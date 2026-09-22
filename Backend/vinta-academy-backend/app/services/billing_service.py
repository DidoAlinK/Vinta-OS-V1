"""
Vinta School OS — Billing Service
Cycle renewals, aging buckets (1-7d, 8-30d, 30d+), payment logs, status management.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import desc, func, extract
from app.extensions import db
from app.models.billing import (
    PaymentPlan,
    StudentBilling,
    PaymentLog,
    StudentSubscription,
    RevenueEntry,
    PayoutRecord,
)
from app.models.student import Student
from app.models.audit import ActivityLog
from app.utils.formatters import days_overdue, overdue_bucket


def list_payment_plans(academy_id: str) -> list:
    """List all payment plans for an academy."""
    plans = PaymentPlan.query.filter_by(academy_id=academy_id).order_by(PaymentPlan.amount_da).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "duration_days": p.duration_days,
            "amount_da": p.amount_da,
        }
        for p in plans
    ]


def create_payment_plan(academy_id: str, data: dict) -> PaymentPlan:
    """Create a new payment plan."""
    plan = PaymentPlan(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        name=data["name"],
        duration_days=data["duration_days"],
        amount_da=data["amount_da"],
    )
    db.session.add(plan)
    db.session.flush()
    return plan


def list_student_billings(academy_id: str, student_id: str = None, status: str = None) -> list:
    """List billing records, optionally filtered by student and status."""
    query = StudentBilling.query.join(Student).filter(Student.academy_id == academy_id)

    if student_id:
        query = query.filter(StudentBilling.student_id == student_id)
    if status:
        query = query.filter(StudentBilling.status == status)

    billings = query.order_by(desc(StudentBilling.created_at)).all()

    return [
        {
            "id": b.id,
            "student_id": b.student_id,
            "student_name": f"{b.student.first_name} {b.student.last_name}" if b.student else None,
            "payment_plan": b.payment_plan.name if b.payment_plan else None,
            "amount_da": b.amount_da,
            "status": b.status,
            "due_date": b.due_date.isoformat(),
            "paid_date": b.paid_date.isoformat() if b.paid_date else None,
            "paid_amount": b.paid_amount,
            "cycle_start": b.cycle_start.isoformat(),
            "cycle_end": b.cycle_end.isoformat(),
            "days_overdue": days_overdue(b.due_date) if b.status == "overdue" else 0,
        }
        for b in billings
    ]


def record_payment(
    billing_id: str, amount: int, payment_method: str,
    recorded_by: str, academy_id: str, notes: str = None
) -> dict:
    """Record a payment against a billing record."""
    billing = db.session.get(StudentBilling, billing_id)
    if not billing:
        return None

    # Create payment log
    log_entry = PaymentLog(
        id=str(uuid.uuid4()),
        student_billing_id=billing_id,
        amount_da=amount,
        payment_method=payment_method,
        recorded_by=recorded_by,
        notes=notes,
    )
    db.session.add(log_entry)

    # Update billing
    billing.paid_amount = (billing.paid_amount or 0) + amount
    billing.updated_at = datetime.now(timezone.utc)

    if billing.paid_amount >= billing.amount_da:
        billing.status = "paid"
        billing.paid_date = date.today()

    db.session.flush()

    return {
        "billing_id": billing_id,
        "amount_paid": amount,
        "total_paid": billing.paid_amount,
        "status": billing.status,
    }


def check_overdue_billings(academy_id: str) -> int:
    """
    Check for billings that are past due_date and mark them as overdue.
    Returns count of newly overdue records.
    """
    today = date.today()
    overdue_billings = StudentBilling.query.join(Student).filter(
        Student.academy_id == academy_id,
        StudentBilling.status == "due",
        StudentBilling.due_date < today,
    ).all()

    count = 0
    for billing in overdue_billings:
        billing.status = "overdue"
        count += 1

        student = db.session.get(Student, billing.student_id)
        student_name = f"{student.first_name} {student.last_name}" if student else "Unknown"

        log = ActivityLog(
            id=str(uuid.uuid4()),
            academy_id=academy_id,
            user_id="system",
            entity_type="billing",
            entity_id=billing.id,
            action="payment_overdue",
            description=f"Payment overdue — {student_name}",
        )
        db.session.add(log)

    if count > 0:
        db.session.flush()

    return count


def renew_billing_cycles(academy_id: str) -> int:
    """
    Create new billing records for students whose cycles have ended.
    Returns count of renewals created.
    """
    today = date.today()
    expired = StudentBilling.query.join(Student).filter(
        Student.academy_id == academy_id,
        StudentBilling.cycle_end <= today,
    ).all()

    count = 0
    for billing in expired:
        # Check if a renewal already exists
        existing = StudentBilling.query.filter(
            StudentBilling.student_id == billing.student_id,
            StudentBilling.payment_plan_id == billing.payment_plan_id,
            StudentBilling.cycle_start >= today,
        ).first()
        if existing:
            continue

        plan = billing.payment_plan
        if not plan:
            continue

        new_billing = StudentBilling(
            id=str(uuid.uuid4()),
            student_id=billing.student_id,
            payment_plan_id=plan.id,
            amount_da=plan.amount_da,
            status="due",
            due_date=today + timedelta(days=plan.duration_days),
            cycle_start=today,
            cycle_end=today + timedelta(days=plan.duration_days),
        )
        db.session.add(new_billing)
        count += 1

    if count > 0:
        db.session.flush()

    return count


def get_billing_stats(academy_id: str) -> dict:
    """Get aggregate billing statistics for the donut chart.

    Uses the new ``StudentSubscription`` model for student billing ring
    and ``TeacherPayroll`` for the teacher ring.

    Returns a flat dict matching the frontend ``BillingStats`` interface:
    ``student_paid``, ``student_due``, ``student_overdue``, ``student_total``,
    ``teacher_pending``, ``teacher_settled``, ``teacher_overdue``,
    ``teacher_total``, ``month_income``, ``total_enrolled``.
    """
    from app.models.teacher import Teacher, TeacherPayroll
    from app.models.student import Enrollment

    # ── Student subscription ring ──────────────────────────
    subs = StudentSubscription.query.filter_by(academy_id=academy_id).all()

    paid = sum(1 for s in subs if s.status in ("ACTIVE",))
    due = sum(1 for s in subs if s.status in ("EXPIRING_SOON", "RENEW_REQUIRED"))
    overdue = sum(1 for s in subs if s.status in ("EXPIRED", "DEPLETED"))
    student_total = paid + due + overdue

    # ── Teacher payroll ring ──────────────────────────────
    payrolls = TeacherPayroll.query.join(
        Teacher, TeacherPayroll.teacher_id == Teacher.id
    ).filter(Teacher.academy_id == academy_id).all()

    payroll_pending = sum(1 for p in payrolls if p.status == "pending")
    payroll_settled = sum(1 for p in payrolls if p.status == "settled")
    payroll_overdue = sum(1 for p in payrolls if p.status == "overdue")
    teacher_total = payroll_pending + payroll_settled + payroll_overdue

    # ── This month's income ───────────────────────────────
    today = date.today()
    month_start = today.replace(day=1)
    month_income = int(
        db.session.query(func.sum(StudentSubscription.amount_paid_da))
        .filter(
            StudentSubscription.academy_id == academy_id,
            StudentSubscription.created_at >= datetime.combine(month_start, datetime.min.time()),
            StudentSubscription.created_at <= datetime.combine(today, datetime.max.time()),
        )
        .scalar() or 0
    )

    # ── Total active enrollments ──────────────────────────
    total_enrolled = Enrollment.query.join(Student).filter(
        Student.academy_id == academy_id,
        Enrollment.status == "active",
    ).count()

    return {
        "student_paid": paid,
        "student_due": due,
        "student_overdue": overdue,
        "student_total": student_total,
        "teacher_pending": payroll_pending,
        "teacher_settled": payroll_settled,
        "teacher_overdue": payroll_overdue,
        "teacher_total": teacher_total,
        "month_income": month_income,
        "total_enrolled": total_enrolled,
    }


def get_revenue_chart(academy_id: str, months: int = 6) -> list:
    """
    Generate time-series revenue data for the chart.
    Returns monthly aggregates for the last N months.
    """
    from datetime import datetime
    today = date.today()
    chart_data = []

    for i in range(months - 1, -1, -1):
        # Calculate month properly
        month = today.month - i
        year = today.year
        while month <= 0:
            month += 12
            year -= 1
        month_date = date(year, month, 1)
        month_start = month_date.replace(day=1)
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1) - timedelta(days=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1) - timedelta(days=1)

        # Sum of paid amounts this month
        income = (
            db.session.query(func.sum(StudentBilling.amount_da))
            .join(Student)
            .filter(
                Student.academy_id == academy_id,
                StudentBilling.status == "paid",
                StudentBilling.paid_date >= month_start,
                StudentBilling.paid_date <= month_end,
            )
            .scalar() or 0
        )

        chart_data.append({
            "month": month_start.strftime("%b %Y"),
            "income": int(income),
            "overdue_count": 0,
        })

    # Compute total overdue count once (not per-month)
    total_overdue = (
        StudentBilling.query.join(Student)
        .filter(
            Student.academy_id == academy_id,
            StudentBilling.status == "overdue",
        )
        .count()
    )
    # Attach to the most recent month entry
    if chart_data:
        chart_data[-1]["overdue_count"] = total_overdue

    return chart_data


def get_aging_buckets(academy_id: str) -> dict:
    """Classify overdue billings into aging buckets."""
    overdue = StudentBilling.query.join(Student).filter(
        Student.academy_id == academy_id,
        StudentBilling.status == "overdue",
    ).all()

    buckets = {"recent": [], "aging": [], "critical": []}
    for billing in overdue:
        days = days_overdue(billing.due_date)
        bucket = overdue_bucket(days)
        student = billing.student
        buckets[bucket].append({
            "id": billing.id,
            "student_name": f"{student.first_name} {student.last_name}" if student else "Unknown",
            "amount_da": billing.amount_da,
            "days_overdue": days,
        })

    return {
        "recent": {"count": len(buckets["recent"]), "items": buckets["recent"]},
        "aging": {"count": len(buckets["aging"]), "items": buckets["aging"]},
        "critical": {"count": len(buckets["critical"]), "items": buckets["critical"]},
    }


# ═══════════════════════════════════════════════════════════════════
# VINTA SCHOOL OS — Money Model Functions
# StudentSubscription, RevenueEntry, PayoutRecord, check-in side
# effects, session finalization, multi-payment, group swap.
# All monetary values are integers (DZD).
# ═══════════════════════════════════════════════════════════════════

from app.models.billing import (
    StudentSubscription, RevenueEntry, PayoutRecord,
)
from app.models.class_room import Class
from app.models.student import Enrollment
from app.models.scheduling import Session
from app.models.teacher import Teacher
from app.models.attendance import SessionStudent
from datetime import datetime, timezone, timedelta


def find_active_subscription(student_id: str, group_id: str) -> StudentSubscription | None:
    """Find the active subscription covering (student, group).

    Lookup order:
    1. Direct subscription: ``group_id`` matches and status is ACTIVE.
    2. Shared TIME_BASED subscription: ``group_id`` is listed in the
       subscription's ``enrolled_group_ids`` (multi-group bundle under the
       same teacher/subject/level).

    Stale subscriptions are lazily transitioned: TIME_BASED past its
    ``access_end_date`` becomes EXPIRED; CREDIT_BASED with no credits left
    becomes DEPLETED. Returns None when nothing usable covers the group.
    """
    candidates = (
        StudentSubscription.query.filter_by(student_id=student_id, status="ACTIVE")
        .order_by(StudentSubscription.created_at.desc())
        .all()
    )

    sub = next((s for s in candidates if s.group_id == group_id), None)
    if sub is None:
        sub = next(
            (
                s
                for s in candidates
                if s.billing_model == "TIME_BASED"
                and isinstance(s.enrolled_group_ids, list)
                and group_id in s.enrolled_group_ids
            ),
            None,
        )
    if sub is None:
        return None

    # For TIME_BASED, also check access window
    if sub.billing_model == "TIME_BASED" and sub.access_end_date:
        if sub.access_end_date < date.today():
            sub.status = "EXPIRED"
            db.session.flush()
            return None

    # For CREDIT_BASED, check credits remaining
    if sub.billing_model == "CREDIT_BASED":
        if (sub.remaining_credits or 0) <= 0:
            sub.status = "DEPLETED"
            db.session.flush()
            return None

    return sub


def find_subscription_for_level(
    student_id: str, teacher_id: str,
    subject: str | None = None, academic_level: str | None = None,
) -> StudentSubscription | None:
    """Find the active CREDIT_BASED subscription for a teaching level.

    A "level" is (``teacher_id``, ``subject``, ``academic_level``): any
    group with the same triple shares the credit pool, so students can
    swap groups (guest check-ins, makeups) without a new payment.
    When ``subject``/``academic_level`` are omitted, any group taught by
    the teacher matches (legacy behavior).
    """
    # Get all classes taught by this teacher, narrowed to the level.
    query = Class.query.filter_by(teacher_id=teacher_id)
    if subject is not None:
        query = query.filter_by(subject=subject)
    if academic_level is not None:
        query = query.filter_by(academic_level=academic_level)
    class_ids = [c.id for c in query.all()]
    if not class_ids:
        return None

    subs = StudentSubscription.query.filter(
        StudentSubscription.student_id == student_id,
        StudentSubscription.group_id.in_(class_ids),
        StudentSubscription.billing_model == "CREDIT_BASED",
        StudentSubscription.status == "ACTIVE",
        StudentSubscription.remaining_credits > 0,
    ).order_by(StudentSubscription.created_at.desc()).all()

    return subs[0] if subs else None


def create_subscription_for_payment(
    enrollment_or_group,
    amount: int,
    method: str,
    staff_id: str,
    academy_id: str,
    group_id: str = None,
) -> StudentSubscription | None:
    """Create a subscription for a payment covering a course group.

    Args:
        enrollment_or_group: an ``Enrollment`` instance, an enrollment id,
            a ``Class`` (group) instance, or a group id. When an enrollment
            (or its id) is given, the group is taken from it unless
            ``group_id`` overrides it.
        amount: amount received, integer DZD (no floating money).
        method: CASH | CCP | BARIDI_MOB (case-insensitive).
        staff_id: staff member recording the payment (PIN attribution is
            enforced at the route layer via ``@verify_staff_pin``; the id is
            stored on ``recorded_by_staff_id``).
        academy_id: tenant scope.
        group_id: explicit group override; also used to extend the
            ``enrolled_group_ids`` bundle of a shared TIME_BASED
            subscription.

    CREDIT_BASED: ``total = remaining = creditsPerCycle`` plus any
    rollover leftover from the student's most recent subscription for the
    same group when the group allows rollover.
    TIME_BASED: ``access_start`` is today; ``access_end`` is today +
    ``access_duration_weeks`` (or None for open-ended). Groups under the
    same teacher/subject/level share one subscription via
    ``enrolled_group_ids``: paying for an extra group extends the existing
    bundle (up to ``max_groups_included``) instead of creating a duplicate.
    Multi-group CREDIT_BASED payments create one Subscription per group.
    """
    from app.models.student import Enrollment as _Enrollment

    enrollment = None
    group = None
    if isinstance(enrollment_or_group, str):
        enrollment = db.session.get(_Enrollment, enrollment_or_group)
        group = db.session.get(Class, group_id) if group_id else None
        if enrollment is not None and group is None:
            group = db.session.get(Class, enrollment.class_id)
        elif group is not None and enrollment is None:
            group = group  # plain group id passed as first arg
            enrollment = None
    elif isinstance(enrollment_or_group, _Enrollment):
        enrollment = enrollment_or_group
        group = db.session.get(Class, group_id or enrollment.class_id)
    elif isinstance(enrollment_or_group, Class):
        group = enrollment_or_group
        if group_id:
            group = db.session.get(Class, group_id) or group
    elif enrollment_or_group is None and group_id:
        group = db.session.get(Class, group_id)

    # First positional arg may itself be a group id string.
    if group is None and isinstance(enrollment_or_group, str):
        maybe_group = db.session.get(Class, enrollment_or_group)
        if maybe_group is not None:
            group = maybe_group
            enrollment = None
    if group is None and group_id:
        group = db.session.get(Class, group_id)
    if group is None:
        return None

    group_id = group.id
    student_id = enrollment.student_id if enrollment is not None else None
    if student_id is None:
        # Caller passed only a group: nothing to attach — require enrollment.
        return None

    amount = int(amount or 0)
    method = (method or "CASH").upper()
    if method not in ("CASH", "CCP", "BARIDI_MOB"):
        method = "CASH"
    today = date.today()

    if group.billing_model == "TIME_BASED":
        existing = (
            StudentSubscription.query.filter_by(
                student_id=student_id, status="ACTIVE",
                billing_model="TIME_BASED",
            )
            .order_by(StudentSubscription.created_at.desc())
            .all()
        )
        for sub in existing:
            covered = list(sub.enrolled_group_ids or [])
            sibling = db.session.get(Class, sub.group_id)
            same_bundle = (
                sibling is not None
                and sibling.teacher_id == group.teacher_id
                and (sibling.subject or "") == (group.subject or "")
                and (sibling.academic_level or "") == (group.academic_level or "")
            )
            if sub.group_id == group_id or group_id in covered or same_bundle:
                if group_id not in covered:
                    if len(covered) >= max(int(sub.max_groups_included or 1), 1):
                        break  # bundle full — fall through to a new subscription
                    covered.append(group_id)
                    sub.enrolled_group_ids = covered
                sub.amount_paid_da = int(sub.amount_paid_da or 0) + amount
                if enrollment is not None and not sub.enrollment_id:
                    sub.enrollment_id = enrollment.id
                db.session.flush()
                return sub

    rollover_leftover = 0
    if group.billing_model == "CREDIT_BASED" and group.allow_rollover:
        previous = (
            StudentSubscription.query.filter_by(
                student_id=student_id, group_id=group_id,
                billing_model="CREDIT_BASED",
            )
            .order_by(StudentSubscription.created_at.desc())
            .first()
        )
        if previous is not None and (previous.remaining_credits or 0) > 0:
            rollover_leftover = int(previous.remaining_credits or 0)

    sub = StudentSubscription(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        student_id=student_id,
        group_id=group_id,
        enrollment_id=enrollment.id if enrollment is not None else None,
        billing_model=group.billing_model,
        amount_paid_da=amount,
        payment_method=method,
        recorded_by_staff_id=staff_id,
        status="ACTIVE",
    )

    if group.billing_model == "CREDIT_BASED":
        credits = int(group.credits_per_cycle or 0) + rollover_leftover
        sub.total_credits = credits
        sub.remaining_credits = credits
        sub.makeup_credits = 0
        sub.cycle_start_date = today
        if group.cycle_week_limit:
            sub.cycle_deadline = today + timedelta(weeks=int(group.cycle_week_limit))
    else:
        # TIME_BASED
        sub.access_start_date = today
        if group.access_duration_weeks:
            sub.access_end_date = today + timedelta(weeks=int(group.access_duration_weeks))
        else:
            sub.access_end_date = None
        sub.max_groups_included = int(group.max_groups_included or 1)
        sub.enrolled_group_ids = [group_id]

    db.session.add(sub)
    db.session.flush()
    return sub


def create_subscription(
    academy_id: str, student_id: str, group_id: str,
    amount: int, method: str, staff_id: str,
    enrollment_id: str = None,
) -> StudentSubscription:
    """Create a new subscription for a student paying for a course group.

    Thin wrapper around :func:`create_subscription_for_payment` kept for
    backward compatibility with existing callers. Handles both
    CREDIT_BASED and TIME_BASED models.
    """
    from app.models.student import Enrollment as _Enrollment

    enrollment = db.session.get(_Enrollment, enrollment_id) if enrollment_id else None
    if enrollment is None:
        enrollment = _Enrollment.query.filter_by(
            student_id=student_id, class_id=group_id, status="active"
        ).first()
    if enrollment is None:
        # No enrollment row (e.g. legacy caller): create a lightweight
        # in-memory enrollment so the payment still attaches to the student.
        enrollment = _Enrollment(
            id=str(uuid.uuid4()),
            student_id=student_id,
            class_id=group_id,
            status="active",
        )
        db.session.add(enrollment)
        db.session.flush()
    return create_subscription_for_payment(
        enrollment,
        amount,
        method,
        staff_id,
        academy_id,
        group_id=group_id,
    )


class MultiPaymentError(Exception):
    """A multi-payment could not be recorded — nothing was charged.

    Raised instead of returning an error-shaped dict: a dict carrying an
    ``error`` key is truthy, so a route's ``if not receipt`` guard reads the
    failure as success, commits, and answers 201. ``status_code`` is the
    HTTP status the route should answer with.
    """

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def record_multi_payment(
    student_id: str,
    items: list,
    total_received: int,
    method: str,
    staff_id: str,
    academy_id: str,
) -> dict:
    """Multi-teacher payment flow: one receipt covering several groups.

    Creates separate subscriptions — one per group paid (CREDIT_BASED
    groups each get their own Subscription row). TIME_BASED groups under
    the same teacher/subject/level share a subscription via
    ``enrolled_group_ids`` (see :func:`create_subscription_for_payment`).

    Args:
        student_id: payer.
        items: ``[{group_id, amount}]`` — amounts are integer DZD.
        total_received: cash actually received (integer DZD); each line
            item is validated and the receipt echoes the breakdown.
        method: CASH | CCP | BARIDI_MOB.
        staff_id: recording staff (PIN attribution at route layer).
        academy_id: tenant scope.

    Returns a receipt breakdown dict with per-group charges.

    Raises:
        MultiPaymentError: the receipt could not be produced — unknown
            student or group, an invalid line item (missing ``group_id`` or
            a non-positive amount), or a line item whose subscription could
            not be created. Callers must treat this as "nothing was charged".
    """
    from app.models.student import Student
    student = db.session.get(Student, student_id)
    if student is None:
        raise MultiPaymentError("Student not found", 404)
    student_name = f"{student.first_name} {student.last_name}"

    charges = []
    expected_total = 0
    for item in items or []:
        group_id = item.get("group_id")
        amount = int(item.get("amount") or 0)
        if not group_id or amount <= 0:
            raise MultiPaymentError(
                "Invalid line item (group_id and positive amount required)"
            )
        group = db.session.get(Class, group_id)
        if group is None:
            raise MultiPaymentError(f"Group not found: {group_id}", 404)

        # Separate Enrollment row per group paid (spec §1).
        enrollment = Enrollment.query.filter_by(
            student_id=student_id, class_id=group_id, status="active"
        ).first()
        if not enrollment:
            enrollment = Enrollment(
                id=str(uuid.uuid4()),
                student_id=student_id,
                class_id=group_id,
                status="active",
            )
            db.session.add(enrollment)
            db.session.flush()

        sub = create_subscription_for_payment(
            enrollment, amount, method, staff_id, academy_id,
            group_id=group_id,
        )
        if sub is None:
            # Student and group are both known here, so the factory returning
            # nothing is a server-side fault — never a receipt without a
            # subscription behind it.
            raise MultiPaymentError(
                f"Subscription could not be created for group {group_id}", 500
            )
        expected_total += amount
        charges.append({
            "group_id": group_id,
            "group_name": group.name,
            "amount_da": amount,
            "subscription_id": sub.id,
            "billing_model": group.billing_model,
            "credits": (
                sub.total_credits
                if group.billing_model == "CREDIT_BASED"
                else None
            ),
        })

    return {
        "student_id": student_id,
        "student_name": student_name,
        "total_da": int(total_received or 0),
        "expected_total_da": expected_total,
        "payment_method": (method or "CASH").upper(),
        "recorded_by_staff_id": staff_id,
        "charges": charges,
    }


def create_multi_payment(
    academy_id: str, student_id: str,
    items: list, total_received: int,
    method: str, staff_id: str,
) -> dict:
    """Multi-teacher payment: create separate subscriptions per group.

    Thin wrapper around :func:`record_multi_payment` kept for backward
    compatibility with existing callers. ``items`` =
    ``[{"group_id": ..., "amount": ...}]``. Returns receipt breakdown.
    """
    return record_multi_payment(
        student_id, items, total_received, method, staff_id, academy_id,
    )


def record_checkin_billing_side_effects(
    session_id: str, student_id: str, status: str,
    is_group_swap: bool, checked_in_by: str, academy_id: str,
) -> dict:
    """Apply billing side effects after an attendance record is created.

    Called by ``attendance_service.check_in_student`` (which owns the
    ``SessionStudent`` row); this function only touches money state.

    CREDIT_BASED: the level subscription
    (``teacher_id`` + ``subject`` + ``academic_level``) is decremented by 1
    — even when ``status`` is ABSENT. When the group allows makeups and the
    student is ABSENT, a ``makeup_credits`` flag is incremented so the
    absence can be made up later. When ``remaining`` hits 0 the
    subscription becomes DEPLETED. A ``RevenueEntry`` of
    ``group.price_da`` (integer DZD) is recorded.
    TIME_BASED: no decrement. When the group enforces attendance the
    attended/conducted ratio is recomputed and the subscription becomes
    SUSPENDED below the group's threshold.
    """
    session = db.session.get(Session, session_id)
    if not session:
        return {"error": "Session not found"}

    group = db.session.get(Class, session.class_id)
    if not group:
        return {"error": "Group not found"}

    result = {"billing_model": group.billing_model, "actions": []}
    status = (status or "PRESENT").upper()

    if group.billing_model == "CREDIT_BASED":
        # Level-based lookup: any group with same teacher + subject +
        # academic_level shares the credit pool (covers group swaps).
        sub = find_subscription_for_level(
            student_id, group.teacher_id,
            subject=group.subject, academic_level=group.academic_level,
        )
        if sub is None and not is_group_swap:
            sub = find_active_subscription(student_id, group.id)

        if sub and (sub.remaining_credits or 0) > 0:
            # Decrement even when ABSENT (credit is consumed by the seat).
            sub.remaining_credits = int(sub.remaining_credits or 0) - 1
            result["subscription_id"] = sub.id
            result["actions"].append(f"credits decremented to {sub.remaining_credits}")

            if status == "ABSENT" and group.allow_makeups:
                sub.makeup_credits = int(sub.makeup_credits or 0) + 1
                result["actions"].append(
                    f"makeup credit granted (total {sub.makeup_credits})"
                )

            if (sub.remaining_credits or 0) <= 0:
                sub.remaining_credits = 0
                sub.status = "DEPLETED"
                result["actions"].append("subscription DEPLETED")
        else:
            result["actions"].append("no active subscription found or credits exhausted")

        # Revenue entry: academy earns the seat price on check-in.
        if int(group.price_da or 0) > 0:
            rev = RevenueEntry(
                id=str(uuid.uuid4()),
                academy_id=academy_id,
                group_id=group.id,
                student_id=student_id,
                session_id=session_id,
                amount_da=int(group.price_da),
            )
            db.session.add(rev)
            result["actions"].append(f"revenue entry: {group.price_da} Da")

    elif group.billing_model == "TIME_BASED":
        # No credit decrement — access is time-window based.
        sub = find_active_subscription(student_id, group.id)
        if sub is not None:
            result["subscription_id"] = sub.id
        result["actions"].append("time-based: no credit decrement")

        # Attendance enforcement: recompute attended/conducted ratio.
        if group.enforce_attendance and group.attendance_threshold:
            enrollment = Enrollment.query.filter_by(
                student_id=student_id, class_id=group.id, status="active"
            ).first()
            if enrollment is not None:
                enrolled_at = enrollment.enrolled_at.date() if hasattr(
                    enrollment.enrolled_at, "date") else enrollment.enrolled_at
            else:
                enrolled_at = sub.access_start_date if sub is not None else None

            conducted_q = SessionStudent.query.join(Session).filter(
                Session.class_id == group.id,
                Session.status.in_(["conducted", "completed"]),
            )
            attended_q = SessionStudent.query.filter_by(
                student_id=student_id, is_present=True
            ).join(Session).filter(
                Session.class_id == group.id,
                Session.status.in_(["conducted", "completed"]),
            )
            if enrolled_at is not None:
                conducted_q = conducted_q.filter(Session.date >= enrolled_at)
                attended_q = attended_q.filter(Session.date >= enrolled_at)
            total_conducted = conducted_q.count()
            total_attended = attended_q.count()

            result["attended"] = total_attended
            result["conducted"] = total_conducted
            if total_conducted > 0:
                ratio = total_attended / total_conducted
                result["attendance_ratio"] = round(ratio, 4)
                if ratio < float(group.attendance_threshold):
                    if sub is not None:
                        sub.status = "SUSPENDED"
                    result["actions"].append(
                        f"attendance below threshold: {ratio:.0%} < "
                        f"{float(group.attendance_threshold):.0%} — subscription SUSPENDED"
                    )

    db.session.flush()
    return result


def _session_duration_hours(session) -> float:
    """Session length in hours from start/end times (min 1h fallback)."""
    from app.utils.formatters import session_duration_hours

    if session.start_time and session.end_time:
        try:
            return max(session_duration_hours(session.start_time, session.end_time), 0.0)
        except Exception:
            return 1.0
    return 1.0


def _compute_teacher_cut(
    gross_da: int, commission_type: str, commission_value: int,
    duration_hours: float,
) -> int:
    """Compute the teacher's cut (integer DZD) for a conducted session.

    PERCENTAGE: ``gross * pct / 100``; FLAT_HOURLY: ``duration_hours *
    value``; FIXED_SESSION: flat ``value`` per session. All money stays
    integer — fractional hours are the only float in the pipeline.
    """
    gross_da = int(gross_da or 0)
    commission_value = int(commission_value or 0)
    if commission_type == "PERCENTAGE":
        return int(gross_da * commission_value / 100)
    if commission_type == "FLAT_HOURLY":
        return int(float(duration_hours or 0) * commission_value)
    if commission_type == "FIXED_SESSION":
        return commission_value
    return int(gross_da * commission_value / 100)


def finalize_session(
    session_id: str, conducted: bool, academy_id: str, staff_id: str,
) -> dict:
    """Finalize a session — the "Is class done?" flow.

    ``conducted=True``: status becomes CONDUCTED; gross revenue is the sum
    of ``RevenueEntry`` rows for the session (falling back to
    ``present check-ins × group.price_da`` when no entries exist yet);
    the teacher cut follows the teacher's ``commissionType``
    (PERCENTAGE / FLAT_HOURLY / FIXED_SESSION, integer DZD); a
    PENDING ``PayoutRecord`` with commission snapshots is created.
    ``conducted=False``: status becomes CANCELLED and no payout is
    created. Finalization is idempotent — re-finalizing returns the
    existing outcome (including the payout id) instead of duplicating.
    """
    session = db.session.get(Session, session_id)
    if not session or session.academy_id != academy_id:
        return {"error": "Session not found"}

    if conducted:
        existing_payout = PayoutRecord.query.filter_by(session_id=session_id).first()
        if session.status == "conducted" and existing_payout is not None:
            return {
                "session_id": session_id,
                "status": "conducted",
                "gross_revenue_da": int(existing_payout.gross_revenue_da or 0),
                "teacher_cut_da": int(existing_payout.teacher_cut_da or 0),
                "commission_type": existing_payout.commission_type,
                "payout_id": existing_payout.id,
            }

        session.status = "conducted"

        # Gross = sum of RevenueEntry rows for this session; fallback to
        # present check-ins × group price when entries are missing.
        entries = RevenueEntry.query.filter_by(session_id=session_id).all()
        gross = sum(int(e.amount_da or 0) for e in entries)
        group = db.session.get(Class, session.class_id)
        if gross == 0 and group is not None:
            roster_count = SessionStudent.query.filter_by(
                session_id=session_id, is_present=True
            ).count()
            gross = roster_count * int(group.price_da or 0)
        gross = int(gross)

        # Teacher cut per commissionType (integer DZD).
        teacher = db.session.get(Teacher, session.teacher_id)
        commission_type = (
            teacher.commission_type if teacher and teacher.commission_type
            else "PERCENTAGE"
        )
        commission_value = (
            int(teacher.commission_value)
            if teacher and teacher.commission_value is not None else 30
        )
        teacher_cut = _compute_teacher_cut(
            gross, commission_type, commission_value,
            _session_duration_hours(session),
        )

        # One payout per session (unique session_id) — reuse if raced.
        payout = PayoutRecord.query.filter_by(session_id=session_id).first()
        if payout is None:
            payout = PayoutRecord(
                id=str(uuid.uuid4()),
                academy_id=academy_id,
                teacher_id=session.teacher_id,
                session_id=session_id,
                gross_revenue_da=gross,
                commission_type=commission_type,
                commission_value=commission_value,
                teacher_cut_da=teacher_cut,
                status="PENDING",
            )
            db.session.add(payout)
        db.session.flush()

        return {
            "session_id": session_id,
            "status": "conducted",
            "gross_revenue_da": gross,
            "teacher_cut_da": int(payout.teacher_cut_da or 0),
            "commission_type": payout.commission_type,
            "payout_id": payout.id,
        }
    else:
        session.status = "cancelled"
        # A cancelled session earns nothing: drop pending revenue facts and
        # never create a payout.
        RevenueEntry.query.filter_by(session_id=session_id).delete()
        PayoutRecord.query.filter_by(session_id=session_id).delete()
        db.session.flush()

        return {
            "session_id": session_id,
            "status": "cancelled",
        }


def list_subscriptions(
    academy_id: str, student_id: str = None,
    group_id: str = None, status: str = None,
) -> list:
    """List student subscriptions with optional filters."""
    from app.models.student import Student

    query = StudentSubscription.query.filter_by(academy_id=academy_id)
    if student_id:
        query = query.filter_by(student_id=student_id)
    if group_id:
        query = query.filter_by(group_id=group_id)
    if status:
        query = query.filter_by(status=status.upper())

    subs = query.order_by(StudentSubscription.created_at.desc()).all()
    result = []
    for sub in subs:
        student = db.session.get(Student, sub.student_id)
        group = db.session.get(Class, sub.group_id)
        result.append({
            "id": sub.id,
            "student_id": sub.student_id,
            "student_name": f"{student.first_name} {student.last_name}" if student else None,
            "group_id": sub.group_id,
            "group_name": group.name if group else None,
            "billing_model": sub.billing_model,
            "total_credits": sub.total_credits,
            "remaining_credits": sub.remaining_credits,
            "cycle_start_date": sub.cycle_start_date.isoformat() if sub.cycle_start_date else None,
            "cycle_deadline": sub.cycle_deadline.isoformat() if sub.cycle_deadline else None,
            "access_start_date": sub.access_start_date.isoformat() if sub.access_start_date else None,
            "access_end_date": sub.access_end_date.isoformat() if sub.access_end_date else None,
            "amount_paid_da": sub.amount_paid_da,
            "payment_method": sub.payment_method,
            "status": sub.status,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
        })
    return result


def renew_subscription(subscription_id: str, academy_id: str) -> dict:
    """Renew an expired/depleted subscription for the same group."""
    sub = db.session.get(StudentSubscription, subscription_id)
    if not sub or sub.academy_id != academy_id:
        return None

    group = db.session.get(Class, sub.group_id)
    if not group:
        return None

    now = date.today()
    if group.billing_model == "CREDIT_BASED":
        credits = group.credits_per_cycle
        # Rollover: if allow_rollover and previous has leftover
        if group.allow_rollover and sub.remaining_credits and sub.remaining_credits > 0:
            credits += sub.remaining_credits
        sub.total_credits = credits
        sub.remaining_credits = credits
        sub.cycle_start_date = now
        if group.cycle_week_limit:
            sub.cycle_deadline = now + timedelta(weeks=group.cycle_week_limit)
    else:
        sub.access_start_date = now
        if group.access_duration_weeks:
            sub.access_end_date = now + timedelta(weeks=group.access_duration_weeks)

    sub.status = "ACTIVE"
    sub.makeup_credits = 0
    db.session.flush()

    return {
        "id": sub.id,
        "status": sub.status,
        "total_credits": sub.total_credits,
        "remaining_credits": sub.remaining_credits,
    }


def list_payouts(
    academy_id: str, teacher_id: str = None, status: str = None,
) -> list:
    """List teacher payout records with optional filters.

    Newest session first (``PayoutRecord`` carries no timestamp of its
    own, so ordering follows the linked session date).
    """
    query = (
        PayoutRecord.query.filter_by(academy_id=academy_id)
        .join(Session, PayoutRecord.session_id == Session.id)
    )
    if teacher_id:
        query = query.filter(PayoutRecord.teacher_id == teacher_id)
    if status:
        query = query.filter(PayoutRecord.status == status.upper())

    records = query.order_by(desc(Session.date), desc(Session.start_time)).all()
    result = []
    for rec in records:
        teacher = db.session.get(Teacher, rec.teacher_id)
        session = db.session.get(Session, rec.session_id)
        result.append({
            "id": rec.id,
            "teacher_id": rec.teacher_id,
            "teacher_name": teacher.full_name if teacher else None,
            "session_id": rec.session_id,
            "session_date": session.date.isoformat() if session and session.date else None,
            "gross_revenue_da": int(rec.gross_revenue_da or 0),
            "commission_type": rec.commission_type,
            "commission_value": int(rec.commission_value or 0),
            "teacher_cut_da": int(rec.teacher_cut_da or 0),
            "status": rec.status,
            "paid_at": rec.paid_at.isoformat() if rec.paid_at else None,
            "paid_by_staff_id": rec.paid_by_staff_id,
            "created_at": session.date.isoformat() if session and session.date else None,
        })
    return result


def mark_payout_paid(payout_id: str, academy_id: str, staff_id: str) -> dict:
    """Mark a payout record as PAID (owner-only, PIN verified at route layer)."""
    rec = db.session.get(PayoutRecord, payout_id)
    if not rec or rec.academy_id != academy_id:
        return None

    rec.status = "PAID"
    rec.paid_at = datetime.now(timezone.utc)
    rec.paid_by_staff_id = staff_id
    db.session.flush()

    return {"id": rec.id, "status": rec.status, "paid_at": rec.paid_at.isoformat()}


def _same_level(group_a: Class, group_b: Class) -> bool:
    """Two groups share a billing level: same teacher + subject + level."""
    return (
        group_a is not None
        and group_b is not None
        and group_a.teacher_id == group_b.teacher_id
        and (group_a.subject or "") == (group_b.subject or "")
        and (group_a.academic_level or "") == (group_b.academic_level or "")
    )


def transfer_enrollment(enrollment_id: str, new_group_id: str) -> dict | None:
    """Transfer an enrollment to another group, keeping billing coherent.

    Same teacher/subject/level: the active subscription transparently
    follows — CREDIT_BASED pools are level-wide by design, and TIME_BASED
    bundles gain the new group via ``enrolled_group_ids`` (when the
    bundle still has room). The enrollment row is pointed at the new
    group and stays ``active``.
    Different level: the current subscription cannot cover the new group;
    the enrollment still moves but the result flags
    ``requires_new_payment=True`` so the caller can collect payment
    (e.g. via :func:`create_subscription_for_payment`).
    """
    enrollment = db.session.get(Enrollment, enrollment_id)
    if not enrollment:
        return None

    old_group = db.session.get(Class, enrollment.class_id)
    new_group = db.session.get(Class, new_group_id)
    if not old_group or not new_group:
        return None

    student_id = enrollment.student_id
    move = repoint_subscriptions_for_transfer(
        student_id, old_group.id, new_group_id
    )
    if "error" in move:
        return None

    enrollment.class_id = new_group_id
    enrollment.status = "active"
    db.session.flush()

    return {
        "enrollment_id": enrollment_id,
        "student_id": student_id,
        "old_group_id": old_group.id,
        "new_group_id": new_group_id,
        "same_level": move["same_level"],
        "requires_new_payment": move["requires_new_payment"],
        "moved_subscriptions": move["moved_subscriptions"],
    }


def repoint_subscriptions_for_transfer(
    student_id: str, old_group_id: str, new_group_id: str,
) -> dict:
    """Move a student's subscriptions across groups after a transfer.

    Same teacher/subject/level: ACTIVE subscriptions follow the move
    (CREDIT_BASED pools are level-wide; TIME_BASED bundles gain the new
    group via ``enrolled_group_ids`` when room allows) and stay ACTIVE.
    Different level: subscriptions stay put and the result flags
    ``requires_new_payment=True`` so the caller can collect a fresh
    payment for the new group.
    """
    old_group = db.session.get(Class, old_group_id)
    new_group = db.session.get(Class, new_group_id)
    if not old_group or not new_group:
        return {"error": "Group not found"}

    same = _same_level(old_group, new_group)
    moved: list[str] = []
    if same:
        for sub in StudentSubscription.query.filter_by(
            student_id=student_id, group_id=old_group_id, status="ACTIVE"
        ).all():
            if sub.billing_model == "CREDIT_BASED":
                sub.group_id = new_group_id
                moved.append(sub.id)
            elif sub.billing_model == "TIME_BASED":
                covered = list(sub.enrolled_group_ids or [])
                if new_group_id not in covered:
                    if len(covered) < max(int(sub.max_groups_included or 1), 1):
                        covered.append(new_group_id)
                        sub.enrolled_group_ids = covered
                sub.group_id = new_group_id
                moved.append(sub.id)
        db.session.flush()

    return {
        "same_level": same,
        "requires_new_payment": not same,
        "moved_subscriptions": moved,
    }


def guest_swap_checkin(student_id: str, session_id: str) -> dict:
    """Guest (group-swap) check-in helper for the service layer.

    Marks the attendance row ``is_group_swap=True`` and decrements the
    student's level-based CREDIT_BASED subscription (same
    teacher/subject/level as the session's group). Returns the attendance
    record id plus the billing side-effect summary. The attendance row
    itself is owned by ``attendance_service.check_in_student``.
    """
    from app.services import attendance_service as _attendance

    session = db.session.get(Session, session_id)
    if not session:
        return {"error": "Session not found"}

    # apply_billing=False: side effects are applied exactly once via the
    # explicit record_checkin_billing_side_effects call below.
    record = _attendance.check_in_student(
        session_id=session_id,
        student_id=student_id,
        academy_id=session.academy_id,
        checked_in_by=None,
        status="PRESENT",
        is_group_swap=True,
        apply_billing=False,
    )
    billing = record_checkin_billing_side_effects(
        session_id=session_id,
        student_id=student_id,
        status="PRESENT",
        is_group_swap=True,
        checked_in_by=record.checked_in_by,
        academy_id=session.academy_id,
    )
    return {
        "attendance_id": record.id,
        "session_id": session_id,
        "student_id": student_id,
        "is_group_swap": True,
        "billing": billing,
    }


def get_revenue(
    academy_id: str, group_id: str = None, session_id: str = None,
) -> dict:
    """Get revenue totals with optional filters."""
    query = RevenueEntry.query.filter_by(academy_id=academy_id)
    if group_id:
        query = query.filter_by(group_id=group_id)
    if session_id:
        query = query.filter_by(session_id=session_id)

    entries = query.all()
    total = sum(e.amount_da for e in entries)
    return {"total_da": total, "count": len(entries)}


def get_session_attendance_summary(student_id: str, subscription: StudentSubscription) -> dict:
    """
    Compute attendance summary for a student based on their subscription.
    Used by roster to show ATTENDANCE_WARNING badges.
    """
    from app.models.attendance import SessionStudent

    if not subscription:
        return {"total_sessions": 0, "attended": 0, "absent": 0, "attendance_rate": 1.0}

    # Count all session students for this student in the subscription's group
    total = SessionStudent.query.filter_by(student_id=student_id).count()
    attended = SessionStudent.query.filter_by(
        student_id=student_id, is_present=True
    ).count()

    rate = attended / total if total > 0 else 1.0

    return {
        "total_sessions": total,
        "attended": attended,
        "absent": total - attended,
        "attendance_rate": rate,
    }
