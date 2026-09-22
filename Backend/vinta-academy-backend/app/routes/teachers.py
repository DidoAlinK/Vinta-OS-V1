"""
Vinta School OS — Teachers Blueprint
/api/teachers — CRUD, Contracts, Payroll Summaries
"""
import uuid
from flask_smorest import Blueprint
from flask import request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.decorators import tenant_required
from app.utils.audit import log_activity
from app.models.teacher import Teacher, TeacherSubject
from app.models.class_room import Subject
from app.services import payroll_service
from app.schemas.teachers import (
    CreateTeacherRequestSchema, UpdateTeacherRequestSchema,
    TeacherListResponseSchema, TeacherStatsResponseSchema,
    TeacherProfileResponseSchema, CreateTeacherResponseSchema,
)
from app.schemas.base import ErrorSchema, MessageSchema

teachers_bp = Blueprint("teachers", __name__, description="Teacher management & payroll")


@teachers_bp.route("", methods=["GET"])
@jwt_required()
@tenant_required
def list_teachers():
    """List all teachers for the academy with computed fields."""
    from flask import g
    from sqlalchemy import func
    from app.models.scheduling import Session

    teachers = Teacher.query.filter_by(academy_id=g.current_academy_id).all()

    result = []
    for teacher in teachers:
        # Classes assigned
        classes = [c.name for c in teacher.classes.all()]

        # Sessions count this week
        from datetime import date, timedelta
        today = date.today()
        week_start = today - timedelta(days=today.weekday() + 1)
        week_end = week_start + timedelta(days=6)
        week_sessions = Session.query.filter(
            Session.teacher_id == teacher.id,
            Session.date >= week_start,
            Session.date <= week_end,
        ).count()

        # Subjects from junction table
        subjects = [
            {"id": ts.subject.id, "name": ts.subject.name, "color": ts.subject.color}
            for ts in teacher.subject_links.all()
            if ts.subject
        ]

        result.append({
            "id": teacher.id,
            "first_name": teacher.first_name,
            "last_name": teacher.last_name,
            "full_name": teacher.full_name,
            "phone": teacher.phone,
            "subject": teacher.subject,
            "subjects": subjects,
            "contract_type": teacher.contract_type,
            "hourly_rate": teacher.hourly_rate,
            "per_student_rate": teacher.per_student_rate,
            "classes_assigned": classes,
            "sessions_this_week": week_sessions,
            "created_at": teacher.created_at.isoformat() if teacher.created_at else None,
        })

    return jsonify({"teachers": result}), 200


@teachers_bp.route("/stats", methods=["GET"])
@jwt_required()
@tenant_required
def get_stats():
    """Get aggregate teacher statistics for the stats rail."""
    from flask import g

    total = Teacher.query.filter_by(academy_id=g.current_academy_id).count()
    hourly = Teacher.query.filter_by(
        academy_id=g.current_academy_id, contract_type="hourly"
    ).count()
    per_student = Teacher.query.filter_by(
        academy_id=g.current_academy_id, contract_type="per_student"
    ).count()

    return jsonify({
        "total": total,
        "hourly": hourly,
        "per_student": per_student,
    }), 200


@teachers_bp.route("/<teacher_id>", methods=["GET"])
@jwt_required()
@tenant_required
def get_teacher(teacher_id):
    """Get a single teacher with schedule and payroll summary."""
    from flask import g
    from app.models.scheduling import Session

    teacher = Teacher.query.filter_by(
        id=teacher_id, academy_id=g.current_academy_id
    ).first()
    if not teacher:
        return jsonify({"error": "Teacher not found"}), 404

    # Schedule
    sessions = Session.query.filter_by(teacher_id=teacher_id).order_by(
        Session.date, Session.start_time
    ).all()

    schedule = [
        {
            "id": s.id,
            "class_name": s.class_.name if s.class_ else None,
            "date": s.date.isoformat(),
            "start_time": s.start_time.strftime("%H:%M"),
            "end_time": s.end_time.strftime("%H:%M"),
            "subject": s.subject,
        }
        for s in sessions
    ]

    # Payroll summary
    summary = payroll_service.get_teacher_summary(teacher_id, g.current_academy_id)

    # Subjects from junction table
    subjects = [
        {"id": ts.subject.id, "name": ts.subject.name, "color": ts.subject.color}
        for ts in teacher.subject_links.all()
        if ts.subject
    ]

    return jsonify({
        "id": teacher.id,
        "first_name": teacher.first_name,
        "last_name": teacher.last_name,
        "full_name": teacher.full_name,
        "phone": teacher.phone,
        "subject": teacher.subject,
        "subjects": subjects,
        "notes": teacher.notes,
        "contract_type": teacher.contract_type,
        "hourly_rate": teacher.hourly_rate,
        "per_student_rate": teacher.per_student_rate,
        "classes_assigned": [c.name for c in teacher.classes.all()],
        "schedule": schedule,
        "payroll_summary": summary,
    }), 200


