"""
Vinta School OS — Students Blueprint
/api/students — CRUD, Guardians, Profile Drawer, Enrollment
"""

from flask_smorest import Blueprint
from flask import request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.decorators import tenant_required
from app.utils.audit import log_activity
from app.services import student_service
from app.schemas.students import (
    CreateStudentRequestSchema,
    UpdateStudentRequestSchema,
    EnrollStudentRequestSchema,
    AddGuardianRequestSchema,
    StudentListResponseSchema,
    StudentStatsResponseSchema,
    StudentProfileResponseSchema,
    CreateStudentResponseSchema,
    EnrollResponseSchema,
)
from app.schemas.base import ErrorSchema, MessageSchema

students_bp = Blueprint("students", __name__, description="Student management")


@students_bp.route("", methods=["GET"])
@jwt_required()
@tenant_required
def list_students():
    """
    List all students for the academy with computed status fields.
    Query params: page, per_page, q (case-insensitive name/phone search)
    """
    from flask import g

    page = request.args.get("page", 1, type=int)
    q = request.args.get("q", None, type=str)
    from flask import current_app

    per_page = min(
        request.args.get("per_page", 50, type=int),
        current_app.config.get("MAX_PAGE_SIZE", 100),
    )

    result = student_service.list_students(g.current_academy_id, page, per_page, q=q)
    return jsonify(result), 200


@students_bp.route("/stats", methods=["GET"])
@jwt_required()
@tenant_required
def get_stats():
    """Get aggregate student statistics for the stats rail."""
    from flask import g

    stats = student_service.get_student_stats(g.current_academy_id)
    return jsonify(stats), 200


@students_bp.route("/<student_id>", methods=["GET"])
@jwt_required()
@tenant_required
def get_student(student_id):
    """Get a single student with all related data (profile drawer)."""
    from flask import g

    result = student_service.get_student(student_id, g.current_academy_id)
    if not result:
        return jsonify({"error": "Student not found"}), 404
    return jsonify(result), 200


@students_bp.route("", methods=["POST"])
@jwt_required()
@tenant_required
def create_student():
    """
    Create a new student with a default guardian (no billing record).
    Body: { first_name, last_name, phone?, parent_phone?, notes?, class_ids?: [string] }
    """
    from flask import g
    import logging

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    if not data.get("first_name") or not data.get("last_name"):
        return jsonify({"error": "first_name and last_name are required"}), 400

    try:
        student = student_service.create_student(
            academy_id=g.current_academy_id,
            data=data,
            created_by=g.current_user.id,
        )

        # Enroll student in classes if class_ids was provided
        class_ids = data.get("class_ids", [])
        for class_id in class_ids:
            student_service.enroll_student(
                student_id=student.id,
                class_id=class_id,
                academy_id=g.current_academy_id,
                enrolled_by=g.current_user.id,
            )

        db.session.commit()
        return (
            jsonify(
                {
                    "id": student.id,
                    "first_name": student.first_name,
                    "last_name": student.last_name,
                    "full_name": student.full_name,
                }
            ),
            201,
        )
    except ValueError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logging.exception("Error creating student")
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500


@students_bp.route("/<student_id>", methods=["PUT"])
@jwt_required()
@tenant_required
def update_student(student_id):
    """Update student profile fields."""
    from flask import g

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    student = student_service.update_student(student_id, g.current_academy_id, data)
    if not student:
        return jsonify({"error": "Student not found"}), 404

    db.session.commit()
    return (
        jsonify(
            {
                "id": student.id,
                "first_name": student.first_name,
                "last_name": student.last_name,
            }
        ),
        200,
    )


@students_bp.route("/<student_id>", methods=["DELETE"])
@jwt_required()
@tenant_required
def delete_student(student_id):
    """Delete student and cascade withdraw enrollments."""
    from flask import g

    success = student_service.delete_student(
        student_id, g.current_academy_id, g.current_user.id
    )
    if not success:
        return jsonify({"error": "Student not found"}), 404

    db.session.commit()
    return jsonify({"message": "Student deleted"}), 200


