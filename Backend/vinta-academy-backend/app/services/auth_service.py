"""
Vinta School OS — Auth Service
Hashing, JWT tokens, PIN validation, owner authorization.
"""
from flask_jwt_extended import create_access_token, create_refresh_token
from sqlalchemy import func
from app.extensions import db
from app.models.user import User


def owner_email_taken(email: str) -> bool:
    """True if an active owner already logs in with this address.

    The login request carries an email and nothing else — no academy id — so
    an address has to identify exactly one owner, globally. A per-academy
    check cannot do that job: signup mints a brand-new academy_id every time,
    so the newly provisioned academy is empty by construction and a check
    scoped to it passes on the second signup with the same address too.

    Deactivated owners are excluded, matching `authenticate_owner`: they
    cannot log in, so they must not hold their address hostage.
    """
    return (
        User.query.filter(
            func.lower(User.email) == User.normalize_email(email),
            User.role == "owner",
            User.is_active.is_(True),
        ).first()
        is not None
    )


def authenticate_owner(email: str, password: str) -> dict | None:
    """
    Authenticate an owner with email + password.
    Returns tokens dict on success, None on failure.
    """
    user = (
        User.query.filter(
            # Case-insensitive so owners written before addresses were
            # normalised on insert still match the address they typed.
            func.lower(User.email) == User.normalize_email(email),
            User.role == "owner",
            User.is_active.is_(True),
        )
        # Duplicate addresses are refused at signup now, but rows written
        # before that guard existed are still in the table. Ordering makes
        # the pick deterministic instead of "whichever row the engine
        # reaches first" — and with two rows sharing an address, only one
        # of their passwords can ever be the right one.
        .order_by(User.created_at.asc(), User.id.asc())
        .first()
    )
    if not user or not user.verify_password(password):
        return None

    access_token = create_access_token(
        identity=user.id,
        additional_claims={"academy_id": user.academy_id, "role": user.role},
    )
    refresh_token = create_refresh_token(
        identity=user.id,
        additional_claims={"academy_id": user.academy_id, "role": user.role},
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user_id": user.id,
        "name": user.name,
        "role": user.role,
        "academy_id": user.academy_id,
    }


def authenticate_profile(user_id: str, pin: str) -> dict | None:
    """
    Authenticate a profile (owner or staff) with PIN.
    Returns tokens dict on success, None on failure.
    """
    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        return None

    if not user.verify_pin(pin):
        return None

    access_token = create_access_token(
        identity=user.id,
        additional_claims={"academy_id": user.academy_id, "role": user.role},
    )
    return {
        "access_token": access_token,
        "user_id": user.id,
        "name": user.name,
        "role": user.role,
        "academy_id": user.academy_id,
    }


def verify_pin(user_id: str, pin: str) -> bool:
    """Verify a PIN for a specific user."""
    user = db.session.get(User, user_id)
    if not user:
        return False
    return user.verify_pin(pin)


def change_pin(user_id: str, old_pin: str, new_pin: str) -> bool:
    """Change a user's PIN. Returns True on success."""
    user = db.session.get(User, user_id)
    if not user:
        return False

    if not user.verify_pin(old_pin):
        return False

    user.set_pin(new_pin)
    db.session.commit()
    return True


def change_password(user_id: str, old_password: str, new_password: str) -> bool:
    """Change an owner's password. Returns True on success."""
    user = db.session.get(User, user_id)
    if not user or user.role != "owner":
        return False

    if not user.verify_password(old_password):
        return False

    user.set_password(new_password)
    db.session.commit()
    return True


def get_current_user(user_id: str) -> User | None:
    """Get the current authenticated user."""
    return db.session.get(User, user_id)
