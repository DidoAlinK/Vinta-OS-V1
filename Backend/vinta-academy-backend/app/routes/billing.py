"""
Vinta School OS — Billing Blueprint
/api/billing — Payment Plans, Cycles, Installments, Overdue, Revenue
"""
from flask_smorest import Blueprint
from flask import request, jsonify
from flask_jwt_extended import jwt_required
from app.extensions import db
from app.utils.decorators import tenant_required, owner_only, verify_staff_pin
from app.utils.audit import log_activity
from app.services import billing_service
from app.schemas.billing import (
    CreatePlanRequestSchema, RecordPaymentRequestSchema,
    PaymentPlanListResponseSchema, StudentBillingListResponseSchema,
    BillingStatsResponseSchema, RevenueChartResponseSchema,
    AgingBucketsResponseSchema, PayrollListResponseSchema, RecordPaymentResponseSchema,
)
from app.schemas.base import ErrorSchema, MessageSchema

billing_bp = Blueprint("billing", __name__, description="Payment plans, billing cycles & payroll")


@billing_bp.route("/plans", methods=["GET"])
@jwt_required()
@tenant_required
def list_plans():
    """List all payment plans for the academy."""
    from flask import g
    plans = billing_service.list_payment_plans(g.current_academy_id)
    return jsonify({"plans": plans}), 200


@billing_bp.route("/plans", methods=["POST"])
@jwt_required()
@tenant_required
def create_plan():
    """
    Create a new payment plan.
    Body: { name, duration_days, amount_da }
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    required = ("name", "duration_days", "amount_da")
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    plan = billing_service.create_payment_plan(g.current_academy_id, data)
    db.session.commit()

    return jsonify({
        "id": plan.id,
        "name": plan.name,
        "duration_days": plan.duration_days,
        "amount_da": plan.amount_da,
    }), 201


@billing_bp.route("/students", methods=["GET"])
@jwt_required()
@tenant_required
def list_student_billings():
    """
    List billing records.
    Query params: student_id, status
    """
    from flask import g
    student_id = request.args.get("student_id")
    status = request.args.get("status")

    billings = billing_service.list_student_billings(
        g.current_academy_id, student_id, status
    )
    return jsonify({"billings": billings}), 200


@billing_bp.route("/record-payment", methods=["POST"])
@jwt_required()
@tenant_required
def record_payment():
    """
    Record a payment against a billing record.
    Body: { billing_id, amount, payment_method, notes? }
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    required = ("billing_id", "amount")
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    result = billing_service.record_payment(
        billing_id=data["billing_id"],
        amount=data["amount"],
        payment_method=data.get("payment_method", "cash"),
        recorded_by=g.current_user.id,
        academy_id=g.current_academy_id,
        notes=data.get("notes"),
    )
    if not result:
        return jsonify({"error": "Billing record not found"}), 404

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="payment",
        entity_id=data["billing_id"],
        action="payment_received",
        description=f"Payment of {data['amount']} received",
        metadata={"amount": data["amount"], "payment_method": data.get("payment_method", "cash")},
    )

    db.session.commit()
    return jsonify(result), 200


@billing_bp.route("/stats", methods=["GET"])
@jwt_required()
@tenant_required
def get_stats():
    """Get billing stats for the donut ring cards."""
    from flask import g
    stats = billing_service.get_billing_stats(g.current_academy_id)
    return jsonify(stats), 200


@billing_bp.route("/revenue-chart", methods=["GET"])
@jwt_required()
@tenant_required
def get_revenue_chart():
    """
    Get revenue chart data.
    Query params: months (default 6)
    """
    from flask import g
    months = request.args.get("months", 6, type=int)
    chart_data = billing_service.get_revenue_chart(g.current_academy_id, months)
    return jsonify({"chart_data": chart_data}), 200


