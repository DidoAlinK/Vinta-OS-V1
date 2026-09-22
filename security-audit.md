# Security Audit Report — Vinta School OS

## Date: 2026-09-09
## Scope: Backend API (Flask + SQLAlchemy + JWT)

Audited files:
- `app/__init__.py`, `app/config.py`, `app/extensions.py`, `run.py`
- `app/models/` (10 files)
- `app/routes/` (10 files)
- `app/services/` (8 files)
- `app/schemas/` (12 files)
- `app/utils/` (4 files)
- `.env`, `requirements.txt`

---

## Critical Findings

### C-01: Hardcoded Fallback JWT Secret — Token Forgery

| | |
|---|---|
| **File** | `app/config.py` lines 15, 19 |
| **Description** | `SECRET_KEY` and `JWT_SECRET_KEY` fall back to hardcoded strings (`"vinta-change-this-in-production"` and `"vinta-jwt-change-this"`) when environment variables are not set. If the `.env` file is not loaded (e.g., misconfigured deployment, container without env injection), these predictable values are used as HMAC signing keys. |
| **Impact** | An attacker can forge valid JWT access tokens with arbitrary `academy_id` and `role` claims, gaining full administrative access to any academy. This completely bypasses all authentication and authorization controls. |
| **Risk** | **Critical** |

### C-02: SocketIO CORS Wildcard — Cross-Origin WebSocket Hijack

| | |
|---|---|
| **File** | `app/__init__.py` line 34 |
| **Description** | `socketio.init_app(app, cors_allowed_origins="*")` allows any origin to establish a WebSocket connection. |
| **Impact** | An attacker's website can open a WebSocket to the backend, potentially receiving real-time broadcast notifications (e.g., payment alerts, attendance events) intended for authenticated users, or sending spoofed messages if SocketIO event handlers trust the connection. |
| **Risk** | **Critical** |

### C-03: No Rate Limiting on Authentication Endpoints — Brute Force

| | |
|---|---|
| **File** | `app/routes/auth.py` lines 43–54 (`/login`), lines 94–117 (`/verify-pin`) |
| **Description** | The `/login` (email + password) and `/verify-pin` (PIN authentication) endpoints have no rate limiting, account lockout, or progressive delay. |
| **Impact** | An attacker can brute-force owner passwords (which have no complexity enforcement in schemas) or 4-digit PINs (only 10,000 combinations) at full speed. With bcrypt verification taking ~100ms per attempt, a 4-digit PIN can be cracked in ~17 minutes on a single core. |
| **Risk** | **Critical** |

### C-04: Unauthenticated PIN-Based Token Issuance

| | |
|---|---|
| **File** | `app/routes/auth.py` lines 94–117 (`verify-pin`), `app/services/auth_service.py` lines 37–59 |
| **Description** | The `/api/auth/verify-pin` endpoint issues JWT tokens (full `access_token` with `academy_id` and `role` claims) using only a `user_id` and 4-digit PIN — no prior authentication required. The only protection is the `X-Academy-Id` header, which the attacker controls. |
| **Impact** | Combined with C-03 (no rate limiting) and the short PIN space, an attacker can enumerate user IDs and brute-force PINs to obtain valid JWT tokens for any user in the system, including owners. |
| **Risk** | **Critical** |

### C-05: No Token Revocation or Logout Mechanism

| | |
|---|---|
| **File** | `app/routes/auth.py` (missing `/logout`), `app/services/auth_service.py` |
| **Description** | There is no endpoint to invalidate tokens, no token blacklist, no refresh token rotation, and no server-side session management. JWT tokens are valid for their full TTL once issued. |
| **Impact** | If a token is compromised (theft, leak, XSS), it remains valid for up to 24 hours (access token) or 30 days (refresh token). There is no way to forcibly log out a user or revoke access. |
| **Risk** | **Critical** |

### C-06: Bootstrap Endpoints Create Owner Without Authentication

| | |
|---|---|
| **File** | `app/routes/auth.py` lines 120–165 (`/create-owner`), lines 22–40 (`/signup`) |
| **Description** | Both `/api/auth/signup` and `/api/auth/create-owner` are completely unauthenticated — no JWT, no CAPTCHA, no email verification, no rate limiting. The only protection is that `/create-owner` requires the `X-Academy-Id` header to match the body. |
| **Impact** | An attacker who discovers (or guesses) an `academy_id` can create an owner account for that academy, gaining full control. Combined with C-04, this allows complete account takeover of any academy. |
| **Risk** | **Critical** |

