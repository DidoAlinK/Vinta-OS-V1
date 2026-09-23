"""Remove everything probe_finalise.py left behind when it crashed before its
own cleanup, and put the subscription credits back where they started."""
import os
import sys

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.attendance import SessionStudent  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.billing import PayoutRecord, RevenueEntry, StudentSubscription  # noqa: E402
from app.models.scheduling import Session  # noqa: E402
from app.models.user import User  # noqa: E402

MARKER = "probe-finalise-throwaway"
app = create_app("development")

with app.app_context():
    ids = [r[0] for r in db.session.query(Session.id).filter(Session.subject == MARKER).all()]
    print(f"throwaway sessions: {len(ids)}")

    n_rev = db.session.query(RevenueEntry).filter(
        RevenueEntry.session_id.in_(ids)).delete(synchronize_session=False) if ids else 0
    n_pay = db.session.query(PayoutRecord).filter(
        PayoutRecord.session_id.in_(ids)).delete(synchronize_session=False) if ids else 0
    n_rows = db.session.query(SessionStudent).filter(
        SessionStudent.session_id.in_(ids)).delete(synchronize_session=False) if ids else 0
    n_logs = db.session.query(ActivityLog).filter(
        ActivityLog.entity_id.in_(ids)).delete(synchronize_session=False) if ids else 0
    n_sess = db.session.query(Session).filter(Session.subject == MARKER).delete(
        synchronize_session=False)
    n_users = db.session.query(User).filter(User.email.like(f"%{MARKER}%")).delete(
        synchronize_session=False)

    # test 6 committed a real decrement before the crash; put it back
    sub = db.session.get(StudentSubscription, "6e7c3524-6219-468d-9759-9065e0bfbb1a")
    if sub is not None and int(sub.remaining_credits or 0) != 4:
        print(f"restoring {sub.id[-8:]}: {sub.remaining_credits} -> 4")
        sub.remaining_credits = 4
    db.session.commit()

    print(f"removed: {n_sess} session(s), {n_rows} roster row(s), {n_rev} revenue, "
          f"{n_pay} payout, {n_logs} log(s), {n_users} user(s)")

    print("\nstate now:")
    print(f"  sessions w/ marker : {db.session.query(Session).filter(Session.subject == MARKER).count()}")
    print(f"  users w/ marker    : {db.session.query(User).filter(User.email.like('%' + MARKER + '%')).count()}")
    print(f"  revenue_entries    : {db.session.query(RevenueEntry).count()}")
    print(f"  payout_records     : {db.session.query(PayoutRecord).count()}")
    print(f"  session_students   : {db.session.query(SessionStudent).count()}")
    print("  subscriptions:")
    for s in db.session.query(StudentSubscription).filter_by(
            academy_id="ad6587d5-6fd3-4015-a497-8dd5301b830d").all():
        print(f"    {s.id[:8]}… credits={s.remaining_credits} "
              f"makeups={s.makeup_credits} status={s.status}")