@billing_bp.route("/aging-buckets", methods=["GET"])
@jwt_required()
@tenant_required
def get_aging_buckets():
    """Get overdue accounts classified into aging buckets."""
    from flask import g
    buckets = billing_service.get_aging_buckets(g.current_academy_id)
    return jsonify(buckets), 200


@billing_bp.route("/check-overdue", methods=["POST"])
@jwt_required()
@tenant_required
@owner_only
def check_overdue():
    """Trigger overdue status checks. Called by cron job."""
    from flask import g
    count = billing_service.check_overdue_billings(g.current_academy_id)
    db.session.commit()
    return jsonify({"overdue_count": count}), 200


@billing_bp.route("/renew-cycles", methods=["POST"])
@jwt_required()
@tenant_required
@owner_only
def renew_cycles():
    """Trigger billing cycle renewals. Called by cron job."""
    from flask import g
    count = billing_service.renew_billing_cycles(g.current_academy_id)
    db.session.commit()
    return jsonify({"renewed_count": count}), 200


# ── Teacher Payroll ─────────────────────────────────────────────────

@billing_bp.route("/payroll", methods=["GET"])
@jwt_required()
@tenant_required
def list_payroll():
    """
    List payroll records.
    Query params: teacher_id
    """
    from flask import g
    from app.services import payroll_service
    teacher_id = request.args.get("teacher_id")
    payrolls = payroll_service.list_teacher_payrolls(g.current_academy_id, teacher_id)
    return jsonify({"payrolls": payrolls}), 200


@billing_bp.route("/payroll/settle/<payroll_id>", methods=["POST"])
@jwt_required()
@tenant_required
def settle_payroll(payroll_id):
    """Mark a payroll record as settled (paid)."""
    from flask import g
    from app.services import payroll_service
    success = payroll_service.settle_payroll(
        payroll_id, g.current_academy_id, g.current_user.id
    )
    if not success:
        return jsonify({"error": "Payroll record not found"}), 404

    db.session.commit()
    return jsonify({"message": "Payroll settled"}), 200


# ═══════════════════════════════════════════════════════════════════
# VINTA SCHOOL OS — Money Model Endpoints
# Subscriptions, multi-pay, payouts, revenue, session finalization
# ═══════════════════════════════════════════════════════════════════

from app.utils.decorators import verify_staff_pin


@billing_bp.route("/subscriptions", methods=["GET"])
@jwt_required()
@tenant_required
def list_subscriptions():
    """
    List student subscriptions.
    Query params: student_id, group_id, status
    """
    from flask import g
    student_id = request.args.get("student_id")
    group_id = request.args.get("group_id")
    status = request.args.get("status")

    subs = billing_service.list_subscriptions(
        g.current_academy_id, student_id, group_id, status
    )
    return jsonify({"subscriptions": subs}), 200


@billing_bp.route("/subscriptions/pay", methods=["POST"])
@jwt_required()
@tenant_required
@verify_staff_pin
def pay_subscription():
    """
    Multi-teacher subscription payment.
    Body: { student_id, items: [{group_id, amount}], payment_method, pin }
    PIN verified by @verify_staff_pin decorator.
    """
    from flask import g
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    required = ("student_id", "items")
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    items = data.get("items", [])
    if not items:
        return jsonify({"error": "At least one payment item is required"}), 400

    total_received = sum(i.get("amount", 0) for i in items)
    method = data.get("payment_method", "CASH")

    try:
        receipt = billing_service.create_multi_payment(
            academy_id=g.current_academy_id,
            student_id=data["student_id"],
            items=items,
            total_received=total_received,
            method=method,
            staff_id=g.current_user.id,
        )
    except billing_service.MultiPaymentError as exc:
        # Nothing was charged: discard any partial flush (e.g. an Enrollment
        # created for an earlier line item) instead of committing it.
        db.session.rollback()
        return jsonify({"error": exc.message}), exc.status_code

    if not receipt:
        return jsonify({"error": "Payment failed"}), 400

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="subscription",
        entity_id=data["student_id"],
        action="payment_received",
        description=f"Multi-payment of {total_received} Da received",
        metadata={"amount": total_received, "method": method, "groups": len(items)},
    )

    db.session.commit()
    return jsonify(receipt), 201


