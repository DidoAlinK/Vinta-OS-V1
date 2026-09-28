"""
Vinta School OS — Auth Blueprint
/api/auth — Login, Profile Selection, PIN Verification, Academy Signup
"""
from flask_smorest import Blueprint
from flask import request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.utils.rate_limiter import limiter, LOGIN_LIMIT, VERIFY_PIN_LIMIT, SIGNUP_LIMIT, CREATE_OWNER_LIMIT
from app.models.user import User
from app.services import auth_service, tenant_service
from app.schemas.auth import (
    SignupRequestSchema, LoginRequestSchema, VerifyPinRequestSchema,
    CreateOwnerRequestSchema, CreateProfileRequestSchema, ChangePinRequestSchema,
    TokenResponseSchema, SignupResponseSchema, CreateOwnerResponseSchema,
    ProfileResponseSchema, ProfileListResponseSchema, MeResponseSchema,
)
from app.schemas.base import ErrorSchema, MessageSchema

auth_bp = Blueprint("auth", __name__, description="Authentication & profile management")


@auth_bp.route("/signup", methods=["POST"])
@limiter.limit(SIGNUP_LIMIT)
@auth_bp.arguments(SignupRequestSchema)
@auth_bp.response(201, SignupResponseSchema)
@auth_bp.doc(responses={
    400: ("Validation error", ErrorSchema),
    409: ("Email already registered", ErrorSchema),
    500: ("Server error", ErrorSchema),
})
def signup(data):
    """Create a new academy (tenant provisioning)
    Creates a new academy with default settings and subscription. Returns the academy ID for the create-owner step.
    """
    email = User.normalize_email(data["email"])
    # Checked before provisioning rather than after: a refused signup must not
    # leave an academy, its settings, its subscription and its payment plans
    # behind with no owner able to reach them. The signup → create-owner →
    # login chain has no rollback, so orphans are permanent.
    if auth_service.owner_email_taken(email):
        return jsonify({"error": "An account with this email already exists"}), 409

    try:
        result = tenant_service.create_academy(
            name=data["name"],
            email=email,
            password=data["password"],
        )
        db.session.commit()
        return result, 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/login", methods=["POST"])
@limiter.limit(LOGIN_LIMIT)
@auth_bp.arguments(LoginRequestSchema)
@auth_bp.response(200, TokenResponseSchema)
@auth_bp.doc(responses={400: ("Validation error", ErrorSchema), 401: ("Invalid credentials", ErrorSchema)})
def login(data):
    """Owner login with email + password
    Authenticates the academy owner and returns JWT tokens. Use the access_token in subsequent requests as `Authorization: Bearer <token>`.
    """
    result = auth_service.authenticate_owner(data["email"], data["password"])
    if not result:
        return jsonify({"error": "Invalid email or password"}), 401
    return result, 200


@auth_bp.route("/profiles", methods=["GET"])
@jwt_required()
@auth_bp.response(200, ProfileListResponseSchema)
@auth_bp.doc(
    security=[{"Bearer": []}],
    parameters=[{"in": "header", "name": "X-Academy-Id", "required": True, "schema": {"type": "string"}, "description": "Academy ID"}],
    responses={400: ("Missing academy header", ErrorSchema), 403: ("Access denied", ErrorSchema)},
)
def get_profiles():
    """Get all active profiles for the academy
    Returns all user profiles (owner + staff) for the profile picker screen. Requires JWT and X-Academy-Id header.
    """
    academy_id = request.headers.get("X-Academy-Id")
    if not academy_id:
        return jsonify({"error": "X-Academy-Id header is required"}), 400

    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user or user.academy_id != academy_id:
        return jsonify({"error": "Access denied"}), 403

    profiles = tenant_service.get_academy_profiles(academy_id)
    return jsonify({
        "profiles": [
            {
                "id": p.id,
                "name": p.name,
                "role": p.role,
                "picture": p.picture,
                "avatar_color_1": p.avatar_color_1,
                "avatar_color_2": p.avatar_color_2,
            }
            for p in profiles
        ]
    }), 200


@auth_bp.route("/verify-pin", methods=["POST"])
@limiter.limit(VERIFY_PIN_LIMIT)
@auth_bp.arguments(VerifyPinRequestSchema)
@auth_bp.response(200, TokenResponseSchema)
@auth_bp.doc(
    parameters=[{"in": "header", "name": "X-Academy-Id", "required": True, "schema": {"type": "string"}, "description": "Academy ID — validates the profile belongs to this academy"}],
    responses={400: ("Missing header", ErrorSchema), 401: ("Invalid PIN or profile", ErrorSchema)},
)
def verify_pin(data):
    """Verify a profile's PIN and return a session token
    **No JWT required** — the PIN itself is the authentication factor. Used by the profile picker flow: select profile → enter PIN → dashboard. Requires X-Academy-Id header to prevent cross-academy PIN enumeration.
    """
    academy_id = request.headers.get("X-Academy-Id")
    if not academy_id:
        return jsonify({"error": "X-Academy-Id header is required"}), 400

    user = db.session.get(User, data["user_id"])
    if not user or user.academy_id != academy_id:
        return jsonify({"error": "Profile not found"}), 401

    result = auth_service.authenticate_profile(data["user_id"], data["pin"])
    if not result:
        return jsonify({"error": "Invalid PIN"}), 401

    return result, 200


