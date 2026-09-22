"""
Vinta School OS — Classes Blueprint
/api/classes, /api/classrooms — Class & Classroom CRUD, Schedules
CourseGroup money-model fields are accepted on create/update and returned
in list/get. Backward compatible: all new fields optional.
"""
import uuid
from flask_smorest import Blueprint
from flask import request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.decorators import tenant_required
from app.utils.audit import log_activity
from app.models.class_room import Classroom, Class, Subject
from app.models.scheduling import Schedule
from app.services import scheduling_service
from app.schemas.classes import (
    CreateClassRequestSchema, CreateClassroomRequestSchema,
    CreateScheduleRequestSchema, ClassListResponseSchema,
    ClassroomListResponseSchema, CreateScheduleResponseSchema,
    CreateClassResponseSchema,
)
from app.schemas.base import ErrorSchema, MessageSchema

classes_bp = Blueprint("classes", __name__, description="Classes, classrooms & recurring schedules")


# ── CourseGroup / money-model helpers ───────────────────────────────

GROUP_FIELDS = (
    "academic_level", "group_name", "billing_model", "price_da",
    "credits_per_cycle", "cycle_week_limit", "allow_rollover",
    "allow_makeups", "access_duration_weeks", "max_groups_included",
    "enforce_attendance", "attendance_threshold",
)

# Friendly aliases accepted for billing_model (DB enum is CREDIT_BASED/TIME_BASED)
BILLING_MODEL_ALIASES = {
    "per_cycle": "CREDIT_BASED",
    "credit_based": "CREDIT_BASED",
    "credit-based": "CREDIT_BASED",
    "per_access": "TIME_BASED",
    "per_month": "TIME_BASED",
    "unlimited": "TIME_BASED",
    "time_based": "TIME_BASED",
    "time-based": "TIME_BASED",
}


def _normalize_billing_model(value):
    """Map friendly billing-model names to the DB enum values."""
    if value is None:
        return None
    key = str(value).strip().lower()
    if key in BILLING_MODEL_ALIASES:
        return BILLING_MODEL_ALIASES[key]
    return str(value).strip().upper()


def _group_payload(cls):
    """Serialize the CourseGroup money-model fields of a Class."""
    return {f: getattr(cls, f, None) for f in GROUP_FIELDS}


def _apply_group_fields(cls, data):
    """Apply any CourseGroup fields present in data. Returns applied names."""
    applied = []
    for field in GROUP_FIELDS:
        if field in data:
            value = data[field]
            if field == "billing_model":
                value = _normalize_billing_model(value)
            setattr(cls, field, value)
            applied.append(field)
    return applied


# ── Classrooms ──────────────────────────────────────────────────────

@classes_bp.route("/classrooms", methods=["GET"])
@jwt_required()
@tenant_required
def list_classrooms():
    """List all classrooms for the academy."""
    from flask import g
    rooms = Classroom.query.filter_by(academy_id=g.current_academy_id).all()
    return jsonify({
        "classrooms": [
            {"id": r.id, "name": r.name, "capacity": r.capacity}
            for r in rooms
        ]
    }), 200


@classes_bp.route("/classrooms", methods=["POST"])
@jwt_required()
@tenant_required
def create_classroom():
    """Create a new classroom. Body: { name, capacity? }"""
    from flask import g
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "name is required"}), 400

    room = Classroom(
        id=str(uuid.uuid4()),
        academy_id=g.current_academy_id,
        name=data["name"],
        capacity=data.get("capacity", 0),
    )
    db.session.add(room)
    db.session.commit()
    return jsonify({"id": room.id, "name": room.name, "capacity": room.capacity}), 201