---

## High Findings

### H-01: CORS Default Wildcard Origin

| | |
|---|---|
| **File** | `app/config.py` line 27 |
| **Description** | `CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")` defaults to allowing all origins. If `CORS_ORIGINS` is not set in the environment, the API accepts requests from any domain. |
| **Impact** | Any malicious website can make authenticated API requests using the victim's stored JWT tokens (via `Authorization` header or cookies), enabling data exfiltration and state-changing operations. |
| **Risk** | **High** |

### H-02: Exception Messages Leaked to Clients

| | |
|---|---|
| **File** | `app/routes/auth.py` lines 40, 165, 210; `app/routes/students.py` line 90; `app/routes/analytics.py` line 134 |
| **Description** | Multiple endpoints catch generic `Exception` and return `str(e)` to the client: `return jsonify({"error": str(e)}), 500`. |
| **Impact** | Python exception messages can contain database connection strings, file paths, SQL query fragments, or internal stack trace information. This provides attackers with reconnaissance data about the backend infrastructure. |
| **Risk** | **High** |

### H-03: Mass Assignment via `setattr()` Without Field Allowlisting

| | |
|---|---|
| **File** | `app/routes/teachers.py` lines 194–197, `app/routes/classes.py` lines 196–198, `app/routes/settings.py` lines 60–63, 146–149, 277–279, 334–336 |
| **Description** | Multiple update endpoints iterate over user-supplied JSON keys and apply them directly via `setattr()` using a hardcoded tuple. While the field list is explicit, the lack of type validation means an attacker can set fields to unexpected types (e.g., setting `capacity` to a string, `role` to an arbitrary value). |
| **Impact** | In `settings.py` line 277–279 (`update_staff`), the `role` field can be set to `"owner"` by any owner, granting unauthorized privilege escalation to another user. In `settings.py` line 334–336 (`update_profile`), a user can change their own `role` to `"owner"`. |
| **Risk** | **High** |

### H-04: Role Escalation in Profile Creation

| | |
|---|---|
| **File** | `app/routes/auth.py` lines 195–200 (`create_profile`), `app/routes/settings.py` lines 250–256 (`add_staff`) |
| **Description** | Both endpoints accept a `role` parameter from the request body and pass it to `tenant_service.create_staff_profile()` without restricting it to `"staff"`. An owner could set `role: "owner"` for any new profile. |
| **Impact** | Creates additional owner accounts that bypass the "only one owner" check in `/create-owner`. Multiple owners can modify billing, academy settings, and other sensitive configurations. |
| **Risk** | **High** |

### H-05: Unprotected Sensitive Cron Endpoints

| | |
|---|---|
| **File** | `app/routes/attendance.py` lines 78–100 (`/auto-checkout`), `app/routes/billing.py` lines 146–154 (`/check-overdue`), lines 157–165 (`/renew-cycles`) |
| **Description** | Endpoints designed for cron job invocation (`/api/attendance/auto-checkout`, `/api/billing/check-overdue`, `/api/billing/renew-cycles`) are accessible to any authenticated user (staff or owner) and can be triggered repeatedly. |
| **Impact** | A malicious staff member can force-checkout students from sessions, mark billings as overdue, or create duplicate billing cycles. There are no idempotency guards or confirmation checks. |
| **Risk** | **High** |

### H-06: No Schema Validation on Most CRUD Endpoints

| | |
|---|---|
| **File** | `app/routes/students.py` (all endpoints), `app/routes/teachers.py` (all), `app/routes/classes.py` (all), `app/routes/attendance.py` (all), `app/routes/billing.py` (all), `app/routes/notifications.py` (all) |
| **Description** | Marshmallow schemas exist in `app/schemas/` but are not applied to most route handlers. Routes manually read `request.get_json()` and do ad-hoc field checks instead of using `@arguments()` and `@response()` decorators consistently. |
| **Impact** | No type validation, no string length limits, no format validation (e.g., email, phone, UUID). Attackers can submit arbitrarily large strings, unexpected types, or malformed data that may cause application errors or database issues. |
| **Risk** | **High** |

### H-07: Exposed Swagger/OpenAPI Documentation

