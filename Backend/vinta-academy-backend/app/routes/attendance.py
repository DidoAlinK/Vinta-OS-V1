"""
Vinta School OS — Attendance Blueprint
/api/attendance — Check-in/out, PIN attribution
"""
from flask_smorest import Blueprint
from flask import request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.decorators import tenant_required, verify_staff_pin, owner_only
from app.services import attendance_service
from app.schemas.attendance import (
    CheckInRequestSchema, CheckOutRequestSchema, AutoCheckoutRequestSchema,
    AddToSessionRequestSchema, CheckInResponseSchema, CheckOutResponseSchema,
    AutoCheckoutResponseSchema, RosterResponseSchema, AddToSessionResponseSchema,
)
from app.schemas.base import ErrorSchema, MessageSchema

attendance_bp = Blueprint("attendance", __name__, description="Student attendance check-in/out")


@attendance_bp.route("/check-in", methods=["POST"])
@jwt_required()
@tenant_required
@verify_staff_pin
def check_in():
    """
    Mark a student as checked in to a session.
    Body: { session_id, student_id, status: PRESENT|ABSENT, is_group_swap?: bool, pin }
    PIN is verified by @verify_staff_pin decorator — action is attributed to the PIN holder.
    """
    from flask import g
    data = request.get_json()

    status = data.get("status", "PRESENT").upper()
    is_group_swap = data.get("is_group_swap", False)

    # check_in_student owns the attendance row (status/is_group_swap params);
    # billing side effects are applied exactly once via the explicit call
    # below (apply_billing=False prevents a double credit decrement).
    record = attendance_service.check_in_student(
        session_id=data["session_id"],
        student_id=data["student_id"],
        academy_id=g.current_academy_id,
        checked_in_by=g.current_user.id,
        status=status,
        is_group_swap=is_group_swap,
        apply_billing=False,
    )

    from app.services.billing_service import record_checkin_billing_side_effects
    billing_result = record_checkin_billing_side_effects(
        session_id=data["session_id"],
        student_id=data["student_id"],
        status=status,
        is_group_swap=is_group_swap,
        checked_in_by=g.current_user.id,
        academy_id=g.current_academy_id,
    )

    db.session.commit()

    return jsonify({
        "id": record.id,
        "student_id": record.student_id,
        "status": record.status,
        "is_present": record.is_present,
        "is_group_swap": record.is_group_swap,
        "checked_in_at": record.checked_in_at.isoformat() if record.checked_in_at else None,
        "checked_in_by": record.checked_in_by,
        "billing": billing_result,
    }), 200


@attendance_bp.route("/check-out", methods=["POST"])
@jwt_required()
@tenant_required
@verify_staff_pin
def check_out():
    """
    Check out a student from a session.
    Body: { session_id, student_id, pin }
    """
    from flask import g
    data = request.get_json()
    if not data or not data.get("session_id") or not data.get("student_id"):
        return jsonify({"error": "session_id and student_id are required"}), 400

    record = attendance_service.check_out_student(
        data["session_id"], data["student_id"], g.current_academy_id
    )
    if not record:
        return jsonify({"error": "Student not checked in or not found"}), 404

    db.session.commit()
    return jsonify({
        "id": record.id,
        "student_id": record.student_id,
        "checked_out_at": record.checked_out_at.isoformat() if record.checked_out_at else None,
    }), 200


@attendance_bp.route("/guest-checkin", methods=["POST"])
@jwt_required()
@tenant_required
@verify_staff_pin
def guest_check_in():
    """
    Guest/group-swap check-in: a student checks in to a session in a different group
    (using their CREDIT_BASED subscription that is level-based).
    Body: { session_id, student_id, pin }
    """
    from flask import g
    data = request.get_json()

    # Billing side effects are applied exactly once via the explicit call
    # below (apply_billing=False prevents a double credit decrement).
    record = attendance_service.check_in_student(
        session_id=data["session_id"],
        student_id=data["student_id"],
        academy_id=g.current_academy_id,
        checked_in_by=g.current_user.id,
        status="PRESENT",
        is_group_swap=True,
        apply_billing=False,
    )

    from app.services.billing_service import record_checkin_billing_side_effects
    billing_result = record_checkin_billing_side_effects(
        session_id=data["session_id"],
        student_id=data["student_id"],
        status="PRESENT",
        is_group_swap=True,
        checked_in_by=g.current_user.id,
        academy_id=g.current_academy_id,
    )

    db.session.commit()

    return jsonify({
        "id": record.id,
        "student_id": record.student_id,
        "status": record.status,
        "is_group_swap": True,
        "checked_in_at": record.checked_in_at.isoformat() if record.checked_in_at else None,
        "billing": billing_result,
    }), 200


@attendance_bp.route("/auto-checkout", methods=["POST"])
@jwt_required()
@tenant_required
@owner_only
def auto_checkout():
    """
    Trigger auto check-out for all present students in a session.
    Body: { session_id }
    Called by cron job at scheduled class end time.
    """
    from flask import g
    data = request.get_json()
    if not data or not data.get("session_id"):
        return jsonify({"error": "session_id is required"}), 400

    count = attendance_service.auto_checkout_session(
        data["session_id"], g.current_academy_id
    )
    db.session.commit()

    return jsonify({
        "session_id": data["session_id"],
        "checked_out_count": count,
    }), 200


@attendance_bp.route("/roster/<session_id>", methods=["GET"])
@jwt_required()
@tenant_required
def get_roster(session_id):
    """
    Get the full roster for a session with attendance status.
    Each entry includes subscription status (remaining_credits / access_end)
    and RENEW_REQUIRED / ATTENDANCE_WARNING badges.
    """
    from flask import g
    from app.models.scheduling import Session

    session = db.session.get(Session, session_id)
    if not session or session.academy_id != g.current_academy_id:
        return jsonify({"error": "Session not found"}), 404

    roster = attendance_service.get_session_roster_with_badges(session_id)
    return jsonify({"roster": roster}), 200


@attendance_bp.route("/add-to-session", methods=["POST"])
@jwt_required()
@tenant_required
def add_to_session():
    """
    Add a student to a session roster.
    Body: { session_id, student_id }
    Returns 201 for new, 200 for existing (idempotent).
    """
    from flask import g
    data = request.get_json()
    if not data or not data.get("session_id") or not data.get("student_id"):
        return jsonify({"error": "session_id and student_id are required"}), 400

    record, is_new = attendance_service.add_student_to_session(
        data["session_id"], data["student_id"],
        g.current_academy_id, g.current_user.id,
    )
    db.session.commit()

    return jsonify({
        "id": record.id,
        "student_id": record.student_id,
        "is_present": record.is_present,
    }), 201 if is_new else 200


@attendance_bp.route("/sessions/<session_id>/complete", methods=["POST"])
@jwt_required()
@tenant_required
@verify_staff_pin
def complete_session(session_id):
    """
    Complete a session — alias of the billing finalize flow.
    Body: { conducted: bool, pin } (PIN verified by decorator).
    Delegates to billing_service.finalize_session.
    """
    from flask import g
    from app.services import billing_service

    data = request.get_json() or {}
    if "conducted" not in data:
        return jsonify({"error": "conducted is required"}), 400

    result = billing_service.finalize_session(
        session_id=session_id,
        conducted=bool(data["conducted"]),
        academy_id=g.current_academy_id,
        staff_id=g.current_user.id,
    )
    if not result or "error" in result:
        return jsonify(result or {"error": "Session not found"}), 404

    db.session.commit()
    return jsonify(result), 200
