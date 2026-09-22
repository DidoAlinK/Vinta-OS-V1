"""
Vinta School OS — Attendance Service
Manual check-in, auto-checkout at class end, popup status.
"""
import uuid
from datetime import datetime, timezone
from app.extensions import db
from app.models.attendance import SessionStudent
from app.models.scheduling import Session
from app.models.audit import ActivityLog


def check_in_student(
    session_id: str, student_id: str, academy_id: str, checked_in_by: str,
    status: str = "PRESENT", is_group_swap: bool = False,
    apply_billing: bool = True,
) -> SessionStudent:
    """Mark a student as checked in to a session.

    Args:
        session_id: session being attended.
        student_id: student attending.
        academy_id: tenant scope (also used for billing side effects).
        checked_in_by: staff user id recording the check-in — PIN
            attribution (``@verify_staff_pin``) is enforced at the route
            layer; the id is stored on ``checked_in_by``.
        status: PRESENT | ABSENT. ABSENT rows still consume a credit for
            CREDIT_BASED groups (the seat is taken); with ``allow_makeups``
            a makeup credit is flagged instead of refunding.
        is_group_swap: True for guest check-ins into a different group —
            billing resolves the level-based subscription.
        apply_billing: run billing side effects inline (default True).
            Pass False when the caller drives
            ``billing_service.record_checkin_billing_side_effects`` itself
            to avoid double-charging.

    After the record is created/updated, billing side effects run via
    ``billing_service.record_checkin_billing_side_effects`` (imported
    lazily to avoid a circular import).
    """
    status = (status or "PRESENT").upper()
    if status not in ("PRESENT", "ABSENT"):
        status = "PRESENT"

    record = SessionStudent.query.filter_by(
        session_id=session_id, student_id=student_id
    ).first()

    now = datetime.now(timezone.utc)
    if record:
        # Update existing record
        record.is_present = (status == "PRESENT")
        record.status = status
        record.is_group_swap = bool(is_group_swap)
        record.timestamp = now
        if status == "PRESENT":
            record.checked_in_at = now
            record.checked_in_by = checked_in_by
    else:
        # Create new record
        record = SessionStudent(
            id=str(uuid.uuid4()),
            session_id=session_id,
            student_id=student_id,
            is_present=(status == "PRESENT"),
            status=status,
            is_group_swap=bool(is_group_swap),
            timestamp=now,
            checked_in_at=now if status == "PRESENT" else None,
            checked_in_by=checked_in_by,
            payment_status="paid",
        )
        db.session.add(record)

    # Audit log
    from app.models.student import Student
    student = db.session.get(Student, student_id)
    student_name = f"{student.first_name} {student.last_name}" if student else "Unknown"

    log = ActivityLog(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        user_id=checked_in_by or "system",
        entity_type="session",
        entity_id=session_id,
        action="checked_in",
        description=f"Student check-in — {student_name} ({status})",
    )
    db.session.add(log)
    db.session.flush()

    if apply_billing:
        from app.services.billing_service import (
            record_checkin_billing_side_effects as _billing_side_effects,
        )
        _billing_side_effects(
            session_id=session_id,
            student_id=student_id,
            status=status,
            is_group_swap=bool(is_group_swap),
            checked_in_by=checked_in_by,
            academy_id=academy_id,
        )

    return record


def check_out_student(
    session_id: str, student_id: str, academy_id: str
) -> SessionStudent | None:
    """Check out a student from a session."""
    record = SessionStudent.query.filter_by(
        session_id=session_id, student_id=student_id
    ).first()

    if not record or not record.is_present:
        return None

    record.checked_out_at = datetime.now(timezone.utc)

    from app.models.student import Student
    student = db.session.get(Student, student_id)
    student_name = f"{student.first_name} {student.last_name}" if student else "Unknown"

    log = ActivityLog(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        user_id=record.checked_in_by or "system",
        entity_type="session",
        entity_id=session_id,
        action="checked_out",
        description=f"Student check-out — {student_name}",
    )
    db.session.add(log)
    db.session.flush()

    return record