| | |
|---|---|
| **File** | `app/__init__.py` lines 18–27 |
| **Description** | Swagger UI is mounted at `/api/docs/` with no authentication or environment check. The complete API schema (endpoints, parameters, response shapes) is publicly accessible. |
| **Impact** | Provides attackers with a complete map of the API attack surface, including undocumented parameter expectations and internal data models, without needing to reverse-engineer the application. |
| **Risk** | **High** |

---

## Medium Findings

### M-01: Insecure Debug Mode in Production

| | |
|---|---|
| **File** | `run.py` lines 14–16, `app/config.py` lines 52–56 |
| **Description** | `socketio.run(app, debug=app.config.get("DEBUG", False))` and `app.run(debug=...)` use the config `DEBUG` flag. While `ProductionConfig` sets `DEBUG = False`, if the `FLASK_ENV` environment variable is not set correctly (defaults to `"development"` per `run.py` line 8), the app runs with `DEBUG=True`. |
| **Impact** | Debug mode enables the Werkzeug interactive debugger, which allows arbitrary Python code execution from the browser if the debugger PIN is discovered or if the debugger is exposed to the network. |
| **Risk** | **Medium** |

### M-02: No CORS Restrictions on API Documentation

| | |
|---|---|
| **File** | `app/__init__.py` lines 18–27, `app/__init__.py` line 33 |
| **Description** | The OpenAPI/Swagger documentation endpoint at `/api/docs/` is covered by the CORS policy. With the wildcard default (H-01), any origin can fetch the full API schema. |
| **Impact** | Cross-origin JavaScript can enumerate all endpoints and build targeted attacks using the discovered API structure. |
| **Risk** | **Medium** |

### M-03: No Input Length Validation

| | |
|---|---|
| **File** | All route files using `request.get_json()` without schema validation |
| **Description** | No maximum length is enforced on string inputs (names, notes, descriptions, email, phone). Database column limits exist (e.g., `String(255)`) but are enforced only at the database level, resulting in raw database errors being returned to clients. |
| **Impact** | Extremely large payloads can cause memory exhaustion, database errors, or degraded performance. Database error messages may leak table/column names. |
| **Risk** | **Medium** |

### M-04: Pagination Bypass — Unbounded `per_page`

| | |
|---|---|
| **File** | `app/routes/students.py` lines 30–31 |
| **Description** | `per_page = request.args.get("per_page", 50, type=int)` has no upper bound. Although `BaseConfig.MAX_PAGE_SIZE = 100` is defined, it is never enforced in the route handler. |
| **Impact** | An attacker can request `per_page=999999`, causing the database to load all student records into memory in a single query, leading to denial of service. |
| **Risk** | **Medium** |

### M-05: No Input Validation on Calendar Date Parameters

| | |
|---|---|
| **File** | `app/routes/calendar.py` lines 31–33, 57 |
| **Description** | `date.fromisoformat(date_str)` is called on user input without try/except. Malformed date strings will raise `ValueError` with an unformatted stack trace. |
| **Impact** | Unhandled exceptions leak internal error details and stack traces to the client, potentially revealing file paths and code structure. |
| **Risk** | **Medium** |

### M-06: Database Root User Used in Application

| | |
|---|---|
| **File** | `.env` line 9, `app/config.py` lines 30–33 |
| **Description** | The database connection string uses `root:password@localhost:3306/vinta_school_dev`. The application connects as MySQL root with full privileges. |
| **Impact** | If SQL injection were ever introduced, the attacker would have unrestricted database access including `DROP TABLE`, `LOAD DATA INFILE`, and access to all databases on the server. |
| **Risk** | **Medium** |

### M-07: Overly Long Token Expiration

| | |
|---|---|
| **File** | `app/config.py` lines 20–21 |
| **Description** | `JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)` and `JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)`. Access tokens are valid for 24 hours; refresh tokens for 30 days. |
| **Impact** | A stolen access token provides 24 hours of unrestricted access. A stolen refresh token can generate new access tokens for 30 days. With no revocation mechanism (C-05), this window cannot be shortened. |
| **Risk** | **Medium** |

### M-08: No Refresh Token Rotation

| | |
|---|---|
| **File** | `app/services/auth_service.py` lines 19–26, `app/routes/auth.py` (no `/refresh` endpoint) |
| **Description** | While refresh tokens are issued during login, there is no `/refresh` endpoint, no refresh token rotation, and no token family tracking. The refresh token is returned but never used by the application. |
| **Impact** | The refresh token mechanism is effectively unused. If implemented client-side, refresh tokens could be replayed indefinitely for 30 days. |
| **Risk** | **Medium** |

