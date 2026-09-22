"""
Vinta School OS — Audit Helper
Centralized activity logging for all significant backend actions.
"""
from app.extensions import db


def log_activity(academy_id, user_id, entity_type, entity_id, action, description="", metadata=None):
    """
    Create an ActivityLog entry for a significant action.

    Args:
        academy_id: The academy performing the action.
        user_id: The user who performed the action.
        entity_type: Type of entity (student, teacher, class, session, payment, export, staff).
        entity_id: ID of the entity acted upon.
        action: Action performed (created, updated, deleted, payment_received, exported, etc.).
        description: Human-readable description of the action.
        metadata: Optional dict of contextual data.
    """
    from app.models.audit import ActivityLog

    log = ActivityLog(
        academy_id=academy_id,
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        description=description,
        log_metadata=metadata,
    )
    db.session.add(log)
