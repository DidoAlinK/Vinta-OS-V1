"""Reverse everything two earlier test clicks wrote, by ROW ID.

The previous attempt at this restored `.first()` of a query, and the group has
THREE identical sessions on 2026-09-29 10:00 — so it snapshotted one row and
restored another, reported CLEAN, and left the real writes in place. Nothing
here selects a row it intends to change. Every id was read out of the database
first (see sweep.py / damage.py) and is named literally, so this cannot fix a
different row than the one it describes.

  py undo_test_state.py --dry     -> report only
  py undo_test_state.py           -> apply, then assert
"""
import os
import sys

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.attendance import SessionStudent  # noqa: E402
from app.models.billing import RevenueEntry, StudentSubscription  # noqa: E402
from app.models.scheduling import Session  # noqa: E402

DRY = "--dry" in sys.argv

# -- The sessions my clicks flipped, and the state the seed left them in --
STARTED_THEN_ENDED = "279eb314-973d-4396-b134-fbe6aeb6a664"   # conducted, money moved
STARTED_ONLY = "f5946368-d4f1-4524-969c-a595bb10c17f"         # still in_progress

# -- Registers opened by those two starts --
ROSTER_IDS = [
    "e7dcf4d2-edbe-4e40-af31-d675e3e1079f",
    "b39de5de-df61-4316-a598-a8c56744fb0a",
    "ed840302-6e6e-40ba-b99e-45532ba1fe74",
    "6fd087fe-3c9a-4396-af04-8ed3efdd4ea0",
]

# -- The charge: two credits and 6600 Da of revenue, all stamped 07:01:03 --
CREDITS_TO_RESTORE = {
    "6e7c3524-6219-468d-9759-9065e0bfbb1a": 4,   # was 3
    "7abf459b-4f33-4232-8705-d7d51136bba3": 4,   # was 3
}
REVENUE_IDS = [
    "3adc71c9-74ae-4b88-ac0f-733ac7c66fb6",   # 3300 Da
    "78641f0d-6bfe-4c5f-8ec8-89f5204dfc2c",   # 3300 Da
]

LOG_IDS = [
    "be7cd7df-d327-41e2-8ba0-5aa48799fa63",
    "7219963e-fa74-48ee-a6fb-7e14a6648b91",
    "88f0f9c4-da44-4c94-a87b-42c04a8cbad5",
]

app = create_app("development")
with app.app_context():
    print("-- BEFORE --")
    for sid in (STARTED_THEN_ENDED, STARTED_ONLY):
        s = db.session.get(Session, sid)
        print(f"  {sid[:8]} status={s.status} start={s.actual_start_time} "
              f"end={s.actual_end_time} by={s.started_by_staff_id}")
    for sub_id, want in CREDITS_TO_RESTORE.items():
        sub = db.session.get(StudentSubscription, sub_id)
        print(f"  sub {sub_id[:8]} credits={sub.remaining_credits} -> {want}")
    print(f"  revenue rows to delete: {len(REVENUE_IDS)}")
    print(f"  roster rows to delete:  {len(ROSTER_IDS)}")
    print(f"  log rows to delete:     {len(LOG_IDS)}")

    if DRY:
        print("\n--dry: nothing written.")
        sys.exit(0)

    print("\n-- APPLYING --")

    n_rev = db.session.query(RevenueEntry).filter(
        RevenueEntry.id.in_(REVENUE_IDS)).delete(synchronize_session=False)
    n_ros = db.session.query(SessionStudent).filter(
        SessionStudent.id.in_(ROSTER_IDS)).delete(synchronize_session=False)
    n_log = db.session.query(ActivityLog).filter(
        ActivityLog.id.in_(LOG_IDS)).delete(synchronize_session=False)

    for sub_id, want in CREDITS_TO_RESTORE.items():
        db.session.get(StudentSubscription, sub_id).remaining_credits = want

    for sid in (STARTED_THEN_ENDED, STARTED_ONLY):
        s = db.session.get(Session, sid)
        s.status = "scheduled"
        s.actual_start_time = None
        s.actual_end_time = None
        s.started_by_staff_id = None
        s.ended_by_staff_id = None

    db.session.commit()
    print(f"  deleted {n_rev} revenue, {n_ros} roster, {n_log} log row(s)")

    # -- Assert against the database, not against what we asked for --
    db.session.expire_all()
    print("\n-- AFTER --")
    ok = True
    for sid in (STARTED_THEN_ENDED, STARTED_ONLY):
        s = db.session.get(Session, sid)
        clean = (
            s.status == "scheduled"
            and s.actual_start_time is None
            and s.actual_end_time is None
            and s.started_by_staff_id is None
            and s.ended_by_staff_id is None
        )
        ok &= clean
        left = db.session.query(SessionStudent).filter_by(session_id=sid).count()
        ok &= left == 0
        print(f"  {sid[:8]} status={s.status} start={s.actual_start_time} "
              f"roster={left} {'OK' if clean and left == 0 else '** STILL DIRTY **'}")

    for sub_id, want in CREDITS_TO_RESTORE.items():
        got = db.session.get(StudentSubscription, sub_id).remaining_credits
        ok &= got == want
        print(f"  sub {sub_id[:8]} credits={got} "
              f"{'OK' if got == want else '** MISMATCH **'}")

    for table, ids, model in (
        ("revenue", REVENUE_IDS, RevenueEntry),
        ("roster", ROSTER_IDS, SessionStudent),
        ("logs", LOG_IDS, ActivityLog),
    ):
        left = db.session.query(model).filter(model.id.in_(ids)).count()
        ok &= left == 0
        print(f"  {table} rows left: {left} {'OK' if left == 0 else '** LEFT BEHIND **'}")

    live = db.session.query(Session).filter_by(
        academy_id="ad6587d5-6fd3-4015-a497-8dd5301b830d",
        status="in_progress",
    ).count()
    ok &= live == 0
    print(f"  in_progress sessions in academy: {live} {'OK' if live == 0 else '** STILL LIVE **'}")

    print("\nRESULT:", "CLEAN" if ok else "MISMATCH — inspect above")
