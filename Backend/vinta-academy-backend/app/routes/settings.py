"""
Vinta School OS — Settings Blueprint
/api/settings — Academy Config, Staff Management, Automations, Profile
"""
import uuid
from datetime import datetime, timedelta, timezone
from flask_smorest import Blueprint
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.utils.decorators import tenant_required, owner_only
from app.utils.audit import log_activity
from app.models.user import User
from app.models.academy import Academy, AcademySettings, Subscription
from app.services import tenant_service, auth_service, export_service
from app.schemas.settings import (
    UpdateAcademyRequestSchema, UpdateAppearanceRequestSchema,
    UpdateBillingConfigRequestSchema, UpdateAutomationsRequestSchema,
    AddStaffRequestSchema, UpdateStaffRequestSchema, UpdateProfileRequestSchema,
    AcademyResponseSchema, AppearanceResponseSchema, BillingConfigResponseSchema,
    AutomationsResponseSchema, StaffListResponseSchema, AddStaffResponseSchema,
    ProfileResponseSchema, SubscriptionResponseSchema,
)
from app.schemas.base import ErrorSchema, MessageSchema

settings_bp = Blueprint("settings", __name__, description="Academy settings, staff & subscriptions")

# How long the activity log keeps anything. Two weeks — long enough to
# answer "what happened to last week's classes" and to reconstruct a
# disputed register, short enough that the log stays a window on the recent
# past rather than an archive nobody reads. Applies to the academy-wide
# feed and a group's own log alike: they read the same table, so they
# expire on the same clock.
ACTIVITY_LOG_RETENTION_DAYS = 14

# Most rows the group-filtered read will look at before narrowing. The
# retention window means this is never reached in practice; it is here so a
# busy academy's read stays bounded rather than loading the whole table to
# return twenty rows.
RETENTION_READ_CAP = 2000


@settings_bp.route("/academy", methods=["GET"])
@jwt_required()
@tenant_required
def get_academy():
    """Get academy profile details."""
    from flask import g
    academy = g.current_academy
    return jsonify({
        "id": academy.id,
        "name": academy.name,
        "phone": academy.phone,
        "email": academy.email,
        "address": academy.address,
        "weekend_day": academy.weekend_day,
        "current_term": academy.current_term,
    }), 200


