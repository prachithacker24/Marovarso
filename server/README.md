# MaroVarso NestJS Backend

A production-ready NestJS server implementing highly robust, passwordless Mobile Number + OTP authentication. Designed with TypeScript best practices, global interceptors, custom exception filters, schema validation, and dynamic environment configurations.

---

## 🛠️ Tech Stack & Key Features

* **Framework**: NestJS (v11.x) with strict TypeScript settings.
* **Database & ORM**: PostgreSQL with Prisma ORM (v5.22.0 stable).
* **Authentication**: Passwordless OTP flow with stateless JWT (Access and Refresh token pairs).
* **Validation**: Global pipe integrating `class-validator` and `class-transformer`.
* **Request Normalization**: Recursive pipeline to sanitize inputs (trim strings, standardize phone numbers, lowercase emails).
* **Robust Error Handling**: Customized exception filter that captures Prisma/Validation errors and prevents internal stack leaks.
* **OpenAPI Docs**: Interactive Swagger documentation available at `/api/docs`.

---

## 📁 Recommended Directory Layout

```text
server/src/
├── common/
│   ├── decorators/       # GetUser custom param decorators
│   ├── filters/          # GlobalExceptionFilter (DB constraint & validation handlers)
│   ├── guards/           # JwtAuthGuard
│   ├── interceptors/     # ResponseInterceptor for success wrapping
│   └── pipes/            # NormalizationPipe (sanitizes request strings recursively)
├── config/               # JWT strategy settings
└── modules/
    ├── auth/             # OTP controller, service, strategies, and SMS services
    ├── health/           # Health check endpoints
    ├── prisma/           # Global Prisma database wrapper module
    └── users/            # User account profiles
```

---

## ⚙️ Initial Setup

### 1. Install Node Dependencies
Ensure you are inside the `server/` directory:
```bash
npm install
```
To view installed dependencies:
```bash
npm list --depth=0
```

### 2. Configure Database & Environment
Copy the configuration parameters or update [server/.env](file:///d:/blockbuster/Marovarso/server/.env) with your credentials:
```ini
# Application configuration
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# PostgreSQL Connection String (adjust username, password, host, port, and db name)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marovarso?schema=public"

# JWT configuration
JWT_ACCESS_SECRET="mv_super_secure_access_secret_key_12345_abcde"
JWT_REFRESH_SECRET="mv_super_secure_refresh_secret_key_67890_fghij"
JWT_ACCESS_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="30d"

# OTP Settings
# Set to 'production' to deliver real SMS gateway payloads, or 'development'/'local' to print OTP to console
OTP_PROVIDER=development
OTP_EXPIRATION_MINUTES=5
```

### 3. Provision PostgreSQL Schema
Execute the following Prisma command to provision schemas and models on your PostgreSQL instance:
```bash
npx prisma db push --skip-generate
```

---

## 🚀 Running the Server

Start the application under development/watch mode:
```bash
npm run start:dev
```

* **Backend Server URL**: `http://localhost:3001`
* **Swagger API Playground**: `http://localhost:3001/api/docs`
* **Health Endpoint**: `http://localhost:3001/health`

---

## 🔐 Passwordless Authentication Flow

This backend utilizes a single-entry unified OTP authentication flow. New phone numbers are **registered automatically** upon successful verification, with no separate signup API required.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client App
    participant Server as NestJS Auth Module
    participant DB as PostgreSQL (Prisma)
    
    Note over Client,Server: Step 1: Send OTP Request
    Client->>Server: POST /auth/send-otp (phoneNumber, countryCode)
    Server->>Server: Generate random 6-digit OTP code
    Server->>DB: Save Otp record (expires in 5 mins)
    alt is OTP_PROVIDER == 'production'
        Server->>Server: Dispatch payload to SMS Gateway Client
    else is OTP_PROVIDER == 'development' / 'local'
        Server->>Server: Log OTP directly to Server console
    end
    Server-->>Client: { success: true, message: "OTP sent successfully" }

    Note over Client,Server: Step 2: Verify OTP & Sign In
    Client->>Server: POST /auth/verify-otp (phoneNumber, countryCode, otp)
    Server->>DB: Fetch active, unused Otp record
    alt OTP is valid and not expired
        Server->>DB: Mark OTP record as isUsed = true
        alt User exists?
            Server->>DB: Fetch User details
        else User does not exist?
            Server->>DB: Auto-create User account
        end
        Server->>Server: Issue JWT Access Token (15m) & Refresh Token (30d)
        Server-->>Client: { success: true, accessToken, refreshToken, user }
    else OTP is invalid / expired / used
        Server-->>Client: Throws 400 BadRequestException
    end
```

---

## 🧪 Quick Test Scenarios (via Curl)

### 1. Request OTP Code
```bash
curl -X POST http://localhost:3001/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9876543210", "countryCode": "+91"}'
```
*Check your NestJS server terminal/console log output for the generated 6-digit OTP code.*

### 2. Verify OTP Code (Log In / Register)
Replace `"123456"` with the actual code retrieved from your server terminal:
```bash
curl -X POST http://localhost:3001/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9876543210", "countryCode": "+91", "otp": "123456"}'
```

### 3. Fetch Secure User Profile (Requires Access Token)
Replace `<JWT_ACCESS_TOKEN>` with the token returned in the step above:
```bash
curl -X GET http://localhost:3001/users/me \
  -H "Authorization: Bearer <JWT_ACCESS_TOKEN>"
```

### 4. Refresh Session Tokens
Replace `<JWT_REFRESH_TOKEN>` with the refresh token returned in the step above:
```bash
curl -X POST http://localhost:3001/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<JWT_REFRESH_TOKEN>"}'
```
### For testing APIs nestJS provides by default e2e test
```bash
npm run test:e2e
```
