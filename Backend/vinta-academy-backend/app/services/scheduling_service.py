"""
Vinta School OS — Scheduling Service
Recurring slot generation, drag-to-rescheduling, 5-min snapping, session CRUD.
"""
import uuid
from datetime import date, time, datetime, timedelta
from sqlalchemy import and_
from app.extensions import db
from app.models.scheduling import Schedule, Session
from app.models.class_room import Class
from app.models.teacher import Teacher
from app.models.audit import ActivityLog


# 5-minute snap grid
SNAP_MINUTES = 5


def snap_time(hour: int, minute: int) -> time:
    """Snap a time to the nearest 5-minute grid."""
    snapped_minute = (minute // SNAP_MINUTES) * SNAP_MINUTES
    if snapped_minute >= 60:
        if hour + 1 >= 24:
            return time(23, 55)
        return time(hour + 1, 0)
    return time(hour, snapped_minute)


def snap_time_obj(t: time) -> time:
    """Snap a time object to the nearest 5-minute grid."""
    return snap_time(t.hour, t.minute)


def get_week_sessions(academy_id: str, week_start: date) -> list:
    """Get all sessions for a given week."""
    week_end = week_start + timedelta(days=6)

    sessions = Session.query.filter(
        Session.academy_id == academy_id,
        Session.date >= week_start,
        Session.date <= week_end,
    ).order_by(Session.date, Session.start_time).all()

    return [_serialize_session(s) for s in sessions]


def get_day_sessions(academy_id: str, target_date: date) -> list:
    """Get all sessions for a specific day."""
    sessions = Session.query.filter(
        Session.academy_id == academy_id,
        Session.date == target_date,
    ).order_by(Session.start_time).all()

    return [_serialize_session(s) for s in sessions]


def get_class_sessions(
    academy_id: str,
    class_id: str,
    date_from: date | None = None,
    date_to: date | None = None,
    statuses: list[str] | None = None,
    limit: int = 50,
) -> list:
    """
    Get one group's sessions, soonest first.

    A group's page needs its own sessions rather than a week of everyone's:
    the week and day views answer "what is happening on this date", but a
    card for Group A has to answer "when does Group A next meet", which no
    date-scoped view can. Ordered by date then start time so the first row
    is the next class to run.

    ``date_from`` defaults to today — a group's card is about what is
    coming, not its history — and can be moved back explicitly to read past
    sessions.
    """
    query = Session.query.filter(
        Session.academy_id == academy_id,
        Session.class_id == class_id,
    )

    if date_from is not None:
        query = query.filter(Session.date >= date_from)
    if date_to is not None:
        query = query.filter(Session.date <= date_to)
    if statuses:
        query = query.filter(Session.status.in_(statuses))

    sessions = (
        query.order_by(Session.date, Session.start_time).limit(limit).all()
    )
    return [_serialize_session(s) for s in sessions]


def create_session(academy_id: str, data: dict, created_by: str) -> Session:
    """Create a new session (from drag-to-create or manual form)."""
    start_time = _parse_time(data["start_time"])
    end_time = _parse_time(data["end_time"])
    target_date = date.fromisoformat(data["date"])

    # Snap to 5-minute grid
    start_time = snap_time_obj(start_time)
    end_time = snap_time_obj(end_time)

    # Denormalize from class/teacher
    class_ = db.session.get(Class, data["class_id"])
    if not class_:
        raise ValueError("Class not found")

    teacher_id = data.get("teacher_id") or class_.teacher_id
    subject = data.get("subject") or class_.subject

    if not teacher_id:
        raise ValueError("Class has no teacher assigned. Please assign a teacher first.")

    session = Session(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        class_id=data["class_id"],
        schedule_id=data.get("schedule_id"),
        teacher_id=teacher_id,
        classroom_id=data.get("classroom_id"),
        date=target_date,
        start_time=start_time,
        end_time=end_time,
        subject=subject,
        status="scheduled",
    )
    db.session.add(session)

    log = ActivityLog(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        user_id=created_by,
        entity_type="session",
        entity_id=session.id,
        action="created",
        description=f"New session scheduled — {subject or class_.name}",
    )
    db.session.add(log)
    db.session.flush()

    return session


# Fields a session may be PATCHed with while it is live.
#
# A class that is under way is history in progress, and the hamburger's
# "Edit THIS instance" is refused for it precisely so the record cannot be
# rewritten. Extend is the one exception, and it is a narrow one: the class
# is running long and the desk is saying so. Nothing about the past moves,
# so `date` and `start_time` stay locked.
LIVE_EDITABLE_FIELDS = frozenset({"end_time"})

# These must match ``session_cancel_reason_enum`` on Session.cancelled_reason —
# a value that is not in the database's enum is rejected by the column.
#
# A voided live class is recorded as ``CANCELLED_BY_STAFF`` rather than given a
# value of its own. It is tempting to add ``LIVE_VOID``, but that is a change to
# a native database enum, which means a migration and (on MySQL) a rewrite of
# the column — too much to hang off a UI fix, and it would be a lie to say the
# distinction is otherwise lost: a voided class has ``actual_start_time`` set,
# because it really did start, while a class cancelled before it ran does not.
# The row already carries the difference; the label is not the only witness.
CANCEL_REASONS = ("TEACHER_ABSENT", "CANCELLED_BY_STAFF", "OTHER")

# A cancellation describes a class that has NOT been settled: either it has not
# run yet (``scheduled``) or it is running and is being abandoned
# (``in_progress``, a "void"). Terminal rows are history — see cancel_session.
CANCELLABLE_STATUSES = frozenset({"scheduled", "in_progress"})


def update_session_times(session_id: str, academy_id: str, data: dict) -> Session | None:
    """
    Update session date/times (drag-to-move or edge-resize).

    Scheduled sessions are freely movable. A session that has already
    started may only have its ``end_time`` pushed *later* — that is Extend,
    and it is the one edit that describes a class still in progress rather
    than revising one that happened. Any other field, or an end time that
    does not move forward, returns None so the caller can refuse it.

    ``is_free_session`` is settable on both: the free flag is a billing
    decision about a session, not a property of when it runs, and the desk
    sets it on the next scheduled class.
    """
    session = Session.query.filter_by(
        id=session_id, academy_id=academy_id
    ).first()
    if not session:
        return None

    if session.status != "scheduled":
        if session.status != "in_progress":
            return None
        if set(data) - LIVE_EDITABLE_FIELDS:
            return None
        if "end_time" not in data:
            return None
        new_end = snap_time_obj(_parse_time(data["end_time"]))
        # Forward only: "extend" that shortens the class is not an extend,
        # and a live class's end time can only ever grow.
        if new_end <= session.end_time:
            return None
        session.end_time = new_end
        db.session.flush()
        return session

    if "date" in data:
        session.date = date.fromisoformat(data["date"])
    if "start_time" in data:
        session.start_time = snap_time_obj(_parse_time(data["start_time"]))
    if "end_time" in data:
        new_end = snap_time_obj(_parse_time(data["end_time"]))
        # A scheduled session may be shortened or lengthened freely — nothing
        # has happened yet — but it must still end after it starts.
        if new_end <= session.start_time:
            return None
        session.end_time = new_end
    if "is_free_session" in data:
        session.is_free_session = bool(data["is_free_session"])

    db.session.flush()
    return session


def cancel_session(
    session_id: str, academy_id: str, reason: str | None = None
) -> Session | None:
    """
    Cancel a session, recording *why*.

    The reason is not decoration: ``TEACHER_ABSENT`` is what tells the
    register, the credit policy and the teacher's pay that this class did
    not happen for a reason that is nobody at the desk's fault, and it is
    the difference between "the academy cancelled" and "the teacher did not
    turn up". Without it every cancellation looked identical.

    An unrecognised reason is recorded as ``OTHER`` rather than rejected:
    the session is cancelled either way, and losing the cancellation to
    save a label would be the worse trade.

    Refuses a session that is already settled. ``conducted`` has already
    written payouts, consumed credits and closed the register against this
    row, and setting it to ``cancelled`` undoes none of that — it only makes
    the record disagree with the money, leaving charges standing against a
    class the app now says never happened. The same applies to a row that is
    already ``cancelled``. A void is the ``in_progress`` case and is allowed.

    Returns the cancelled session, or None if there is no such session or the
    session cannot be cancelled.
    """
    session = Session.query.filter_by(
        id=session_id, academy_id=academy_id
    ).first()
    if not session:
        return None

    if session.status not in CANCELLABLE_STATUSES:
        return None

    session.status = "cancelled"
    if reason:
        session.cancelled_reason = (
            reason if reason in CANCEL_REASONS else "OTHER"
        )
    db.session.flush()
    return session


def generate_sessions_from_schedule(schedule_id: str, weeks_ahead: int = 12) -> int:
    """
    Generate concrete Session instances from a recurring Schedule entry.
    Creates sessions for the next `weeks_ahead` weeks.
    Returns the count of sessions created.
    """
    schedule = db.session.get(Schedule, schedule_id)
    if not schedule:
        return 0

    class_ = db.session.get(Class, schedule.class_id)
    if not class_:
        return 0

    count = 0
    today = date.today()
    start_date = today

    for week in range(weeks_ahead):
        # Find the next occurrence of this day_of_week.
        #
        # The two scales are not the same one, and subtracting them directly is
        # how every session came out a day late: `Schedule.day_of_week` is
        # 0=Sun…6=Sat (what the API accepts and what `Date.getDay()` returns,
        # so it is what the desk picks), while `date.weekday()` is 0=Mon…6=Sun.
        # A Monday slot generated Tuesdays, for all twelve weeks. Convert first.
        days_ahead = schedule.day_of_week - (start_date.weekday() + 1)
        if days_ahead < 0:
            days_ahead += 7
        session_date = start_date + timedelta(days=days_ahead + (week * 7))

        # Skip if session already exists
        existing = Session.query.filter_by(
            class_id=schedule.class_id,
            schedule_id=schedule_id,
            date=session_date,
        ).first()
        if existing:
            continue

        session = Session(
            id=str(uuid.uuid4()),
            academy_id=class_.academy_id,
            class_id=schedule.class_id,
            schedule_id=schedule_id,
            teacher_id=class_.teacher_id,
            classroom_id=schedule.classroom_id,
            date=session_date,
            start_time=schedule.start_time,
            end_time=schedule.end_time,
            subject=class_.subject,
            status="scheduled",
        )
        db.session.add(session)
        count += 1

    db.session.flush()
    return count


# --- Helpers ---

def _parse_time(time_str: str) -> time:
    """Parse a time string like '08:00' or '8:30' into a time object."""
    if isinstance(time_str, time):
        return time_str
    parts = time_str.split(":")
    return time(int(parts[0]), int(parts[1]))


def _serialize_session(session: Session) -> dict:
    """
    Serialize a session to a dict for API response.

    The lifecycle fields are part of this shape deliberately. Whether a class
    has actually started or finished is a fact the server owns — it is what
    decides who gets charged — so the client has to be able to read it back.
    Without these the UI had to keep its own started-time in localStorage,
    which meant two answers to one question: reloading the browser forgot a
    class had begun, and the register the server had opened went with it.
    """
    return {
        "id": session.id,
        "class_id": session.class_id,
        "class_name": session.class_.name if session.class_ else None,
        "teacher_id": session.teacher_id,
        "teacher_name": session.teacher.full_name if session.teacher else None,
        "classroom_id": session.classroom_id,
        "date": session.date.isoformat(),
        "start_time": session.start_time.strftime("%H:%M"),
        "end_time": session.end_time.strftime("%H:%M"),
        "subject": session.subject,
        "status": session.status,
        "color": session.class_.color if session.class_ else None,
        # Lifecycle — see the docstring.
        "schedule_id": session.schedule_id,
        "is_free_session": bool(session.is_free_session),
        "actual_start_time": (
            session.actual_start_time.isoformat()
            if session.actual_start_time else None
        ),
        "actual_end_time": (
            session.actual_end_time.isoformat()
            if session.actual_end_time else None
        ),
        "started_by_staff_id": session.started_by_staff_id,
        "ended_by_staff_id": session.ended_by_staff_id,
        "cancelled_reason": session.cancelled_reason,
    }
