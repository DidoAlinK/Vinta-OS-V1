"""
Teacher schemas — CRUD, Contracts, Payroll.
"""
from marshmallow import Schema, fields


# ── Request Schemas ────────────────────────────────────────────────

class CreateTeacherRequestSchema(Schema):
    """POST /api/teachers"""
    first_name = fields.String(required=True, metadata={"description": "First name", "example": "Ali"})
    last_name = fields.String(required=True, metadata={"description": "Last name", "example": "Bensalem"})
    # Required + format-checked server-side, unique per academy (409 on clash).
    # String rather than fields.Email: email_validator is not a dependency.
    email = fields.String(required=True, metadata={"description": "Unique per academy", "example": "ali@albaraka.dz"})
    phone = fields.String(load_default=None, metadata={"description": "Phone number", "example": "+213555987654"})
    subject = fields.String(load_default=None, metadata={"description": "Primary subject", "example": "Math"})
    notes = fields.String(load_default=None, metadata={"description": "Free-form notes"})
    contract_type = fields.String(load_default="hourly", metadata={"description": "hourly or per_student", "example": "hourly"})
    hourly_rate = fields.Integer(load_default=0, metadata={"description": "DA per hour", "example": 1500})
    per_student_rate = fields.Integer(load_default=0, metadata={"description": "DA per student", "example": 500})
    commission_type = fields.String(metadata={"description": "PERCENTAGE, FLAT_HOURLY or FIXED_SESSION — owner-only"})
    commission_value = fields.Integer(metadata={"description": "0-100 for PERCENTAGE, 0-1000000 for the flat types — owner-only"})


class UpdateTeacherRequestSchema(Schema):
    """PUT /api/teachers/<id>"""
    first_name = fields.String(metadata={"description": "First name"})
    last_name = fields.String(metadata={"description": "Last name"})
    email = fields.String(metadata={"description": "Unique per academy, own row excluded"})
    status = fields.String(metadata={"description": "ACTIVE or INACTIVE"})
    phone = fields.String(metadata={"description": "Phone number"})
    subject = fields.String(metadata={"description": "Primary subject"})
    notes = fields.String(metadata={"description": "Notes"})
    contract_type = fields.String(metadata={"description": "hourly or per_student"})
    hourly_rate = fields.Integer(metadata={"description": "DA per hour"})
    per_student_rate = fields.Integer(metadata={"description": "DA per student"})
    commission_type = fields.String(metadata={"description": "PERCENTAGE, FLAT_HOURLY or FIXED_SESSION — owner-only"})
    commission_value = fields.Integer(metadata={"description": "0-100 for PERCENTAGE, 0-1000000 for the flat types — owner-only"})


# ── Response Schemas ───────────────────────────────────────────────

class TeacherListSchema(Schema):
    """Single teacher in list."""
    id = fields.String(metadata={"description": "Teacher ID"})
    first_name = fields.String(metadata={"description": "First name"})
    last_name = fields.String(metadata={"description": "Last name"})
    full_name = fields.String(metadata={"description": "Computed full name"})
    phone = fields.String(metadata={"description": "Phone number"})
    email = fields.String(metadata={"description": "Unique per academy (null on legacy rows)"})
    status = fields.String(metadata={"description": "ACTIVE or INACTIVE"})
    subject = fields.String(metadata={"description": "Primary subject"})
    contract_type = fields.String(metadata={"description": "hourly or per_student"})
    hourly_rate = fields.Integer(metadata={"description": "DA per hour"})
    per_student_rate = fields.Integer(metadata={"description": "DA per student"})
    commission_type = fields.String(metadata={"description": "PERCENTAGE, FLAT_HOURLY or FIXED_SESSION"})
    commission_value = fields.Integer(metadata={"description": "Value interpreted per commission_type"})
    classes_assigned = fields.List(fields.String, metadata={"description": "Assigned class names"})
    sessions_this_week = fields.Integer(metadata={"description": "Sessions scheduled this week"})
    created_at = fields.String(metadata={"description": "Created at (ISO 8601)"})


class TeacherListResponseSchema(Schema):
    """GET /api/teachers response."""
    teachers = fields.List(fields.Nested(TeacherListSchema))


class TeacherStatsResponseSchema(Schema):
    """GET /api/teachers/stats response."""
    total = fields.Integer(metadata={"description": "Total teachers"})
    hourly = fields.Integer(metadata={"description": "Hourly contract count"})
    per_student = fields.Integer(metadata={"description": "Per-student contract count"})


class ScheduleEntrySchema(Schema):
    """Single schedule entry in teacher profile."""
    id = fields.String(metadata={"description": "Session ID"})
    class_name = fields.String(metadata={"description": "Class name"})
    date = fields.String(metadata={"description": "Session date (ISO 8601)"})
    start_time = fields.String(metadata={"description": "Start time (HH:MM)"})
    end_time = fields.String(metadata={"description": "End time (HH:MM)"})
    subject = fields.String(metadata={"description": "Subject"})


class PayrollSummarySchema(Schema):
    """Payroll summary in teacher profile."""
    teacher_id = fields.String(metadata={"description": "Teacher ID"})
    contract_type = fields.String(metadata={"description": "Contract type"})
    hourly_rate = fields.Integer(metadata={"description": "DA per hour"})
    per_student_rate = fields.Integer(metadata={"description": "DA per student"})
    current_payroll = fields.Dict(metadata={"description": "Current month payroll info"})
    hours_this_week = fields.Float(metadata={"description": "Hours logged this week"})
    active_students = fields.Integer(metadata={"description": "Active students (per-student contracts)"})


class TeacherProfileResponseSchema(Schema):
    """GET /api/teachers/<id> — full teacher profile."""
    id = fields.String(metadata={"description": "Teacher ID"})
    first_name = fields.String(metadata={"description": "First name"})
    last_name = fields.String(metadata={"description": "Last name"})
    full_name = fields.String(metadata={"description": "Computed full name"})
    phone = fields.String(metadata={"description": "Phone number"})
    email = fields.String(metadata={"description": "Unique per academy (null on legacy rows)"})
    status = fields.String(metadata={"description": "ACTIVE or INACTIVE"})
    subject = fields.String(metadata={"description": "Primary subject"})
    notes = fields.String(metadata={"description": "Notes"})
    contract_type = fields.String(metadata={"description": "hourly or per_student"})
    hourly_rate = fields.Integer(metadata={"description": "DA per hour"})
    per_student_rate = fields.Integer(metadata={"description": "DA per student"})
    commission_type = fields.String(metadata={"description": "PERCENTAGE, FLAT_HOURLY or FIXED_SESSION"})
    commission_value = fields.Integer(metadata={"description": "Value interpreted per commission_type"})
    classes_assigned = fields.List(fields.String, metadata={"description": "Assigned class names"})
    schedule = fields.List(fields.Nested(ScheduleEntrySchema))
    payroll_summary = fields.Nested(PayrollSummarySchema)


class CreateTeacherResponseSchema(Schema):
    """POST /api/teachers response."""
    id = fields.String(metadata={"description": "Teacher ID"})
    first_name = fields.String(metadata={"description": "First name"})
    last_name = fields.String(metadata={"description": "Last name"})
    email = fields.String(metadata={"description": "Stored email"})
    status = fields.String(metadata={"description": "ACTIVE or INACTIVE"})
    commission_type = fields.String(metadata={"description": "PERCENTAGE, FLAT_HOURLY or FIXED_SESSION"})
    commission_value = fields.Integer(metadata={"description": "Value interpreted per commission_type"})
