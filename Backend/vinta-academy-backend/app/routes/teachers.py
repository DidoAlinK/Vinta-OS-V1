"""
Vinta School OS — Teachers Blueprint
/api/teachers — CRUD, Contracts, Payroll Summaries
"""
import re
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


# ── Profile field validation ───────────────────────────────────────
#
# Teacher.email is nullable in the DB (so pre-existing rows survive the
# additive migration) but required + format-checked here, and unique per
# academy via uq_teacher_email_per_academy. status/commission_type are
# SAEnum columns with no CHECK constraint in SQLite, so an unvalidated
# value would be written happily and then blow up on the next read —
# they are validated here instead.

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")

TEACHER_STATUSES = ("ACTIVE", "INACTIVE")

# Mirrors the SAEnum on Teacher.commission_type.
COMMISSION_TYPES = ("PERCENTAGE", "FLAT_HOURLY", "FIXED_SESSION")

# commission_value is a DZD integer whose meaning depends on the type
# (see Teacher.commission_value and billing_service.compute_teacher_cut):
#   PERCENTAGE     % of gross         → 0–100
#   FLAT_HOURLY    DA per hour        → 0–1,000,000
#   FIXED_SESSION  DA per session     → 0–1,000,000
COMMISSION_RANGES = {
    "PERCENTAGE": (0, 100),
    "FLAT_HOURLY": (0, 1_000_000),
    "FIXED_SESSION": (0, 1_000_000),
}


def _clean_email(raw):
    """
    Format-check a teacher email. Returns (value, error).

    Stored lower-cased/stripped so the DB unique index agrees with the
    case-insensitive uniqueness rule the UI already applies.
    """
    if not isinstance(raw, str):
        return None, "email is required"
    value = raw.strip().lower()
    if not value:
        return None, "email is required"
    if len(value) > 254 or not EMAIL_RE.match(value):
        return None, "email must be a valid email address"
    return value, None


def _clean_status(raw):
    """Validate a teacher status. Returns (value, error)."""
    if raw not in TEACHER_STATUSES:
        return None, "status must be one of " + ", ".join(TEACHER_STATUSES)
    return raw, None


def _resolve_commission(data, current_type):
    """
    Owner-gate and range-check the commission fields.

    Returns (fields, error) — `fields` holds the model attributes to apply,
    `error` is a ready (response, status) tuple.

    Commission is owner-only: a non-owner who sends either field is refused
    with 403 rather than having the fields silently dropped.

    `current_type` is the teacher's existing commission_type (PUT), used to
    range-check a bare commission_value; None on POST, where the model
    default (PERCENTAGE) applies.
    """
    from flask import g

    if "commission_type" not in data and "commission_value" not in data:
        return {}, None

    # Fail closed: tenant_required always sets g.current_user, so a missing
    # one means the route was wired wrong — treat that as non-owner.
    user = getattr(g, "current_user", None)
    if user is None or user.role != "owner":
        return None, (jsonify({
            "error": "Commission editing is owner-only — ask the academy owner",
        }), 403)

    fields = {}

    commission_type = data.get("commission_type", current_type or "PERCENTAGE")
    if commission_type not in COMMISSION_TYPES:
        return None, (jsonify({
            "error": "commission_type must be one of " + ", ".join(COMMISSION_TYPES),
        }), 400)
    fields["commission_type"] = commission_type

    if "commission_value" in data:
        value = data["commission_value"]
        low, high = COMMISSION_RANGES[commission_type]
        # bool is an int subclass — reject it explicitly.
        if isinstance(value, bool) or not isinstance(value, int):
            return None, (jsonify({
                "error": (
                    f"commission_value must be an integer between {low} and {high} "
                    f"for commission_type {commission_type}"
                ),
            }), 400)
        if value < low or value > high:
            return None, (jsonify({
                "error": (
                    f"commission_value must be between {low} and {high} "
                    f"for commission_type {commission_type}"
                ),
            }), 400)
        fields["commission_value"] = value

    return fields, None


def _email_taken(academy_id, email, exclude_teacher_id=None):
    """True if another teacher in the academy already uses this email."""
    query = Teacher.query.filter_by(academy_id=academy_id, email=email)
    if exclude_teacher_id:
        query = query.filter(Teacher.id != exclude_teacher_id)
    return query.first() is not None


def _serialize_teacher(teacher):
    """Profile fields shared by the create/update responses."""
    return {
        "id": teacher.id,
        "first_name": teacher.first_name,
        "last_name": teacher.last_name,
        "email": teacher.email,
        "status": teacher.status,
        "commission_type": teacher.commission_type,
        "commission_value": teacher.commission_value,
    }