@classes_bp.route("/classrooms/<room_id>", methods=["PUT"])
@jwt_required()
@tenant_required
def update_classroom(room_id):
    """Update a classroom. Body: { name?, capacity? }"""
    from flask import g
    room = Classroom.query.filter_by(id=room_id, academy_id=g.current_academy_id).first()
    if not room:
        return jsonify({"error": "Classroom not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    for field in ("name", "capacity"):
        if field in data:
            setattr(room, field, data[field])

    db.session.commit()
    return jsonify({"id": room.id, "name": room.name, "capacity": room.capacity}), 200


@classes_bp.route("/classrooms/<room_id>", methods=["DELETE"])
@jwt_required()
@tenant_required
def delete_classroom(room_id):
    """Delete a classroom; schedules/sessions referencing it are unlinked."""
    from flask import g
    from app.models.scheduling import Session

    room = Classroom.query.filter_by(id=room_id, academy_id=g.current_academy_id).first()
    if not room:
        return jsonify({"error": "Classroom not found"}), 404

    # Unlink (both FKs are nullable) so front desk can manage rooms freely
    Schedule.query.filter_by(classroom_id=room.id).update({"classroom_id": None})
    Session.query.filter_by(classroom_id=room.id).update({"classroom_id": None})

    db.session.delete(room)
    db.session.commit()
    return jsonify({"message": "Classroom deleted"}), 200


# ── Classes ─────────────────────────────────────────────────────────

@classes_bp.route("/classes", methods=["GET"])
@jwt_required()
@tenant_required
def list_classes():
    """List all classes with enrollment status dots."""
    from flask import g
    from app.models.student import Enrollment

    classes = Class.query.filter_by(academy_id=g.current_academy_id).all()

    result = []
    for cls in classes:
        enrolled_count = Enrollment.query.filter_by(
            class_id=cls.id, status="active"
        ).count()

        # Status dot logic: Red=full, Green=has students, Grey=empty
        if enrolled_count >= cls.capacity and cls.capacity > 0:
            status_color = "red"
        elif enrolled_count > 0:
            status_color = "green"
        else:
            status_color = "grey"

        entry = {
            "id": cls.id,
            "name": cls.name,
            "subject": cls.subject,
            "color": cls.color,
            "teacher_id": cls.teacher_id,
            "teacher_name": cls.teacher.full_name if cls.teacher else "Unassigned",
            "capacity": cls.capacity,
            "enrolled_count": enrolled_count,
            "status_color": status_color,
            "notes": cls.notes,
            "class_type": cls.class_type,
            "dedicated_time": cls.dedicated_time,
        }
        entry.update(_group_payload(cls))
        result.append(entry)

    return jsonify({"classes": result}), 200


@classes_bp.route("/classes/<class_id>", methods=["GET"])
@jwt_required()
@tenant_required
def get_class(class_id):
    """Get a single class with schedules and enrollment."""
    from flask import g
    from app.models.student import Enrollment

    cls = Class.query.filter_by(id=class_id, academy_id=g.current_academy_id).first()
    if not cls:
        return jsonify({"error": "Class not found"}), 404

    enrolled_count = Enrollment.query.filter_by(
        class_id=cls.id, status="active"
    ).count()

    schedules = Schedule.query.filter_by(class_id=cls.id).all()
    schedule_data = [
        {
            "id": s.id,
            "day_of_week": s.day_of_week,
            "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"),
            "classroom_id": s.classroom_id,
            "classroom_name": s.classroom.name if s.classroom else None,
        }
        for s in schedules
    ]

    payload = {
        "id": cls.id,
        "name": cls.name,
        "subject": cls.subject,
        "color": cls.color,
        "teacher_id": cls.teacher_id,
        "teacher_name": cls.teacher.full_name if cls.teacher else "Unassigned",
        "capacity": cls.capacity,
        "enrolled_count": enrolled_count,
        "notes": cls.notes,
        "class_type": cls.class_type,
        "dedicated_time": cls.dedicated_time,
        "schedules": schedule_data,
    }
    payload.update(_group_payload(cls))
    return jsonify(payload), 200


@classes_bp.route("/classes/<class_id>/students", methods=["GET"])
@jwt_required()
@tenant_required
def list_class_students(class_id):
    """List all students enrolled in a specific class."""
    from flask import g
    from app.models.student import Student, Enrollment

    cls = Class.query.filter_by(id=class_id, academy_id=g.current_academy_id).first()
    if not cls:
        return jsonify({"error": "Class not found"}), 404

    enrollments = Enrollment.query.filter_by(class_id=class_id, status="active").all()
    student_ids = [e.student_id for e in enrollments]
    students = Student.query.filter(Student.id.in_(student_ids)).all() if student_ids else []

    return jsonify({
        "students": [
            {
                "id": s.id,
                "full_name": s.full_name,
                "first_name": s.first_name,
                "last_name": s.last_name,
                "phone": s.phone,
                "status": s.status,
                "enrollment_id": next((e.id for e in enrollments if e.student_id == s.id), None),
            }
            for s in students
        ],
        "total": len(students),
    }), 200


@classes_bp.route("/classes", methods=["POST"])
@jwt_required()
@tenant_required
def create_class():
    """
    Create a new class.
    Body: { name, subject?, color?, teacher_id?, capacity?, notes?,
            academic_level?, group_name?, billing_model?, price_da?,
            credits_per_cycle?, cycle_week_limit?, allow_rollover?,
            allow_makeups?, access_duration_weeks?, max_groups_included?,
            enforce_attendance?, attendance_threshold? }
    """
    from flask import g
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "name is required"}), 400

    cls = Class(
        id=str(uuid.uuid4()),
        academy_id=g.current_academy_id,
        name=data["name"],
        subject=data.get("subject"),
        color=data.get("color"),
        teacher_id=data.get("teacher_id"),
        capacity=data.get("capacity", 30),
        notes=data.get("notes"),
        class_type=data.get("class_type", "weekly"),
        dedicated_time=data.get("dedicated_time"),
    )
    _apply_group_fields(cls, data)
    db.session.add(cls)

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="class",
        entity_id=cls.id,
        action="created",
        description=f"Class {cls.name} created",
    )

    db.session.commit()

    return jsonify({
        "id": cls.id,
        "name": cls.name,
        "subject": cls.subject,
    }), 201