@teachers_bp.route("", methods=["POST"])
@jwt_required()
@tenant_required
def create_teacher():
    """
    Create a new teacher with default contract_type=hourly, rate=0.
    Body: { first_name, last_name, phone?, subject?, contract_type?, hourly_rate?, per_student_rate? }
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    if not data.get("first_name") or not data.get("last_name"):
        return jsonify({"error": "first_name and last_name are required"}), 400

    teacher = Teacher(
        id=str(uuid.uuid4()),
        academy_id=g.current_academy_id,
        first_name=data["first_name"],
        last_name=data["last_name"],
        phone=data.get("phone"),
        subject=data.get("subject"),
        notes=data.get("notes"),
        contract_type=data.get("contract_type", "hourly"),
        hourly_rate=data.get("hourly_rate", 0),
        per_student_rate=data.get("per_student_rate", 0),
    )
    db.session.add(teacher)
    db.session.flush()  # Get teacher.id for junction table

    # Create subject links from subject_ids
    subject_ids = data.get("subject_ids", [])
    if subject_ids:
        for sid in subject_ids:
            subject = Subject.query.filter_by(id=sid, academy_id=g.current_academy_id).first()
            if subject:
                ts = TeacherSubject(teacher_id=teacher.id, subject_id=sid)
                db.session.add(ts)

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="teacher",
        entity_id=teacher.id,
        action="created",
        description=f"Teacher {teacher.full_name} created",
    )

    db.session.commit()

    return jsonify({
        "id": teacher.id,
        "first_name": teacher.first_name,
        "last_name": teacher.last_name,
    }), 201


@teachers_bp.route("/<teacher_id>", methods=["PUT"])
@jwt_required()
@tenant_required
def update_teacher(teacher_id):
    """Update teacher profile fields."""
    from flask import g

    teacher = Teacher.query.filter_by(
        id=teacher_id, academy_id=g.current_academy_id
    ).first()
    if not teacher:
        return jsonify({"error": "Teacher not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    for field in ("first_name", "last_name", "phone", "subject", "notes",
                  "contract_type", "hourly_rate", "per_student_rate"):
        if field in data:
            setattr(teacher, field, data[field])

    # Update subject links if subject_ids provided
    if "subject_ids" in data:
        # Delete existing links
        TeacherSubject.query.filter_by(teacher_id=teacher.id).delete()
        # Create new links
        for sid in data["subject_ids"]:
            subject = Subject.query.filter_by(id=sid, academy_id=g.current_academy_id).first()
            if subject:
                ts = TeacherSubject(teacher_id=teacher.id, subject_id=sid)
                db.session.add(ts)

    db.session.commit()
    return jsonify({
        "id": teacher.id,
        "first_name": teacher.first_name,
        "last_name": teacher.last_name,
    }), 200


@teachers_bp.route("/<teacher_id>", methods=["DELETE"])
@jwt_required()
@tenant_required
def delete_teacher(teacher_id):
    """Delete a teacher."""
    from flask import g

    teacher = Teacher.query.filter_by(
        id=teacher_id, academy_id=g.current_academy_id
    ).first()
    if not teacher:
        return jsonify({"error": "Teacher not found"}), 404

    # Nullify teacher_id on classes (Class.teacher_id is nullable)
    from app.models.class_room import Class
    Class.query.filter_by(teacher_id=teacher_id).update({'teacher_id': None})

    # Delete teacher hours logs referencing this teacher
    from app.models.teacher import TeacherHoursLog
    TeacherHoursLog.query.filter_by(teacher_id=teacher_id).delete()

    # Delete sessions referencing this teacher (Session.teacher_id is NOT NULL)
    from app.models.scheduling import Session
    Session.query.filter_by(teacher_id=teacher_id).delete()

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="teacher",
        entity_id=teacher.id,
        action="deleted",
        description=f"Teacher {teacher.full_name} deleted",
    )

    db.session.delete(teacher)
    db.session.commit()
    return jsonify({"message": "Teacher deleted"}), 200
