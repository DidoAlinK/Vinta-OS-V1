"""Read-only: which sessions are in_progress, per group, right now."""
import os
import sys
from datetime import date

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.attendance import SessionStudent  # noqa: E402
from app.models.scheduling import Session  # noqa: E402

ACADEMY = "ad6587d5-6fd3-4015-a497-8dd5301b830d"

app = create_app("development")
with app.app_context():
    live = (
        Session.query
        .filter(Session.academy_id == ACADEMY, Session.status == "in_progress")
        .order_by(Session.date, Session.start_time)
        .all()
    )
    print(f"in_progress sessions in this academy: {len(live)}")
    for s in live:
        roster = db.session.query(SessionStudent).filter_by(session_id=s.id).count()
        print(f"  {s.id}")
        print(f"    group={s.class_id} date={s.date} {s.start_time}-{s.end_time}")
        print(f"    actual_start={s.actual_start_time} started_by={s.started_by_staff_id}")
        print(f"    roster rows={roster}  (today is {date.today()})")

    print()
    a = "a41fd3be-807b-45ad-b298-69edb7a0ac21"
    rows = (
        Session.query
        .filter(Session.academy_id == ACADEMY, Session.class_id == a,
                Session.date >= date.today())
        .order_by(Session.date, Session.start_time)
        .limit(6)
        .all()
    )
    print("Group A sessions from today on:")
    for s in rows:
        print(f"  {s.date} {s.start_time}-{s.end_time} status={s.status} start={s.actual_start_time}")
