# MaroVarso OTP Verification & JWT Authentication System Documentation

This document provides a professional, step-by-step breakdown of the passwordless OTP authentication, security lockout mechanisms, and JWT-based session logic implemented in the MaroVarso backend.

---

## 1. Core Architecture Overview
The system implements a secure, stateless, passwordless authentication model using mobile phone numbers:
* **No Passwords**: Users verify their identity using a one-time 6-digit passcode sent to their registered phone number.
* **Auto-Provisioning**: New users are registered dynamically on successful OTP verification (`isNewUser` flag returned to client).
* **Double-Token JWT Setup**: Provides short-lived Access Tokens for route validation and long-lived Refresh Tokens for silent session prolongation.
* **Brute-Force Safeguards**: Employs mandatory rate limits, cooldown durations, and lockout durations to block bulk automated verification attempts.

---

## 2. Database Models & Prisma Entities
Three PostgreSQL tables manage authentication state via Prisma ORM:

### 1. `User` ([`users`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/prisma/schema.prisma#L10))
* **Primary Key**: `id` (Auto-generated UUID).
* **Identifiers**: `phoneNumber` (unique key) and `countryCode` (e.g. `+91`).
* **Attributes**: `fullName`, `isActive` (boolean to control blocklisting), `isVerified` (boolean flagging successful validation).
* **Timestamps**: `createdAt` and `updatedAt`.

### 2. `Otp` ([`otps`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/prisma/schema.prisma#L23))
* **Attributes**: 
  * `id`: UUID token transaction tracker.
  * `phoneNumber`: Associated mobile number.
  * `otp`: 6-digit cryptographically generated numeric string.
  * `expiresAt`: Absolute time of validity (default: 5 minutes).
  * `isUsed`: Boolean indicating if the OTP has already been checked.
  * `resendCount`: Number of times this transaction has requested an update (max: 3).
* **Timestamp**: `createdAt`.

### 3. `UserLockout` ([`user_lockouts`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/prisma/schema.prisma#L35))
* **Attributes**:
  * `phoneNumber`: Unique index for locking.
  * `failedOtpAttempts`: Counter for consecutive incorrect codes submitted during verification (max: 5).
  * `lockedUntil`: Expiration timestamp of the active lockout window.
* **Timestamps**: `createdAt` and `updatedAt`.

---

## 3. Step-by-Step Flow Logic

