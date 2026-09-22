"""
Attendance schemas — Check-in/out, Roster, Auto-checkout.
Backward compatible: legacy schemas untouched; status/swap/guest fields added.
"""
from marshmallow import Schema, fields


# ── Request Schemas ────────────────────────────────────────────────

class CheckInRequestSchema(Schema):
    """POST /api/attendance/check-in"""
    session_id = fields.String(required=True, metadata={"description": "Session ID", "example": "uuid-string"})
    student_id = fields.String(required=True, metadata={"description": "Student ID", "example": "uuid-string"})
    pin = fields.String(required=True, metadata={"description": "Staff PIN for attribution", "example": "1234"})
    status = fields.String(load_default="PRESENT", metadata={"description": "PRESENT or ABSENT", "example": "PRESENT"})
    is_group_swap = fields.Boolean(load_default=False, metadata={"description": "True when student swaps in from another group"})


class CheckOutRequestSchema(Schema):
    """POST /api/attendance/check-out"""
    session_id = fields.String(required=True, metadata={"description": "Session ID", "example": "uuid-string"})
    student_id = fields.String(required=True, metadata={"description": "Student ID", "example": "uuid-string"})


class AutoCheckoutRequestSchema(Schema):
    """POST /api/attendance/auto-checkout"""
    session_id = fields.String(required=True, metadata={"description": "Session ID", "example": "uuid-string"})


class AddToSessionRequestSchema(Schema):
    """POST /api/attendance/add-to-session"""
    session_id = fields.String(required=True, metadata={"description": "Session ID", "example": "uuid-string"})
    student_id = fields.String(required=True, metadata={"description": "Student ID", "example": "uuid-string"})


class GuestCheckinRequestSchema(Schema):
    """POST /api/attendance/guest-checkin"""
    session_id = fields.String(required=True, metadata={"description": "Session ID", "example": "uuid-string"})
    student_id = fields.String(required=True, metadata={"description": "Guest student ID", "example": "uuid-string"})
    pin = fields.String(required=True, metadata={"description": "Staff PIN for attribution", "example": "1234"})


class CompleteSessionRequestSchema(Schema):
    """POST /api/attendance/sessions/<id>/complete"""
    conducted = fields.Boolean(required=True, metadata={"description": "True if the session was conducted", "example": True})
    pin = fields.String(required=True, metadata={"description": "Staff PIN (verified by decorator)", "example": "1234"})


# ── Response Schemas ───────────────────────────────────────────────

class CheckInResponseSchema(Schema):
    """POST /api/attendance/check-in response."""
    id = fields.String(metadata={"description": "SessionStudent record ID"})
    student_id = fields.String(metadata={"description": "Student ID"})
    is_present = fields.Boolean(metadata={"description": "Attendance status"})
    checked_in_at = fields.String(metadata={"description": "Check-in timestamp (ISO 8601)"})
    checked_in_by = fields.String(metadata={"description": "User ID who performed check-in"})


class CheckOutResponseSchema(Schema):
    """POST /api/attendance/check-out response."""
    id = fields.String(metadata={"description": "SessionStudent record ID"})
    student_id = fields.String(metadata={"description": "Student ID"})
    checked_out_at = fields.String(metadata={"description": "Check-out timestamp (ISO 8601)"})


class AutoCheckoutResponseSchema(Schema):
    """POST /api/attendance/auto-checkout response."""
    session_id = fields.String(metadata={"description": "Session ID"})
    checked_out_count = fields.Integer(metadata={"description": "Number of students checked out"})


class RosterEntrySchema(Schema):
    """Single entry in the session roster."""
    id = fields.String(metadata={"description": "SessionStudent record ID"})
    student_id = fields.String(metadata={"description": "Student ID"})
    student_name = fields.String(metadata={"description": "Student full name"})
    is_present = fields.Boolean(metadata={"description": "Attendance status"})
    checked_in_at = fields.String(metadata={"description": "Check-in timestamp (ISO 8601)"})
    checked_out_at = fields.String(metadata={"description": "Check-out timestamp (ISO 8601)"})
    checked_in_by = fields.String(metadata={"description": "User ID who performed check-in"})
    payment_status = fields.String(metadata={"description": "paid / unpaid / partial"})
    remaining_credits = fields.Integer(metadata={"description": "Remaining credits (if tracked)"})
    access_end = fields.String(metadata={"description": "Access end date (ISO 8601)"})
    badges = fields.List(fields.String, metadata={"description": "RENEW_REQUIRED / ATTENDANCE_WARNING badges"})


class RosterResponseSchema(Schema):
    """GET /api/attendance/roster/<session_id> response."""
    roster = fields.List(fields.Nested(RosterEntrySchema))


class AddToSessionResponseSchema(Schema):
    """POST /api/attendance/add-to-session response."""
    id = fields.String(metadata={"description": "SessionStudent record ID"})
    student_id = fields.String(metadata={"description": "Student ID"})
    is_present = fields.Boolean(metadata={"description": "Attendance status"})