### M-09: Missing Security Headers

| | |
|---|---|
| **File** | `app/__init__.py` (entire file — no security headers configured) |
| **Description** | No security headers are set: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, `X-XSS-Protection`, `Referrer-Policy`. Flask does not set these by default. |
| **Impact** | The application is vulnerable to clickjacking (`X-Frame-Options` missing), MIME sniffing attacks (`X-Content-Type-Options` missing), and downgrade attacks (no HSTS). |
| **Risk** | **Medium** |

### M-10: Unvalidated Notification Creation — Cross-User Notification Spoofing

| | |
|---|---|
| **File** | `app/routes/notifications.py` lines 124–159 (`create_notification`) |
| **Description** | Any authenticated user (staff or owner) can create notifications for any `user_id` within the academy, or broadcast to all users, without any authorization check beyond basic authentication. |
| **Impact** | A malicious staff member can create fake notifications (e.g., fake payment reminders, fake alerts) targeted at the academy owner or broadcast to all staff, enabling social engineering attacks. |
| **Risk** | **Medium** |

### M-11: Staff Can Create Notifications for Owner

| | |
|---|---|
| **File** | `app/routes/notifications.py` lines 124–159 |
| **Description** | The `user_id` field in the notification creation body is accepted without validating whether the requesting user has authority to send notifications to the specified target. |
| **Impact** | A staff user can impersonate system notifications to the academy owner, potentially triggering social engineering or phishing within the application. |
| **Risk** | **Medium** |

### M-12: No PIN Complexity or Length Enforcement

| | |
|---|---|
| **File** | `app/schemas/auth.py` line 25, 34, 40, 48, 49; `app/schemas/settings.py` line 44 |
| **Description** | PIN fields are declared as `fields.String()` with no min/max length, no regex validation, and no numeric-only constraint. The comment says "4-6 digit PIN" but this is not enforced. |
| **Impact** | Users can set 1-character PINs (e.g., "1"), trivially brutable PINs (e.g., "1111"), or non-numeric PINs. The 10,000 combinations for a 4-digit PIN are insufficient without rate limiting. |
| **Risk** | **Medium** |

---

## Low Findings

### L-01: Information Disclosure in Error Handlers

| | |
|---|---|
| **File** | `app/utils/error_handlers.py` lines 13, 17, 21, 25 |
| **Description** | Generic error handlers include `str(e.description)` in the response body. For 400 errors, Flask's Werkzeug may include the malformed request URL or parameter names. |
| **Impact** | Minor information disclosure about request structure and server-side routing. |
| **Risk** | **Low** |

### L-02: SQL Echo in Development Logs Sensitive Data

| | |
|---|---|
| **File** | `app/config.py` line 56 |
| **Description** | `SQLALCHEMY_ECHO = True` in `DevelopmentConfig` logs all SQL queries including parameter values. This may log sensitive data such as PIN hashes, passwords (during hashing), and personal information. |
| **Impact** | If development logs are accessible (e.g., shared log files, cloud logging), sensitive data including password hashes may be exposed. |
| **Risk** | **Low** |

### L-03: User Email Exposed in `/api/auth/me` and Settings

| | |
|---|---|
| **File** | `app/routes/auth.py` lines 242–251, `app/routes/settings.py` lines 311–319 |
| **Description** | The `/api/auth/me` endpoint returns the user's `email` field. Staff users (who don't log in with email) have `email=""` but this is still exposed. |
| **Impact** | Minor information exposure. For staff accounts, the empty string is not harmful but reveals implementation details. |
| **Risk** | **Low** |

### L-04: No CSRF Protection on State-Changing Endpoints

| | |
|---|---|
| **File** | All `POST`, `PUT`, `DELETE`, `PATCH` routes |
| **Description** | No CSRF tokens are used. The application relies solely on JWT in `Authorization` headers for state modification. If tokens are ever stored in cookies (not currently the case), CSRF would be exploitable. |
| **Impact** | Currently mitigated by header-based JWT usage. Risk materializes if token storage mechanism changes to cookies. |
| **Risk** | **Low** |

### L-05: CSV Export Filename Not Sanitized

