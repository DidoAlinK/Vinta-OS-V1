"""
Runtime probe: the session start endpoint and register materialisation.

Verifies against the real route:
  1. starting a SCHEDULED class -> IN_PROGRESS, clock set, staff attributed
  2. the register is materialised ABSENT ("false until true")
  3. starting twice is idempotent — no duplicate rows, clock not reset
  4. a FINISHED class cannot be started -> 409
  5. a free session auto-fills PRESENT (toggle 6 on by default)
  6. **starting a class moves no money** — no credit decrement, no RevenueEntry

Uses throwaway sessions inside a real group so no existing row is modified.
Cleans up everything it creates, including activity log rows.
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
from app.models.billing import RevenueEntry, StudentSubscription  # noqa: E402
from app.models.class_room import Class  # noqa: E402
from app.models.scheduling import Session  # noqa: E402
from app.models.student import Enrollment  # noqa: E402
from app.models.teacher import Teacher  # noqa: E402
from app.models.user import User  # noqa: E402

MARKER = "probe-start-throwaway"
app = create_app("development")
results = []


def check(label, cond, detail=""):
    results.append(bool(cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))


with app.app_context():
    # ---- state before ----------------------------------------------------
    owner = db.session.query(User).filter_by(role="owner", academy_id="ad6587d5-6fd3-4015-a497-8dd5301b830d").first()
    group = db.session.get(Class, "a41fd3be-807b-45ad-b298-69edb7a0ac21")
    teacher = db.session.query(Teacher).filter_by(academy_id=owner.academy_id).first()

    enrolled = db.session.query(Enrollment).filter_by(class_id=group.id, status="active").all()
    print(f"group {group.name!r}: {len(enrolled)} active enrollment(s)")
    check("group has at least one active enrollment to materialise", len(enrolled) > 0)

    credits_before = {
        s.id: s.remaining_credits
        for s in db.session.query(StudentSubscription).filter(
            StudentSubscription.student_id.in_([e.student_id for e in enrolled])
        ).all()
    }
    rev_before = db.session.query(RevenueEntry).count()
    print(f"credits before: {credits_before}")
    print(f"revenue entries before: {rev_before}")

    token = create_access_token(identity=owner.id)
    hdr = {"Authorization": f"Bearer {token}", "X-Academy-Id": owner.academy_id}
    client = app.test_client()

    def make_session(status="scheduled", is_free=False):
        s = Session(
            id=str(uuid.uuid4()),
            academy_id=owner.academy_id,
            class_id=group.id,
            teacher_id=group.teacher_id or teacher.id,
            date=date.today(),
            start_time=time(9, 0),
            end_time=time(10, 0),
            subject=MARKER,
            status=status,
            is_free_session=is_free,
        )
        db.session.add(s)
        db.session.commit()
        return s

    # ================= 1/2. happy path =================
    print("\n--- start a scheduled class ---")
    s1 = make_session()
    r = client.post(f"/api/sessions/{s1.id}/start", headers=hdr)
    body = r.get_json(silent=True) or {}
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
    print(f"    {body}")
    check("reports roster_created >= 1", body.get("roster_created", 0) >= 1,
          f"got {body.get('roster_created')}")
    check("status is in_progress", body.get("status") == "in_progress")
    check("actual_start_time set", bool(body.get("actual_start_time")))
    check("not flagged already_started", body.get("already_started") is False)

    db.session.expire_all()
    s1 = db.session.get(Session, s1.id)
    check("DB: actual_start_time persisted", s1.actual_start_time is not None)
    check("DB: started_by_staff_id persisted", s1.started_by_staff_id == owner.id,
          f"got {s1.started_by_staff_id}")

    rows = db.session.query(SessionStudent).filter_by(session_id=s1.id).all()
    check("register materialised", len(rows) == len(enrolled),
          f"{len(rows)} row(s) for {len(enrolled)} enrollment(s)")
    check("every row ABSENT", all(r.status == "ABSENT" for r in rows))
    check("every row is_present False", all(not r.is_present for r in rows))
    check("no row has a timestamp (nobody acted yet)",
          all(r.timestamp is None for r in rows))

    # ================= 3. idempotency =================
    print("\n--- start again (idempotent) ---")
    first_start = s1.actual_start_time
    r = client.post(f"/api/sessions/{s1.id}/start", headers=hdr)
    body = r.get_json(silent=True) or {}
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
    check("reports already_started", body.get("already_started") is True)
    check("roster_created is 0", body.get("roster_created") == 0)

    db.session.expire_all()
    s1 = db.session.get(Session, s1.id)
    rows2 = db.session.query(SessionStudent).filter_by(session_id=s1.id).all()
    check("register NOT duplicated", len(rows2) == len(rows),
          f"{len(rows2)} row(s)")
    check("clock NOT reset", s1.actual_start_time == first_start)

    # ================= 4. finished class cannot start =================
    print("\n--- start a finished class (must refuse) ---")
    s2 = make_session(status="conducted")
    r = client.post(f"/api/sessions/{s2.id}/start", headers=hdr)
    check(f"HTTP 409 (got {r.status_code})", r.status_code == 409)
    print(f"    {(r.get_json(silent=True) or {}).get('error')}")

    # ================= 5. free session auto-present =================
    print("\n--- free session (toggle 6 default on) ---")
    s3 = make_session(is_free=True)
    r = client.post(f"/api/sessions/{s3.id}/start", headers=hdr)
    body = r.get_json(silent=True) or {}
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
    check("flagged is_free_session", body.get("is_free_session") is True)
    rows3 = db.session.query(SessionStudent).filter_by(session_id=s3.id).all()
    check("register materialised", len(rows3) == len(enrolled), f"{len(rows3)} row(s)")
    check("every row PRESENT (auto-filled)", all(r.status == "PRESENT" for r in rows3))
    check("no check-in attributed to a human",
          all(r.checked_in_by is None and r.checked_in_at is None for r in rows3))

    # ================= 6. no money moved =================
    print("\n--- money must not move on start ---")
    db.session.expire_all()
    credits_after = {
        s.id: s.remaining_credits
        for s in db.session.query(StudentSubscription).filter(
            StudentSubscription.student_id.in_([e.student_id for e in enrolled])
        ).all()
    }
    rev_after = db.session.query(RevenueEntry).count()
    check("no subscription credits decremented", credits_before == credits_after,
          f"{credits_before} -> {credits_after}")
    check("no RevenueEntry written", rev_before == rev_after,
          f"{rev_before} -> {rev_after}")

    # ================= cleanup =================
    print("\ncleanup")
    probe_ids = [s1.id, s2.id, s3.id]
    n_rows = db.session.query(SessionStudent).filter(
        SessionStudent.session_id.in_(probe_ids)
    ).delete(synchronize_session=False)
    n_logs = db.session.query(ActivityLog).filter(
        ActivityLog.entity_id.in_(probe_ids)
    ).delete(synchronize_session=False)
    n_sessions = db.session.query(Session).filter(Session.subject == MARKER).delete(
        synchronize_session=False
    )
    db.session.commit()
    print(f"  removed {n_sessions} session(s), {n_rows} roster row(s), {n_logs} log(s)")

    left = db.session.query(Session).filter(Session.subject == MARKER).count()
    check("no throwaway sessions left", left == 0)
    check("session_students back to 0",
          db.session.query(SessionStudent).count() == 0)

print("\n" + "=" * 52)
print(f"RESULT: {sum(results)}/{len(results)} checks passed"
      f" — {'ALL PASS' if results and all(results) else 'SEE FAILURES ABOVE'}")
