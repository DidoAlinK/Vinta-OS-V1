"""
Vinta School OS — Academy Rules

Per-academy policy, read at the moment a decision is made.

These are the "Billing Rules" toggles from Settings. They are deliberately
never cached and never read at startup: every accessor queries the current
row, so an owner changing a rule mid-day takes effect on the very next class
rather than on the next restart.

They live here rather than on any one service because several of them are
consulted by different parts of the money flow — attendance, finalisation
and billing all need the same policy, and none of them should have to depend
on the others to read it.

An academy with no settings row yet is not an error: it gets the documented
default, which is what the model column declares.
"""

from app.extensions import db
from app.models.academy import AcademySettings


def settings_for(academy_id: str) -> AcademySettings | None:
    """The academy's settings row, or None if it has never been created."""
    return AcademySettings.query.filter_by(academy_id=academy_id).first()


def _toggle(academy_id: str, name: str, default: bool) -> bool:
    """Read one boolean rule, falling back to its documented default."""
    row = settings_for(academy_id)
    if row is None:
        return default
    value = getattr(row, name, None)
    return default if value is None else bool(value)


# ---------------------------------------------------------------------------
# The toggles, each named for the question it answers
# ---------------------------------------------------------------------------

def absence_consumes_credit(academy_id: str) -> bool:
    """
    Toggle 1 — does a missed session still spend a credit?

    True (default): an ABSENT student spends a credit, so the seat is paid
    for whether or not it was used. False: only PRESENT spends one, and an
    absence is a free retry.
    """
    return _toggle(academy_id, "absence_consumes_credit", True)


def count_gap_sessions(academy_id: str) -> bool:
    """
    Toggle 2 — are sessions missed during a payment gap charged later?

    True: sessions missed while overdue are charged against the NEXT
    subscription. False (default): a new payment always starts a clean cycle.
    """
    return _toggle(academy_id, "count_gap_sessions", False)


def restore_credits_on_cancellation(academy_id: str) -> bool:
    """
    Toggle 5 — give credits back when a class is cancelled after charging?

    False (default): the academy keeps the money.
    """
    return _toggle(academy_id, "restore_credits_on_cancellation", False)


def free_session_auto_present(academy_id: str) -> bool:
    """
    Toggle 6 — auto-mark everyone PRESENT for a free session?

    True (default): a free session has no money attached, so tracking who
    turned up earns nothing and the register is filled in for you.
    """
    return _toggle(academy_id, "free_session_auto_present", True)


def share_credits_across_groups(academy_id: str) -> bool:
    """
    Toggle 7 — does one subscription cover every group of the same subject?

    False (default): each group needs its own subscription.
    """
    return _toggle(academy_id, "share_credits_across_groups", False)


def early_payment_on_extra_sessions(academy_id: str) -> bool:
    """
    Toggle 8 — prompt for renewal as soon as extra sessions drain the credits?

    True (default): ask straight away rather than waiting for the cycle end.
    """
    return _toggle(academy_id, "early_payment_on_extra_sessions", True)