@classes_bp.route("/classes/<class_id>", methods=["PUT"])
@jwt_required()
@tenant_required
def update_class(class_id):
    """Update class fields (legacy + CourseGroup money-model fields)."""
    from flask import g

    cls = Class.query.filter_by(id=class_id, academy_id=g.current_academy_id).first()
    if not cls:
        return jsonify({"error": "Class not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    LEGACY_FIELDS = ("name", "subject", "color", "teacher_id", "capacity", "notes", "class_type", "dedicated_time")
    for field in LEGACY_FIELDS:
        if field in data:
            setattr(cls, field, data[field])
    _apply_group_fields(cls, data)

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="class",
        entity_id=cls.id,
        action="updated",
        description=f"Class {cls.name} updated",
        metadata={"fields": [f for f in (*LEGACY_FIELDS, *GROUP_FIELDS) if f in data]},
    )

    db.session.commit()
    return jsonify({"id": cls.id, "name": cls.name}), 200


@classes_bp.route("/classes/<class_id>", methods=["DELETE"])
@jwt_required()
@tenant_required
def delete_class(class_id):
    """Delete class, cancel sessions, withdraw enrollments."""
    from flask import g
    from app.models.student import Enrollment

    cls = Class.query.filter_by(id=class_id, academy_id=g.current_academy_id).first()
    if not cls:
        return jsonify({"error": "Class not found"}), 404

    # Cancel all sessions for this class
    from app.models.scheduling import Session
    sessions = Session.query.filter_by(class_id=cls.id).all()
    for s in sessions:
        s.status = "cancelled"

    # Withdraw all enrollments
    enrollments = Enrollment.query.filter_by(class_id=class_id, status="active").all()
    for e in enrollments:
        e.status = "withdrawn"

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="class",
        entity_id=cls.id,
        action="deleted",
        description=f"Class {cls.name} deleted",
    )

    db.session.delete(cls)
    db.session.commit()
    return jsonify({"message": "Class deleted"}), 200


# ── Enrollment transfer & group subscriptions ─────────────────────────

