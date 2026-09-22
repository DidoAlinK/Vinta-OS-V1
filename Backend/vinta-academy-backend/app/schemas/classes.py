"""
Class schemas — Classes, Classrooms, Schedules.
Backward compatible: CourseGroup (money-model) fields are optional.
"""
from marshmallow import Schema, fields


# ── Shared money-model (CourseGroup) fields ──────────────────────────
# academic_level, group_name, billing_model, price_da, credits_per_cycle,
# cycle_week_limit, allow_rollover, allow_makeups, access_duration_weeks,
# max_groups_included, enforce_attendance, attendance_threshold

GROUP_FIELDS_DOC = {
    "academic_level": "Academic level label (e.g. Primary, Middle, Secondary)",
    "group_name": "Group display name within the course",
    "billing_model": "per_cycle / per_access / per_month / unlimited",
    "price_da": "Price in DZD (integer)",
    "credits_per_cycle": "Credits included per cycle",
    "cycle_week_limit": "Cycle length in weeks",
    "allow_rollover": "Unused credits roll over",
    "allow_makeups": "Makeup sessions allowed",
    "access_duration_weeks": "Access window in weeks",
    "max_groups_included": "Max groups included in pack",
    "enforce_attendance": "Enforce attendance threshold",
    "attendance_threshold": "Minimum attendance ratio (0-100)",
}


# ── Request Schemas ────────────────────────────────────────────────

class CreateClassRequestSchema(Schema):
    """POST /api/classes"""
    name = fields.String(required=True, metadata={"description": "Class name", "example": "Math — CM2"})
    subject = fields.String(load_default=None, metadata={"description": "Primary subject", "example": "Math"})
    color = fields.String(load_default="#b3872a", metadata={"description": "Calendar color hex", "example": "#b3872a"})
    teacher_id = fields.String(load_default=None, metadata={"description": "Assigned teacher ID"})
    capacity = fields.Integer(load_default=25, metadata={"description": "Max students", "example": 25})
    notes = fields.String(load_default=None, metadata={"description": "Free-form notes"})
    # CourseGroup / money-model extensions (all optional → backward compat)
    academic_level = fields.String(load_default=None, metadata={"description": GROUP_FIELDS_DOC["academic_level"]})
    group_name = fields.String(load_default=None, metadata={"description": GROUP_FIELDS_DOC["group_name"]})
    billing_model = fields.String(load_default=None, metadata={"description": GROUP_FIELDS_DOC["billing_model"]})
    price_da = fields.Integer(load_default=None, metadata={"description": GROUP_FIELDS_DOC["price_da"]})
    credits_per_cycle = fields.Integer(load_default=None, metadata={"description": GROUP_FIELDS_DOC["credits_per_cycle"]})
    cycle_week_limit = fields.Integer(load_default=None, metadata={"description": GROUP_FIELDS_DOC["cycle_week_limit"]})
    allow_rollover = fields.Boolean(load_default=None, metadata={"description": GROUP_FIELDS_DOC["allow_rollover"]})
    allow_makeups = fields.Boolean(load_default=None, metadata={"description": GROUP_FIELDS_DOC["allow_makeups"]})
    access_duration_weeks = fields.Integer(load_default=None, metadata={"description": GROUP_FIELDS_DOC["access_duration_weeks"]})
    max_groups_included = fields.Integer(load_default=None, metadata={"description": GROUP_FIELDS_DOC["max_groups_included"]})
    enforce_attendance = fields.Boolean(load_default=None, metadata={"description": GROUP_FIELDS_DOC["enforce_attendance"]})
    attendance_threshold = fields.Integer(load_default=None, metadata={"description": GROUP_FIELDS_DOC["attendance_threshold"]})


class UpdateClassRequestSchema(Schema):
    """PUT /api/classes/<id>"""
    name = fields.String(metadata={"description": "Class name"})
    subject = fields.String(metadata={"description": "Primary subject"})
    color = fields.String(metadata={"description": "Calendar color hex"})
    teacher_id = fields.String(metadata={"description": "Assigned teacher ID"})
    capacity = fields.Integer(metadata={"description": "Max students"})
    notes = fields.String(metadata={"description": "Free-form notes"})
    academic_level = fields.String(metadata={"description": GROUP_FIELDS_DOC["academic_level"]})
    group_name = fields.String(metadata={"description": GROUP_FIELDS_DOC["group_name"]})
    billing_model = fields.String(metadata={"description": GROUP_FIELDS_DOC["billing_model"]})
    price_da = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["price_da"]})
    credits_per_cycle = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["credits_per_cycle"]})
    cycle_week_limit = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["cycle_week_limit"]})
    allow_rollover = fields.Boolean(metadata={"description": GROUP_FIELDS_DOC["allow_rollover"]})
    allow_makeups = fields.Boolean(metadata={"description": GROUP_FIELDS_DOC["allow_makeups"]})
    access_duration_weeks = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["access_duration_weeks"]})
    max_groups_included = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["max_groups_included"]})
    enforce_attendance = fields.Boolean(metadata={"description": GROUP_FIELDS_DOC["enforce_attendance"]})
    attendance_threshold = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["attendance_threshold"]})


