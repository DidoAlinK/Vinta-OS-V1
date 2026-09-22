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
from app.models.academy import AcademySettings
from app.models.attendance import SessionStudent
from app.models.audit import ActivityLog
from app.models.class_room import Class
from app.models.scheduling import Session
from app.models.student import Enrollment

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


# ---------------------------------------------------------------------------
# Academy toggles — read at decision time
# ---------------------------------------------------------------------------

def _settings(academy_id: str) -> AcademySettings | None:
    return AcademySettings.query.filter_by(academy_id=academy_id).first()


def absence_consumes_credit(academy_id: str) -> bool:
    """
    Toggle 1 — does a missed session still spend a credit?

    Defaults to True, matching the model default, so an academy that has
    never opened Settings still behaves as documented.
    """
    settings = _settings(academy_id)
    return True if settings is None else bool(settings.absence_consumes_credit)


def free_session_auto_present(academy_id: str) -> bool:
    """
    Toggle 6 — auto-mark everyone PRESENT for a free session?

    Defaults to True. A free session has no money attached, so tracking
    who turned up earns nothing and the register is filled in for you.
    """
    settings = _settings(academy_id)
    return True if settings is None else bool(settings.free_session_auto_present)


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
        user_id=staff_id or "system",
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
    returns the existing state with ``already_started=True``.
    """
    session = db.session.get(Session, session_id)
    if not session or session.academy_id != academy_id:
        raise LifecycleError("Session not found", 404)

    current = session.status or SCHEDULED

    if current == IN_PROGRESS:
        return session, [], True

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
