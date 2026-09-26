"""
Vinta School OS — cancelling a session.

``cancel_session`` is reached from three places: the calendar's "Remove", the
hamburger's "Cancel Class" / "Teacher Absent", and the live "Void". Two things
about it are easy to get wrong and are pinned here.

1. It must refuse a session that has already been settled. ``conducted`` has
   written payouts and consumed credits against the row; setting it to
   ``cancelled`` reverses none of that, so the record would simply disagree
   with the money — charges standing against a class the app says never
   happened. Cancelling an already-cancelled row is meaningless for the same
   reason.

2. The reason has to round-trip. ``LIVE_VOID`` in particular was unrecordable:
   the void modal sent no body, so a class that visibly ran and was
   deliberately not charged was filed identically to one that was called off
   before it started.
"""
import uuid
from datetime import date, time

import pytest

from app.models.scheduling import Session
from app.services import scheduling_service


def _session(db, academy, class_obj, teacher, status):
    session = Session(
        id=str(uuid.uuid4()),
        academy_id=academy.id,
        class_id=class_obj.id,
        teacher_id=teacher.id,
        date=date.today(),
        start_time=time(8, 0),
        end_time=time(9, 0),
        subject="Math",
        status=status,
    )
    db.session.add(session)
    db.session.flush()
    return session


@pytest.mark.parametrize("status", ["scheduled", "in_progress"])
def test_unsettled_sessions_can_be_cancelled(db, academy, class_obj, teacher, status):
    """
    A class that has not run can be called off; a class that is running can be
    voided. Both are legitimate, and both must keep working.
    """
    session = _session(db, academy, class_obj, teacher, status)

    result = scheduling_service.cancel_session(session.id, academy.id)

    assert result is not None
    db.session.refresh(session)
    assert session.status == "cancelled"


@pytest.mark.parametrize("status", ["conducted", "cancelled"])
def test_settled_sessions_are_refused(db, academy, class_obj, teacher, status):
    """
    The guard. ``conducted`` is the one that matters: it holds settled money,
    and relabelling it would leave that money attached to a cancelled class.
    """
    session = _session(db, academy, class_obj, teacher, status)

    assert scheduling_service.cancel_session(session.id, academy.id) is None

    db.session.refresh(session)
    assert session.status == status


def test_reason_is_recorded(db, academy, class_obj, teacher):
    session = _session(db, academy, class_obj, teacher, "scheduled")

    scheduling_service.cancel_session(session.id, academy.id, "TEACHER_ABSENT")

    db.session.refresh(session)
    assert session.cancelled_reason == "TEACHER_ABSENT"


def test_void_reason_is_accepted_by_the_column(db, academy, class_obj, teacher):
    """
    The void modal sends CANCELLED_BY_STAFF.

    A dedicated ``LIVE_VOID`` value is not used, on purpose: ``cancelled_reason``
    is a native database enum, so a new value is a migration rather than a
    string. This test is the reason that decision is written down — sending
    ``LIVE_VOID`` passes CANCEL_REASONS at the Python level and is then rejected
    by the column, which is a failure that only shows up on the write.
    """
    session = _session(db, academy, class_obj, teacher, "in_progress")

    scheduling_service.cancel_session(session.id, academy.id, "CANCELLED_BY_STAFF")

    db.session.refresh(session)
    assert session.cancelled_reason == "CANCELLED_BY_STAFF"


def test_every_allowed_reason_is_a_column_value():
    """
    CANCEL_REASONS is a plain Python tuple; the column is a native enum that
    knows nothing about it. A name added to one list and not the other is
    accepted by ``cancel_session`` and then rejected by the database on the
    write — a failure that would first appear in production, on a real
    cancellation. Checking the two against each other makes that a test
    failure instead.

    Written after ``LIVE_VOID`` was briefly added to CANCEL_REASONS and turned
    out not to exist in ``session_cancel_reason_enum``.
    """
    column_values = set(Session.__table__.c.cancelled_reason.type.enums)

    assert set(scheduling_service.CANCEL_REASONS) <= column_values, (
        "a reason was added to CANCEL_REASONS without adding it to "
        "session_cancel_reason_enum — that needs a migration, not just a string"
    )


def test_unknown_reason_falls_back_to_other(db, academy, class_obj, teacher):
    """An unrecognised reason is a label problem, not a reason to lose the cancel."""
    session = _session(db, academy, class_obj, teacher, "scheduled")

    result = scheduling_service.cancel_session(session.id, academy.id, "NOT_A_REASON")

    assert result is not None
    db.session.refresh(session)
    assert session.cancelled_reason == "OTHER"


def test_no_reason_leaves_the_column_alone(db, academy, class_obj, teacher):
    """A bare DELETE still cancels; it just does not claim to know why."""
    session = _session(db, academy, class_obj, teacher, "scheduled")

    scheduling_service.cancel_session(session.id, academy.id)

    db.session.refresh(session)
    assert session.status == "cancelled"
    assert session.cancelled_reason is None


def test_another_academys_session_is_not_reachable(db, academy, class_obj, teacher):
    """Tenant scoping — the lookup is by id AND academy."""
    session = _session(db, academy, class_obj, teacher, "scheduled")

    assert scheduling_service.cancel_session(session.id, str(uuid.uuid4())) is None

    db.session.refresh(session)
    assert session.status == "scheduled"


def test_missing_session_returns_none(db, academy):
    assert scheduling_service.cancel_session(str(uuid.uuid4()), academy.id) is None
