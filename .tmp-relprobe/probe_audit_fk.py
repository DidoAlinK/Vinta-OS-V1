"""
Runtime probe: the audit-log foreign key, on the routes that used to crash.

`activity_logs.user_id` is a foreign key to `users.id` and SQLite runs with
`PRAGMA foreign_keys=ON`, so the code's habit of logging with the string
"system" raised IntegrityError on every automatic action and took the whole
request down with it. The column is nullable now and those writes pass NULL,
which the activity-log reader already renders as "System".

This exercises each route end to end and asserts what landed in the table:

  1. POST /attendance/auto-checkout  -> 200, and the log names the caller
  2. POST /billing/check-overdue     -> 200, and the log names nobody (NULL)
  3. POST /attendance/check-out      -> 200 on a row with no checked-in-by
                                        (a free session's auto-filled row),
                                        which used to 500
  4. no row anywhere says "system"

Throwaway throughout: sessions, roster rows, one legacy billing row. The
billing row's original status is restored and every probe row is removed.
"""
import os
import sys
import uuid
from datetime import date, datetime, time, timezone

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from flask_jwt_extended import create_access_token  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.attendance import SessionStudent  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.billing import (  # noqa: E402
    PayoutRecord, RevenueEntry, StudentBilling, StudentSubscription,
)
from app.models.class_room import Class  # noqa: E402
from app.models.scheduling import Session  # noqa: E402
from app.models.student import Enrollment, Student  # noqa: E402
from app.models.teacher import Teacher  # noqa: E402
from app.models.user import User  # noqa: E402

MARKER = "probe-auditfk-throwaway"
ACADEMY = "ad6587d5-6fd3-4015-a497-8dd5301b830d"
GROUP = "a41fd3be-807b-45ad-b298-69edb7a0ac21"

app = create_app("development")
results = []


def check(label, cond, detail=""):
    results.append(bool(cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))


