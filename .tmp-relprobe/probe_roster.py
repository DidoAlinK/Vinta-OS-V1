"""
Runtime probe for the roster endpoints.

Verifies, against the real routes:
  1. GET /sessions/<id>/roster        returns the subscription signal
  2. GET /attendance/roster/<id>      returns the same shape
  3. neither returns the removed `payment_status`
  4. a session belonging to ANOTHER academy 404s (no cross-tenant leak)

Seeds a throwaway session_students row and a throwaway foreign session so
the checks run against real payloads, then deletes both. Nothing is left
behind. Re-runnable: it removes any leftover rows it created first.
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
from app.models.academy import Academy  # noqa: E402
from app.models.class_room import Class  # noqa: E402
from app.models.scheduling import Session  # noqa: E402
from app.models.student import Student  # noqa: E402
from app.models.teacher import Teacher  # noqa: E402
from app.models.attendance import SessionStudent  # noqa: E402
from app.models.user import User  # noqa: E402

MARKER = "probe-throwaway"
app = create_app("development")

results = []


def check(label, cond, detail=""):
    results.append(bool(cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))


with app.app_context():
    # ---- cleanup any leftovers from a previous run -----------------------
    for row in db.session.query(SessionStudent).filter(
        SessionStudent.checked_in_by == MARKER
    ).all():
        db.session.delete(row)
    for row in db.session.query(Session).filter(Session.subject == MARKER).all():
        db.session.delete(row)
    db.session.commit()

    sessions = db.session.query(Session).all()
    home = next((s for s in sessions if s.academy_id == "ad6587d5-6fd3-4015-a497-8dd5301b830d"), sessions[0])
    owner = db.session.query(User).filter_by(academy_id=home.academy_id, role="owner").first()
    student = db.session.query(Student).filter_by(academy_id=home.academy_id).first()
    student2 = db.session.query(Student).filter_by(academy_id=home.academy_id).offset(1).first()

    print(f"academy under test : {owner.academy_id}")
    print(f"owner              : {owner.email}")
    print(f"session            : {home.id}")
    print(f"students           : {student.id if student else None}, {student2.id if student2 else None}")

    # ---- seed a throwaway roster (2 rows, so badges vary) ---------------
    seeded = []
    for st in (student, student2):
        if not st:
            continue
        row = SessionStudent(
            id=str(uuid.uuid4()),
            session_id=home.id,
            student_id=st.id,
            is_present=False,
            status="ABSENT",
            checked_in_by=MARKER,   # marker for cleanup; not a real user id
        )
        db.session.add(row)
        seeded.append(row.id)
    db.session.commit()
    print(f"seeded {len(seeded)} roster row(s) on {home.id}")

    token = create_access_token(identity=owner.id)
    hdr = {"Authorization": f"Bearer {token}", "X-Academy-Id": owner.academy_id}
    client = app.test_client()

    def payload_shape(label, path):
        r = client.get(path, headers=hdr)
        body = r.get_json(silent=True) or {}
        roster = body.get("roster")
        print(f"\n{label}  ({path})")
        check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
        check("roster is a non-empty list", isinstance(roster, list) and len(roster) > 0,
              f"len={len(roster) if isinstance(roster, list) else 'n/a'}")
        if not roster:
            return
        keys = set(roster[0].keys())
        check("has 'badges'", "badges" in keys)
        check("has 'remaining_credits'", "remaining_credits" in keys)
        check("has 'access_end'", "access_end" in keys)
        check("has 'status'", "status" in keys)
        check("does NOT have 'payment_status'", "payment_status" not in keys)
        for entry in roster:
            print(f"    {entry.get('student_name')!r:28} present={entry.get('is_present')} "
                  f"status={entry.get('status')} credits={entry.get('remaining_credits')} "
                  f"badges={entry.get('badges')}")

    payload_shape("calendar route", f"/api/sessions/{home.id}/roster")
    payload_shape("attendance route", f"/api/attendance/roster/{home.id}")

    # ---- cross-tenant isolation -----------------------------------------
    print("\ncross-tenant")
    foreign_academy = db.session.query(Academy).filter(
        Academy.id != owner.academy_id
    ).first()
    foreign_class = db.session.query(Class).filter_by(
        academy_id=foreign_academy.id
    ).first()
    foreign_teacher = db.session.query(Teacher).filter_by(
        academy_id=foreign_academy.id
    ).first()

    # Neither real teacher belongs to the second academy, so stand one up
    # (throwaway, marked via `notes`) purely to satisfy Session.teacher_id.
    created_teacher = None
    if foreign_class and not foreign_teacher:
        foreign_teacher = Teacher(
            id=str(uuid.uuid4()),
            academy_id=foreign_academy.id,
            first_name="Probe",
            last_name="Throwaway",
            notes=MARKER,
            status="ACTIVE",
        )
        db.session.add(foreign_teacher)
        db.session.commit()
        created_teacher = foreign_teacher.id
        print(f"  seeded throwaway teacher for {foreign_academy.name!r}")

    if foreign_class and foreign_teacher:
        foreign_session = Session(
            id=str(uuid.uuid4()),
            academy_id=foreign_academy.id,
            class_id=foreign_class.id,
            teacher_id=foreign_teacher.id,
            date=date.today(),
            start_time=time(9, 0),
            end_time=time(10, 0),
            subject=MARKER,          # marker for cleanup
            status="scheduled",
        )
        db.session.add(foreign_session)
        db.session.commit()
        print(f"  created foreign session in academy {foreign_academy.name!r}")

        for path in (
            f"/api/sessions/{foreign_session.id}/roster",
            f"/api/attendance/roster/{foreign_session.id}",
        ):
            r = client.get(path, headers=hdr)
            check(f"{path.split('/api/')[1]} -> 404 (got {r.status_code})", r.status_code == 404)
    else:
        print("  SKIP: could not build a foreign session — foreign academy lacks a class or teacher")
        results.append(False)

    # ---- cleanup ---------------------------------------------------------
    for rid in seeded:
        row = db.session.get(SessionStudent, rid)
        if row:
            db.session.delete(row)
    for row in db.session.query(Session).filter(Session.subject == MARKER).all():
        db.session.delete(row)
    for row in db.session.query(Teacher).filter(Teacher.notes == MARKER).all():
        db.session.delete(row)
    db.session.commit()
    print(f"\ncleaned up: {len(seeded)} roster row(s), any foreign session, "
          f"any throwaway teacher")

print("\n" + "=" * 52)
print(f"RESULT: {sum(results)}/{len(results)} checks passed"
      f" — {'ALL PASS' if results and all(results) else 'SEE FAILURES ABOVE'}")