@auth_bp.route("/create-owner", methods=["POST"])
@limiter.limit(CREATE_OWNER_LIMIT)
@auth_bp.arguments(CreateOwnerRequestSchema)
@auth_bp.response(201, CreateOwnerResponseSchema)
@auth_bp.doc(
    parameters=[{"in": "header", "name": "X-Academy-Id", "required": True, "schema": {"type": "string"}, "description": "Must match body academy_id"}],
    responses={400: ("Validation error", ErrorSchema), 404: ("Academy not found", ErrorSchema), 409: ("Owner already exists, or email already registered", ErrorSchema)},
)
def create_owner(data):
    """Create the first owner profile during academy setup
    **No JWT required** — this is the bootstrap endpoint called after academy signup. Requires X-Academy-Id header matching the body academy_id. Can only be called once per academy (409 if owner exists).
    """
    academy_id = request.headers.get("X-Academy-Id")
    if not academy_id:
        return jsonify({"error": "X-Academy-Id header is required"}), 400
    if academy_id != data["academy_id"]:
        return jsonify({"error": "X-Academy-Id header does not match body"}), 400

    from app.models.academy import Academy
    academy = db.session.get(Academy, data["academy_id"])
    if not academy:
        return jsonify({"error": "Academy not found"}), 404

    existing_owner = User.query.filter_by(
        academy_id=data["academy_id"], role="owner"
    ).first()
    if existing_owner:
        return jsonify({"error": "Owner already exists for this academy"}), 409

    # The academy-scoped check above cannot see an owner registered under a
    # different academy. This endpoint is reachable without a JWT, so it has
    # to carry the same guard signup does — otherwise the duplicate-email
    # state that makes login unresolvable can be recreated straight from here.
    if auth_service.owner_email_taken(data["email"]):
        return jsonify({"error": "An account with this email already exists"}), 409

    try:
        owner = tenant_service.create_owner_profile(
            academy_id=data["academy_id"],
            name=data["name"],
            email=data["email"],
            password=data["password"],
            pin=data["pin"],
        )
        db.session.commit()
        return jsonify({
            "id": owner.id,
            "name": owner.name,
            "role": owner.role,
            "academy_id": owner.academy_id,
        }), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/create-profile", methods=["POST"])
@jwt_required()
@auth_bp.arguments(CreateProfileRequestSchema)
@auth_bp.response(201, ProfileResponseSchema)
@auth_bp.doc(
    security=[{"Bearer": []}],
    responses={400: ("Validation error", ErrorSchema), 403: ("Owner access required, or invalid owner PIN", ErrorSchema)},
)
def create_profile(data):
    """Create a new staff/owner profile (owner-only action)
    Creates a new user profile with PIN for the profile picker. Requires JWT (owner role) and owner PIN verification in the request body.
    """
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user or user.role != "owner":
        return jsonify({"error": "Owner access required"}), 403

    pin = data.get("owner_pin")
    if not pin or not user.verify_pin(pin):
        # 403, not 401. The caller is already authenticated — this is a step-up
        # check that was refused, not a session that failed. A 401 here would be
        # read by the frontend as "session expired" and log the owner out
        # mid-action, discarding the form they were filling in.
        return jsonify({"error": "Owner PIN verification required"}), 403

    required = ("name", "pin")
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    role = data.get("role", "staff")
    if role not in ("owner", "staff"):
        return jsonify({"error": "Role must be 'owner' or 'staff'"}), 400

    # Prevent creating a second owner
    if role == "owner":
        existing_owner = User.query.filter_by(
            academy_id=user.academy_id, role="owner"
        ).first()
        if existing_owner:
            return jsonify({"error": "An owner already exists for this academy"}), 409

    try:
        new_user = tenant_service.create_staff_profile(
            academy_id=user.academy_id,
            name=data["name"],
            pin=data["pin"],
            phone=data.get("phone"),
            role=role,
        )
        db.session.commit()
        return jsonify({
            "id": new_user.id,
            "name": new_user.name,
            "role": new_user.role,
        }), 201
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route("/change-pin", methods=["POST"])
@jwt_required()
@auth_bp.arguments(ChangePinRequestSchema)
@auth_bp.response(200, MessageSchema)
@auth_bp.doc(security=[{"Bearer": []}], responses={400: ("Validation error", ErrorSchema), 403: ("Invalid current PIN", ErrorSchema)})
def change_pin(data):
    """Change the current user's PIN
    Requires JWT. Must provide old PIN for verification and new PIN.
    """
    user_id = get_jwt_identity()
    success = auth_service.change_pin(user_id, data["old_pin"], data["new_pin"])
    if not success:
        # 403 for the same reason as create_profile: a wrong step-up PIN is a
        # refused action, not a dead session.
        return jsonify({"error": "Invalid current PIN"}), 403
    return jsonify({"message": "PIN changed successfully"}), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
@auth_bp.response(200, MeResponseSchema)
@auth_bp.doc(security=[{"Bearer": []}], responses={404: ("User not found", ErrorSchema)})
def get_current_user():
    """Get the current authenticated user's profile
    Requires JWT. Returns full profile details for the authenticated user.
    """
    user_id = get_jwt_identity()
    user = auth_service.get_current_user(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "academy_id": user.academy_id,
        "picture": user.picture,
        "is_active": user.is_active,
    }), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
@auth_bp.doc(security=[{"Bearer": []}], responses={200: ("Logged out", MessageSchema)})
def logout():
    """Revoke the current JWT token (logout)."""
    from flask_jwt_extended import get_jwt
    from app.utils.token_blacklist import blacklist_token
    jwt_data = get_jwt()
    blacklist_token(jwt_data["jti"], jwt_data["exp"])
    return jsonify({"message": "Logged out successfully"}), 200