| | |
|---|---|
| **File** | `app/routes/analytics.py` line 124 |
| **Description** | `filename = f"chart_{chart_type}.csv"` uses user-supplied `chart_type` query parameter in the `Content-Disposition` header without sanitization. |
| **Impact** | A crafted `chart_type` value could inject HTTP header characters (e.g., newlines for header injection) or path traversal sequences in the filename. Modern browsers mitigate this, but it violates secure coding practices. |
| **Risk** | **Low** |

### L-06: `delete_student` Performs Soft Delete But Model Uses `db.session.delete()`

| | |
|---|---|
| **File** | `app/services/student_service.py` lines 140–165 |
| **Description** | The function name says "soft-delete" but actually calls `db.session.delete(student)` for a hard delete. Enrollments are withdrawn first (soft), but the student record itself is permanently deleted. |
| **Impact** | Audit logs reference deleted student IDs, creating orphan references. Financial/billing history tied to the student may become difficult to trace. Not a direct security issue but a data integrity concern. |
| **Risk** | **Low** |

### L-07: UUID Generation Not Using Cryptographic Random

| | |
|---|---|
| **File** | All model files (default `lambda: str(uuid.uuid4())`) |
| **Description** | `uuid.uuid4()` uses `os.urandom()` which is cryptographically secure on modern systems. However, if the Python version or OS has a weak CSPRNG, UUIDs could be predictable. |
| **Impact** | Predictable UUIDs would allow enumeration of student IDs, billing IDs, and other records. Current risk is low due to modern OS CSPRNG quality. |
| **Risk** | **Low** |

---

## Recommendations

### Immediate (Critical — Fix Before Any Deployment)

1. **Eliminate hardcoded secrets**: Remove all fallback secret keys from `config.py`. Fail fast with a clear error if `SECRET_KEY` or `JWT_SECRET_KEY` are not set in the environment. Use a secrets manager in production.

2. **Add rate limiting**: Implement `Flask-Limiter` on all authentication endpoints:
   - `/api/auth/login`: 5 attempts/minute per IP
   - `/api/auth/verify-pin`: 5 attempts/minute per `user_id`
   - `/api/auth/create-owner`: 3 attempts/minute per IP
   - `/api/auth/signup`: 3 attempts/minute per IP

3. **Implement token revocation**: Add a token blacklist (Redis-backed) or implement short-lived access tokens with refresh token rotation. Add a `/logout` endpoint that blacklists the current token.

4. **Restrict SocketIO CORS**: Replace `cors_allowed_origins="*"` with the same origin whitelist used for HTTP CORS:
   ```python
   socketio.init_app(app, cors_allowed_origins=app.config.get("CORS_ORIGINS", "").split(","))
   ```

5. **Protect bootstrap endpoints**: Add CAPTCHA verification and email confirmation to `/signup` and `/create-owner`. Restrict `/create-owner` to a time-limited token issued during signup.

### High Priority

6. **Enforce role restrictions**: In `create_profile`, `add_staff`, and `update_staff`, strip or ignore the `role` parameter — only allow setting `"staff"`. Creating additional owners should require a separate, more privileged flow.

7. **Add schema validation to all routes**: Apply `@arguments()` and `@response()` decorators consistently across all CRUD endpoints. Use Marshmallow validation (min/max length, regex patterns, type constraints).

8. **Remove generic exception exposure**: Replace all `except Exception as e: return jsonify({"error": str(e)})` with:
   ```python
   except Exception:
       app.logger.exception("Unhandled error in <endpoint>")
       return jsonify({"error": "Internal server error"}), 500
   ```

9. **Gate Swagger UI by environment**: Only expose OpenAPI documentation in development/testing:
   ```python
   if config_name != "production":
       app.config["OPENAPI_URL_PREFIX"] = "/api/docs"
   else:
       app.config["OPENAPI_URL_PREFIX"] = None
   ```

10. **Enforce pagination limits**: Apply `MAX_PAGE_SIZE` in the route handlers:
    ```python
    per_page = min(request.args.get("per_page", 50, type=int), current_app.config["MAX_PAGE_SIZE"])
    ```

### Medium Priority

11. **Add security headers**: Use `Flask-Talisman` or manually set headers:
    ```
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    Strict-Transport-Security: max-age=31536000; includeSubDomains
    Content-Security-Policy: default-src 'self'
    ```

12. **Reduce token lifetimes**: Consider shorter access token expiry (15–60 minutes) with proper refresh token rotation.