class CreateClassroomRequestSchema(Schema):
    """POST /api/classrooms"""
    name = fields.String(required=True, metadata={"description": "Room name", "example": "Room 101"})
    capacity = fields.Integer(load_default=30, metadata={"description": "Max capacity", "example": 30})


class UpdateClassroomRequestSchema(Schema):
    """PUT /api/classrooms/<id>"""
    name = fields.String(metadata={"description": "Room name"})
    capacity = fields.Integer(metadata={"description": "Max capacity"})


class CreateScheduleRequestSchema(Schema):
    """POST /api/classes/<id>/schedules"""
    day_of_week = fields.Integer(required=True, metadata={"description": "0=Sun, 1=Mon, ..., 6=Sat", "example": 1})
    start_time = fields.String(required=True, metadata={"description": "Start time (HH:MM)", "example": "08:00"})
    end_time = fields.String(required=True, metadata={"description": "End time (HH:MM)", "example": "09:00"})
    classroom_id = fields.String(load_default=None, metadata={"description": "Classroom ID"})


class TransferEnrollmentRequestSchema(Schema):
    """PUT /api/enrollments/<id>/transfer  |  POST /api/classes/<id>/transfer-enrollment"""
    new_group_id = fields.String(required=True, metadata={"description": "Destination class/group ID"})
    new_class_id = fields.String(load_default=None, metadata={"description": "Alias of new_group_id"})


# ── Response Schemas ───────────────────────────────────────────────

class ClassListSchema(Schema):
    """Single class in list."""
    id = fields.String(metadata={"description": "Class ID"})
    name = fields.String(metadata={"description": "Class name"})
    subject = fields.String(metadata={"description": "Primary subject"})
    color = fields.String(metadata={"description": "Calendar color hex"})
    teacher_id = fields.String(metadata={"description": "Assigned teacher ID"})
    teacher_name = fields.String(metadata={"description": "Teacher full name"})
    capacity = fields.Integer(metadata={"description": "Max students"})
    enrolled_count = fields.Integer(metadata={"description": "Currently enrolled students"})
    status_color = fields.String(metadata={"description": "red / green / grey"})
    notes = fields.String(metadata={"description": "Free-form notes"})
    academic_level = fields.String(metadata={"description": GROUP_FIELDS_DOC["academic_level"]})
    group_name = fields.String(metadata={"description": GROUP_FIELDS_DOC["group_name"]})
    billing_model = fields.String(metadata={"description": GROUP_FIELDS_DOC["billing_model"]})
    price_da = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["price_da"]})
    credits_per_cycle = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["credits_per_cycle"]})
    cycle_week_limit = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["cycle_week_limit"]})
    allow_rollover = fields.Boolean(metadata={"description": GROUP_FIELDS_DOC["allow_rollover"]})
    allow_makeups = fields.Boolean(metadata={"description": GROUP_FIELDS_DOC["allow_makeups"]})
    access_duration_weeks = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["access_duration_weeks"]})
    max_groups_included = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["max_groups_included"]})
    enforce_attendance = fields.Boolean(metadata={"description": GROUP_FIELDS_DOC["enforce_attendance"]})
    attendance_threshold = fields.Integer(metadata={"description": GROUP_FIELDS_DOC["attendance_threshold"]})


class ClassListResponseSchema(Schema):
    """GET /api/classes response."""
    classes = fields.List(fields.Nested(ClassListSchema))


class ClassroomSchema(Schema):
    """Classroom in list."""
    id = fields.String(metadata={"description": "Classroom ID"})
    name = fields.String(metadata={"description": "Room name"})
    capacity = fields.Integer(metadata={"description": "Max capacity"})


class ClassroomListResponseSchema(Schema):
    """GET /api/classrooms response."""
    classrooms = fields.List(fields.Nested(ClassroomSchema))


class ScheduleSchema(Schema):
    """Schedule entry."""
    id = fields.String(metadata={"description": "Schedule ID"})
    class_id = fields.String(metadata={"description": "Class ID"})
    day_of_week = fields.Integer(metadata={"description": "0=Sun, 1=Mon, ..., 6=Sat"})
    start_time = fields.String(metadata={"description": "Start time (HH:MM)"})
    end_time = fields.String(metadata={"description": "End time (HH:MM)"})
    classroom_id = fields.String(metadata={"description": "Classroom ID"})


class CreateScheduleResponseSchema(Schema):
    """POST /api/classes/<id>/schedules response."""
    id = fields.String(metadata={"description": "Schedule ID"})
    day_of_week = fields.Integer(metadata={"description": "Day of week"})
    start_time = fields.String(metadata={"description": "Start time (HH:MM)"})
    end_time = fields.String(metadata={"description": "End time (HH:MM)"})
    classroom_id = fields.String(metadata={"description": "Classroom ID"})
    sessions_created = fields.Integer(metadata={"description": "Number of sessions generated"})


class CreateClassResponseSchema(Schema):
    """POST /api/classes response."""
    id = fields.String(metadata={"description": "Class ID"})
    name = fields.String(metadata={"description": "Class name"})
    subject = fields.String(metadata={"description": "Subject"})
    teacher_id = fields.String(metadata={"description": "Teacher ID"})
    capacity = fields.Integer(metadata={"description": "Max students"})
