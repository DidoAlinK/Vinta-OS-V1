"""Snapshot / restore around a real Start Class click from the Classrooms card.

Starting a class is a real write: it flips the session to in_progress, stamps
actual_start_time, and materialises an ABSENT register. The point of clicking
it in the browser is to prove the card's menu is wired to the real endpoint
rather than to a local flag, so the click has to happen for real — and then
everything it wrote has to come back off.

  py start_rundown.py before   -> record the session's exact prior state
  py start_rundown.py after    -> restore it, and assert the restore
"""
import json
import os
import sys
from datetime import date

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
SNAP = r"E:\vinta-os-app-essembled-main\.tmp-relprobe\start_snapshot.json"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.attendance import SessionStudent  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.scheduling import Session  # noqa: E402

ACADEMY = "ad6587d5-6fd3-4015-a497-8dd5301b830d"
GROUP = "a41fd3be-807b-45ad-b298-69edb7a0ac21"

app = create_app("development")
action = sys.argv[1] if len(sys.argv) > 1 else "before"

with app.app_context():
    if action == "before":
        # The same query the card makes, bounds included: the group's soonest
        # scheduled class FROM TODAY. Without the date floor this picks up a
        # stale past session that is still marked scheduled, which is not the
        # row the card will act on.
        s = (
            Session.query
            .filter(
                Session.academy_id == ACADEMY,
                Session.class_id == GROUP,
                Session.date >= date.today(),
                Session.status.in_(["scheduled", "in_progress"]),
            )
            .order_by(Session.date, Session.start_time)
            .first()
        )
        roster = db.session.query(SessionStudent).filter_by(session_id=s.id).count()
        snap = {
            "session_id": s.id,
            "status": s.status,
            "actual_start_time": s.actual_start_time.isoformat() if s.actual_start_time else None,
            "started_by_staff_id": s.started_by_staff_id,
            "roster_rows": roster,
            "log_ids": [
                r.id for r in db.session.query(ActivityLog).filter_by(entity_id=s.id).all()
            ],
            "total_sessions": db.session.query(Session).filter_by(
                academy_id=ACADEMY, class_id=GROUP).count(),
        }
        with open(SNAP, "w", encoding="utf-8") as fh:
            json.dump(snap, fh, indent=2)
        print(f"session {s.id}")
        print(f"  {s.date} {s.start_time}-{s.end_time} status={s.status}")
        print(f"  roster rows={roster} logs={len(snap['log_ids'])}")
        print(f"  group total sessions={snap['total_sessions']}")
    else:
        with open(SNAP, encoding="utf-8") as fh:
            snap = json.load(fh)
        sid = snap["session_id"]
        s = db.session.get(Session, sid)
        print(f"IN PROGRESS NOW: status={s.status} actual_start={s.actual_start_time}")

        # The register start materialised — every row for this session, since
        # the session had none before (that is what the snapshot asserts).
        removed_rows = db.session.query(SessionStudent).filter_by(
            session_id=sid).delete(synchronize_session=False)
        # The audit lines start wrote, addressed by the ids taken beforehand
        # plus anything new naming this session.
        new_logs = db.session.query(ActivityLog).filter(
            ActivityLog.entity_id == sid,
            ActivityLog.id.notin_(snap["log_ids"] or [""]),
        ).delete(synchronize_session=False)

        s.status = snap["status"]
        s.actual_start_time = None
        s.started_by_staff_id = None
        db.session.commit()

        print(f"  removed {removed_rows} roster row(s) (was {snap['roster_rows']} before)")
        print(f"  removed {new_logs} new log row(s)")

        db.session.expire_all()
        s2 = db.session.get(Session, sid)
        left = db.session.query(SessionStudent).filter_by(session_id=sid).count()
        total = db.session.query(Session).filter_by(
            academy_id=ACADEMY, class_id=GROUP).count()
        ok = (
            s2.status == snap["status"]
            and s2.actual_start_time is None
            and s2.started_by_staff_id is None
            and left == snap["roster_rows"]
            and total == snap["total_sessions"]
        )
        print(f"RESTORED: status={s2.status} roster={left} sessions={total}")
        print("RESULT:", "CLEAN" if ok else "MISMATCH — inspect above")
