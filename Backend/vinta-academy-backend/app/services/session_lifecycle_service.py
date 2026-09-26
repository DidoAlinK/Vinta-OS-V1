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
from datetime import date, datetime, timezone

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

#: A class that meets once and is never generated again. The counterpart,
#: ``weekly``, is a recurring slot that keeps producing sessions, so a past
#: instance of it is not the end of anything. Mirrors
#: ``class_type_enum`` in app/models/class_room.py.
TEMPORARY = "temporary"

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

    # A class may only be started on its own day.
    #
    # This is the guard that makes "a class is not active until the desk
    # starts it" actually hold. Without it a future-dated class could be
    # started, and it would then sit IN_PROGRESS indefinitely — a live lamp
    # on the Classrooms tab for a class weeks away, holding a register of
    # attendance taken before the class happened. That is exactly how a
    # session dated 2026-10-06 came to be started on 2026-09-24.
    #
    # It also closes the older hole at the other end: a months-old
    # `scheduled` row could be started today, which stamped
    # `actual_start_time` as now and materialised a register for a class
    # nobody ran.
    #
    # `session.date` is a local wall-clock date, not UTC — same basis as
    # `Session.start_time`/`end_time`, which the client reads back through
    # lib/sessionTime.ts as local. So the comparison is local-against-local
    # on purpose; do not "fix" this to UTC without migrating the columns.
    # (`auto_checkout_expired_sessions` carries the same note.)
    #
    # Same day rather than "within N hours" deliberately: it explains itself
    # to the desk without a rule they cannot see, and it survives a late
    # start, an early start, and a browser whose clock is a little off.
    if session.date != date.today():
        raise LifecycleError(
            "This class can only be started on its own day "
            f"({session.date:%Y-%m-%d}); today is {date.today():%Y-%m-%d}.",
            409,
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


def close_past_temporary_sessions() -> int:
    """
    Close out one-off classes whose day passed without ever being started.

    **Temporary classes only.** A weekly class's past instance is history for
    a group that is still meeting: the desk may yet want to say what happened
    to it, and the next session in the series is the one that matters, so it
    is left as ``scheduled``. A temporary class has no next session, so a past
    unstarted one is simply over — and leaving it ``scheduled`` forever means
    it never stops being due and is counted as pending on every screen that
    lists the register.

    Cancelled, NOT conducted, and that is a money decision rather than a
    wording one. ``conducted`` is what the payroll and revenue reports read
    (``billing_service`` scans ``conducted``/``completed`` to total classes
    taught and teacher payout), so marking a class nobody taught as conducted
    would count it as taught and pay the teacher for it. ``cancelled`` is
    terminal, settles nothing, and stays in the session list and the activity
    log as the record of what happened.

    Only ``scheduled`` rows are touched. A class that WAS started has a
    register and a real outcome, and ending it — with its absences charged —
    is the desk's call through the Finish flow, not a timer's. Note that even
    the cancellation path reaches no money: the register is materialised by
    ``start_session``, so a class that was never started has no rows for
    ``settle_absences`` to charge.

    Returns the number of sessions closed.
    """
    from app.models.academy import Academy
    from app.services.scheduling_service import cancel_session

    today = date.today()
    closed = 0

    for academy in Academy.query.all():
        rows = (
            db.session.query(Session)
            .join(Class, Class.id == Session.class_id)
            .filter(
                Session.academy_id == academy.id,
                Session.status == SCHEDULED,
                Session.date < today,
                Class.class_type == TEMPORARY,
            )
            .all()
        )

        for session in rows:
            # ``cancel_session`` refuses anything outside
            # CANCELLABLE_STATUSES, which is the guard that keeps a settled
            # class from being relabelled. Nothing here can reach that state
            # (the query is SCHEDULED-only), but going through it anyway means
            # the rule lives in one place rather than two.
            if cancel_session(session.id, academy.id, reason="OTHER") is None:
                continue

            closed += 1
            # staff_id is None: no human did this, and the column is a real
            # foreign key to users.id, so a sentinel would raise. It reads
            # back as "System".
            _log(
                academy.id, None, session.id, "cancelled",
                f"Closed automatically — a one-off class dated "
                f"{session.date:%Y-%m-%d} passed without being started. "
                f"No register was taken and nothing was charged.",
            )

    if closed:
        db.session.commit()

    return closed