def _transfer_enrollment(enrollment_id, new_group_id, academy_id, performed_by):
    """Move an enrollment to another group. Returns (payload, status_code)."""
    from app.models.student import Enrollment

    enrollment = Enrollment.query.filter_by(id=enrollment_id).first()
    if not enrollment:
        return {"error": "Enrollment not found"}, 404

    student = enrollment.student
    if not student or student.academy_id != academy_id:
        return {"error": "Enrollment not found"}, 404

    new_cls = Class.query.filter_by(id=new_group_id, academy_id=academy_id).first()
    if not new_cls:
        return {"error": "Destination group not found"}, 404

    if enrollment.class_id == new_group_id and enrollment.status == "active":
        return {
            "id": enrollment.id,
            "student_id": enrollment.student_id,
            "class_id": enrollment.class_id,
            "status": enrollment.status,
        }, 200

    # Capacity guard on the destination group
    enrolled_count = Enrollment.query.filter_by(
        class_id=new_group_id, status="active"
    ).count()
    if new_cls.capacity and enrolled_count >= new_cls.capacity:
        return {"error": "Destination group is at full capacity"}, 409

    old_group_id = enrollment.class_id
    enrollment.status = "transferred"
    new_enrollment = Enrollment(
        id=str(uuid.uuid4()),
        student_id=enrollment.student_id,
        class_id=new_group_id,
        status="active",
    )
    db.session.add(new_enrollment)
    db.session.flush()

    # Keep billing coherent: same-level subscriptions follow the move and
    # stay ACTIVE; cross-level moves flag that a new payment is required.
    from app.services.billing_service import repoint_subscriptions_for_transfer
    billing_move = repoint_subscriptions_for_transfer(
        enrollment.student_id, old_group_id, new_group_id
    )

    log_activity(
        academy_id=academy_id,
        user_id=performed_by,
        entity_type="enrollment",
        entity_id=enrollment.id,
        action="updated",
        description=f"Enrollment transferred to group {new_cls.name}",
        metadata={"from_group": old_group_id, "to_group": new_group_id},
    )
    db.session.commit()

    return {
        "id": new_enrollment.id,
        "student_id": new_enrollment.student_id,
        "class_id": new_enrollment.class_id,
        "status": new_enrollment.status,
        "previous_enrollment_id": enrollment.id,
        "same_level": billing_move.get("same_level"),
        "requires_new_payment": billing_move.get("requires_new_payment"),
        "moved_subscriptions": billing_move.get("moved_subscriptions", []),
    }, 201


