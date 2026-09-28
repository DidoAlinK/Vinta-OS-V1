"""
s07_money — the ledger: what families owe, what the academy earned, what
teachers are owed.

Owns: ``StudentBilling``, ``PaymentLog``, ``RevenueEntry``, ``PayoutRecord``,
``TeacherHoursLog`` and ``TeacherPayroll``.

Reads from ctx: ``academy_id``, ``staff_ids``.
Adds to ctx: nothing load-bearing — everything here is derivable by query.

The three ledgers are kept consistent with each other and with the sessions
they come from, because a seed whose money disagrees with its own attendance
is worse than no seed at all:

* A billing exists for a cycle only if the student had already enrolled when
  that cycle ended. Nobody owes for July if they joined in September.
* Revenue is written per *present* student per conducted session, at the
  class's own per-session rate. A free session writes none, which is what
  ``Session.is_free_session`` promises.
* A payout exists for every conducted session and no cancelled one, and the
  cut is computed from that session's *actual* gross by the teacher's own
  commission type.
"""

import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta

from seed.config import PAYMENT_METHODS, TODAY
from seed.helpers import bulk_insert, log, new_id
from seed.pools import pick

MODULE = "s07_money"

#: How many monthly cycles of billing history to write, ending with the cycle
#: TODAY falls in.
BILLING_CYCLES = 3

#: A past cycle is usually settled; some are not.
PAST_OVERDUE_RATE = 0.12

#: Share of the current cycle already collected.
CURRENT_PAID_RATE = 0.55

#: Of the settled billings, how many were settled short.
PARTIAL_RATE = 0.14

#: How long after a session its payout is still outstanding. Older ones have
#: been through payroll.
PAYOUT_SETTLE_DAYS = 45

#: Sessions still PENDING whose payout record is actually overdue.
PAYROLL_OVERDUE_RATE = 0.15


def _month_start(day, months_back):
    """First day of the month ``months_back`` before ``day``'s month."""
    month = day.month - months_back
    year = day.year
    while month < 1:
        month += 12
        year -= 1
    return date(year, month, 1)


def _month_end(day):
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


def _split(rng, total, parts):
    """Break ``total`` into ``parts`` positive-ish chunks summing exactly to it."""
    if parts <= 1 or total <= 0:
        return [total]
    cuts = sorted(rng.randrange(1, total) for _ in range(parts - 1))
    bounds = [0] + cuts + [total]
    return [bounds[i + 1] - bounds[i] for i in range(len(bounds) - 1)]