@settings_bp.route("/academy", methods=["PUT"])
@jwt_required()
@tenant_required
@owner_only
def update_academy():
    """
    Update academy profile (owner-only).
    Body: { name?, phone?, email?, address?, weekend_day?, current_term? }
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    academy = g.current_academy

    # Handle academy deletion via confirm_delete flag
    if data.get("confirm_delete"):
        from app.models.student import Student, Guardian, Enrollment
        from app.models.teacher import Teacher, TeacherPayroll, TeacherHoursLog
        from app.models.class_room import Class, Classroom, Subject
        from app.models.scheduling import Schedule, Session
        from app.models.billing import PaymentPlan, StudentBilling, PaymentLog
        from app.models.audit import ActivityLog
        from app.models.notification import Notification
        from app.models.attendance import SessionStudent
        from app.models.user import User

        academy_id = g.current_academy_id

        # Collect IDs for cascade deletion (some tables lack academy_id)
        student_ids = [s.id for s in Student.query.filter_by(academy_id=academy_id).all()]
        teacher_ids = [t.id for t in Teacher.query.filter_by(academy_id=academy_id).all()]
        class_ids = [c.id for c in Class.query.filter_by(academy_id=academy_id).all()]

        # Step 1: Delete leaf records (no academy_id — use FK cascade)
        from app.models.billing import StudentSubscription, PayoutRecord, RevenueEntry
        from app.models.teacher import TeacherSubject

        # Clean up junction table records first (bulk .delete() bypasses ORM cascades)
        TeacherSubject.query.filter(
            TeacherSubject.teacher_id.in_(teacher_ids)
        ).delete(synchronize_session=False) if teacher_ids else None

        if student_ids:
            # Collect billing IDs before deleting billings
            billing_ids = [b.id for b in StudentBilling.query.filter(StudentBilling.student_id.in_(student_ids)).all()]
            SessionStudent.query.filter(SessionStudent.student_id.in_(student_ids)).delete(synchronize_session=False)
            if billing_ids:
                PaymentLog.query.filter(PaymentLog.student_billing_id.in_(billing_ids)).delete(synchronize_session=False)
            StudentBilling.query.filter(StudentBilling.student_id.in_(student_ids)).delete(synchronize_session=False)
            Enrollment.query.filter(Enrollment.student_id.in_(student_ids)).delete(synchronize_session=False)
            Guardian.query.filter(Guardian.student_id.in_(student_ids)).delete(synchronize_session=False)
        if teacher_ids:
            TeacherHoursLog.query.filter(TeacherHoursLog.teacher_id.in_(teacher_ids)).delete(synchronize_session=False)
            TeacherPayroll.query.filter(TeacherPayroll.teacher_id.in_(teacher_ids)).delete(synchronize_session=False)

        # Step 2: Delete records with academy_id
        Session.query.filter_by(academy_id=academy_id).delete()
        Schedule.query.filter(Schedule.class_id.in_(class_ids)).delete(synchronize_session=False) if class_ids else None
        PaymentPlan.query.filter_by(academy_id=academy_id).delete()
        Class.query.filter_by(academy_id=academy_id).delete()
        Subject.query.filter_by(academy_id=academy_id).delete()
        Classroom.query.filter_by(academy_id=academy_id).delete()
        Teacher.query.filter_by(academy_id=academy_id).delete()
        Student.query.filter_by(academy_id=academy_id).delete()
        ActivityLog.query.filter_by(academy_id=academy_id).delete()
        Notification.query.filter_by(academy_id=academy_id).delete()
        StudentSubscription.query.filter_by(academy_id=academy_id).delete()
        PayoutRecord.query.filter_by(academy_id=academy_id).delete()
        RevenueEntry.query.filter_by(academy_id=academy_id).delete()

        # Delete academy settings and subscription
        AcademySettings.query.filter_by(academy_id=academy_id).delete()
        Subscription.query.filter_by(academy_id=academy_id).delete()

        # Delete staff users
        User.query.filter_by(academy_id=academy_id).delete()

        # Delete the academy itself
        db.session.delete(academy)
        db.session.commit()
        return jsonify({"message": "Academy deleted"}), 200

    for field in ("name", "phone", "email", "address", "weekend_day", "current_term"):
        if field in data:
            setattr(academy, field, data[field])

    db.session.commit()
    return jsonify({"message": "Academy updated"}), 200


@settings_bp.route("/appearance", methods=["GET"])
@jwt_required()
@tenant_required
def get_appearance():
    """Get appearance settings."""
    from flask import g
    settings = AcademySettings.query.filter_by(academy_id=g.current_academy_id).first()
    if not settings:
        return jsonify({"error": "Settings not found"}), 404

    return jsonify({
        "theme": settings.default_theme,
        "font_size": settings.default_font_size,
        "language": settings.default_language,
    }), 200


@settings_bp.route("/appearance", methods=["PUT"])
@jwt_required()
@tenant_required
def update_appearance():
    """
    Update appearance settings.
    Body: { theme?, font_size?, language? }
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    settings = AcademySettings.query.filter_by(academy_id=g.current_academy_id).first()
    if not settings:
        return jsonify({"error": "Settings not found"}), 404

    if "theme" in data:
        settings.default_theme = data["theme"]
    if "font_size" in data:
        settings.default_font_size = data["font_size"]
    if "language" in data:
        settings.default_language = data["language"]

    db.session.commit()
    return jsonify({"message": "Appearance updated"}), 200


# ── Billing Rules toggles ───────────────────────────────────────────
# The six per-academy edge-case switches on AcademySettings. They are plain
# booleans, but they arrive over JSON where clients send "false" (string) or
# 0/1 rather than a real boolean. The column type will not rescue that: a bare
# setattr of "false" reaches the Boolean bind processor and raises at flush
# (an unhandled 500), and a junk value would be stored as-is on a laxer
# backend. So they are coerced explicitly on write instead.
BILLING_BOOL_FIELDS = (
    "absence_consumes_credit",
    "count_gap_sessions",
    "restore_credits_on_cancellation",
    "free_session_auto_present",
    "share_credits_across_groups",
    "early_payment_on_extra_sessions",
)


