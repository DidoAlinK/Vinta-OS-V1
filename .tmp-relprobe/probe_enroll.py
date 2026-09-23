"""
Runtime probe: "I added a student and it doesn't show up."

Walks the exact path the Add Students modal walks, against the live routes:

  1. GET  /students?per_page=100                 (the modal's source list)
  2. POST /students/bulk-enroll                  (what Confirm calls first)
  3. GET  /classes/<id>/students                 (what the roster renders from)
  4. POST /students/<id>/enroll                  (what the fallback calls)

Prints the status and body of each so the failure is visible rather than
theorised. Uses a throwaway student and removes it afterwards.
"""
import os
import sys
import uuid

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from flask_jwt_extended import create_access_token  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.class_room import Class  # noqa: E402
from app.models.student import Enrollment, Student  # noqa: E402
from app.models.user import User  # noqa: E402

MARKER = "probe-enroll-throwaway"
ACADEMY = "ad6587d5-6fd3-4015-a497-8dd5301b830d"
GROUP = "a41fd3be-807b-45ad-b298-69edb7a0ac21"

app = create_app("development")

with app.app_context():
    owner = db.session.query(User).filter_by(role="owner", academy_id=ACADEMY).first()
    hdr = {
        "Authorization": f"Bearer {create_access_token(identity=owner.id)}",
        "X-Academy-Id": ACADEMY,
    }
    client = app.test_client()

    students_before = db.session.query(Student).count()
    enrollments_before = db.session.query(Enrollment).count()

    victim = Student(
        id=str(uuid.uuid4()), academy_id=ACADEMY,
        first_name=MARKER, last_name="Student",
        phone="+213000000000", is_active=True,
    )
    db.session.add(victim)
    db.session.commit()
    print(f"throwaway student {victim.id}")

    # 1. the modal's source list
    print("\n1. GET /students?per_page=100")
    r = client.get("/api/students?per_page=100", headers=hdr)
    body = r.get_json(silent=True) or {}
    rows = body.get("students") if isinstance(body, dict) else body
    print(f"   HTTP {r.status_code}, {len(rows) if isinstance(rows, list) else '?'} student(s)")
    if isinstance(rows, list):
        print(f"   contains the new student: {any(s.get('id') == victim.id for s in rows)}")
        print(f"   keys on a row: {sorted(rows[0].keys()) if rows else '—'}")
    else:
        print(f"   body: {str(body)[:300]}")

    # 2. bulk-enroll, exactly as Confirm calls it
    print("\n2. POST /students/bulk-enroll")
    r = client.post("/api/students/bulk-enroll", headers=hdr,
                    json={"student_ids": [victim.id], "class_id": GROUP})
    print(f"   HTTP {r.status_code}")
    print(f"   body: {r.get_json(silent=True)}")

    # 3. what the roster renders from
    print("\n3. GET /classes/<Group A>/students")
    r = client.get(f"/api/classes/{GROUP}/students", headers=hdr)
    body = r.get_json(silent=True) or {}
    ids = [s["id"] for s in body.get("students", [])]
    print(f"   HTTP {r.status_code}, total={body.get('total')}")
    print(f"   contains the new student: {victim.id in ids}")
    print(f"   students: {[s.get('full_name') for s in body.get('students', [])]}")

    # 4. the per-student fallback
    print("\n4. POST /students/<id>/enroll")
    r = client.post(f"/api/students/{victim.id}/enroll", headers=hdr,
                    json={"class_id": GROUP})
    print(f"   HTTP {r.status_code}, body: {r.get_json(silent=True)}")

    # ---- cleanup ----
    print("\ncleanup")
    n_enr = db.session.query(Enrollment).filter(
        Enrollment.student_id == victim.id).delete(synchronize_session=False)
    n_log = db.session.query(ActivityLog).filter(
        ActivityLog.entity_id == victim.id).delete(synchronize_session=False)
    db.session.delete(victim)
    db.session.commit()
    print(f"   removed student, {n_enr} enrollment(s), {n_log} log row(s)")
    print(f"   students: {students_before} -> {db.session.query(Student).count()}")
    print(f"   enrollments: {enrollments_before} -> {db.session.query(Enrollment).count()}")