@students_bp.route("/<student_id>/enroll", methods=["POST"])
@jwt_required()
@tenant_required
def enroll_student(student_id):
    """
    Enroll a student in a class.
    Body: { class_id }
    """
    from flask import g

    data = request.get_json()
    if not data or not data.get("class_id"):
        return jsonify({"error": "class_id is required"}), 400

    enrollment = student_service.enroll_student(
        student_id, data["class_id"], g.current_academy_id, g.current_user.id
    )
    db.session.commit()

    return (
        jsonify(
            {
                "id": enrollment.id,
                "student_id": enrollment.student_id,
                "class_id": enrollment.class_id,
                "status": enrollment.status,
            }
        ),
        201,
    )


@students_bp.route("/bulk-enroll", methods=["POST"])
@jwt_required()
@tenant_required
def bulk_enroll_students():
    """
    Enroll multiple students in a class at once.
    Body: { student_ids: [...], class_id: "..." }
    """
    from flask import g
    data = request.get_json()
    if not data or not data.get("student_ids") or not data.get("class_id"):
        return jsonify({"error": "student_ids and class_id are required"}), 400

    student_ids = data["student_ids"]
    class_id = data["class_id"]
    enrolled = []
    skipped = []

    for sid in student_ids:
        try:
            enrollment = student_service.enroll_student(
                sid, class_id, g.current_academy_id, g.current_user.id
            )
            enrolled.append({
                "student_id": sid,
                "enrollment_id": enrollment.id,
                "status": enrollment.status,
            })
        except Exception as e:
            skipped.append({"student_id": sid, "error": str(e)})

    db.session.commit()

    return jsonify({
        "enrolled": enrolled,
        "skipped": skipped,
        "total_enrolled": len(enrolled),
        "total_skipped": len(skipped),
    }), 200


@students_bp.route("/<student_id>/guardians", methods=["GET"])
@jwt_required()
@tenant_required
def list_guardians(student_id):
    """List guardians for a student."""
    from flask import g
    from app.models.student import Student, Guardian

    student = Student.query.filter_by(
        id=student_id, academy_id=g.current_academy_id
    ).first()
    if not student:
        return jsonify({"error": "Student not found"}), 404

    guardians = Guardian.query.filter_by(student_id=student_id).all()
    return (
        jsonify(
            {
                "guardians": [
                    {
                        "id": guard.id,
                        "name": guard.name,
                        "relationship": guard.relationship_type,
                        "phone": guard.phone,
                        "is_emergency": guard.is_emergency,
                    }
                    for guard in guardians
                ]
            }
        ),
        200,
    )


@students_bp.route("/<student_id>/guardians", methods=["POST"])
@jwt_required()
@tenant_required
def add_guardian(student_id):
    """
    Add a guardian to a student.
    Body: { name, relationship, phone, is_emergency? }
    """
    from flask import g
    import uuid
    from app.models.student import Student, Guardian

    student = Student.query.filter_by(
        id=student_id, academy_id=g.current_academy_id
    ).first()
    if not student:
        return jsonify({"error": "Student not found"}), 404

    data = request.get_json()
    if not data or not data.get("name") or not data.get("phone"):
        return jsonify({"error": "name and phone are required"}), 400

    guardian = Guardian(
        id=str(uuid.uuid4()),
        student_id=student_id,
        name=data["name"],
        relationship_type=data.get("relationship"),
        phone=data["phone"],
        is_emergency=data.get("is_emergency", False),
    )
    db.session.add(guardian)
    db.session.commit()

    return (
        jsonify(
            {
                "id": guardian.id,
                "name": guardian.name,
                "relationship": guardian.relationship_type,
                "phone": guardian.phone,
            }
        ),
        201,
    )