def _coerce_bool(value):
    """
    Return the boolean a JSON client meant, or None if the value is not
    unambiguously boolean-ish (the caller turns None into a 400).

    Accepted: real booleans; "true"/"false" (any case); "1"/"0"; 1/0.
    Everything else — "yes", 2, null, lists — is rejected rather than stored.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1"):
            return True
        if lowered in ("false", "0"):
            return False
        return None
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    return None


@settings_bp.route("/billing-config", methods=["GET"])
@jwt_required()
@tenant_required
@owner_only
def get_billing_config():
    """Get billing configuration (owner-only)."""
    from flask import g
    settings = AcademySettings.query.filter_by(academy_id=g.current_academy_id).first()
    if not settings:
        return jsonify({"error": "Settings not found"}), 404

    return jsonify({
        "currency": settings.currency,
        "default_plan_duration": settings.default_plan_duration,
        "billing_reminder_days_before": settings.billing_reminder_days_before,
        "due_date_reminder_timing": settings.due_date_reminder_timing,
        "whatsapp_template": settings.whatsapp_template,
        "default_credits_per_cycle": settings.default_credits_per_cycle,
        "allow_rollover_default": settings.allow_rollover_default,
        "allow_makeups_default": settings.allow_makeups_default,
        "default_access_weeks": settings.default_access_weeks,
        "default_max_groups": settings.default_max_groups,
        "absence_consumes_credit": settings.absence_consumes_credit,
        "count_gap_sessions": settings.count_gap_sessions,
        "restore_credits_on_cancellation": settings.restore_credits_on_cancellation,
        "free_session_auto_present": settings.free_session_auto_present,
        "share_credits_across_groups": settings.share_credits_across_groups,
        "early_payment_on_extra_sessions": settings.early_payment_on_extra_sessions,
    }), 200


@settings_bp.route("/billing-config", methods=["PUT"])
@jwt_required()
@tenant_required
@owner_only
def update_billing_config():
    """
    Update billing configuration (owner-only).
    Body: { currency?, default_plan_duration?, billing_reminder_days_before?,
            due_date_reminder_timing?, whatsapp_template?,
            default_credits_per_cycle?, allow_rollover_default?,
            allow_makeups_default?, default_access_weeks?, default_max_groups?,
            absence_consumes_credit?, count_gap_sessions?,
            restore_credits_on_cancellation?, free_session_auto_present?,
            share_credits_across_groups?, early_payment_on_extra_sessions? }
    Currency is locked to DZD on write: any other value is ignored with a warning.
    The six Billing Rules toggles are coerced to real booleans ("false" and 0
    both mean False); a value that is not boolean-ish is rejected with a 400
    naming the field. Unknown fields are ignored.
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400
    settings = AcademySettings.query.filter_by(academy_id=g.current_academy_id).first()
    if not settings:
        return jsonify({"error": "Settings not found"}), 404

    warning = None
    if "currency" in data and data["currency"] != "DZD":
        warning = "currency is locked to DZD and was not changed"

    # Billing Rules toggles: coerce before writing, so a client that sends
    # "false" cannot store a truthy value and junk cannot reach the column.
    for field in BILLING_BOOL_FIELDS:
        if field in data:
            coerced = _coerce_bool(data[field])
            if coerced is None:
                return jsonify({"error": f"{field} must be a boolean"}), 400
            setattr(settings, field, coerced)

    for field in ("default_plan_duration", "billing_reminder_days_before",
                  "due_date_reminder_timing", "whatsapp_template",
                  "default_credits_per_cycle", "allow_rollover_default",
                  "allow_makeups_default", "default_access_weeks",
                  "default_max_groups"):
        if field in data:
            setattr(settings, field, data[field])

    db.session.commit()
    payload = {"message": "Billing config updated"}
    if warning:
        payload["warning"] = warning
    return jsonify(payload), 200


@settings_bp.route("/automations", methods=["GET"])
@jwt_required()
@tenant_required
@owner_only
def get_automations():
    """Get automation settings (owner-only, gated by Scaler tier)."""
    from flask import g
    settings = AcademySettings.query.filter_by(academy_id=g.current_academy_id).first()
    subscription = Subscription.query.filter_by(academy_id=g.current_academy_id).first()

    return jsonify({
        "auto_checkout_enabled": settings.auto_checkout_enabled if settings else True,
        "end_class_popup_enabled": settings.end_class_popup_enabled if settings else True,
        "tier": subscription.tier if subscription else "starter",
    }), 200