@classes_bp.route("/enrollments/<enrollment_id>/transfer", methods=["PUT"])
@jwt_required()
@tenant_required
def transfer_enrollment_by_id(enrollment_id):
    """
    Transfer an enrollment to another group.
    Body: { new_group_id } (alias: new_class_id)
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    new_group_id = data.get("new_group_id") or data.get("new_class_id")
    if not new_group_id:
        return jsonify({"error": "new_group_id is required"}), 400

    payload, code = _transfer_enrollment(
        enrollment_id, new_group_id, g.current_academy_id, g.current_user.id
    )
    return jsonify(payload), code


@classes_bp.route("/classes/<class_id>/transfer-enrollment", methods=["POST"])
@jwt_required()
@tenant_required
def transfer_enrollment_from_class(class_id):
    """
    Transfer an enrollment out of this class.
    Body: { enrollment_id, new_group_id } (alias: new_class_id)
    """
    from flask import g
    from app.models.student import Enrollment

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    enrollment_id = data.get("enrollment_id")
    new_group_id = data.get("new_group_id") or data.get("new_class_id")
    if not enrollment_id or not new_group_id:
        return jsonify({"error": "enrollment_id and new_group_id are required"}), 400

    enrollment = Enrollment.query.filter_by(id=enrollment_id).first()
    if not enrollment or enrollment.class_id != class_id:
        return jsonify({"error": "Enrollment not found in this class"}), 404

    payload, code = _transfer_enrollment(
        enrollment_id, new_group_id, g.current_academy_id, g.current_user.id
    )
    return jsonify(payload), code


@classes_bp.route("/classes/<class_id>/subscriptions", methods=["GET"])
@jwt_required()
@tenant_required
def list_group_subscriptions(class_id):
    """List active subscriptions for a group (class)."""
    from flask import g
    from app.models.billing import StudentSubscription
    from app.models.student import Student

    cls = Class.query.filter_by(id=class_id, academy_id=g.current_academy_id).first()
    if not cls:
        return jsonify({"error": "Class not found"}), 404

    subs = StudentSubscription.query.filter_by(
        group_id=class_id, status="ACTIVE"
    ).all()

    result = []
    for sub in subs:
        student = db.session.get(Student, sub.student_id)
        result.append({
            "id": sub.id,
            "student_id": sub.student_id,
            "student_name": f"{student.first_name} {student.last_name}" if student else None,
            "group_id": sub.group_id,
            "billing_model": sub.billing_model,
            "amount_da": int(sub.amount_paid_da or 0),
            "remaining_credits": sub.remaining_credits,
            "total_credits": sub.total_credits,
            "access_end": sub.access_end_date.isoformat() if sub.access_end_date else None,
            "status": sub.status,
        })

    return jsonify({"subscriptions": result}), 200


# ── Schedules (within a class) ──────────────────────────────────────

@classes_bp.route("/classes/<class_id>/schedules", methods=["POST"])
@jwt_required()
@tenant_required
def create_schedule(class_id):
    """
    Add a schedule block to a class.
    Body: { day_of_week, start_time, end_time, classroom_id? }
    """
    from flask import g
    from app.services.scheduling_service import snap_time_obj, _parse_time

    cls = Class.query.filter_by(id=class_id, academy_id=g.current_academy_id).first()
    if not cls:
        return jsonify({"error": "Class not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    required = ("day_of_week", "start_time", "end_time")
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    schedule = Schedule(
        id=str(uuid.uuid4()),
        class_id=class_id,
        classroom_id=data.get("classroom_id"),
        day_of_week=data["day_of_week"],
        start_time=snap_time_obj(scheduling_service._parse_time(data["start_time"])),
        end_time=snap_time_obj(scheduling_service._parse_time(data["end_time"])),
    )
    db.session.add(schedule)
    db.session.commit()

    # Generate sessions for the next 12 weeks
    sessions_created = scheduling_service.generate_sessions_from_schedule(schedule.id)
    db.session.commit()

    return jsonify({
        "id": schedule.id,
        "day_of_week": schedule.day_of_week,
        "start_time": schedule.start_time.strftime("%H:%M"),
        "end_time": schedule.end_time.strftime("%H:%M"),
        "sessions_created": sessions_created,
    }), 201


@classes_bp.route("/classes/<class_id>/schedules/<schedule_id>", methods=["DELETE"])
@jwt_required()
@tenant_required
def delete_schedule(class_id, schedule_id):
    """Delete a schedule block."""
    from flask import g

    schedule = Schedule.query.filter_by(
        id=schedule_id, class_id=class_id
    ).first()
    if not schedule:
        return jsonify({"error": "Schedule not found"}), 404

    # Delete associated sessions first
    from app.models.scheduling import Session
    Session.query.filter_by(schedule_id=schedule.id).delete()

    db.session.delete(schedule)
    db.session.commit()
    return jsonify({"message": "Schedule deleted"}), 200


# ── Subjects (extensible palette) ───────────────────────────────────

@classes_bp.route("/subjects", methods=["GET"])
@jwt_required()
@tenant_required
def list_subjects():
    """List all subjects for the calendar palette and settings."""
    from flask import g
    subjects = Subject.query.filter_by(academy_id=g.current_academy_id).all()

    # Also include unique subjects from classes
    classes = Class.query.filter_by(academy_id=g.current_academy_id).all()
    seen = {s.name for s in subjects}
    palette = [
        {"id": s.id, "name": s.name, "color": s.color} for s in subjects
    ]

    for cls in classes:
        if cls.subject and cls.subject not in seen:
            seen.add(cls.subject)
            palette.append({"id": None, "name": cls.subject, "color": cls.color or "#b3872a"})

    return jsonify({"subjects": palette}), 200


@classes_bp.route("/subjects", methods=["POST"])
@jwt_required()
@tenant_required
def create_subject():
    """
    Add a custom subject to the palette.
    Body: { name, color }
    """
    from flask import g
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "name is required"}), 400

    subject = Subject(
        id=str(uuid.uuid4()),
        academy_id=g.current_academy_id,
        name=data["name"],
        color=data.get("color", "#b3872a"),
    )
    db.session.add(subject)
    db.session.commit()
    return jsonify({"id": subject.id, "name": subject.name, "color": subject.color}), 201


@classes_bp.route("/subjects/<subject_id>", methods=["DELETE"])
@jwt_required()
@tenant_required
def delete_subject(subject_id):
    """Delete a custom subject by ID."""
    from flask import g
    from app.models.teacher import TeacherSubject

    subject = Subject.query.filter_by(id=subject_id, academy_id=g.current_academy_id).first()
    if not subject:
        return jsonify({"error": "Subject not found"}), 404

    # Clean up teacher-subject junction records first
    TeacherSubject.query.filter_by(subject_id=subject_id).delete()

    db.session.delete(subject)
    db.session.commit()
    return jsonify({"message": "Subject deleted"}), 200
