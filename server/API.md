# MaroVarso API Reference

This document describes the API endpoints for the MaroVarso backend.

## Internationalization & Localization (i18n)

All success and error messages can be localized to English (`en`), Gujarati (`gu`), or Hindi (`hi`). The backend resolves the target language using one of the following mechanisms (in order of priority):
1. **Custom Header**: `x-custom-lang` (e.g., `x-custom-lang: gu`)
2. **Query Parameter**: `lang` or `l` (e.g., `/api/v1/auth/otp/request?lang=hi` or `/api/v1/auth/otp/request?l=gu`)
3. **Accept-Language Header**: `Accept-Language` (e.g., `Accept-Language: gu`)

If no language is explicitly requested, it defaults to English (`en`).

---

## Methods

### 1. Authentication: Request OTP
Generate and dispatch a numeric verification OTP code to the user's phone number.
Request

| Method | Endpoint |
| :--- | :--- |
| POST | /api/v1/auth/otp/request |

| Parameter | Type | Value Type | Description |
| :--- | :--- | :--- | :--- |
| phoneNumber | Body | String | Phone number without dialing code (7 to 15 digits). |
| countryCode | Body | String | Country dialing code with leading plus sign (e.g., +91). |

Response

| Status | Description | JSON Response Example |
| :--- | :--- | :--- |
| 200 | OK | `{"success": true, "code": "AUTH_OTP_SENT", "message": "OTP sent successfully.", "data": null}` |
| 400 | Cooldown Limit | `{"success": false, "code": "BAD_REQUEST", "message": "Please wait 30 second(s) before requesting a new OTP.", "errors": ["Please wait 30 second(s) before requesting a new OTP."]}` |
| 400 | Account Locked | `{"success": false, "code": "BAD_REQUEST", "message": "Login is temporarily locked due to too many attempts. Please try again after 30 minute(s).", "errors": ["Login is temporarily locked due to too many attempts. Please try again after 30 minute(s)."]}` |

---

### 2. Authentication: Resend OTP
Resend the active OTP code to the user's phone number if the cooldown period has elapsed.
Request

| Method | Endpoint |
| :--- | :--- |
| POST | /api/v1/auth/otp/resend |

| Parameter | Type | Value Type | Description |
| :--- | :--- | :--- | :--- |
| phoneNumber | Body | String | Phone number without dialing code (7 to 15 digits). |
| countryCode | Body | String | Country dialing code with leading plus sign (e.g., +91). |

Response

| Status | Description | JSON Response Example |
| :--- | :--- | :--- |
| 200 | OK | `{"success": true, "code": "AUTH_OTP_RESENT", "message": "OTP resent successfully.", "data": {"resendAttempt": 1}}` |
| 400 | No Active OTP | `{"success": false, "code": "BAD_REQUEST", "message": "No active OTP request found or it has expired. Please request a new OTP.", "errors": ["No active OTP request found or it has expired. Please request a new OTP."]}` |
| 400 | Max Attempts Exceeded | `{"success": false, "code": "BAD_REQUEST", "message": "Maximum resend attempts (3) exceeded. Login is locked for 30 minutes.", "errors": ["Maximum resend attempts (3) exceeded. Login is locked for 30 minutes."]}` |

---

### 3. Authentication: Verify OTP
Verify the OTP code, perform passwordless registration (auto-signup) or login, and issue session tokens.
Request

| Method | Endpoint |
| :--- | :--- |
| POST | /api/v1/auth/otp/verify |

| Parameter | Type | Value Type | Description |
| :--- | :--- | :--- | :--- |
| phoneNumber | Body | String | Phone number without dialing code (7 to 15 digits). |
| countryCode | Body | String | Country dialing code with leading plus sign (e.g., +91). |
| otp | Body | String | The 6-digit OTP code received by the user. |

Response

| Status | Description | JSON Response Example |
| :--- | :--- | :--- |
| 200 | OK | `{"success": true, "code": "AUTH_SUCCESS", "message": "Authentication successful.", "data": {"isNewUser": false, "accessToken": "eyJhbGci...", "refreshToken": "eyJhbGci...", "user": {"id": "d08fa671-87ab-...", "phoneNumber": "9876543210", "countryCode": "+91", "fullName": null, "isActive": true, "isVerified": true, "createdAt": "2026-05-30T15:23:00.000Z", "updatedAt": "2026-05-30T15:23:00.000Z"}}}` |
| 400 | Invalid OTP | `{"success": false, "code": "AUTH_INVALID_OTP", "message": "Invalid OTP.", "errors": ["Invalid OTP."]}` |
| 400 | Expired OTP | `{"success": false, "code": "AUTH_OTP_EXPIRED", "message": "OTP has expired.", "errors": ["OTP has expired."]}` |
| 400 | Account Locked | `{"success": false, "code": "BAD_REQUEST", "message": "Too many failed attempts. Login is locked for 30 minutes.", "errors": ["Too many failed attempts. Login is locked for 30 minutes."]}` |

---

### 4. Authentication: Refresh Token
Verify the active Refresh Token and issue a new session Access Token.
Request

| Method | Endpoint |
| :--- | :--- |
| POST | /api/v1/auth/token/refresh |

| Parameter | Type | Value Type | Description |
| :--- | :--- | :--- | :--- |
| refreshToken | Body | String | The Refresh Token issued during verification. |

Response

| Status | Description | JSON Response Example |
| :--- | :--- | :--- |
| 200 | OK | `{"success": true, "code": "TOKENS_REFRESHED", "message": "Tokens refreshed successfully.", "data": {"accessToken": "eyJhbGci..."}}` |
| 401 | Unauthorized | `{"success": false, "code": "AUTH_UNAUTHORIZED", "message": "You are not authorized.", "errors": ["You are not authorized."]}` |

---

### 5. Authentication: Logout
Performs standard stateless session logout cleanup.
Request

| Method | Endpoint |
| :--- | :--- |
| POST | /api/v1/auth/logout |

Response

| Status | Description | JSON Response Example |
| :--- | :--- | :--- |
| 200 | OK (First Hit) | `{"success": true, "code": "LOGOUT_SUCCESS", "message": "Logged out successfully.", "data": null}` |
| 200 | OK (Subsequent Hits) | `{"success": true, "code": "ALREADY_LOGGED_OUT", "message": "Already logged out.", "data": null}` |

---

### 6. Users: Get Profile
Retrieve the active user profile details. Requires Bearer Authentication.
Request

| Method | Endpoint |
| :--- | :--- |
| GET | /api/v1/auth/me |

Response

| Status | Description | JSON Response Example |
| :--- | :--- | :--- |
| 200 | OK | `{"success": true, "code": "SUCCESS", "message": "Operation successful", "data": {"id": "d08fa671-87ab-...", "phoneNumber": "9876543210", "countryCode": "+91", "fullName": null, "isActive": true, "isVerified": true, "createdAt": "2026-05-30T15:23:00.000Z", "updatedAt": "2026-05-30T15:23:00.000Z"}}` |
| 401 | Unauthorized | `{"success": false, "code": "AUTH_UNAUTHORIZED", "message": "You are not authorized.", "errors": ["You are not authorized."]}` |

---

### 7. Health: Check Operational Status
Get backend application operational status.
Request

| Method | Endpoint |
| :--- | :--- |
| GET | /api/v1/health |

Response

| Status | Description | JSON Response Example |
| :--- | :--- | :--- |
| 200 | OK | `{"status": "ok"}` |
