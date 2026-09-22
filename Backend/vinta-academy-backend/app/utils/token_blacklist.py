"""
Simple in-memory token blacklist for JWT revocation.
For production, replace with Redis-backed implementation.
"""
from datetime import datetime, timezone

_blacklisted_jti: dict[str, float] = {}  # jti -> expiry timestamp

def blacklist_token(jti: str, expires_at: float):
    """Add a token JTI to the blacklist."""
    _blacklisted_jti[jti] = expires_at

def is_token_blacklisted(jti: str) -> bool:
    """Check if a token JTI is blacklisted."""
    if jti in _blacklisted_jti:
        # Clean up expired entries periodically
        now = datetime.now(timezone.utc).timestamp()
        if _blacklisted_jti[jti] < now:
            del _blacklisted_jti[jti]
            return False
        return True
    return False

def cleanup_expired():
    """Remove expired entries from the blacklist."""
    now = datetime.now(timezone.utc).timestamp()
    expired = [jti for jti, exp in _blacklisted_jti.items() if exp < now]
    for jti in expired:
        del _blacklisted_jti[jti]
