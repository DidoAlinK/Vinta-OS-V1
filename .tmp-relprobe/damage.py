"""Read-only: exactly what my earlier test clicks left behind, and what it cost.

Everything here is a SELECT. Nothing is written.
"""
import os
import sys

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.billing import PaymentLog, StudentBilling, StudentSubscription  # noqa: E402
from app.models.attendance import SessionStudent  # noqa: E402
from app.models.scheduling import Session  # noqa: E402

ACADEMY = "ad6587d5-6fd3-4015-a497-8dd5301b830d"
GROUP = "a41fd3be-807b-45ad-b298-69edb7a0ac21"

app = create_app("development")
with app.app_context():
    rows = (
        Session.query
        .filter(Session.academy_id == ACADEMY, Session.class_id == GROUP,
                Session.date == "2026-09-29")
        .order_by(Session.created_at)
        .all()
    )
    print(f"=== Group A sessions on 2026-09-29: {len(rows)} ===")
    for s in rows:
        print(f"{s.id}")
        print(f"  created_at   = {s.created_at}")
        print(f"  status       = {s.status}   is_finalized={getattr(s, 'is_finalized', None)}")
        print(f"  start/end    = {s.actual_start_time} -> {s.actual_end_time}")
        print(f"  by           = {s.started_by_staff_id} -> {s.ended_by_staff_id}")

    print()
    print("=== subscriptions for this group ===")
    subs = (
        StudentSubscription.query
        .filter(StudentSubscription.academy_id == ACADEMY)
        .all()
    )
    for sub in subs:
        if getattr(sub, "group_id", None) != GROUP:
            continue
        print(f"{sub.id} student={sub.student_id} status={sub.status}")
        print(f"  credits={getattr(sub, 'remaining_credits', '?')} "
              f"total={getattr(sub, 'total_credits', '?')} "
              f"used={getattr(sub, 'used_credits', '?')}")
        print(f"  updated_at={getattr(sub, 'updated_at', '?')}")

    print()
    print("=== payment_logs naming this group (newest 12) ===")
    logs = (
        PaymentLog.query
        .filter(PaymentLog.academy_id == ACADEMY)
        .order_by(PaymentLog.created_at.desc())
        .limit(400)
        .all()
    )
    n = 0
    for lg in logs:
        if str(getattr(lg, "group_id", None) or "").strip() != GROUP:
            continue
        n += 1
        if n > 12:
            continue
        print(f"  {lg.created_at} {getattr(lg, 'action', '?')} "
              f"student={getattr(lg, 'student_id', '?')} "
              f"amt={getattr(lg, 'amount', '?')} credits={getattr(lg, 'credits_used', '?')}")
    print(f"  (total payment_logs for group: {n})")

    print()
    print("=== activity log lines naming my two touched sessions ===")
    ids = [s.id for s in rows]
    for lg in db.session.query(ActivityLog).filter(ActivityLog.entity_id.in_(ids)).all():
        print(f"  {lg.created_at} {lg.action}: {lg.description}")
