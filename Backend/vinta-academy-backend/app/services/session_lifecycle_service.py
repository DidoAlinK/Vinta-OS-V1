"""
Vinta School OS — Session Lifecycle Service

"a class does not exist until it starts."

A session sits in SCHEDULED as a plan on the calendar: it holds no
attendance and no money. Everything real begins when the class is started,
which is the moment the register is materialised ("false until true") —
every enrolled student gets a row that starts ABSENT, and the desk flips
students to PRESENT as they arrive.

Lifecycle: scheduled -> in_progress -> conducted, with scheduled and
in_progress both able to go to cancelled. `completed` is the legacy
spelling of `conducted`; both are terminal and treated identically here.

Every academy-toggle read happens at the decision point (no caching, no
startup wiring), so changing a Billing Rule mid-day takes effect on the
very next class rather than on the next restart.
"""

import uuid
from datetime import datetime, timezone

from app.extensions import db
from app.models.attendance import SessionStudent
from app.models.audit import ActivityLog
from app.models.class_room import Class
from app.models.scheduling import Session
from app.models.student import Enrollment
from app.services.academy_rules import (
    free_session_auto_present,
    settings_for,
)

# Lifecycle states
SCHEDULED = "scheduled"
IN_PROGRESS = "in_progress"
CONDUCTED = "conducted"
CANCELLED = "cancelled"
LEGACY_COMPLETED = "completed"

#: A class that is finished, in either spelling.
FINISHED = (CONDUCTED, LEGACY_COMPLETED)


class LifecycleError(Exception):
    """An illegal transition. ``status`` is the HTTP status the route returns."""

    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.message = message
        self.status = status


def is_finished(status: str | None) -> bool:
    """True for both `conducted` and its legacy spelling."""
    return status in FINISHED


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

def materialize_roster(
    session: Session, *, mark_present: bool = False
) -> list[SessionStudent]:
    """
    Create the register for ``session`` from its group's active enrollments.

    "False until true": each new row starts ABSENT, with no recorded
    timestamp — the row exists, but nobody has acted on it yet. The desk
    flips students to PRESENT as they arrive.

    Idempotent. A student who already has a row keeps it untouched, so
    restarting a class, retrying a request, or re-running this by hand can
    never duplicate the register or reset an attendance someone already
    recorded.

    ``mark_present`` is used only for free sessions (toggle 6); it fills the
    register in without recording a check-in, because no staff member
    checked anybody in — the class being free did.
    """
    enrolled = (
        db.session.query(Enrollment.student_id)
        .filter(
            Enrollment.class_id == session.class_id,
            # Enrollment.status is lowercase ('active'); StudentSubscription
            # uses uppercase. Mixing the two silently returns nothing.
            Enrollment.status == "active",
        )
        .all()
    )

    already = {
        row[0]
        for row in db.session.query(SessionStudent.student_id)
        .filter(SessionStudent.session_id == session.id)
        .all()
    }

    now = datetime.now(timezone.utc)
    created: list[SessionStudent] = []
    for (student_id,) in enrolled:
        if student_id in already:
            continue
        row = SessionStudent(
            id=str(uuid.uuid4()),
            session_id=session.id,
            student_id=student_id,
            is_present=mark_present,
            status="PRESENT" if mark_present else "ABSENT",
            # Only an auto-filled register has a timestamp; a human check-in
            # goes through check_in_student, which owns that column.
            timestamp=now if mark_present else None,
        )
        db.session.add(row)
        created.append(row)

    return created


# ---------------------------------------------------------------------------
# Transitions
# ---------------------------------------------------------------------------

def _log(academy_id: str, staff_id: str | None, session_id: str, action: str, description: str) -> None:
    db.session.add(ActivityLog(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        # staff_id straight through, never a "system" fallback: user_id is a
        # foreign key to users.id and SQLite enforces it, so a sentinel that
        # is not a real user raises IntegrityError and takes the request with
        # it. NULL is the honest "no human" and reads back as "System".
        user_id=staff_id or None,
        entity_type="session",
        entity_id=session_id,
        action=action,
        description=description,
    ))


