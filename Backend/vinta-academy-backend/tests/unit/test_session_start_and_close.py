"""
Vinta School OS — starting a class, and closing out one that never ran.

Two rules, both about the same thing: a session is a plan until the desk
starts it, and a plan that is never started must not become a live class, a
register, or a payout on its own.

Regression cover for a real row found in the dev database — a session dated
**2026-10-06** that had been started on **2026-09-24**, twelve days early. It
sat ``in_progress`` the whole time, so the Classrooms tab showed a live lamp
for a class a fortnight away and held a register of attendance taken before
the class happened. ``start_session`` had no clock guard at all: a session
dated 2035 and one dated 2019 both started identically.
"""
import uuid
from datetime import date, time, timedelta

import pytest

from app.models.attendance import SessionStudent
from app.models.scheduling import Session
from app.services.session_lifecycle_service import (
    LifecycleError,
    close_past_temporary_sessions,
    start_session,
)


def _session(
    db, academy, class_obj, teacher, *, day_offset, status="scheduled",
    start=time(8, 0), end=time(9, 0),
):
    """A session on a given day, in a given lifecycle state."""
    session = Session(
        id=str(uuid.uuid4()),
        academy_id=academy.id,
        class_id=class_obj.id,
        teacher_id=teacher.id,
        date=date.today() + timedelta(days=day_offset),
        start_time=start,
        end_time=end,
        subject="Math",
        status=status,
    )
    db.session.add(session)
    db.session.flush()
    return session


# ── The start guard ──────────────────────────────────────────────────────

def test_class_can_be_started_on_its_own_day(db, academy, class_obj, teacher):
    """The ordinary case still works."""
    session = _session(db, academy, class_obj, teacher, day_offset=0)

    started, _created, already = start_session(
        session.id, academy.id, teacher.id
    )

    assert started.status == "in_progress"
    assert already is False
    assert started.actual_start_time is not None


def test_future_class_cannot_be_started(db, academy, class_obj, teacher):
    """
    The regression. A class eleven days out must stay a plan.

    Before the guard this returned 200 and left the row ``in_progress``
    forever, which is what put a pulsing green lamp on a class that had not
    happened and held a register nobody could close.
    """
    session = _session(db, academy, class_obj, teacher, day_offset=11)

    with pytest.raises(LifecycleError) as err:
        start_session(session.id, academy.id, teacher.id)

    assert err.value.status == 409
    db.session.refresh(session)
    assert session.status == "scheduled", "a future class must stay scheduled"
    assert session.actual_start_time is None
    assert session.started_by_staff_id is None


def test_past_class_cannot_be_started(db, academy, class_obj, student, teacher):
    """
    And the other end of the same hole: a months-old row must not be started
    now, which would stamp ``actual_start_time`` as today and materialise a
    register for a class nobody ran.
    """
    session = _session(db, academy, class_obj, teacher, day_offset=-30)

    with pytest.raises(LifecycleError) as err:
        start_session(session.id, academy.id, teacher.id)

    assert err.value.status == 409
    db.session.refresh(session)
    assert session.status == "scheduled"
    # The register is what would have carried the charge, so assert on it
    # directly rather than trusting the status alone. The student fixture
    # enrolls into class_obj, so a roster here would not be empty.
    assert SessionStudent.query.filter_by(session_id=session.id).count() == 0


def test_already_started_class_is_still_idempotent(
    db, academy, class_obj, teacher
):
    """
    The guard must not break double-clicks or the repair path.

    A class already ``in_progress`` returns ``already_started=True`` without
    being restarted — and a stale ``in_progress`` row on a future date must
    still answer that way rather than raising, or the desk could never reach
    it to finish or void it.
    """
    session = _session(
        db, academy, class_obj, teacher, day_offset=11, status="in_progress"
    )

    found, _created, already = start_session(
        session.id, academy.id, teacher.id
    )

    assert already is True
    assert found.status == "in_progress"


# ── Closing out one-off classes ──────────────────────────────────────────

def test_past_unstarted_temporary_session_is_closed(
    db, academy, class_obj, teacher
):
    """
    A one-off class whose day passed unstarted is over, and must stop being
    counted as pending.
    """
    class_obj.class_type = "temporary"
    db.session.flush()
    session = _session(db, academy, class_obj, teacher, day_offset=-1)

    closed = close_past_temporary_sessions()

    assert closed == 1
    db.session.refresh(session)
    assert session.status == "cancelled"


def test_closing_charges_nothing(db, academy, class_obj, student, teacher):
    """
    Cancelled, never conducted — the money decision.

    ``conducted`` is what the payroll and revenue reports read, so a class
    nobody taught marked conducted would count as taught and pay the teacher.
    Cancelled is terminal and settles nothing. Asserted through the register
    because that is the only thing ``settle_absences`` can charge: a class
    that was never started has no rows.
    """
    class_obj.class_type = "temporary"
    db.session.flush()
    session = _session(db, academy, class_obj, teacher, day_offset=-1)

    close_past_temporary_sessions()

    db.session.refresh(session)
    assert session.status == "cancelled"
    assert SessionStudent.query.filter_by(session_id=session.id).count() == 0


def test_past_unstarted_weekly_session_is_left_alone(
    db, academy, class_obj, teacher
):
    """
    Weekly classes are deliberately untouched.

    The group is still meeting, so a past instance is history and the desk may
    yet want to say what happened to it. Only one-off classes are closed.
    """
    class_obj.class_type = "weekly"
    db.session.flush()
    session = _session(db, academy, class_obj, teacher, day_offset=-1)

    closed = close_past_temporary_sessions()

    assert closed == 0
    db.session.refresh(session)
    assert session.status == "scheduled", (
        "a weekly class's past instance is history, not a thing to close"
    )


def test_started_temporary_session_is_left_to_the_desk(
    db, academy, class_obj, teacher
):
    """
    A class that WAS started has a register and a real outcome. Ending it —
    with its absences charged — is the desk's call through the Finish flow,
    not a timer's.
    """
    class_obj.class_type = "temporary"
    db.session.flush()
    session = _session(
        db, academy, class_obj, teacher, day_offset=-1, status="in_progress"
    )

    closed = close_past_temporary_sessions()

    assert closed == 0
    db.session.refresh(session)
    assert session.status == "in_progress"


def test_todays_temporary_session_is_not_closed(
    db, academy, class_obj, teacher
):
    """The job closes what has passed, not what is still to come today."""
    class_obj.class_type = "temporary"
    db.session.flush()
    session = _session(db, academy, class_obj, teacher, day_offset=0)

    closed = close_past_temporary_sessions()

    assert closed == 0
    db.session.refresh(session)
    assert session.status == "scheduled"


def test_cron_entry_point_closes_through_the_service(
    db, academy, class_obj, teacher
):
    """
    The scheduled wrapper reaches the rule rather than reimplementing it.

    It returns nothing, like every other entry point in ``cron_jobs`` — the
    scheduler ignores the result — so assert on the effect instead.
    """
    from app.tasks.cron_jobs import close_past_temporary_sessions as cron_job

    class_obj.class_type = "temporary"
    db.session.flush()
    session = _session(db, academy, class_obj, teacher, day_offset=-1)

    cron_job()

    db.session.refresh(session)
    assert session.status == "cancelled"
