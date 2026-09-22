"""
Billing schemas — Payment Plans, Student Billing, Payroll, Revenue.
Backward compatible: legacy schemas untouched; money-model schemas appended.
All money fields are integers in DZD.
"""
from marshmallow import Schema, fields


# ── Request Schemas ────────────────────────────────────────────────

class CreatePlanRequestSchema(Schema):
    """POST /api/billing/plans"""
    name = fields.String(required=True, metadata={"description": "Plan name", "example": "Monthly — 3,500 DA"})
    duration_days = fields.Integer(required=True, metadata={"description": "Duration in days", "example": 30})
    amount_da = fields.Integer(required=True, metadata={"description": "Amount in DA", "example": 3500})


class RecordPaymentRequestSchema(Schema):
    """POST /api/billing/record-payment"""
    billing_id = fields.String(required=True, metadata={"description": "Student billing record ID", "example": "uuid-string"})
    amount = fields.Integer(required=True, metadata={"description": "Payment amount in DA", "example": 3500})
    payment_method = fields.String(load_default="cash", metadata={"description": "cash / ccp / baridimob / bank_transfer", "example": "cash"})
    notes = fields.String(load_default=None, metadata={"description": "Payment notes"})


class SubscriptionPayItemSchema(Schema):
    """Single line item in a multi-teacher subscription payment."""
    group_id = fields.String(required=True, metadata={"description": "Course group / class ID", "example": "uuid-string"})
    amount = fields.Integer(required=True, metadata={"description": "Amount in DZD (integer)", "example": 3500})


class SubscriptionPayRequestSchema(Schema):
    """POST /api/billing/subscriptions/pay"""
    student_id = fields.String(required=True, metadata={"description": "Student ID", "example": "uuid-string"})
    items = fields.List(fields.Nested(SubscriptionPayItemSchema), required=True, metadata={"description": "One item per teacher/group"})
    payment_method = fields.String(load_default="cash", metadata={"description": "cash / ccp / baridimob / bank_transfer", "example": "cash"})
    pin = fields.String(required=True, metadata={"description": "Staff PIN (verified by decorator)", "example": "1234"})
    notes = fields.String(load_default=None, metadata={"description": "Payment notes"})


class RenewSubscriptionRequestSchema(Schema):
    """POST /api/billing/subscriptions/<id>/renew"""
    pin = fields.String(load_default=None, metadata={"description": "Staff PIN (optional)"})


class MarkPayoutPaidRequestSchema(Schema):
    """POST /api/billing/payouts/<id>/mark-paid"""
    pin = fields.String(required=True, metadata={"description": "Owner PIN", "example": "1234"})


class FinalizeSessionRequestSchema(Schema):
    """POST /api/billing/sessions/<id>/finalize"""
    conducted = fields.Boolean(required=True, metadata={"description": "True if the session was conducted", "example": True})
    pin = fields.String(required=True, metadata={"description": "Staff PIN (verified by decorator)", "example": "1234"})


# ── Response Schemas ───────────────────────────────────────────────

class PaymentPlanSchema(Schema):
    """Payment plan in list."""
    id = fields.String(metadata={"description": "Plan ID"})
    name = fields.String(metadata={"description": "Plan name"})
    duration_days = fields.Integer(metadata={"description": "Duration in days"})
    amount_da = fields.Integer(metadata={"description": "Amount in DA"})


class PaymentPlanListResponseSchema(Schema):
    """GET /api/billing/plans response."""
    plans = fields.List(fields.Nested(PaymentPlanSchema))


class StudentBillingSchema(Schema):
    """Student billing record."""
    id = fields.String(metadata={"description": "Billing record ID"})
    student_id = fields.String(metadata={"description": "Student ID"})
    student_name = fields.String(metadata={"description": "Student full name"})
    payment_plan_id = fields.String(metadata={"description": "Payment plan ID"})
    amount_da = fields.Integer(metadata={"description": "Billed amount in DA"})
    status = fields.String(metadata={"description": "paid / due / overdue"})
    due_date = fields.String(metadata={"description": "Due date (ISO 8601)"})
    paid_date = fields.String(metadata={"description": "Payment date (ISO 8601)"})
    paid_amount = fields.Integer(metadata={"description": "Amount paid in DA"})
    cycle_start = fields.String(metadata={"description": "Billing cycle start (ISO 8601)"})
    cycle_end = fields.String(metadata={"description": "Billing cycle end (ISO 8601)"})
    days_overdue = fields.Integer(metadata={"description": "Days past due date"})


class StudentBillingListResponseSchema(Schema):
    """GET /api/billing/students response."""
    billings = fields.List(fields.Nested(StudentBillingSchema))


class BillingStatsResponseSchema(Schema):
    """GET /api/billing/stats response."""
    total_due = fields.Integer(metadata={"description": "Total amount due"})
    total_paid = fields.Integer(metadata={"description": "Total amount paid"})
    total_overdue = fields.Integer(metadata={"description": "Total overdue amount"})
    students_paid = fields.Integer(metadata={"description": "Students with paid status"})
    students_due = fields.Integer(metadata={"description": "Students with due status"})
    students_overdue = fields.Integer(metadata={"description": "Students with overdue status"})