@settings_bp.route("/automations", methods=["PUT"])
@jwt_required()
@tenant_required
@owner_only
def update_automations():
    """
    Update automation settings (owner-only).
    Body: { auto_checkout_enabled?, end_class_popup_enabled? }
    Gated by Scaler subscription tier.
    """
    from flask import g
    data = request.get_json()

    subscription = Subscription.query.filter_by(academy_id=g.current_academy_id).first()
    if subscription and subscription.tier not in ("pro", "scaler"):
        return jsonify({"error": "Automations require Pro or Scaler tier"}), 403

    settings = AcademySettings.query.filter_by(academy_id=g.current_academy_id).first()
    if not settings:
        return jsonify({"error": "Settings not found"}), 404

    if "auto_checkout_enabled" in data:
        settings.auto_checkout_enabled = data["auto_checkout_enabled"]
    if "end_class_popup_enabled" in data:
        settings.end_class_popup_enabled = data["end_class_popup_enabled"]

    db.session.commit()
    return jsonify({"message": "Automations updated"}), 200


# ── Staff Management ────────────────────────────────────────────────

@settings_bp.route("/staff", methods=["GET"])
@jwt_required()
@tenant_required
@owner_only
def list_staff():
    """List all staff profiles for the academy (owner-only)."""
    from flask import g
    profiles = tenant_service.get_academy_profiles(g.current_academy_id)
    return jsonify({
        "staff": [
            {
                "id": p.id,
                "name": p.name,
                "role": p.role,
                "phone": p.phone,
                "is_active": p.is_active,
            }
            for p in profiles
        ]
    }), 200


@settings_bp.route("/staff", methods=["POST"])
@jwt_required()
@tenant_required
@owner_only
def add_staff():
    """
    Add a new staff profile (owner-only, requires owner PIN).
    Body: { name, pin, phone? }
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    # Verify owner PIN.
    # 403, not 401 — see the note in auth.py:create_profile. The caller holds a
    # valid session; only this step-up check failed, and answering 401 would make
    # the frontend treat it as an expired session and log them out mid-form.
    owner_pin = data.get("owner_pin")
    if not owner_pin or not g.current_user.verify_pin(owner_pin):
        return jsonify({"error": "Owner PIN verification required"}), 403

    required = ("name", "pin")
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    user = tenant_service.create_staff_profile(
        academy_id=g.current_academy_id,
        name=data["name"],
        pin=data["pin"],
        phone=data.get("phone"),
        role="staff",  # Always staff — owner creation is a separate flow
    )

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="staff",
        entity_id=user.id,
        action="created",
        description=f"Staff {user.name} ({user.role}) added",
    )

    db.session.commit()

    return jsonify({
        "id": user.id,
        "name": user.name,
        "role": user.role,
    }), 201


@settings_bp.route("/staff/<user_id>", methods=["PUT"])
@jwt_required()
@tenant_required
@owner_only
def update_staff(user_id):
    """Update a staff profile."""
    user = db.session.get(User, user_id)
    if not user or user.academy_id != g.current_academy_id:
        return jsonify({"error": "Staff not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    for field in ("name", "phone"):
        if field in data:
            setattr(user, field, data[field])
    # Role cannot be changed via update — use create-profile for new roles

    db.session.commit()
    return jsonify({"message": "Staff updated"}), 200


@settings_bp.route("/staff/<user_id>/deactivate", methods=["POST"])
@jwt_required()
@tenant_required
@owner_only
def deactivate_staff(user_id):
    """Deactivate a staff profile (soft-delete)."""
    from flask import g
    user = db.session.get(User, user_id)
    if not user or user.academy_id != g.current_academy_id:
        return jsonify({"error": "Staff not found"}), 404

    if user.role == "owner":
        return jsonify({"error": "Cannot deactivate an owner account"}), 400

    if user_id == g.current_user.id:
        return jsonify({"error": "Cannot deactivate your own account"}), 400

    user.is_active = False
    db.session.commit()
    return jsonify({"message": "Staff deactivated"}), 200


@settings_bp.route("/staff/<user_id>/reactivate", methods=["POST"])
@jwt_required()
@tenant_required
@owner_only
def reactivate_staff(user_id):
    """Reactivate a previously deactivated staff profile."""
    from flask import g
    user = db.session.get(User, user_id)
    if not user or user.academy_id != g.current_academy_id:
        return jsonify({"error": "Staff not found"}), 404

    if user.is_active:
        return jsonify({"message": "Staff is already active"}), 200

    user.is_active = True
    db.session.commit()
    return jsonify({"message": "Staff reactivated"}), 200


@settings_bp.route("/staff/<user_id>", methods=["DELETE"])
@jwt_required()
@tenant_required
@owner_only
def delete_staff(user_id):
    """Permanently delete a staff profile (owner-only)."""
    from flask import g
    user = db.session.get(User, user_id)
    if not user or user.academy_id != g.current_academy_id:
        return jsonify({"error": "Staff not found"}), 404

    if user.role == "owner":
        return jsonify({"error": "Cannot delete an owner account"}), 400

    if user_id == g.current_user.id:
        return jsonify({"error": "Cannot delete your own account"}), 400

    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "Staff deleted"}), 200


# ── Profile ─────────────────────────────────────────────────────────

@settings_bp.route("/profile", methods=["GET"])
@jwt_required()
@tenant_required
def get_profile():
    """Get current user's profile."""
    from flask import g
    user = g.current_user
    return jsonify({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "picture": user.picture,
    }), 200