with app.app_context():
    owner = db.session.query(User).filter_by(role="owner", academy_id=ACADEMY).first()
    group = db.session.get(Class, GROUP)
    teacher = db.session.query(Teacher).filter_by(academy_id=ACADEMY).first()
    enrolled = db.session.query(Enrollment).filter_by(class_id=GROUP, status="active").all()
    student_id = enrolled[0].student_id

    hdr = {
        "Authorization": f"Bearer {create_access_token(identity=owner.id)}",
        "X-Academy-Id": ACADEMY,
    }

    # A throwaway staff member with a PIN we know, for the PIN-gated route.
    # Minting the owner's PIN is not possible — it is bcrypt-hashed and is not
    # ours to change — so a second user carries the known one instead.
    PIN = "4321"
    staff = User(
        id=str(uuid.uuid4()), academy_id=ACADEMY, name=MARKER,
        email=f"{MARKER}@example.test", role="staff",
        pin_hash=User.hash_pin(PIN),
    )
    db.session.add(staff)
    db.session.commit()
    pin_hdr = {
        "Authorization": f"Bearer {create_access_token(identity=staff.id)}",
        "X-Academy-Id": ACADEMY,
    }

    client = app.test_client()

    subs_before = {
        s.id: (s.remaining_credits, s.makeup_credits, s.status)
        for s in db.session.query(StudentSubscription).filter_by(academy_id=ACADEMY).all()
    }
    credits_before = sum(int(s.remaining_credits or 0) for s in db.session.query(
        StudentSubscription).filter_by(student_id=student_id).all())
    rev_before = db.session.query(RevenueEntry).count()
    logs_before = db.session.query(ActivityLog).count()
    billings_before = db.session.query(StudentBilling).count()
    users_before = db.session.query(User).count()

    def make_session(is_free=False, status="scheduled"):
        s = Session(
            id=str(uuid.uuid4()), academy_id=ACADEMY, class_id=group.id,
            teacher_id=group.teacher_id or (teacher.id if teacher else None),
            date=date.today(), start_time=time(9, 0), end_time=time(10, 0),
            subject=MARKER, status=status, is_free_session=is_free,
        )
        db.session.add(s)
        db.session.commit()
        return s

    probe_sessions = []
    seeded_billing = None
    billing_original = None

    # ============ 1. auto-checkout, with a present student ============
    print("\n--- POST /attendance/auto-checkout ---")
    s1 = make_session(); probe_sessions.append(s1)
    client.post(f"/api/sessions/{s1.id}/start",
                headers={"Authorization": hdr["Authorization"], "X-Academy-Id": ACADEMY})
    db.session.expire_all()
    row = db.session.query(SessionStudent).filter_by(
        session_id=s1.id, student_id=student_id).first()
    check("precondition: a register row exists", row is not None)
    if row is not None:
        # make it PRESENT without a human attribution, i.e. as auto-fill would
        row.is_present = True
        row.status = "PRESENT"
        row.checked_in_by = None
        db.session.commit()

    r = client.post("/api/attendance/auto-checkout", headers=hdr,
                    json={"session_id": s1.id})
    body = r.get_json(silent=True) or {}
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200, f"{body}")
    check("checked out >= 1 student", body.get("checked_out_count", 0) >= 1,
          f"got {body.get('checked_out_count')}")

    db.session.expire_all()
    log = (db.session.query(ActivityLog)
           .filter_by(entity_id=s1.id, action="checked_out")
           .order_by(ActivityLog.created_at.desc()).first())
    check("an audit row was written at all", log is not None)
    if log is not None:
        check("attributed to the caller, not 'system'", log.user_id == owner.id,
              f"got {log.user_id!r}")
        check("the attribution resolves to a real user",
              db.session.get(User, log.user_id) is not None if log.user_id else False)

    # ============ 2. the overdue sweep ============
    print("\n--- POST /billing/check-overdue ---")
    plan_id = db.session.execute(
        db.text("SELECT id FROM payment_plans WHERE academy_id = :a LIMIT 1"),
        {"a": ACADEMY},
    ).scalar()
    if plan_id is None:
        plan_id = db.session.execute(
            db.text("SELECT id FROM payment_plans LIMIT 1")).scalar()
    print(f"    payment_plan: {plan_id}")

    seeded_billing = StudentBilling(
        id=str(uuid.uuid4()), student_id=student_id, payment_plan_id=plan_id,
        amount_da=1000, status="due",
        due_date=date(2020, 1, 1), cycle_start=date(2019, 12, 1),
        cycle_end=date(2019, 12, 31),
    )
    db.session.add(seeded_billing)
    db.session.commit()
    billing_original = seeded_billing.status

    r = client.post("/api/billing/check-overdue", headers=hdr, json={})
    body = r.get_json(silent=True) or {}
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200, f"{body}")
    check("sweep found the seeded row", body.get("overdue_count", 0) >= 1,
          f"got {body.get('overdue_count')}")

    db.session.expire_all()
    log = (db.session.query(ActivityLog)
           .filter_by(entity_id=seeded_billing.id, action="payment_overdue").first())
    check("an overdue audit row was written at all", log is not None)
    if log is not None:
        check("attributed to nobody (NULL = System)", log.user_id is None,
              f"got {log.user_id!r}")

    # ============ 3. check-out of a row with no checked-in-by ============
    print("\n--- POST /attendance/check-out on an unattributed row ---")
    s2 = make_session(is_free=True); probe_sessions.append(s2)
    client.post(f"/api/sessions/{s2.id}/start", headers=hdr)
    db.session.expire_all()
    row2 = db.session.query(SessionStudent).filter_by(
        session_id=s2.id, student_id=student_id).first()
    check("free session auto-filled the row PRESENT",
          row2 is not None and row2.status == "PRESENT")
    check("with no checked-in-by", row2 is not None and row2.checked_in_by is None)

    r = client.post("/api/attendance/check-out", headers=pin_hdr,
                    json={"session_id": s2.id, "student_id": student_id,
                          "pin": PIN})
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200,
          f"{(r.get_json(silent=True) or {}).get('error')}")

    db.session.expire_all()
    log = (db.session.query(ActivityLog)
           .filter_by(entity_id=s2.id, action="checked_out").first())
    check("a check-out audit row was written", log is not None)
    if log is not None:
        check("attributed to nobody (NULL = System)", log.user_id is None,
              f"got {log.user_id!r}")

    # ============ 4. nothing anywhere says "system" ============
    print("\n--- the sentinel is gone from the table ---")
    bogus = db.session.query(ActivityLog).filter(ActivityLog.user_id == "system").count()
    check("no activity_logs row has user_id == 'system'", bogus == 0, f"got {bogus}")
    orphans = db.session.query(ActivityLog).filter(
        ActivityLog.user_id.is_not(None),
        ~ActivityLog.user_id.in_(db.session.query(User.id)),
    ).count()
    check("every non-NULL user_id resolves to a real user", orphans == 0,
          f"{orphans} orphaned")

    # ============ cleanup ============
    print("\ncleanup")
    ids = [s.id for s in probe_sessions]
    n_rev = db.session.query(RevenueEntry).filter(
        RevenueEntry.session_id.in_(ids)).delete(synchronize_session=False)
    n_pay = db.session.query(PayoutRecord).filter(
        PayoutRecord.session_id.in_(ids)).delete(synchronize_session=False)
    n_rows = db.session.query(SessionStudent).filter(
        SessionStudent.session_id.in_(ids)).delete(synchronize_session=False)
    n_logs = db.session.query(ActivityLog).filter(
        ActivityLog.entity_id.in_(ids)).delete(synchronize_session=False)
    if seeded_billing is not None:
        n_logs += db.session.query(ActivityLog).filter(
            ActivityLog.entity_id == seeded_billing.id).delete(synchronize_session=False)
        row_b = db.session.get(StudentBilling, seeded_billing.id)
        if row_b is not None:
            row_b.status = billing_original
            # The row itself has to go, not just its status: it is a probe
            # artefact, and leaving it behind means the NEXT sweep finds it
            # again and the probe silently changes the data it measures.
            db.session.delete(row_b)
    n_sess = db.session.query(Session).filter(Session.subject == MARKER).delete(
        synchronize_session=False)
    db.session.delete(staff)
    db.session.commit()
    for sub_id, (credits, makeups, status) in subs_before.items():
        sub = db.session.get(StudentSubscription, sub_id)
        if sub is not None:
            sub.remaining_credits, sub.makeup_credits, sub.status = credits, makeups, status
    db.session.commit()
    print(f"  removed {n_sess} session(s), {n_rows} roster row(s), {n_rev} revenue, "
          f"{n_pay} payout, {n_logs} log(s)")

    # ============ restore asserted ============
    print("\nrestore")
    db.session.expire_all()
    subs_after = {
        s.id: (s.remaining_credits, s.makeup_credits, s.status)
        for s in db.session.query(StudentSubscription).filter_by(academy_id=ACADEMY).all()
    }
    check("subscriptions restored exactly", subs_after == subs_before)
    check("credits back to the snapshot",
          sum(int(s.remaining_credits or 0) for s in db.session.query(
              StudentSubscription).filter_by(student_id=student_id).all())
          == credits_before)
    check("revenue back to the snapshot",
          db.session.query(RevenueEntry).count() == rev_before,
          f"{rev_before} -> {db.session.query(RevenueEntry).count()}")
    check("payouts back to the snapshot",
          db.session.query(PayoutRecord).count() == 0)
    check("seed billing row removed",
          seeded_billing is None or db.session.get(
              StudentBilling, seeded_billing.id) is None)
    check("student_billings back to its pre-probe count",
          db.session.query(StudentBilling).count() == billings_before,
          f"{billings_before} -> {db.session.query(StudentBilling).count()}")
    check("no throwaway sessions left",
          db.session.query(Session).filter(Session.subject == MARKER).count() == 0)

print("\n" + "=" * 52)
print(f"RESULT: {sum(results)}/{len(results)} checks passed"
      f" — {'ALL PASS' if results and all(results) else 'SEE FAILURES ABOVE'}")
