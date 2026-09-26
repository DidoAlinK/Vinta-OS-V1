"""
Vinta School OS — the end-of-class cron sweep.

Regression cover for two bugs that each stopped this job dead, and for the
rule that it must never end a class by itself.

``auto_checkout_expired_sessions`` was unreachable for two independent reasons:

1. ``cron_jobs.py`` imported ``auto_checkout_session`` from
   ``scheduling_service``, which has never defined it. That is an ``ImportError``
   at module load, so no job in the module could run.
2. It compared an aware ``datetime.now(timezone.utc)`` against a naive
   ``datetime.combine(date, end_time)``, so the first expired session raised
   ``TypeError: can't compare offset-naive and offset-aware datetimes``.

And the behaviour it performed on the way past was wrong regardless: it wrote
``session.status = "completed"``, which is the terminal state. Ending a class is
what settles money and it is PIN-gated in ``session_lifecycle_service``. A timer
must not do it, and once the row is terminal the session drops out of the
``status IN ('scheduled','in_progress')`` query the Classrooms tab uses — so the
desk loses Finish / Extend / Void exactly when it needs them.
"""
import uuid
from datetime import date, time, timedelta

from app.models.attendance import SessionStudent
from app.models.scheduling import Session
from app.tasks.cron_jobs import auto_checkout_expired_sessions


def _make_session(db, academy, class_obj, teacher, *, status, day_offset, end_time):
    """A session on a given day, in a given lifecycle state."""
    session = Session(
        id=str(uuid.uuid4()),
        academy_id=academy.id,
        class_id=class_obj.id,
        teacher_id=teacher.id,
        date=date.today() + timedelta(days=day_offset),
        start_time=time(8, 0),
        end_time=end_time,
        subject="Math",
        status=status,
    )
    db.session.add(session)
    db.session.flush()
    return session


def test_expired_in_progress_session_does_not_raise(db, academy, class_obj, teacher):
    """
    The TypeError regression. Yesterday's still-running class must not blow up
    the sweep — if it does, no later session in the loop is ever reached either.
    """
    _make_session(
        db, academy, class_obj, teacher,
        status="in_progress", day_offset=-1, end_time=time(9, 0),
    )

    # Before the fix this raised TypeError on the comparison.
    auto_checkout_expired_sessions()


def test_expired_session_keeps_its_status(db, academy, class_obj, teacher):
    """
    The class stays IN_PROGRESS so the desk can still choose the outcome.
    """
    session = _make_session(
        db, academy, class_obj, teacher,
        status="in_progress", day_offset=-1, end_time=time(9, 0),
    )

    auto_checkout_expired_sessions()

    db.session.refresh(session)
    assert session.status == "in_progress", (
        "the cron must not end a class — ending settles money and is PIN-gated"
    )
    assert session.actual_end_time is None, (
        "actual_end_time is written by end_session, not by a timer"
    )


def test_present_student_is_checked_out(db, academy, class_obj, teacher, student):
    """
    The part the job is actually for: a student left checked in overnight does
    not stay checked in forever.
    """
    session = _make_session(
        db, academy, class_obj, teacher,
        status="in_progress", day_offset=-1, end_time=time(9, 0),
    )
    record = SessionStudent(
        id=str(uuid.uuid4()),
        session_id=session.id,
        student_id=student.id,
        is_present=True,
    )
    db.session.add(record)
    db.session.flush()

    auto_checkout_expired_sessions()

    db.session.refresh(record)
    assert record.checked_out_at is not None
    # …and the money decision is still open.
    db.session.refresh(session)
    assert session.status == "in_progress"


def test_future_session_is_untouched(db, academy, class_obj, teacher, student):
    """A class that has not ended yet is left alone."""
    session = _make_session(
        db, academy, class_obj, teacher,
        status="in_progress", day_offset=1, end_time=time(9, 0),
    )
    record = SessionStudent(
        id=str(uuid.uuid4()),
        session_id=session.id,
        student_id=student.id,
        is_present=True,
    )
    db.session.add(record)
    db.session.flush()

    auto_checkout_expired_sessions()

    db.session.refresh(record)
    assert record.checked_out_at is None


def test_never_started_session_is_untouched(db, academy, class_obj, teacher):
    """
    A ``scheduled`` class that nobody started is the desk's to cancel. The old
    filter included ``scheduled``, so a future date could be silently marked
    finished.
    """
    session = _make_session(
        db, academy, class_obj, teacher,
        status="scheduled", day_offset=-1, end_time=time(9, 0),
    )

    auto_checkout_expired_sessions()

    db.session.refresh(session)
    assert session.status == "scheduled"


def test_conducted_session_is_untouched(db, academy, class_obj, teacher):
    """A finished class is not re-processed."""
    session = _make_session(
        db, academy, class_obj, teacher,
        status="conducted", day_offset=-1, end_time=time(9, 0),
    )

    auto_checkout_expired_sessions()

    db.session.refresh(session)
    assert session.status == "conducted"
