"""
Runtime probe: the session finalise endpoint (POST /sessions/<id>/end).

This is the step that settles money, so the probe spends most of its checks
on who gets charged and who does not.

Route / gate:
  1. no pin         -> 400 "PIN is required"
  2. wrong pin      -> 403 (explicitly NOT 401 — a 401 is read by the
                       frontend axios interceptor as "session expired" and
                       clears the tokens mid-payment)
  3. end a SCHEDULED class -> 409 (a class that never started cannot finish)
  4. another academy's session -> 404
  5. ending twice -> already_ended, and nobody charged a second time

Money:
  6. absence_consumes_credit=True  -> the ABSENT student is charged: exactly
     one credit and exactly one RevenueEntry
  7. absence_consumes_credit=False -> the ABSENT student is charged nothing
     (read at decision time, so flipping the toggle mid-day takes effect)
  8. a free session -> nobody charged, no revenue, register auto-PRESENT
  9. a PRESENT student is NOT charged twice (once at check-in, not again at
     finalise)

Everything is throwaway: sessions, the staff user used to hold a known PIN.
The subscriptions and the toggle are snapshotted and restored, and the
restore is asserted — a probe that fixes its own mess is the only kind worth
running against a live database.
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
from app.models.academy import AcademySettings  # noqa: E402
from app.models.attendance import SessionStudent  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.billing import (  # noqa: E402
    PayoutRecord, RevenueEntry, StudentSubscription,
)
from app.models.class_room import Class  # noqa: E402
from app.models.scheduling import Session  # noqa: E402
from app.models.student import Enrollment  # noqa: E402
from app.models.teacher import Teacher  # noqa: E402
from app.models.user import User  # noqa: E402

MARKER = "probe-finalise-throwaway"
PIN = "4321"
WRONG_PIN = "0000"
ACADEMY = "ad6587d5-6fd3-4015-a497-8dd5301b830d"
GROUP = "a41fd3be-807b-45ad-b298-69edb7a0ac21"
OTHER_ACADEMY = "50b418a9-97b8-4066-b566-269ceae04ef1"

app = create_app("development")
results = []


def check(label, cond, detail=""):
    results.append(bool(cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))


def credits_of(student_id):
    return sum(
        int(s.remaining_credits or 0)
        for s in db.session.query(StudentSubscription).filter_by(student_id=student_id).all()
    )


with app.app_context():
    group = db.session.get(Class, GROUP)
    settings = AcademySettings.query.filter_by(academy_id=ACADEMY).first()
    enrolled = db.session.query(Enrollment).filter_by(class_id=GROUP, status="active").all()
    student_id = enrolled[0].student_id
    teacher = db.session.query(Teacher).filter_by(academy_id=ACADEMY).first()

    print(f"group {group.name!r}: {len(enrolled)} active enrollment(s), "
          f"model={group.billing_model}, price={group.price_da}")

    # ---------------- snapshot ----------------
    subs_before = {
        s.id: (s.remaining_credits, s.makeup_credits, s.status)
        for s in db.session.query(StudentSubscription).filter_by(academy_id=ACADEMY).all()
    }
    toggle_before = settings.absence_consumes_credit
    rev_before = db.session.query(RevenueEntry).count()
    payout_before = db.session.query(PayoutRecord).count()
    users_before = db.session.query(User).count()
    credits_before = credits_of(student_id)
    print(f"snapshot: {len(subs_before)} subscription(s), credits={credits_before}, "
          f"revenue={rev_before}, toggle={toggle_before}")

    # throwaway staff user — a known PIN without touching the owner's hash.
    # /sessions/<id>/end needs an academy member, not the owner specifically.
    staff = User(
        id=str(uuid.uuid4()),
        academy_id=ACADEMY,
        name=MARKER,
        email=f"{MARKER}@example.test",
        role="staff",
        pin_hash=User.hash_pin(PIN),
    )
    db.session.add(staff)

    # a class in the other academy, for the cross-tenant check
    other_class = db.session.query(Class).filter_by(academy_id=OTHER_ACADEMY).first()
    made_other_class = False
    if other_class is None:
        other_class = Class(
            id=str(uuid.uuid4()), academy_id=OTHER_ACADEMY, name=MARKER,
            billing_model="CREDIT_BASED", price_da=0,
        )
        db.session.add(other_class)
        made_other_class = True
    db.session.commit()

    hdr = {
        "Authorization": f"Bearer {create_access_token(identity=staff.id)}",
        "X-Academy-Id": ACADEMY,
    }
    client = app.test_client()

    def make_session(status="scheduled", is_free=False, academy_id=ACADEMY,
                     class_id=None):
        s = Session(
            id=str(uuid.uuid4()),
            academy_id=academy_id,
            class_id=class_id or group.id,
            teacher_id=group.teacher_id or (teacher.id if teacher else None),
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

    def end(session_id, pin=PIN):
        return client.post(f"/api/sessions/{session_id}/end",
                           headers=hdr, json={"pin": pin} if pin is not None else {})

    probe_sessions = []

    # ================= 1. no pin =================
    print("\n--- PIN gate ---")
    s = make_session(); probe_sessions.append(s)
    r = end(s.id, pin=None)
    check(f"no pin -> 400 (got {r.status_code})", r.status_code == 400,
          f"{(r.get_json(silent=True) or {}).get('error')}")

    # ================= 2. wrong pin =================
    r = end(s.id, pin=WRONG_PIN)
    check(f"wrong pin -> 403 (got {r.status_code})", r.status_code == 403,
          f"{(r.get_json(silent=True) or {}).get('error')}")
    check("wrong pin is NOT 401 (a 401 logs the user out mid-payment)",
          r.status_code != 401)

    # ================= 3. cannot end what never started =================
    print("\n--- end a class that never started ---")
    r = end(s.id)
    check(f"end a SCHEDULED class -> 409 (got {r.status_code})", r.status_code == 409,
          f"{(r.get_json(silent=True) or {}).get('error')}")
    db.session.expire_all()
    check("the session was left alone",
          db.session.get(Session, s.id).status == "scheduled")

    # ================= 4. cross-tenant =================
    print("\n--- another academy's session ---")
    foreign = make_session(academy_id=OTHER_ACADEMY, class_id=other_class.id)
    probe_sessions.append(foreign)
    r = end(foreign.id)
    check(f"foreign session -> 404 (got {r.status_code})", r.status_code == 404)

    # ================= 6. toggle ON: an absence is charged =================
    print("\n--- absence_consumes_credit=True (the default) ---")
    settings.absence_consumes_credit = True
    db.session.commit()

    s_on = make_session(); probe_sessions.append(s_on)
    client.post(f"/api/sessions/{s_on.id}/start", headers=hdr)
    db.session.expire_all()
    rows = db.session.query(SessionStudent).filter_by(session_id=s_on.id).all()
    check("register materialised ABSENT", len(rows) == len(enrolled) and
          all(x.status == "ABSENT" for x in rows), f"{len(rows)} row(s)")

    rev_pre = db.session.query(RevenueEntry).count()
    r = end(s_on.id)
    body = r.get_json(silent=True) or {}
    db.session.expire_all()
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
    print(f"    {body}")
    check("charged_absences == 1", body.get("charged_absences") == 1,
          f"got {body.get('charged_absences')}")
    check("summary counts the absence", body.get("absent") == len(enrolled),
          f"got {body.get('absent')}")
    check("status is conducted", body.get("status") == "conducted")
    check("actual_end_time set", bool(body.get("actual_end_time")))
    check("exactly one credit spent", credits_of(student_id) == credits_before - 1,
          f"{credits_before} -> {credits_of(student_id)}")
    check("exactly one RevenueEntry written",
          db.session.query(RevenueEntry).count() == rev_pre + 1,
          f"{rev_pre} -> {db.session.query(RevenueEntry).count()}")
    check("ended_by_staff_id attributed", db.session.get(Session, s_on.id).ended_by_staff_id == staff.id)

    # ================= 5. idempotent =================
    print("\n--- end again ---")
    credits_after_first = credits_of(student_id)
    rev_after_first = db.session.query(RevenueEntry).count()
    r = end(s_on.id)
    body = r.get_json(silent=True) or {}
    db.session.expire_all()
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
    check("reports already_ended", body.get("already_ended") is True)
    check("nobody charged a second time", credits_of(student_id) == credits_after_first,
          f"{credits_after_first} -> {credits_of(student_id)}")
    check("no second RevenueEntry",
          db.session.query(RevenueEntry).count() == rev_after_first)

    # ================= 5b. a started class always has a register =================
    print("\n--- start a class that is already in_progress with no register ---")
    orphan = make_session(status="in_progress"); probe_sessions.append(orphan)
    check("precondition: no register",
          db.session.query(SessionStudent).filter_by(session_id=orphan.id).count() == 0)
    r = client.post(f"/api/sessions/{orphan.id}/start", headers=hdr)
    body = r.get_json(silent=True) or {}
    db.session.expire_all()
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
    check("reports already_started", body.get("already_started") is True)
    check("but materialises the missing register", body.get("roster_created", 0) >= 1,
          f"got {body.get('roster_created')}")
    rows = db.session.query(SessionStudent).filter_by(session_id=orphan.id).all()
    check("register is ABSENT", all(x.status == "ABSENT" for x in rows),
          f"{len(rows)} row(s)")

    # ================= 7. toggle OFF: an absence is free =================
    print("\n--- absence_consumes_credit=False (read at decision time) ---")
    settings.absence_consumes_credit = False
    db.session.commit()
    credits_pre = credits_of(student_id)
    rev_pre = db.session.query(RevenueEntry).count()

    s_off = make_session(); probe_sessions.append(s_off)
    client.post(f"/api/sessions/{s_off.id}/start", headers=hdr)
    r = end(s_off.id)
    body = r.get_json(silent=True) or {}
    db.session.expire_all()
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
    print(f"    {body}")
    check("charged_absences == 0", body.get("charged_absences") == 0,
          f"got {body.get('charged_absences')}")
    check("the absence is counted as skipped", body.get("skipped") == len(enrolled),
          f"got {body.get('skipped')}")
    check("no credit spent", credits_of(student_id) == credits_pre,
          f"{credits_pre} -> {credits_of(student_id)}")
    check("no RevenueEntry written",
          db.session.query(RevenueEntry).count() == rev_pre,
          f"{rev_pre} -> {db.session.query(RevenueEntry).count()}")

    settings.absence_consumes_credit = toggle_before
    db.session.commit()

    # ================= 8. free session bills nothing =================
    print("\n--- a free session ---")
    credits_pre = credits_of(student_id)
    rev_pre = db.session.query(RevenueEntry).count()
    s_free = make_session(is_free=True); probe_sessions.append(s_free)
    client.post(f"/api/sessions/{s_free.id}/start", headers=hdr)
    db.session.expire_all()
    rows = db.session.query(SessionStudent).filter_by(session_id=s_free.id).all()
    check("register auto-filled PRESENT (toggle 6)", len(rows) == len(enrolled) and
          all(x.status == "PRESENT" for x in rows), f"{len(rows)} row(s)")
    r = end(s_free.id)
    body = r.get_json(silent=True) or {}
    db.session.expire_all()
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
    print(f"    {body}")
    check("everyone present", body.get("present") == len(enrolled), f"got {body.get('present')}")
    check("nobody absent", body.get("absent") == 0)
    check("nobody charged", body.get("charged_absences") == 0)
    check("no credit spent", credits_of(student_id) == credits_pre,
          f"{credits_pre} -> {credits_of(student_id)}")
    check("no RevenueEntry written",
          db.session.query(RevenueEntry).count() == rev_pre,
          f"{rev_pre} -> {db.session.query(RevenueEntry).count()}")

    # ================= 9. a PRESENT student is not billed twice =================
    print("\n--- present at check-in, then finalised ---")
    credits_pre = credits_of(student_id)
    rev_pre = db.session.query(RevenueEntry).count()
    s_present = make_session(); probe_sessions.append(s_present)
    client.post(f"/api/sessions/{s_present.id}/start", headers=hdr)

    r = client.post("/api/attendance/check-in", headers=hdr, json={
        "session_id": s_present.id, "student_id": student_id, "pin": PIN,
    })
    check(f"check-in -> 200 (got {r.status_code})", r.status_code == 200,
          f"{(r.get_json(silent=True) or {}).get('error')}")
    db.session.expire_all()
    after_checkin = credits_of(student_id)
    check("check-in charged one credit", after_checkin == credits_pre - 1,
          f"{credits_pre} -> {after_checkin}")

    r = end(s_present.id)
    body = r.get_json(silent=True) or {}
    db.session.expire_all()
    check(f"end -> 200 (got {r.status_code})", r.status_code == 200)
    print(f"    {body}")
    check("present counted", body.get("present") >= 1, f"got {body.get('present')}")
    check("no absence charged", body.get("charged_absences") == 0,
          f"got {body.get('charged_absences')}")
    check("NOT charged a second time", credits_of(student_id) == after_checkin,
          f"{after_checkin} -> {credits_of(student_id)}")
    check("no second RevenueEntry",
          db.session.query(RevenueEntry).count() == rev_pre + 1,
          f"{rev_pre} -> {db.session.query(RevenueEntry).count()}")

    # ================= cleanup =================
    print("\ncleanup")
    ids = [s.id for s in probe_sessions]
    session_ids = [x.id for x in probe_sessions]
    n_rev = db.session.query(RevenueEntry).filter(
        RevenueEntry.session_id.in_(session_ids)).delete(synchronize_session=False)
    n_pay = db.session.query(PayoutRecord).filter(
        PayoutRecord.session_id.in_(session_ids)).delete(synchronize_session=False)
    n_rows = db.session.query(SessionStudent).filter(
        SessionStudent.session_id.in_(session_ids)).delete(synchronize_session=False)
    n_logs = db.session.query(ActivityLog).filter(
        ActivityLog.entity_id.in_(session_ids)).delete(synchronize_session=False)
    n_sess = db.session.query(Session).filter(Session.subject == MARKER).delete(
        synchronize_session=False)
    db.session.delete(staff)
    if made_other_class:
        db.session.delete(other_class)
    db.session.commit()

    # restore money state
    for sub_id, (credits, makeups, status) in subs_before.items():
        sub = db.session.get(StudentSubscription, sub_id)
        if sub is not None:
            sub.remaining_credits, sub.makeup_credits, sub.status = credits, makeups, status
    settings.absence_consumes_credit = toggle_before
    db.session.commit()

    print(f"  removed {n_sess} session(s), {n_rows} roster row(s), {n_rev} revenue, "
          f"{n_pay} payout, {n_logs} log(s), 1 staff user")

    # ================= restore asserted =================
    print("\nrestore")
    db.session.expire_all()
    subs_after = {
        s.id: (s.remaining_credits, s.makeup_credits, s.status)
        for s in db.session.query(StudentSubscription).filter_by(academy_id=ACADEMY).all()
    }
    check("subscriptions restored exactly", subs_after == subs_before)
    check("credits back to the snapshot", credits_of(student_id) == credits_before,
          f"{credits_before} -> {credits_of(student_id)}")
    check("toggle restored",
          AcademySettings.query.filter_by(academy_id=ACADEMY).first().absence_consumes_credit
          == toggle_before)
    check("no throwaway sessions left",
          db.session.query(Session).filter(Session.subject == MARKER).count() == 0)
    check("no throwaway users left", db.session.query(User).count() == users_before,
          f"{users_before} -> {db.session.query(User).count()}")
    check("revenue back to the snapshot",
          db.session.query(RevenueEntry).count() == rev_before,
          f"{rev_before} -> {db.session.query(RevenueEntry).count()}")
    check("payouts back to the snapshot",
          db.session.query(PayoutRecord).count() == payout_before,
          f"{payout_before} -> {db.session.query(PayoutRecord).count()}")

print("\n" + "=" * 52)
print(f"RESULT: {sum(results)}/{len(results)} checks passed"
      f" — {'ALL PASS' if results and all(results) else 'SEE FAILURES ABOVE'}")
