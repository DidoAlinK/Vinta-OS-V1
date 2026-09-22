"""
Vinta School OS — Calendar Blueprint
/api/calendar, /api/sessions — Week/Month views, drag-to-move, edge-resize, create
"""
from datetime import date, timedelta
from flask_smorest import Blueprint
from flask import request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.decorators import tenant_required
from app.utils.audit import log_activity
from app.services import scheduling_service
from app.schemas.calendar import (
    CreateSessionRequestSchema, UpdateSessionRequestSchema,
    WeekSessionsResponseSchema, DaySessionsResponseSchema,
    CreateSessionResponseSchema, UpdateSessionResponseSchema,
)
from app.schemas.base import ErrorSchema, MessageSchema

calendar_bp = Blueprint("calendar", __name__, description="Calendar views & session management")


@calendar_bp.route("/calendar/week", methods=["GET"])
@jwt_required()
@tenant_required
def get_week():
    """
    Get all sessions for a given week.
    Query params: date (ISO date, defaults to today)
    """
    from flask import g
    date_str = request.args.get("date")
    if date_str:
        try:
            target = date.fromisoformat(date_str)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400
    else:
        target = date.today()

    # Find start of week (Sunday)
    start = target - timedelta(days=target.weekday() + 1)

    sessions = scheduling_service.get_week_sessions(g.current_academy_id, start)
    return jsonify({
        "week_start": start.isoformat(),
        "sessions": sessions,
    }), 200


@calendar_bp.route("/calendar/day", methods=["GET"])
@jwt_required()
@tenant_required
def get_day():
    """
    Get all sessions for a specific day.
    Query params: date (ISO date, defaults to today)
    """
    from flask import g
    date_str = request.args.get("date")
    if date_str:
        try:
            target = date.fromisoformat(date_str)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400
    else:
        target = date.today()

    sessions = scheduling_service.get_day_sessions(g.current_academy_id, target)
    return jsonify({
        "date": target.isoformat(),
        "sessions": sessions,
    }), 200


@calendar_bp.route("/sessions", methods=["POST"])
@jwt_required()
@tenant_required
def create_session():
    """
    Create a new session (drag-to-create or form).
    Body: { class_id, date, start_time, end_time, teacher_id?, classroom_id?, subject? }
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    required = ("class_id", "date", "start_time", "end_time")
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        session = scheduling_service.create_session(
            academy_id=g.current_academy_id,
            data=data,
            created_by=g.current_user.id,
        )

        db.session.commit()

        return jsonify({
            "id": session.id,
            "class_id": session.class_id,
            "date": session.date.isoformat(),
            "start_time": session.start_time.strftime("%H:%M"),
            "end_time": session.end_time.strftime("%H:%M"),
            "subject": session.subject,
            "status": session.status,
        }), 201
    except ValueError:
        return jsonify({"error": "Invalid session data"}), 400


@calendar_bp.route("/sessions/<session_id>", methods=["PATCH"])
@jwt_required()
@tenant_required
def update_session(session_id):
    """
    Update session times (drag-to-move / edge-resize).
    Body: { date?, start_time?, end_time? }
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    session = scheduling_service.update_session_times(
        session_id, g.current_academy_id, data
    )
    if not session:
        return jsonify({"error": "Session not found or already started"}), 404

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="session",
        entity_id=session.id,
        action="updated",
        description=f"Session on {session.date.isoformat()} updated",
    )

    db.session.commit()
    return jsonify({
        "id": session.id,
        "date": session.date.isoformat(),
        "start_time": session.start_time.strftime("%H:%M"),
        "end_time": session.end_time.strftime("%H:%M"),
    }), 200


@calendar_bp.route("/sessions/<session_id>", methods=["DELETE"])
@jwt_required()
@tenant_required
def cancel_session(session_id):
    """Cancel a session."""
    from flask import g
    success = scheduling_service.cancel_session(session_id, g.current_academy_id)
    if not success:
        return jsonify({"error": "Session not found"}), 404

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="session",
        entity_id=session_id,
        action="deleted",
        description="Session cancelled",
    )

    db.session.commit()
    return jsonify({"message": "Session cancelled"}), 200


@calendar_bp.route("/sessions/<session_id>/start", methods=["POST"])
@jwt_required()
@tenant_required
def start_session(session_id):
    """
    Start a class: SCHEDULED -> IN_PROGRESS, and open the register.

    This is where a class begins to exist. Until it is started, a session is
    only a plan on the calendar — it holds no attendance and no money.
    Starting materialises the register from the group's active enrollments
    as a blank slate of absences ("false until true"), so the desk flips
    students to PRESENT as they arrive rather than recording who was absent.

    Idempotent: starting an already-started class returns 200 with
    ``already_started: true`` rather than restarting the clock or
    duplicating the register.

    No PIN — starting a class is routine and moves no money. The PIN gate
    belongs on the finalise step, which is what settles credits.
    """
    from flask import g
    from app.services import session_lifecycle_service as lifecycle

    try:
        session, created, already = lifecycle.start_session(
            session_id, g.current_academy_id, g.current_user.id
        )
    except lifecycle.LifecycleError as exc:
        return jsonify({"error": exc.message}), exc.status

    db.session.commit()
    return jsonify({
        "message": "Class already started" if already else "Class started",
        "session_id": session.id,
        "status": session.status,
        "actual_start_time": (
            session.actual_start_time.isoformat() if session.actual_start_time else None
        ),
        "already_started": already,
        "roster_created": len(created),
        "is_free_session": bool(session.is_free_session),
    }), 200


@calendar_bp.route("/sessions/<session_id>/roster", methods=["GET"])
@jwt_required()
@tenant_required
def get_session_roster(session_id):
    """
    Get the student roster for a session, enriched with each student's
    subscription signal (remaining_credits / access_end / badges).

    This delegates to the same implementation as
    GET /attendance/roster/<session_id> so the two endpoints cannot drift —
    the dashboard reads this one, and it previously returned a bare roster,
    which is why the UI grew a fabricated client-side payment pill to fill
    the gap. The academy check is mandatory: without it any authenticated
    user could read another academy's roster by guessing a session id.
    """
    from flask import g
    from app.models.scheduling import Session
    from app.services.attendance_service import get_session_roster_with_badges

    session = db.session.get(Session, session_id)
    if not session or session.academy_id != g.current_academy_id:
        return jsonify({"error": "Session not found"}), 404

    roster = get_session_roster_with_badges(session_id)
    return jsonify({"roster": roster}), 200


@calendar_bp.route("/sessions/<session_id>/roster", methods=["POST"])
@jwt_required()
@tenant_required
def add_student_to_session(session_id):
    """
    Add a student to a session roster.
    Body: { student_id }
    """
    from flask import g
    from app.services.attendance_service import add_student_to_session

    data = request.get_json()
    if not data or not data.get("student_id"):
        return jsonify({"error": "student_id is required"}), 400

    record, is_new = add_student_to_session(
        session_id, data["student_id"],
        g.current_academy_id, g.current_user.id
    )
    db.session.commit()

    return jsonify({
        "id": record.id,
        "student_id": record.student_id,
        "is_present": record.is_present,
    }), 201 if is_new else 200