def run(ctx: dict) -> dict:
    """Write the money ledger. Returns counts."""
    from app.extensions import db
    from app.models.billing import (
        PaymentLog,
        PaymentPlan,
        PayoutRecord,
        RevenueEntry,
        StudentBilling,
        StudentSubscription,
    )
    from app.models.class_room import Class
    from app.models.scheduling import Session
    from app.models.student import Enrollment
    from app.models.teacher import Teacher, TeacherHoursLog, TeacherPayroll
    from app.models.user import User
    from app.models.attendance import SessionStudent

    rng = ctx["rng"]
    academy_id = ctx["academy_id"]

    staff_ids = list(ctx.get("staff_ids") or [])
    if not staff_ids:
        staff_ids = [
            u.id
            for u in db.session.query(User)
            .filter_by(academy_id=academy_id)
            .order_by(User.created_at)
            .all()
        ]
    staff = pick(rng, staff_ids) if staff_ids else None

    classes = {c.id: c for c in db.session.query(Class).filter_by(academy_id=academy_id).all()}
    teachers = {t.id: t for t in db.session.query(Teacher).filter_by(academy_id=academy_id).all()}

    # A billing has to point at a plan, and the plans s01 created are named
    # "<n> séances / mois". They are a price list rather than a per-student
    # fact, so a student's plan is whichever one sits closest to what they
    # actually owe that cycle.
    plans = db.session.query(PaymentPlan).filter_by(academy_id=academy_id).all()

    # ------------------------------------------------------------- billings
    subscriptions = (
        db.session.query(StudentSubscription)
        .filter_by(academy_id=academy_id)
        .all()
    )
    enrolments = {
        e.id: e
        for e in db.session.query(Enrollment)
        .filter(Enrollment.class_id.in_(classes))
        .all()
    }

    cycles = [_month_start(TODAY, back) for back in range(BILLING_CYCLES - 1, -1, -1)]

    # ``StudentBilling`` is "one record per billing cycle per student" — not
    # one per class. A child taking Math and Physique gets a single bill that
    # covers both, which is also how a parent would expect to be charged.
    # Grouping by subscription instead produced up to four bills for the same
    # student in the same month.
    by_student = defaultdict(list)
    for subscription in subscriptions:
        klass = classes.get(subscription.group_id)
        if klass is None or klass.price_da <= 0:
            # The free offer bills nothing — the model says so in as many words.
            continue
        enrollment = enrolments.get(subscription.enrollment_id or "")
        joined = enrollment.enrolled_at.date() if enrollment else None
        by_student[subscription.student_id].append((subscription, klass, joined))

    billings = []
    payments = []
    for student_id, entries in by_student.items():
        for cycle_start in cycles:
            cycle_end = _month_end(cycle_start)
            # Only the classes the student was actually in when the cycle
            # closed. Nobody owes for July for a class they joined in August.
            active = [row for row in entries if row[2] is None or row[2] <= cycle_end]
            if not active:
                continue

            total = sum(klass.price_da for _, klass, _ in active)
            principal = max(active, key=lambda row: row[1].price_da)[1]
            if not plans:
                continue
            plan = min(plans, key=lambda p: abs(p.amount_da - total))
            klass = principal

            past = cycle_end < TODAY
            if past:
                overdue = rng.random() < PAST_OVERDUE_RATE
                if overdue:
                    status = "overdue"
                    paid_amount = (
                        int(total * rng.choice((0.4, 0.6, 0.8)))
                        if rng.random() < 0.7
                        else None
                    )
                else:
                    status = "paid"
                    paid_amount = (
                        int(total * rng.uniform(0.55, 0.9))
                        if rng.random() < PARTIAL_RATE
                        else total
                    )
            else:
                if rng.random() < CURRENT_PAID_RATE:
                    status = "paid"
                    paid_amount = total
                else:
                    status = "due"
                    paid_amount = None

            settled = paid_amount is not None and paid_amount > 0
            billing = StudentBilling(
                id=new_id(rng),
                student_id=student_id,
                payment_plan_id=plan.id,
                amount_da=total,
                status=status,
                due_date=cycle_end,
                paid_date=(
                    cycle_start + timedelta(days=rng.randint(0, 20))
                    if status == "paid"
                    else None
                ),
                paid_amount=paid_amount,
                cycle_start=cycle_start,
                cycle_end=cycle_end,
                notes=(
                    f"Reliquat reporté — {len(active)} groupes"
                    if settled and 0 < paid_amount < total
                    else (f"{len(active)} groupes" if len(active) > 1 else None)
                ),
                created_at=datetime.combine(cycle_start, datetime.min.time()),
                updated_at=datetime.combine(cycle_start, datetime.min.time()),
            )
            billings.append(billing)

            # Payment logs must add up to exactly what the billing says was
            # paid, or the two records contradict each other.
            if settled:
                chunks = _split(rng, paid_amount, rng.choice((1, 1, 1, 2, 3)))
                for offset, chunk in enumerate(chunks):
                    when = (billing.paid_date or cycle_start) + timedelta(days=offset)
                    payments.append(
                        PaymentLog(
                            id=new_id(rng),
                            student_billing_id=billing.id,
                            amount_da=chunk,
                            payment_method=pick(rng, PAYMENT_METHODS),
                            group_id=klass.id,
                            session_id=None,
                            recorded_by=staff,
                            notes=None,
                            created_at=datetime.combine(when, datetime.min.time())
                            + timedelta(hours=rng.randint(9, 17)),
                        )
                    )

    bulk_insert(db, billings, chunk=500, rng=rng)
    bulk_insert(db, payments, chunk=500, rng=rng)

    # ------------------------------------------------------------- revenue
    sessions = (
        db.session.query(Session).filter_by(academy_id=academy_id).all()
    )
    billable = [
        s for s in sessions if s.status in ("conducted", "completed")
    ]
    billable_ids = {s.id for s in billable}

    present = (
        db.session.query(SessionStudent)
        .filter(SessionStudent.is_present.is_(True))
        .all()
    )
    present_by_session = defaultdict(list)
    for row in present:
        if row.session_id in billable_ids:
            present_by_session[row.session_id].append(row.student_id)

    revenue = []
    gross_by_session = defaultdict(int)
    for session in billable:
        if session.is_free_session:
            continue
        klass = classes.get(session.class_id)
        if klass is None or not klass.credits_per_cycle:
            continue
        per_session = klass.price_da // klass.credits_per_cycle
        if per_session <= 0:
            continue
        for student_id in present_by_session.get(session.id, []):
            gross_by_session[session.id] += per_session
            revenue.append(
                RevenueEntry(
                    id=new_id(rng),
                    academy_id=academy_id,
                    group_id=session.class_id,
                    student_id=student_id,
                    session_id=session.id,
                    amount_da=per_session,
                    recorded_at=session.actual_end_time or session.actual_start_time,
                )
            )

    bulk_insert(db, revenue, chunk=1000, rng=rng)

    # ------------------------------------------------- payouts & hours logs
    payouts = []
    hours_logs = []
    for session in billable:
        teacher = teachers.get(session.teacher_id)
        if teacher is None:
            continue

        gross = gross_by_session.get(session.id, 0)
        kind = (teacher.commission_type or "").upper()
        value = teacher.commission_value or 0

        if kind == "PERCENTAGE":
            cut = gross * value // 100
        elif kind == "FLAT_HOURLY":
            start = session.actual_start_time or datetime.combine(
                session.date, session.start_time
            )
            end = session.actual_end_time or datetime.combine(
                session.date, session.end_time
            )
            hours = max(0.0, (end - start).total_seconds() / 3600.0)
            cut = int(value * hours)
        else:  # FIXED_SESSION and anything unrecognised: a flat fee per class
            cut = value

        settled = session.date < TODAY - timedelta(days=PAYOUT_SETTLE_DAYS)
        payouts.append(
            PayoutRecord(
                id=new_id(rng),
                academy_id=academy_id,
                teacher_id=teacher.id,
                session_id=session.id,
                gross_revenue_da=gross,
                commission_type=teacher.commission_type,
                commission_value=value,
                teacher_cut_da=cut,
                status="PAID" if settled else "PENDING",
                paid_at=(
                    datetime.combine(
                        session.date + timedelta(days=rng.randint(3, 20)),
                        datetime.min.time(),
                    )
                    if settled
                    else None
                ),
                paid_by_staff_id=staff if settled else None,
            )
        )

        start = session.actual_start_time or datetime.combine(session.date, session.start_time)
        end = session.actual_end_time or datetime.combine(session.date, session.end_time)
        hours_logs.append(
            TeacherHoursLog(
                id=new_id(rng),
                teacher_id=teacher.id,
                session_id=session.id,
                hours=round(max(0.0, (end - start).total_seconds() / 3600.0), 2),
                logged_by=staff,
                created_at=end,
            )
        )

    bulk_insert(db, payouts, chunk=500, rng=rng)
    bulk_insert(db, hours_logs, chunk=500, rng=rng)

    # ------------------------------------------------------------- payroll
    # One record per teacher per cycle, totalling the payouts actually raised
    # in that window. ``calculated_amount`` is the money really owed, not a
    # second estimate that could drift from the payout rows.
    session_date = {s.id: s.date for s in sessions}
    payouts_by_teacher = defaultdict(list)
    for payout in payouts:
        payouts_by_teacher[payout.teacher_id].append(payout)
    billable_by_teacher = defaultdict(list)
    for session in billable:
        billable_by_teacher[session.teacher_id].append(session)

    payrolls = []
    for teacher in teachers.values():
        for cycle_start in cycles:
            cycle_end = _month_end(cycle_start)

            # A payout belongs to the cycle its session fell in. Dating it by
            # paid_at would move a settled payout into the month it was paid
            # rather than the month it was earned.
            in_period = [
                p
                for p in payouts_by_teacher.get(teacher.id, [])
                if cycle_start <= session_date.get(p.session_id, cycle_start) <= cycle_end
            ]
            taught = [
                s
                for s in billable_by_teacher.get(teacher.id, [])
                if cycle_start <= s.date <= cycle_end
            ]
            if not taught:
                continue

            taught_ids = {s.id for s in taught}
            hours = sum(
                row.hours
                for row in hours_logs
                if row.teacher_id == teacher.id and row.session_id in taught_ids
            )
            students = len(
                {
                    sid
                    for s in taught
                    for sid in present_by_session.get(s.id, [])
                }
            )
            amount = sum(p.teacher_cut_da for p in in_period)

            if cycle_end < TODAY:
                status = "settled" if rng.random() > PAYROLL_OVERDUE_RATE else "overdue"
            else:
                status = "pending"

            payrolls.append(
                TeacherPayroll(
                    id=new_id(rng),
                    teacher_id=teacher.id,
                    period_start=cycle_start,
                    period_end=cycle_end,
                    total_hours=round(hours, 2),
                    total_students=students,
                    rate_applied=teacher.commission_value or 0,
                    calculated_amount=amount,
                    status=status,
                    paid_date=(
                        cycle_end + timedelta(days=rng.randint(1, 10))
                        if status == "settled"
                        else None
                    ),
                    created_at=datetime.combine(cycle_end, datetime.min.time()),
                    updated_at=datetime.combine(cycle_end, datetime.min.time()),
                )
            )

    bulk_insert(db, payrolls, chunk=500, rng=rng)

    log(
        f"[{MODULE}] {len(billings)} billings ({len(payments)} payments), "
        f"{len(revenue)} revenue entries, {len(payouts)} payouts, "
        f"{len(hours_logs)} hours logs, {len(payrolls)} payroll records"
    )
    return {
        "billings": len(billings),
        "payments": len(payments),
        "revenue_entries": len(revenue),
        "payouts": len(payouts),
        "hours_logs": len(hours_logs),
        "payrolls": len(payrolls),
    }
