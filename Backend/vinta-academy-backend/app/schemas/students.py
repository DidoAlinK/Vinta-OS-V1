"""
Student schemas — CRUD, Guardians, Enrollments, Profile Drawer.
"""
from marshmallow import Schema, fields


# ── Request Schemas ────────────────────────────────────────────────

class CreateStudentRequestSchema(Schema):
    """POST /api/students"""
    first_name = fields.String(required=True, metadata={"description": "First name", "example": "Yasmine"})
    last_name = fields.String(required=True, metadata={"description": "Last name", "example": "Benali"})
    phone = fields.String(load_default=None, metadata={"description": "Student phone", "example": "+213555111222"})
    parent_phone = fields.String(load_default=None, metadata={"description": "Parent phone", "example": "+213555333444"})
    notes = fields.String(load_default=None, metadata={"description": "Free-form notes"})


class UpdateStudentRequestSchema(Schema):
    """PUT /api/students/<id>"""
    first_name = fields.String(metadata={"description": "First name"})
    last_name = fields.String(metadata={"description": "Last name"})
    phone = fields.String(metadata={"description": "Student phone"})
    parent_phone = fields.String(metadata={"description": "Parent phone"})
    notes = fields.String(metadata={"description": "Free-form notes"})


class EnrollStudentRequestSchema(Schema):
    """POST /api/students/<id>/enroll"""
    class_id = fields.String(required=True, metadata={"description": "Class ID to enroll in", "example": "uuid-string"})


class AddGuardianRequestSchema(Schema):
    """POST /api/students/<id>/guardians"""
    name = fields.String(required=True, metadata={"description": "Guardian name", "example": "Mr. Benali"})
    relationship = fields.String(load_default=None, metadata={"description": "Relationship type", "example": "Father"})
    phone = fields.String(required=True, metadata={"description": "Guardian phone", "example": "+213555333444"})
    is_emergency = fields.Boolean(load_default=False, metadata={"description": "Emergency contact flag"})


# ── Response Schemas ───────────────────────────────────────────────

class StudentListSchema(Schema):
    """Single student in list."""
    id = fields.String(metadata={"description": "Student ID"})
    first_name = fields.String(metadata={"description": "First name"})
    last_name = fields.String(metadata={"description": "Last name"})
    full_name = fields.String(metadata={"description": "Computed full name"})
    phone = fields.String(metadata={"description": "Phone number"})
    parent_phone = fields.String(metadata={"description": "Parent phone"})
    enrollment_status = fields.String(metadata={"description": "active / inactive / withdrawn"})
    billing_status = fields.String(metadata={"description": "paid / due / overdue"})
    days_until_due = fields.Integer(metadata={"description": "Days until next payment is due"})


class StudentListResponseSchema(Schema):
    """GET /api/students response."""
    students = fields.List(fields.Nested(StudentListSchema))
    total = fields.Integer(metadata={"description": "Total student count"})
    page = fields.Integer(metadata={"description": "Current page"})
    per_page = fields.Integer(metadata={"description": "Page size"})


class StudentStatsResponseSchema(Schema):
    """GET /api/students/stats response.

    Documents the shape `student_service.get_student_stats` actually returns.
    It previously described `active` / `inactive` / `new_this_month`, which no
    endpoint has ever produced — the service has always counted billing status.
    Every student has exactly one status, so the five buckets sum to `total`.
    """
    total = fields.Integer(
        metadata={"description": "Students matching the search (whole roster when q is absent)"}
    )
    paid = fields.Integer(metadata={"description": "Active plan, inside its cycle window"})
    due = fields.Integer(metadata={"description": "Money owed — cycle closed, expired or depleted"})
    overdue = fields.Integer(metadata={"description": "Plan suspended"})
    unpaid = fields.Integer(metadata={"description": "Enrolled in a group, never bought a plan"})
    no_plan = fields.Integer(metadata={"description": "Not enrolled in anything"})


class GuardianSchema(Schema):
    """Guardian in student profile."""
    id = fields.String(metadata={"description": "Guardian ID"})
    name = fields.String(metadata={"description": "Guardian name"})
    relationship = fields.String(metadata={"description": "Relationship type"})
    phone = fields.String(metadata={"description": "Phone number"})
    is_emergency = fields.Boolean(metadata={"description": "Emergency contact"})


class EnrollmentSchema(Schema):
    """Enrollment in student profile."""
    id = fields.String(metadata={"description": "Enrollment ID"})
    class_id = fields.String(metadata={"description": "Class ID"})
    class_name = fields.String(metadata={"description": "Class name"})
    status = fields.String(metadata={"description": "active / withdrawn"})


class StudentProfileResponseSchema(Schema):
    """GET /api/students/<id> — full profile drawer."""
    id = fields.String(metadata={"description": "Student ID"})
    first_name = fields.String(metadata={"description": "First name"})
    last_name = fields.String(metadata={"description": "Last name"})
    full_name = fields.String(metadata={"description": "Computed full name"})
    phone = fields.String(metadata={"description": "Phone number"})
    parent_phone = fields.String(metadata={"description": "Parent phone"})
    notes = fields.String(metadata={"description": "Notes"})
    created_at = fields.String(metadata={"description": "Created at (ISO 8601)"})
    guardians = fields.List(fields.Nested(GuardianSchema))
    enrollments = fields.List(fields.Nested(EnrollmentSchema))
    billing = fields.Dict(metadata={"description": "Current billing info"})


class CreateStudentResponseSchema(Schema):
    """POST /api/students response."""
    id = fields.String(metadata={"description": "Student ID"})
    first_name = fields.String(metadata={"description": "First name"})
    last_name = fields.String(metadata={"description": "Last name"})
    full_name = fields.String(metadata={"description": "Computed full name"})


class EnrollResponseSchema(Schema):
    """POST /api/students/<id>/enroll response."""
    id = fields.String(metadata={"description": "Enrollment ID"})
    student_id = fields.String(metadata={"description": "Student ID"})
    class_id = fields.String(metadata={"description": "Class ID"})
    status = fields.String(metadata={"description": "Enrollment status"})