@teachers_bp.route("", methods=["GET"])
@jwt_required()
@tenant_required
def list_teachers():
    """
    List all teachers for the academy with computed fields.

    Query params: status=ACTIVE|INACTIVE — optional. This endpoint feeds both
    the management roster and the class/session assignment pickers, so the
    default stays the full roster (INACTIVE teachers must remain reachable
    to be reactivated) and pickers opt in with ?status=ACTIVE to keep
    deactivated teachers out of their dropdowns.
    """
    from flask import g
    from sqlalchemy import func
    from app.models.scheduling import Session

    status_filter = request.args.get("status")
    if status_filter is not None and status_filter not in TEACHER_STATUSES:
        return jsonify({"error": "status must be one of " + ", ".join(TEACHER_STATUSES)}), 400

    query = Teacher.query.filter_by(academy_id=g.current_academy_id)
    if status_filter:
        query = query.filter_by(status=status_filter)
    teachers = query.all()

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
            "email": teacher.email,
            "status": teacher.status,
            "subject": teacher.subject,
            "subjects": subjects,
            "contract_type": teacher.contract_type,
            "hourly_rate": teacher.hourly_rate,
            "per_student_rate": teacher.per_student_rate,
            "commission_type": teacher.commission_type,
            "commission_value": teacher.commission_value,
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
        "email": teacher.email,
        "status": teacher.status,
        "subject": teacher.subject,
        "subjects": subjects,
        "notes": teacher.notes,
        "contract_type": teacher.contract_type,
        "hourly_rate": teacher.hourly_rate,
        "per_student_rate": teacher.per_student_rate,
        "commission_type": teacher.commission_type,
        "commission_value": teacher.commission_value,
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
    Body: { first_name, last_name, email, phone?, subject?, contract_type?,
            hourly_rate?, per_student_rate?, commission_type?, commission_value? }

    email is required and unique per academy (409 on a clash).
    commission_type/commission_value are owner-only and range-checked.
    """
    from flask import g
    from sqlalchemy.exc import IntegrityError

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    if not data.get("first_name") or not data.get("last_name"):
        return jsonify({"error": "first_name and last_name are required"}), 400

    email, email_error = _clean_email(data.get("email"))
    if email_error:
        return jsonify({"error": email_error}), 400

    commission, commission_error = _resolve_commission(data, None)
    if commission_error:
        return commission_error

    # Pre-check so the common clash is a clean 409 before any write; the
    # unique index is still the authority (see the IntegrityError catch below).
    if _email_taken(g.current_academy_id, email):
        return jsonify({
            "error": "A teacher with this email already exists in this academy",
        }), 409

    teacher = Teacher(
        id=str(uuid.uuid4()),
        academy_id=g.current_academy_id,
        first_name=data["first_name"],
        last_name=data["last_name"],
        phone=data.get("phone"),
        email=email,
        subject=data.get("subject"),
        notes=data.get("notes"),
        contract_type=data.get("contract_type", "hourly"),
        hourly_rate=data.get("hourly_rate", 0),
        per_student_rate=data.get("per_student_rate", 0),
        **commission,
    )
    db.session.add(teacher)
    try:
        db.session.flush()  # Get teacher.id for junction table
    except IntegrityError:
        # Lost a race against a concurrent create of the same email.
        db.session.rollback()
        return jsonify({
            "error": "A teacher with this email already exists in this academy",
        }), 409

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

    return jsonify(_serialize_teacher(teacher)), 201


@teachers_bp.route("/<teacher_id>", methods=["PUT"])
@jwt_required()
@tenant_required
def update_teacher(teacher_id):
    """
    Update teacher profile fields.
    Body: { first_name?, last_name?, email?, status?, phone?, subject?,
            notes?, contract_type?, hourly_rate?, per_student_rate?,
            commission_type?, commission_value? }

    email keeps the per-academy uniqueness rule but excludes this teacher's
    own row. status must be ACTIVE or INACTIVE.
    commission_type/commission_value are owner-only (403 otherwise) and
    range-checked.
    """
    from flask import g
    from sqlalchemy.exc import IntegrityError

    teacher = Teacher.query.filter_by(
        id=teacher_id, academy_id=g.current_academy_id
    ).first()
    if not teacher:
        return jsonify({"error": "Teacher not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    if "email" in data:
        email, email_error = _clean_email(data.get("email"))
        if email_error:
            return jsonify({"error": email_error}), 400
        if _email_taken(g.current_academy_id, email, exclude_teacher_id=teacher.id):
            return jsonify({
                "error": "A teacher with this email already exists in this academy",
            }), 409
        teacher.email = email

    if "status" in data:
        status, status_error = _clean_status(data.get("status"))
        if status_error:
            return jsonify({"error": status_error}), 400
        teacher.status = status

    commission, commission_error = _resolve_commission(data, teacher.commission_type)
    if commission_error:
        return commission_error

    for field in ("first_name", "last_name", "phone", "subject", "notes",
                  "contract_type", "hourly_rate", "per_student_rate"):
        if field in data:
            setattr(teacher, field, data[field])

    for field, value in commission.items():
        setattr(teacher, field, value)

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

    try:
        db.session.commit()
    except IntegrityError:
        # Lost a race against a concurrent create/rename to the same email.
        db.session.rollback()
        return jsonify({
            "error": "A teacher with this email already exists in this academy",
        }), 409

    return jsonify(_serialize_teacher(teacher)), 200


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