class RevenueChartEntrySchema(Schema):
    """Single month in revenue chart."""
    month = fields.String(metadata={"description": "Month label (e.g., 'Sep 2026')"})
    revenue = fields.Integer(metadata={"description": "Revenue in DA"})


class RevenueChartResponseSchema(Schema):
    """GET /api/billing/revenue-chart response."""
    chart_data = fields.List(fields.Nested(RevenueChartEntrySchema))


class AgingBucketsResponseSchema(Schema):
    """GET /api/billing/aging-buckets response."""
    recent_1_7 = fields.List(fields.Dict, metadata={"description": "1-7 days overdue"})
    aging_8_30 = fields.List(fields.Dict, metadata={"description": "8-30 days overdue"})
    critical_30plus = fields.List(fields.Dict, metadata={"description": "30+ days overdue"})


class PayrollSchema(Schema):
    """Payroll record."""
    id = fields.String(metadata={"description": "Payroll record ID"})
    teacher_id = fields.String(metadata={"description": "Teacher ID"})
    teacher_name = fields.String(metadata={"description": "Teacher full name"})
    period_start = fields.String(metadata={"description": "Period start (ISO 8601)"})
    period_end = fields.String(metadata={"description": "Period end (ISO 8601)"})
    total_hours = fields.Float(metadata={"description": "Total hours logged"})
    total_students = fields.Integer(metadata={"description": "Active student count"})
    rate_applied = fields.Integer(metadata={"description": "Rate used for calculation"})
    calculated_amount = fields.Integer(metadata={"description": "Calculated pay in DA"})
    status = fields.String(metadata={"description": "pending / settled / overdue"})
    paid_date = fields.String(metadata={"description": "Payment date (ISO 8601)"})


class PayrollListResponseSchema(Schema):
    """GET /api/billing/payroll response."""
    payrolls = fields.List(fields.Nested(PayrollSchema))


class RecordPaymentResponseSchema(Schema):
    """POST /api/billing/record-payment response."""
    id = fields.String(metadata={"description": "Payment log ID"})
    billing_id = fields.String(metadata={"description": "Billing record ID"})
    amount = fields.Integer(metadata={"description": "Amount paid in DA"})
    payment_method = fields.String(metadata={"description": "Payment method"})
    paid_at = fields.String(metadata={"description": "Payment timestamp (ISO 8601)"})


# ── Money-model schemas ────────────────────────────────────────────

class SubscriptionPayResponseSchema(Schema):
    """POST /api/billing/subscriptions/pay response."""
    student_id = fields.String(metadata={"description": "Student ID"})
    total_da = fields.Integer(metadata={"description": "Total paid in DZD"})
    payment_method = fields.String(metadata={"description": "Payment method"})
    items = fields.List(fields.Dict, metadata={"description": "Per-group payment breakdown"})


class SubscriptionSchema(Schema):
    """Student subscription (backed by billing + enrollment records)."""
    id = fields.String(metadata={"description": "Subscription/billing record ID"})
    student_id = fields.String(metadata={"description": "Student ID"})
    student_name = fields.String(metadata={"description": "Student full name"})
    group_id = fields.String(metadata={"description": "Course group / class ID"})
    status = fields.String(metadata={"description": "active / due / overdue / paid"})
    amount_da = fields.Integer(metadata={"description": "Amount in DZD"})
    remaining_credits = fields.Integer(metadata={"description": "Remaining credits (if tracked)"})
    access_end = fields.String(metadata={"description": "Access end date (ISO 8601)"})


class SubscriptionListResponseSchema(Schema):
    """GET /api/billing/subscriptions response."""
    subscriptions = fields.List(fields.Nested(SubscriptionSchema))


class PayoutSchema(Schema):
    """Teacher payout (backed by payroll records)."""
    id = fields.String(metadata={"description": "Payout/payroll record ID"})
    teacher_id = fields.String(metadata={"description": "Teacher ID"})
    teacher_name = fields.String(metadata={"description": "Teacher full name"})
    amount_da = fields.Integer(metadata={"description": "Amount in DZD"})
    status = fields.String(metadata={"description": "pending / paid / settled"})
    period_start = fields.String(metadata={"description": "Period start (ISO 8601)"})
    period_end = fields.String(metadata={"description": "Period end (ISO 8601)"})


class PayoutListResponseSchema(Schema):
    """GET /api/billing/payouts response."""
    payouts = fields.List(fields.Nested(PayoutSchema))


class RevenueResponseSchema(Schema):
    """GET /api/billing/revenue response."""
    total_da = fields.Integer(metadata={"description": "Total revenue in DZD"})
    count = fields.Integer(metadata={"description": "Number of payments"})
    group_id = fields.String(metadata={"description": "Filter: group ID"})
    session_id = fields.String(metadata={"description": "Filter: session ID"})


class FinalizeSessionResponseSchema(Schema):
    """POST /api/billing/sessions/<id>/finalize response."""
    session_id = fields.String(metadata={"description": "Session ID"})
    status = fields.String(metadata={"description": "completed / cancelled"})
    conducted = fields.Boolean(metadata={"description": "Whether the session was conducted"})