13. **Enforce PIN complexity**: Add validation:
    ```python
    pin = fields.String(required=True, validate=validate.Length(min=4, max=6, error="PIN must be 4-6 digits"))
    ```

14. **Protect admin-only endpoints**: `/billing/check-overdue`, `/billing/renew-cycles`, and `/attendance/auto-checkout` should require owner role or an API key for cron job authentication.

15. **Use a dedicated database user**: Create a MySQL user with only `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the application schema — not `root`.

### Low Priority

16. **Add request ID tracking**: Include a unique request ID in all responses for debugging and audit correlation.

17. **Sanitize CSV export filenames**: Whitelist allowed `chart_type` values.

18. **Implement structured logging**: Replace SQL echo with structured application logging that redacts sensitive fields.

19. **Add API versioning strategy**: Plan for backward-compatible API versioning to handle breaking changes without downtime.

20. **Add health check endpoint**: Create an unauthenticated `/health` endpoint for monitoring that does not expose sensitive information.

---

## Frontend Security Findings

### F-01: JWT Tokens Stored in localStorage — XSS Vulnerability

| | |
|---|---|
| **File** | `src/lib/api.ts` (tokenStorage), `src/stores/authStore.ts` |
| **Description** | Access tokens and refresh tokens are stored in `localStorage`. If an XSS vulnerability exists anywhere in the application, an attacker can read `localStorage` and steal JWT tokens. |
| **Impact** | Token theft enables full account impersonation. Unlike `httpOnly` cookies, JavaScript can access localStorage freely. |
| **Risk** | **High** |

### F-02: No Content Security Policy (CSP)

| | |
|---|---|
| **File** | `index.html`, `vite.config.ts` |
| **Description** | No CSP headers are configured. The application does not restrict which scripts, styles, or sources can load. |
| **Impact** | Increases XSS attack surface and allows loading of external malicious scripts. |
| **Risk** | **High** |

### F-03: Mock Authentication Bypass in Development

| | |
|---|---|
| **File** | `src/stores/authStore.ts` (loadUser function) |
| **Description** | The `loadUser` function accepts tokens starting with `mock-` and reads user data directly from localStorage without server verification. |
| **Impact** | If this code ships to production, any user can bypass authentication by setting a mock token in localStorage. |
| **Risk** | **High** (if shipped to production) |

### F-04: Sensitive Data in Console Logs

| | |
|---|---|
| **File** | Multiple components (`DashboardPage.tsx`, `SettingsPage.tsx`, `TeachersPage.tsx`) |
| **Description** | API errors and state data are logged to `console.error()` and `console.log()`. In production, this can leak sensitive information to anyone with browser dev tools. |
| **Impact** | Information disclosure of API endpoints, error messages, and application state. |
| **Risk** | **Medium** |

### F-05: No CSRF Protection on API Calls

| | |
|---|---|
| **File** | `src/lib/api.ts` |
| **Description** | API calls use JWT Bearer tokens but do not implement CSRF tokens or SameSite cookie policies. While JWT in headers is generally CSRF-safe, the token storage in localStorage combined with no CSP increases risk. |
| **Impact** | If combined with XSS, CSRF attacks become trivial. |
| **Risk** | **Medium** |

### F-06: External Font Loading Without SRI

| | |
|---|---|
| **File** | `index.html` |
| **Description** | Google Fonts are loaded via external CDN without Subresource Integrity (SRI) hashes. |
| **Impact** | If the CDN is compromised, malicious fonts/CSS could be served. |
| **Risk** | **Low** |

---

## Summary

| Severity | Count | Key Theme |
|----------|-------|-----------|
| Critical | 6 | Token forgery, brute force, unauthenticated account creation |
| High | 9 | Mass assignment, role escalation, missing validation, localStorage token theft, missing CSP |
| Medium | 14 | Debug exposure, input validation, security headers, token lifetime, CSRF, console leaks |
| Low | 4 | SRI, request tracking, CSV sanitization |
| Low | 7 | Error disclosure, CSRF edge cases, data integrity |

**Overall Assessment**: The application has a solid architectural foundation (multi-tenant isolation, audit logging, role-based access control patterns) but has critical authentication and authorization weaknesses that must be addressed before any production deployment. The most urgent issues are the predictable JWT fallback secrets, lack of rate limiting on authentication endpoints, and the ability to forge tokens via the unauthenticated PIN verification endpoint.