@billing_bp.route("/subscriptions/<subscription_id>/renew", methods=["POST"])
@jwt_required()
@tenant_required
def renew_subscription(subscription_id):
    """
    Renew an expired/depleted subscription.
    Body: { pin } (optional)
    """
    from flask import g
    result = billing_service.renew_subscription(subscription_id, g.current_academy_id)
    if not result:
        return jsonify({"error": "Subscription not found"}), 404
    db.session.commit()
    return jsonify(result), 200


# ── Payouts (Teacher Dashboard) ────────────────────────────────────

@billing_bp.route("/payouts", methods=["GET"])
@jwt_required()
@tenant_required
def list_payouts():
    """
    List teacher payout records.
    Query params: teacher_id, status
    """
    from flask import g
    teacher_id = request.args.get("teacher_id")
    status = request.args.get("status")
    payouts = billing_service.list_payouts(
        g.current_academy_id, teacher_id, status
    )
    return jsonify({"payouts": payouts}), 200


@billing_bp.route("/payouts/<payout_id>/mark-paid", methods=["POST"])
@jwt_required()
@tenant_required
@owner_only
def mark_payout_paid(payout_id):
    """
    Mark a payout as PAID (owner-only).
    Body: { pin } — owner PIN verified.
    """
    from flask import g
    data = request.get_json() or {}
    pin = data.get("pin")
    if not pin or not g.current_user.verify_pin(pin):
        # 403 for a wrong PIN — a 401 is treated as "session expired" by the
        # axios interceptor (clears tokens + redirects), same as @verify_staff_pin.
        return jsonify({"error": "Owner PIN is required"}), 403

    result = billing_service.mark_payout_paid(
        payout_id, g.current_academy_id, g.current_user.id
    )
    if not result:
        return jsonify({"error": "Payout record not found"}), 404

    db.session.commit()
    return jsonify(result), 200


# ── Revenue ────────────────────────────────────────────────────────

@billing_bp.route("/revenue", methods=["GET"])
@jwt_required()
@tenant_required
def get_revenue():
    """
    Get revenue totals.
    Query params: group_id, session_id
    """
    from flask import g
    group_id = request.args.get("group_id")
    session_id = request.args.get("session_id")
    result = billing_service.get_revenue(
        g.current_academy_id, group_id, session_id
    )
    return jsonify(result), 200


# ── Session Finalization ───────────────────────────────────────────

@billing_bp.route("/sessions/<session_id>/finalize", methods=["POST"])
@jwt_required()
@tenant_required
@verify_staff_pin
def finalize_session(session_id):
    """
    "Is the class done?" flow.
    Body: { conducted: bool, pin }
    PIN verified by @verify_staff_pin.
    Yes → session becomes CONDUCTED, teacher payout computed.
    No → session becomes CANCELLED, no payout.
    """
    from flask import g
    data = request.get_json() or {}
    # `conducted` must be explicit: a missing field would otherwise fall
    # through to the cancel branch (status=cancelled + bulk-delete of the
    # session's RevenueEntry/PayoutRecord rows) and still report success.
    if "conducted" not in data:
        return jsonify({"error": "conducted is required"}), 400
    conducted = bool(data["conducted"])

    result = billing_service.finalize_session(
        session_id=session_id,
        conducted=conducted,
        academy_id=g.current_academy_id,
        staff_id=g.current_user.id,
    )

    if not result or "error" in result:
        return jsonify(result or {"error": "Session not found"}), 404

    log_activity(
        academy_id=g.current_academy_id,
        user_id=g.current_user.id,
        entity_type="session",
        entity_id=session_id,
        action="session_finalized",
        description=f"Session {'conducted' if conducted else 'cancelled'}",
        metadata={"conducted": conducted},
    )

    db.session.commit()
    return jsonify(result), 200