def auto_checkout_session(session_id: str, academy_id: str) -> int:
    """
    Auto check-out all present students when session ends.
    Returns count of students checked out.
    """
    now = datetime.now(timezone.utc)
    records = SessionStudent.query.filter_by(
        session_id=session_id, is_present=True
    ).filter(SessionStudent.checked_out_at.is_(None)).all()

    count = 0
    for record in records:
        record.checked_out_at = now
        count += 1

    if count > 0:
        log = ActivityLog(
            id=str(uuid.uuid4()),
            academy_id=academy_id,
            user_id="system",
            entity_type="session",
            entity_id=session_id,
            action="checked_out",
            description=f"Auto check-out — {count} students",
        )
        db.session.add(log)
        db.session.flush()

    return count


def get_session_roster(session_id: str) -> list:
    """Get the full roster for a session with attendance status."""
    records = SessionStudent.query.filter_by(session_id=session_id).all()

    roster = []
    for record in records:
        student = record.student
        roster.append({
            "id": record.id,
            "student_id": record.student_id,
            "student_name": f"{student.first_name} {student.last_name}" if student else "Unknown",
            "is_present": record.is_present,
            "status": record.status,
            "is_group_swap": record.is_group_swap,
            "checked_in_at": record.checked_in_at.isoformat() if record.checked_in_at else None,
            "checked_out_at": record.checked_out_at.isoformat() if record.checked_out_at else None,
            "checked_in_by": record.checked_in_by,
            "payment_status": record.payment_status,
        })

    return roster


def get_session_roster_with_badges(session_id: str) -> list:
    """
    Roster enriched with subscription status per student:
    remaining_credits / access_end plus RENEW_REQUIRED /
    ATTENDANCE_WARNING badges. Purely additive — base roster untouched.
    """
    from datetime import date
    from app.models.billing import StudentSubscription
    from app.models.class_room import Class

    roster = get_session_roster(session_id)
    if not roster:
        return roster

    session = db.session.get(Session, session_id)
    group = db.session.get(Class, session.class_id) if session else None

    for entry in roster:
        student_id = entry.get("student_id")
        subs = StudentSubscription.query.filter_by(
            student_id=student_id, status="ACTIVE"
        ).all()

        # Prefer the subscription for this session's group
        sub = next((s for s in subs if session and s.group_id == session.class_id), None)

        remaining = sub.remaining_credits if sub else None
        access_end = None
        for s in subs:
            if s.access_end_date and (access_end is None or s.access_end_date > access_end):
                access_end = s.access_end_date

        entry["remaining_credits"] = remaining
        entry["access_end"] = access_end.isoformat() if access_end else None

        badges = []
        if not subs:
            badges.append("RENEW_REQUIRED")
        else:
            if sub and sub.billing_model == "CREDIT_BASED" and (sub.remaining_credits or 0) <= 0:
                badges.append("RENEW_REQUIRED")
            if access_end and access_end < date.today():
                badges.append("RENEW_REQUIRED")

        if group and group.enforce_attendance and group.attendance_threshold:
            total = SessionStudent.query.filter_by(student_id=student_id).join(
                Session, SessionStudent.session_id == Session.id
            ).filter(Session.class_id == group.id).count()
            attended = SessionStudent.query.filter_by(
                student_id=student_id, is_present=True
            ).join(Session, SessionStudent.session_id == Session.id).filter(
                Session.class_id == group.id
            ).count()
            if total > 0 and (attended / total) < float(group.attendance_threshold):
                badges.append("ATTENDANCE_WARNING")

        entry["badges"] = badges

    return roster


def add_student_to_session(
    session_id: str, student_id: str, academy_id: str, added_by: str
) -> tuple[SessionStudent, bool]:
    """Add a student to a session roster. Returns (record, is_new)."""
    existing = SessionStudent.query.filter_by(
        session_id=session_id, student_id=student_id
    ).first()
    if existing:
        return existing, False

    record = SessionStudent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        student_id=student_id,
        is_present=False,
        payment_status="paid",
    )
    db.session.add(record)

    log = ActivityLog(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        user_id=added_by,
        entity_type="session",
        entity_id=session_id,
        action="created",
        description="Student added to session",
    )
    db.session.add(log)
    db.session.flush()

    return record, True
