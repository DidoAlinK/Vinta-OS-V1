"""Read the snapshot session's current state. Throwaway, read-only."""
import json
import os
import sys

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
SNAP = r"E:\vinta-os-app-essembled-main\.tmp-relprobe\start_snapshot.json"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.attendance import SessionStudent  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.scheduling import Session  # noqa: E402

app = create_app("development")
with app.app_context():
    snap = json.load(open(SNAP, encoding="utf-8"))
    s = db.session.get(Session, snap["session_id"])
    roster = db.session.query(SessionStudent).filter_by(session_id=s.id).all()
    logs = db.session.query(ActivityLog).filter_by(entity_id=s.id).all()
    print(f"session {s.id}")
    print(f"  status           = {s.status}   (was {snap['status']})")
    print(f"  actual_start     = {s.actual_start_time}")
    print(f"  started_by       = {s.started_by_staff_id}")
    print(f"  roster rows      = {len(roster)}   (was {snap['roster_rows']})")
    for r in roster:
        print(f"      is_present={r.is_present} status={getattr(r, 'status', None)}")
    print(f"  audit rows       = {len(logs)}   (was {len(snap['log_ids'])})")
    for lg in logs:
        print(f"      {lg.action}: {lg.description}")
