"""
Rate limiting configuration for authentication endpoints.
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    storage_uri="memory://",
)

# Auth endpoint limits
LOGIN_LIMIT = "10 per minute"
VERIFY_PIN_LIMIT = "10 per minute"
SIGNUP_LIMIT = "5 per minute"
CREATE_OWNER_LIMIT = "5 per minute"