@settings_bp.route("/profile", methods=["PUT"])
@jwt_required()
@tenant_required
def update_profile():
    """
    Update current user's profile.
    Body: { name?, phone?, email? }
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    user = g.current_user

    for field in ("name", "phone", "email"):
        if field in data:
            setattr(user, field, data[field])

    db.session.commit()
    return jsonify({"message": "Profile updated"}), 200


# ── Reset Data ──────────────────────────────────────────────────────

@settings_bp.route("/reset-data", methods=["POST"])
@jwt_required()
@tenant_required
@owner_only
def reset_academy_data():
    """
    Reset all academy data (students, teachers, classes, billing, sessions).
    Keeps the academy itself and staff accounts.
    """
    from flask import g
    from app.models.student import Student
    from app.models.teacher import Teacher
    from app.models.class_room import Class, Classroom, Subject
    from app.models.scheduling import Schedule, Session
    from app.models.billing import PaymentPlan, StudentBilling
    from app.models.audit import ActivityLog
    from app.models.notification import Notification

    academy_id = g.current_academy_id

    # Collect IDs for cascade deletion (some tables lack academy_id)
    student_ids = [s.id for s in Student.query.filter_by(academy_id=academy_id).all()]
    teacher_ids = [t.id for t in Teacher.query.filter_by(academy_id=academy_id).all()]
    class_ids = [c.id for c in Class.query.filter_by(academy_id=academy_id).all()]

    # Step 1: Delete leaf records (no academy_id — use FK cascade)
    from app.models.billing import PaymentLog, StudentSubscription, PayoutRecord, RevenueEntry
    from app.models.attendance import SessionStudent
    from app.models.teacher import TeacherHoursLog, TeacherPayroll, TeacherSubject
    from app.models.scheduling import Schedule
    from app.models.student import Enrollment, Guardian

    # Clean up junction table records first (bulk .delete() bypasses ORM cascades)
    TeacherSubject.query.filter(
        TeacherSubject.teacher_id.in_(teacher_ids)
    ).delete(synchronize_session=False) if teacher_ids else None

    if student_ids:
        billing_ids = [b.id for b in StudentBilling.query.filter(StudentBilling.student_id.in_(student_ids)).all()]
        SessionStudent.query.filter(SessionStudent.student_id.in_(student_ids)).delete(synchronize_session=False)
        if billing_ids:
            PaymentLog.query.filter(PaymentLog.student_billing_id.in_(billing_ids)).delete(synchronize_session=False)
        StudentBilling.query.filter(StudentBilling.student_id.in_(student_ids)).delete(synchronize_session=False)
        Enrollment.query.filter(Enrollment.student_id.in_(student_ids)).delete(synchronize_session=False)
        Guardian.query.filter(Guardian.student_id.in_(student_ids)).delete(synchronize_session=False)
    if teacher_ids:
        TeacherHoursLog.query.filter(TeacherHoursLog.teacher_id.in_(teacher_ids)).delete(synchronize_session=False)
        TeacherPayroll.query.filter(TeacherPayroll.teacher_id.in_(teacher_ids)).delete(synchronize_session=False)

    # Step 2: Delete records with academy_id
    Session.query.filter_by(academy_id=academy_id).delete()
    Schedule.query.filter(Schedule.class_id.in_(class_ids)).delete(synchronize_session=False) if class_ids else None
    Class.query.filter_by(academy_id=academy_id).delete()
    Subject.query.filter_by(academy_id=academy_id).delete()
    Classroom.query.filter_by(academy_id=academy_id).delete()
    Teacher.query.filter_by(academy_id=academy_id).delete()
    Student.query.filter_by(academy_id=academy_id).delete()
    PaymentPlan.query.filter_by(academy_id=academy_id).delete()
    ActivityLog.query.filter_by(academy_id=academy_id).delete()
    Notification.query.filter_by(academy_id=academy_id).delete()
    StudentSubscription.query.filter_by(academy_id=academy_id).delete()
    PayoutRecord.query.filter_by(academy_id=academy_id).delete()
    RevenueEntry.query.filter_by(academy_id=academy_id).delete()

    log_activity(
        academy_id=academy_id,
        user_id=g.current_user.id,
        entity_type="academy",
        entity_id=academy_id,
        action="reset",
        description="Academy data reset by owner",
    )

    db.session.commit()
    return jsonify({"message": "Academy data has been reset"}), 200


# ── Subscription ────────────────────────────────────────────────────

@settings_bp.route("/subscription", methods=["GET"])
@jwt_required()
@tenant_required
@owner_only
def get_subscription():
    """Get academy subscription details (owner-only)."""
    from flask import g
    sub = Subscription.query.filter_by(academy_id=g.current_academy_id).first()
    if not sub:
        return jsonify({"error": "Subscription not found"}), 404

    return jsonify({
        "tier": sub.tier,
        "status": sub.status,
        "invoicing_method": sub.invoicing_method,
        "started_at": sub.started_at.isoformat() if sub.started_at else None,
        "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
    }), 200


# ── Data Export ────────────────────────────────────────────────────

@settings_bp.route("/export/<dataset>", methods=["GET"])
@jwt_required()
@tenant_required
def export_data(dataset):
    """
    Export academy data as CSV.
    Supported datasets: students, teachers, classes, billing, activity-log
    """
    from flask import g, Response

    try:
        if dataset == "students":
            csv_data = export_service.export_student_roster(g.current_academy_id)
            filename = "students.csv"
        elif dataset == "teachers":
            csv_data = export_service.export_teacher_hours(g.current_academy_id)
            filename = "teachers.csv"
        elif dataset == "classes":
            from app.models.class_room import Class
            from app.models.scheduling import Schedule
            classes = Class.query.filter_by(academy_id=g.current_academy_id).all()
            import io, csv
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["Name", "Subject", "Teacher", "Schedule"])
            for cls in classes:
                teacher_name = f"{cls.teacher.first_name} {cls.teacher.last_name}" if cls.teacher else ""
                schedules = Schedule.query.filter_by(class_id=cls.id).all()
                schedule_str = ", ".join(f"{s.day_of_week}:{s.start_time}-{s.end_time}" for s in schedules)
                writer.writerow([cls.name, cls.subject or "", teacher_name, schedule_str])
            csv_data = output.getvalue()
            filename = "classes.csv"
        elif dataset == "billing":
            csv_data = export_service.export_billing_history(g.current_academy_id)
            filename = "billing.csv"
        elif dataset == "activity-log":
            from app.models.audit import ActivityLog
            from app.models.user import User
            logs = (
                ActivityLog.query
                .filter_by(academy_id=g.current_academy_id)
                .order_by(ActivityLog.created_at.desc())
                .limit(1000)
                .all()
            )
            import io, csv
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["Type", "Action", "Description", "User", "Date"])
            for log in logs:
                user = db.session.get(User, log.user_id)
                user_name = f"{user.name}" if user else ""
                writer.writerow([
                    log.entity_type,
                    log.action,
                    log.description or "",
                    user_name,
                    log.created_at.isoformat() if log.created_at else "",
                ])
            csv_data = output.getvalue()
            filename = "activity-log.csv"
        else:
            return jsonify({"error": f"Unknown dataset: {dataset}"}), 400

        log_activity(
            academy_id=g.current_academy_id,
            user_id=g.current_user.id,
            entity_type="export",
            entity_id=dataset,
            action="exported",
            description=f"Exported {dataset} data",
        )

        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={filename}"},
        )
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


# ── Activity Log (Dashboard) ──────────────────────────────────────

@settings_bp.route("/activity-log", methods=["GET"])
@jwt_required()
@tenant_required
def get_activity_log():
    """
    Get recent activity log entries.

    Query params:
      limit     default 20, capped at 200
      class_id  optional — only what happened to that group

    The same table answers two questions. The dashboard asks "what has been
    going on" and wants the academy's whole recent history; a group's own
    hamburger asks "what happened to THIS class", and used to be handed the
    academy-wide feed instead, which told the desk nothing it could not
    already see and buried the one line it wanted.

    An entry belongs to a group when it names the group itself, when it
    names one of the group's sessions, or when it carries the class_id in
    its metadata. All three are checked because the log has been written by
    three different code paths over time and history is not re-writable.

    Retention: entries older than ACTIVITY_LOG_RETENTION_DAYS are deleted
    here, before the read. Two weeks is the horizon the desk asked for, and
    pruning on read is what makes it self-maintaining — nobody has to
    remember a cleanup job, and no reader can ever see a row past it.
    """
    from flask import g
    from app.models.audit import ActivityLog as ActivityLogModel
    from app.models.scheduling import Session as SessionModel

    limit = request.args.get("limit", 20, type=int)
    limit = max(1, min(limit, 200))
    class_id = request.args.get("class_id")

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        days=ACTIVITY_LOG_RETENTION_DAYS
    )
    pruned = (
        ActivityLogModel.query
        .filter(
            ActivityLogModel.academy_id == g.current_academy_id,
            ActivityLogModel.created_at < cutoff,
        )
        .delete(synchronize_session=False)
    )
    if pruned:
        db.session.commit()

    # Filtering a group's history happens in Python rather than in SQL
    # because "belongs to this group" spans three columns, one of them
    # JSON. The retention window keeps the row count small enough that this
    # stays a cheap read rather than a scan of the academy's whole past.
    if class_id:
        session_ids = {
            sid for (sid,) in db.session.query(SessionModel.id)
            .filter(
                SessionModel.academy_id == g.current_academy_id,
                SessionModel.class_id == class_id,
            )
            .all()
        }
        candidates = (
            ActivityLogModel.query
            .filter_by(academy_id=g.current_academy_id)
            .order_by(ActivityLogModel.created_at.desc())
            .limit(RETENTION_READ_CAP)
            .all()
        )
        logs = [log for log in candidates if _log_belongs_to_class(log, class_id, session_ids)][:limit]
    else:
        logs = (
            ActivityLogModel.query
            .filter_by(academy_id=g.current_academy_id)
            .order_by(ActivityLogModel.created_at.desc())
            .limit(limit)
            .all()
        )

    # Map backend action types to frontend activity types
    ACTION_TYPE_MAP = {
        "payment_received": "payment",
        "payment_overdue": "payment",
        "checked_in": "checkin",
        "checked_out": "checkin",
        "enrolled": "student",
        "withdrawn": "student",
        "created": "student",
        "updated": "student",
        "extended": "checkin",
        "deleted": "alert",
    }

    activities = []
    for log in logs:
        user = db.session.get(User, log.user_id)
        user_name = user.name if user else "System"
        activity_type = ACTION_TYPE_MAP.get(log.action, "alert")

        # Build a human-readable title from the action
        title = log.description or f"{log.action.replace('_', ' ').title()} — {log.entity_type}"

        activities.append({
            "id": log.id,
            "type": activity_type,
            "title": title,
            "description": log.description or "",
            "timestamp": log.created_at.isoformat() + "Z" if log.created_at else "",
            "staff_name": user_name,
            # The frontend colours by these; a group's log can then show a
            # free session or a teacher absence without re-reading anything.
            "action": log.action,
            "cancelled_reason": (log.log_metadata or {}).get("cancelled_reason"),
        })

    return jsonify({
        "activities": activities,
        "class_id": class_id,
        "retention_days": ACTIVITY_LOG_RETENTION_DAYS,
    }), 200


def _log_belongs_to_class(log, class_id: str, session_ids: set) -> bool:
    """Is this entry part of that group's story?"""
    if (log.log_metadata or {}).get("class_id") == class_id:
        return True
    if log.entity_type == "class" and log.entity_id == class_id:
        return True
    if log.entity_type == "session" and log.entity_id in session_ids:
        return True
    return False