### Flow A: Requesting an OTP (`POST /auth/otp/request`)
* **Endpoint**: [`auth/otp/request`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/src/modules/auth/auth.controller.ts#L16-L36)
* **Input Parameters**: Validated by `SendOtpDto` (`phoneNumber` [numeric 7-15 digits], `countryCode` [calling prefix]).
* **Processing Steps**:
  1. **Lockout Check**: Queries `UserLockout` for the phone number. If `lockedUntil` is active in the future, rejects request immediately with `400 Bad Request` displaying the remaining locked time. If `lockedUntil` has passed, resets `failedOtpAttempts` to 0.
  2. **Active OTP Check**: Checks for an existing, unused, and unexpired OTP in the database.
  3. **Cooldown Verification**: If an active OTP exists, computes elapsed time since creation. If it is less than `OTP_COOLDOWN_SECONDS` (default: 30s), aborts execution.
  4. **Invalidate Old Code**: If cooldown has passed, invalidates the previous active OTP by setting `isUsed = true`.
  5. **Code Generation**: Computes a random 6-digit numeric OTP code (`100000` to `999999`).
  6. **Persistence**: Creates a new record in the `Otp` table with `isUsed = false`, `resendCount = 0`, and set `expiresAt` (configured via `OTP_EXPIRATION_MINUTES`, default: 5m).
  7. **Sms Service Call**: Triggers `SmsService`. In local/dev environments, prints a formatted console warning block containing the OTP. In production, triggers the SMS gateway API.
  8. **Response**: Wraps output and returns localized status `AUTH_OTP_SENT`.

### Flow B: Resending an OTP (`POST /auth/otp/resend`)
* **Endpoint**: [`auth/otp/resend`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/src/modules/auth/auth.controller.ts#L38-L59)
* **Processing Steps**:
  1. **Lockout Check**: Confirms the phone number is not currently locked out.
  2. **Retrieve Current Record**: Queries the latest active (unused and unexpired) OTP. If none is found, throws a BadRequest exception requesting a fresh request.
  3. **Cooldown Enforcement**: Ensures 30 seconds have elapsed since the record creation timestamp.
  4. **Max Attempts Check**: Checks the retrieved record's `resendCount`. If `resendCount >= 3`, writes a lock record to `UserLockout` setting `lockedUntil = now + 30 minutes`, then aborts request.
  5. **Invalidate Previous Code**: Marks the active OTP as used.
  6. **Re-Generate & Save**: Generates a new 6-digit OTP, increments the `resendCount` by 1, sets a new expiry window, and saves it.
  7. **SMS Dispatch**: Transmits the newly generated code to the recipient.
  8. **Response**: Responds with localized status `AUTH_OTP_RESENT` and the attempt counter.

### Flow C: Verifying an OTP (`POST /auth/otp/verify`)
* **Endpoint**: [`auth/otp/verify`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/src/modules/auth/auth.controller.ts#L61-L100)
* **Input Parameters**: Validated by `VerifyOtpDto` (phone number, country code, and 6-digit `otp` code).
* **Processing Steps**:
  1. **Lockout Check**: Validates that the user is not actively locked out.
  2. **OTP Match Check**: Searches the `Otp` table for a record matching the phone number, matching code, and `isUsed = false`.
  3. **Expiration & Failure Log**:
     * If no match is found, or if `now > expiresAt`, increments `failedOtpAttempts` in `UserLockout`.
     * If `failedOtpAttempts >= 5`, sets `lockedUntil = now + 30 minutes` and throws a lockout exception.
     * Throws localized errors: `AUTH_INVALID_OTP` (if missing) or `AUTH_OTP_EXPIRED` (if expired).
  4. **Mark Code Spent**: Atomically updates the matched OTP setting `isUsed = true`.
  5. **Clear Lockout State**: Resets `failedOtpAttempts` to 0 and `lockedUntil` to `null` in `UserLockout`.
  6. **User Resolution**:
     * Queries the database for an existing `User`.
     * **First-time Login (Auto-Signup)**: Creates a new user record in the `User` table, setting `isVerified = true` and `isActive = true`, returning `isNewUser = true` to the client.
     * **Returning User**: Verifies status. If not verified, updates user to `isVerified = true`. Returns `isNewUser = false`.
  7. **JWT Token Signing**: Generates Access and Refresh tokens containing payload `{ sub: userId, phoneNumber }`.
  8. **Response**: Returns a JSON object containing the tokens, user profile metadata, and localized status `AUTH_SUCCESS`.

### Flow D: Token Refresh (`POST /auth/token/refresh`)
* **Endpoint**: [`auth/token/refresh`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/src/modules/auth/auth.controller.ts#L102-L120)
* **Input Parameters**: Validated by `RefreshTokenDto` (`refreshToken`).
* **Processing Steps**:
  1. **Token Signature Verification**: Verifies the Refresh Token asynchronously using `JwtService` and `JWT_REFRESH_SECRET`.
  2. **Failure Handling**: If the token is expired, modified, or has an invalid key signature, throws `401 UnauthorizedException` (`AUTH_UNAUTHORIZED`).
  3. **Refresh Generation**: Extracts the payload (`sub` and `phoneNumber`) and generates a fresh, cryptographically signed Access Token valid for 15 minutes.
  4. **Response**: Returns `accessToken` and success status to the caller.

### Flow E: Log Out (`POST /auth/logout`)
* **Endpoint**: [`auth/logout`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/src/modules/auth/auth.controller.ts#L172-L208)
* **Processing Steps**:
  1. **Authentication Guard**: The endpoint is guarded by `JwtAuthGuard` which verifies the client's short-lived Access Token.
  2. **Session ID Resolution**: The `JwtStrategy` extracts the unique session ID (`sid` / `sessionId`) from the Access Token payload.
  3. **Revocation**: The server updates the session record in the database, setting `revokedAt` to the current timestamp. Any subsequent request attempting to authenticate or refresh using tokens linked to this session will be rejected.
  4. **Response**: Responds with a success message confirming logout. The client application should discard its locally cached Access and Refresh tokens.

---

## 4. NestJS Components and Decorators Implemented

The application integrates standard NestJS frameworks, decorators, and strategies to build clean pipelines:

### 1. `JwtStrategy` ([`jwt.strategy.ts`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/src/modules/auth/strategies/jwt.strategy.ts))
* **Base Class**: Extends Passport's `PassportStrategy(Strategy, 'jwt')`.
* **Configuration**:
  * Extracts tokens from incoming requests via `ExtractJwt.fromAuthHeaderAsBearerToken()` (expects header `Authorization: Bearer <JWT>`).
  * Cryptographically checks signatures using `JWT_ACCESS_SECRET`.
  * Rejects request instantly if the token lifetime is expired (`ignoreExpiration: false`)....
* **`validate()` Handler**:
  * Receives decrypted payload `{ sub: string, phoneNumber: string }`.
  * Fetches the user profile via `UsersService.findById(sub)`.
  * Validates user active state (`user.isActive`).
  * Returns user entity which NestJS binds to the request object (`request.user`).

### 2. `JwtAuthGuard` ([`jwt-auth.guard.ts`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/src/common/guards/jwt-auth.guard.ts))
* **Implementation**: Extends NestJS Passport `AuthGuard('jwt')`.
* **Execution**: Placed on top of controllers/endpoints (e.g. `@UseGuards(JwtAuthGuard)`) to block requests lacking authenticated Bearer tokens.

### 3. Custom Decorator: `@GetUser` ([`get-user.decorator.ts`](file:///Users/prachithacker/My%20Workspace/Workspace/IPS/MaroVarso/server/src/common/decorators/get-user.decorator.ts))
* **Implementation**: Created via `createParamDecorator`.
* **Purpose**: Extracts the validated user profile payload directly from the HTTP request (`request.user`) and injects it into controller arguments.
* **Usage Example**:
  ```typescript
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@GetUser() user: User) {
    return user;
  }
  ```

### 4. Swagger Annotations
* `@ApiTags('Authentication')`: Organizes endpoints.
* `@ApiOperation({ summary: '...' })`: Outlines the actions of each method.
* `@ApiResponse({ status: 200, schema: ... })`: Documents success structures for frontend integration.
* `@ApiBearerAuth()`: Informs Swagger UI that requests require Bearer tokens.

---

## 5. Security & Rate-Limiting Controls Summary

To present this system clearly to other developers, here are the core security guardrails:

* **Cooldown Protection**: A mandatory 30-second wait time prevents multiple OTP requests from clogging SMS gateways.
* **Resend Threshold**: Restricts users to 3 OTP resends per transaction. Crossing this triggers a 30-minute lockout.
* **Verification Block**: Users are locked out for 30 minutes after 5 consecutive incorrect OTP submissions.
* **Stateless JWT Payloads**: Avoids exposing passwords or DB connection records. Tokens contain only the identifier (`phoneNumber`) and target key (`sub`).
* **Environment Configuration**: Key secrets are read at boot time:
  * `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
  * `JWT_ACCESS_EXPIRATION` (default: `15m`)
  * `JWT_REFRESH_EXPIRATION` (default: `30d`)
  * `OTP_COOLDOWN_SECONDS` (default: `30`)
  * `OTP_EXPIRATION_MINUTES` (default: `5`)
  * `OTP_PROVIDER` (controls if actual SMS messages are sent or simulated in developer log streams)
