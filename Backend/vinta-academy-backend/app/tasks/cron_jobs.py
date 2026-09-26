"""
Vinta School OS — Cron Jobs
Automated check-outs, overdue status checks, renewal triggers.
Runs via APScheduler on a configurable schedule.
"""
import logging
from datetime import datetime
from app.extensions import db
from app.models.academy import Academy
from app.models.scheduling import Session
from app.models.billing import StudentBilling
from app.services import attendance_service, billing_service

logger = logging.getLogger(__name__)


def auto_checkout_expired_sessions():
    """
    Check all in-progress sessions whose end_time has passed and auto check-out
    any students still marked present.

    Deliberately does NOT end the class.

    This job used to set ``session.status = "completed"`` the moment the clock
    passed ``end_time``. That is the one thing it must never do. Ending a class
    is what settles money — ``session_lifecycle_service.end_session`` runs
    ``settle_absences``, writes ``conducted``, and stamps ``actual_end_time``
    and ``ended_by_staff_id`` behind a staff PIN. A timer cannot consent to that,
    and the terminal status also drops the session out of the
    ``status IN ('scheduled','in_progress')`` query the Classrooms tab uses, so
    the desk lost the Finish / Extend / Void choices entirely.

    So the class is left IN_PROGRESS and the desk is told it is over (the
    client derives "overdue" from ``end_time`` and raises the prompt). This job
    only tidies the register: a student left checked in overnight should not
    stay checked in forever.

    Two bugs used to stop this function before it did anything at all:

    * ``import auto_checkout_session`` was pulled from ``scheduling_service``,
      which has never defined it — an ImportError that made this whole module
      unimportable. It lives in ``attendance_service``.
    * ``datetime.now(timezone.utc)`` (aware) was compared against
      ``datetime.combine(date, time)`` (always naive), so the first expired
      session raised ``TypeError: can't compare offset-naive and offset-aware
      datetimes`` and the sweep died there.

    On the comparison: ``Session.date`` and ``Session.end_time`` are stored as
    local wall-clock values, not UTC — the frontend reads them back through
    ``lib/sessionTime.ts`` and formats them as local time. So the comparison
    here is local-against-local on purpose. Do not "fix" this to UTC without
    also migrating the stored columns.
    """
    now = datetime.now()
    from app.models.academy import AcademySettings

    academies = Academy.query.all()
    total_checkout_count = 0

    for academy in academies:
        settings = AcademySettings.query.filter_by(academy_id=academy.id).first()
        if not settings or not settings.auto_checkout_enabled:
            continue

        # IN_PROGRESS only. A ``scheduled`` class has nobody checked in to
        # check out, and a class that was never started is the desk's to
        # cancel — not this job's.
        expired_sessions = Session.query.filter(
            Session.academy_id == academy.id,
            Session.status == "in_progress",
        ).all()

        for session in expired_sessions:
            session_end = datetime.combine(session.date, session.end_time)
            if now > session_end:
                count = attendance_service.auto_checkout_session(session.id, academy.id)
                if count > 0:
                    total_checkout_count += count
                    logger.info(
                        "Auto checkout: session %s — %s students", session.id, count
                    )

    if total_checkout_count > 0:
        db.session.commit()
        logger.info(
            "Total auto checkouts across all academies: %s", total_checkout_count
        )


def close_past_temporary_sessions():
    """
    Close out one-off classes whose day passed without ever being started.

    The rule and the reasoning live in
    ``session_lifecycle_service.close_past_temporary_sessions`` — this is only
    the schedule and the log line. Kept thin on purpose: the lifecycle service
    owns session status, and a second copy of the rule here is how the two
    would drift apart.
    """
    from app.services.session_lifecycle_service import (
        close_past_temporary_sessions as _close,
    )

    closed = _close()
    if closed:
        logger.info("Closed %s unstarted one-off session(s)", closed)


def check_overdue_payments():
    """
    Check all academies for billings past their due_date.
    Marks them as 'overdue' and triggers overdue alerts.
    """
    academies = Academy.query.all()
    total_overdue_count = 0

    for academy in academies:
        count = billing_service.check_overdue_billings(academy.id)
        total_overdue_count += count

        if count > 0:
            logger.info(f"Overdue check: {count} new overdue for academy {academy.id}")

    if total_overdue_count > 0:
        db.session.commit()
        logger.info(f"Total new overdue across all academies: {total_overdue_count}")


def renew_billing_cycles():
    """
    Create new billing records for students whose cycles have ended.
    Runs daily at midnight.
    """
    academies = Academy.query.all()
    total_renewed = 0

    for academy in academies:
        count = billing_service.renew_billing_cycles(academy.id)
        total_renewed += count

        if count > 0:
            logger.info(f"Cycle renewal: {count} new cycles for academy {academy.id}")

    if total_renewed > 0:
        db.session.commit()
        logger.info(f"Total renewals across all academies: {total_renewed}")


def check_upcoming_renewals():
    """
    Notify staff about upcoming billing renewals (due in 3 days).
    """
    from datetime import date, timedelta
    from app.models.notification import Notification
    import uuid

    academies = Academy.query.all()
    reminder_date = date.today() + timedelta(days=3)

    for academy in academies:
        from app.models.academy import AcademySettings
        settings = AcademySettings.query.filter_by(academy_id=academy.id).first()
        days_before = settings.billing_reminder_days_before if settings else 3

        target_date = date.today() + timedelta(days=days_before)

        upcoming = (
            StudentBilling.query.join(StudentBilling.student)
            .filter(
                StudentBilling.status == "due",
                StudentBilling.due_date == target_date,
            )
            .all()
        )

        for billing in upcoming:
            student = billing.student
            student_name = f"{student.first_name} {student.last_name}" if student else "Unknown"

            notification = Notification(
                id=str(uuid.uuid4()),
                academy_id=academy.id,
                user_id=None,  # Broadcast
                type="payment_reminder",
                title=f"Payment due in {days_before} days",
                message=f"Payment of {billing.amount_da} DA due for {student_name}",
                detail=f"Plan: {billing.payment_plan.name if billing.payment_plan else 'N/A'}",
            )
            db.session.add(notification)

    db.session.commit()


# Job schedule configuration
CRON_JOBS = [
    {
        "id": "auto_checkout",
        "func": auto_checkout_expired_sessions,
        "trigger": "interval",
        "minutes": 5,
        "description": "Auto check-out expired sessions every 5 minutes",
    },
    {
        "id": "close_past_temporary",
        "func": close_past_temporary_sessions,
        "trigger": "cron",
        "hour": 0,
        "minute": 30,
        "description": (
            "Close one-off classes whose day passed unstarted, daily at 0:30"
        ),
    },
    {
        "id": "check_overdue",
        "func": check_overdue_payments,
        "trigger": "cron",
        "hour": 1,
        "minute": 0,
        "description": "Check overdue payments daily at 1:00 AM",
    },
    {
        "id": "renew_cycles",
        "func": renew_billing_cycles,
        "trigger": "cron",
        "hour": 0,
        "minute": 0,
        "description": "Renew billing cycles daily at midnight",
    },
    {
        "id": "upcoming_renewals",
        "func": check_upcoming_renewals,
        "trigger": "cron",
        "hour": 9,
        "minute": 0,
        "description": "Check upcoming renewals daily at 9:00 AM",
    },
]
