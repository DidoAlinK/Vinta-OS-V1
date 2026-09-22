"""
Vinta School OS — Standardized JSON Error Handlers
Consistent error response format across the entire API.
"""
from flask import jsonify


def register_error_handlers(app):
    """Register global error handlers for the Flask application."""

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request"}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({"error": "Unauthorized"}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": "Forbidden"}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(409)
    def conflict(e):
        return jsonify({"error": "Conflict"}), 409

    @app.errorhandler(422)
    def unprocessable_entity(e):
        return jsonify({"error": "Unprocessable entity"}), 422

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error"}), 500
