"""
Vinta School OS — Application Factory
Creates and configures the Flask application with all extensions and blueprints.
"""
from flask import Flask
from app.config import config_by_name
from app.extensions import db, migrate, jwt, cors, socketio, api, limiter


def create_app(config_name="development"):
    """Application factory pattern."""
    from app.config import validate_config
    validate_config()

    app = Flask(__name__)
    app.config.from_object(config_by_name[config_name])

    # API Documentation config
    app.config["API_TITLE"] = "Vinta School OS API"
    app.config["API_VERSION"] = "v1"
    app.config["OPENAPI_VERSION"] = "3.1.0"

    # Gate Swagger UI in production (H-07)
    if config_name != "production":
        app.config["OPENAPI_URL_PREFIX"] = "/api/docs"
        app.config["OPENAPI_JSON_PATH"] = "openapi.json"
        app.config["OPENAPI_SWAGGER_UI_PATH"] = "/"
        app.config["OPENAPI_SWAGGER_UI_URL"] = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/"
        app.config["OPENAPI_SWAGGER_UI_CONFIG"] = {"docExpansion": "none"}
        app.config["OPENAPI_REDOC_URL"] = None
        app.config["OPENAPI_RAPIDOC_URL"] = None
    else:
        app.config["OPENAPI_URL_PREFIX"] = None

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS", "")}})
    limiter.init_app(app)
    # Disable rate limiter in test environment
    if app.config.get("TESTING"):
        limiter.enabled = False

    # SocketIO CORS — use configured origins instead of wildcard
    cors_origins = app.config.get("CORS_ORIGINS", "")
    allowed = [o.strip() for o in cors_origins.split(",") if o.strip()] if cors_origins else ["http://localhost:5173"]
    socketio.init_app(app, cors_allowed_origins=allowed)

    api.init_app(app)

    # Enable SQLite foreign key enforcement (required for ON DELETE CASCADE)
    @app.before_request
    def _ensure_sqlite_fk():
        from sqlalchemy import text
        engine = db.engine
        if "sqlite" in str(engine.url):
            with engine.connect() as conn:
                conn.execute(text("PRAGMA foreign_keys=ON"))

    # JWT token blocklist callback (C-05)
    from app.utils.token_blacklist import is_token_blacklisted

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload["jti"]
        return is_token_blacklisted(jti)

    # Security headers middleware
    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if config_name == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    # Register error handlers
    from app.utils.error_handlers import register_error_handlers
    register_error_handlers(app)

    # Register blueprints
    _register_blueprints(app)

    # Shell context
    _register_shell_context(app)

    return app


def _register_blueprints(app):
    """Register all API blueprints."""
    from app.routes.auth import auth_bp
    from app.routes.students import students_bp
    from app.routes.teachers import teachers_bp
    from app.routes.classes import classes_bp
    from app.routes.calendar import calendar_bp
    from app.routes.attendance import attendance_bp
    from app.routes.billing import billing_bp
    from app.routes.analytics import analytics_bp
    from app.routes.settings import settings_bp
    from app.routes.notifications import notifications_bp

    # Register with smorest api for documentation
    api.register_blueprint(auth_bp, url_prefix="/api/auth", name="Auth")
    api.register_blueprint(students_bp, url_prefix="/api/students", name="Students")
    api.register_blueprint(teachers_bp, url_prefix="/api/teachers", name="Teachers")
    api.register_blueprint(classes_bp, url_prefix="/api", name="Classes")
    api.register_blueprint(calendar_bp, url_prefix="/api", name="Calendar")
    api.register_blueprint(attendance_bp, url_prefix="/api/attendance", name="Attendance")
    api.register_blueprint(billing_bp, url_prefix="/api/billing", name="Billing")
    api.register_blueprint(analytics_bp, url_prefix="/api/analytics", name="Analytics")
    api.register_blueprint(settings_bp, url_prefix="/api/settings", name="Settings")
    api.register_blueprint(notifications_bp, url_prefix="/api/notifications", name="Notifications")


def _register_shell_context(app):
    """Register shell context objects."""
    from app.models import academy, user, student, teacher  # noqa: F401
    from app.models import class_room, scheduling, attendance  # noqa: F401
    from app.models import billing, audit, notification  # noqa: F401

    @app.shell_context_processor
    def make_shell_context():
        return dict(db=db)