def start_session(
    session_id: str, academy_id: str, staff_id: str | None
) -> tuple[Session, list[SessionStudent], bool]:
    """
    SCHEDULED -> IN_PROGRESS, and open the register.

    Returns ``(session, created_rows, already_started)``. Starting an
    already-started class is not an error — a double-click or a retried
    request must not restart the clock or duplicate the register — so it
    returns the existing state with ``already_started=True``. It still
    ensures the register exists, so a class that somehow reached
    ``in_progress`` without one is repaired rather than left to finalise
    against nothing.
    """
    session = db.session.get(Session, session_id)
    if not session or session.academy_id != academy_id:
        raise LifecycleError("Session not found", 404)

    current = session.status or SCHEDULED

    if current == IN_PROGRESS:
        # Already started, so the clock is not reset and no second log line is
        # written — but the invariant "a started class has a register" is
        # still enforced. A class can be in_progress with no rows (started
        # before this service existed, or by a path that did not open the
        # register), and leaving it that way would silently finalise a class
        # that charged nobody. materialize_roster only adds missing rows, so
        # this cannot disturb attendance anyone already recorded.
        group = db.session.get(Class, session.class_id)
        auto_present = bool(session.is_free_session) and free_session_auto_present(academy_id)
        created = materialize_roster(session, mark_present=auto_present)
        db.session.flush()
        return session, created, True

    if current != SCHEDULED:
        raise LifecycleError(
            f"Cannot start a class that is already {current}", 409
        )

    now = datetime.now(timezone.utc)
    session.status = IN_PROGRESS
    session.actual_start_time = now
    session.started_by_staff_id = staff_id

    group = db.session.get(Class, session.class_id)
    auto_present = bool(session.is_free_session) and free_session_auto_present(academy_id)
    created = materialize_roster(session, mark_present=auto_present)

    label = group.name if group else "class"
    detail = " — free session, register auto-filled" if auto_present else ""
    _log(
        academy_id, staff_id, session_id, "started",
        f"Started {label}: {len(created)} student(s) on the register{detail}",
    )

    db.session.flush()
    return session, created, False


def settle_absences(
    session: Session, academy_id: str, staff_id: str | None
) -> dict:
    """
    Charge the students who did not turn up, per the academy's policy.

    Only ABSENT rows are settled. Students who attended were already charged
    when they were checked in, so charging the whole register here would bill
    every attendee twice.

    The two policy decisions this depends on — whether a free session bills
    at all, and whether an absence spends a credit — are made inside the
    billing service, which owns them. They are deliberately not repeated
    here; two copies of a money rule is how they drift apart.
    """
    from app.services.billing_service import record_checkin_billing_side_effects

    rows = db.session.query(SessionStudent).filter_by(session_id=session.id).all()
    summary = {"present": 0, "absent": 0, "charged_absences": 0, "skipped": 0}

    for row in rows:
        if row.is_present:
            summary["present"] += 1
            continue

        summary["absent"] += 1
        result = record_checkin_billing_side_effects(
            session_id=session.id,
            student_id=row.student_id,
            status="ABSENT",
            is_group_swap=bool(row.is_group_swap),
            checked_in_by=staff_id,
            academy_id=academy_id,
        )
        actions = result.get("actions", [])
        if any("credits decremented" in action for action in actions):
            summary["charged_absences"] += 1
        else:
            summary["skipped"] += 1

    return summary


def end_session(
    session_id: str, academy_id: str, staff_id: str | None
) -> tuple[Session, dict, bool]:
    """
    IN_PROGRESS -> CONDUCTED, and close the register.

    This is the step that settles money: the desk confirms the class is over,
    absences are charged according to the academy's rules, and the register
    is closed. It is PIN-gated at the route layer for exactly that reason.

    Returns ``(session, summary, already_ended)``. Ending an already-finished
    class is not an error — it reports the existing state without charging
    anyone a second time.
    """
    session = db.session.get(Session, session_id)
    if not session or session.academy_id != academy_id:
        raise LifecycleError("Session not found", 404)

    if is_finished(session.status):
        return session, {
            "present": 0, "absent": 0, "charged_absences": 0,
            "skipped": 0, "checked_out": 0,
        }, True

    if session.status != IN_PROGRESS:
        raise LifecycleError(
            "Cannot end a class that has not started "
            f"(status is {session.status or 'unknown'})",
            409,
        )

    summary = settle_absences(session, academy_id, staff_id)

    session.status = CONDUCTED
    session.actual_end_time = datetime.now(timezone.utc)
    session.ended_by_staff_id = staff_id

    # Auto check-out is a preference rather than a rule — the desk may want
    # to close the register by hand.
    settings = settings_for(academy_id)
    if settings is None or settings.auto_checkout_enabled:
        from app.services.attendance_service import auto_checkout_session
        # Attributed to whoever ended the class — the check-out is automatic
        # but it did not happen on its own, and an audit line naming nobody
        # when somebody pressed the button would be a worse answer than one
        # naming the person who did.
        summary["checked_out"] = auto_checkout_session(
            session.id, academy_id, staff_id
        )
    else:
        summary["checked_out"] = 0

    _log(
        academy_id, staff_id, session_id, "ended",
        f"Class finished — {summary['present']} present, {summary['absent']} absent "
        f"({summary['charged_absences']} charged)",
    )

    db.session.flush()
    return session, summary, False
