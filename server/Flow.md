# MaroVarso System Flow & Architecture

This document outlines the folder structure, core architectural flows, database schema, design decisions, and visual flows of the MaroVarso backend.

---

## 1. Project Directory Structure

Here is a breakdown of the server's codebase structure and the purpose of each directory:

```text
server/
├── prisma/                  # Prisma Database Schema & Migrations
│   └── schema.prisma        # Database schema definitions (PostgreSQL)
├── src/
│   ├── app.module.ts        # App root module; registers global modules (Config, Prisma, i18n)
│   ├── main.ts              # Entry point; sets up middleware, pipes, interceptors, CORS, and Swagger
│   ├── common/              # Shared assets, utilities, and custom handlers
│   │   ├── decorators/      # Custom decorators (e.g., @GetUser to extract JWT payloads)
│   │   ├── filters/         # Exception filters (e.g., GlobalExceptionFilter to format/translate errors)
│   │   ├── guards/          # Route guards (e.g., JwtAuthGuard to protect secure endpoints)
│   │   ├── interceptors/    # Response interceptors (e.g., ResponseInterceptor to format/translate successes)
│   │   └── pipes/           # Validation/parsing pipes (e.g., NormalizationPipe to normalize input phone strings)
│   ├── i18n/                # Localization translation dictionaries
│   │   ├── en/              # English errors.json and success.json
│   │   ├── gu/              # Gujarati errors.json and success.json
│   │   └── hi/              # Hindi errors.json and success.json
│   └── modules/             # Domain-specific modules (Controllers, Services, DTOs)
│       ├── auth/            # Auth module (OTP generation, validation, JWT issuing, SMS sending)
│       ├── health/          # Server health operational check module
│       ├── prisma/          # Prisma database client instance module
│       └── users/           # User creation, retrieval, and profile update module
├── nest-cli.json            # NestJS CLI compiler configuration
├── package.json             # NPM dependencies and project scripts
└── tsconfig.json            # TypeScript compiler configuration
```

---

## 2. Core Architectural Design Decisions (Why We Used This)

### NestJS Module Architecture
- **Why**: NestJS provides a scalable, highly modular structure. Separating code into domain modules (`auth`, `users`, `prisma`, `health`) keeps it clean, maintainable, and loosely coupled.
- **Use Case**: When adding new features (e.g., Family Member management), we can easily spawn a `members` module without touching existing auth logic.

### Prisma ORM
- **Why**: Standardizes data modeling, runs database migrations declaratively, and autogenerates type-safe database queries.
- **Use Case**: Eliminates sql-injection vulnerabilities and raw-string query errors.

### Decoupled Internationalization (i18n)
- **Why**: Decouples presentation text from the service layer. Error codes and success parameters are returned as UPPER_SNAKE_CASE strings (`AUTH_INVALID_OTP`, `AUTH_OTP_SENT`), while `nestjs-i18n` dynamically translates them in unified pipelines before responding to the client.
- **Use Case**: Frontend applications can specify the language via headers (`Accept-Language: gu`, `x-custom-lang: hi`) or queries (`?lang=en`) to render translated text instantly.

### Global Interceptors & Exception Filters
- **Why**: Standardizes the response format for all success and error responses. 
- **Use Case**:
  - Success responses always follow: `{ success: true, code: string, message: string, data: any }`
  - Error responses always follow: `{ success: false, code: string, message: string, errors: string[] }`
  - Eliminates the need to write redundant wrapper logic inside individual controllers.

---

## 3. Database Schema Models

The PostgreSQL database (managed via Prisma) has three core tables:

1. **`User`** (`users` table):
   - Stores user profiles.
   - Core anchor is `phoneNumber` + `countryCode` (unique constraint on phone).
   - Tracks verification status and account state.
2. **`Otp`** (`otps` table):
   - Stores verification transactions.
   - Stores the generated 6-digit `otp`, target phone number, `expiresAt`, `isUsed` state, and `resendCount`.
3. **`UserLockout`** (`user_lockouts` table):
   - Tracks failed login/verification attempts.
   - Enforces a lock out until a specific datetime (`lockedUntil`) if user reaches maximum verification limits.

---

## 4. Visual Workflows (Draw.io XML Codes)

You can copy and paste the XML codes below directly into [Draw.io](https://app.diagrams.net/) (File -> Import From -> XML) to view or edit the architecture diagrams.

### Diagram 1: Global Request-Response Processing Pipeline
This diagram displays how incoming client requests flow through global middleware, guards, pipes, controllers, and services, and get wrapped by interceptors or exception filters on output.

```xml
<mxfile host="Electron" modified="2026-06-06T00:00:00.000Z" agent="MaroVarso Diagram Builder" version="21.0.0" type="device">
  <diagram id="pipeline-diagram" name="Request-Response Pipeline">
    <mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- Client Node -->
        <mxCell id="client" value="Client Application&#xa;(HTTP Request)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="40" y="240" width="130" height="70" as="geometry" />
        </mxCell>
        
        <!-- Normalization Pipe Node -->
        <mxCell id="norm_pipe" value="Normalization Pipe&#xa;(Clean phone strings)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="220" y="240" width="130" height="70" as="geometry" />
        </mxCell>
        
        <!-- Validation Pipe Node -->
        <mxCell id="val_pipe" value="Validation Pipe&#xa;(class-validator)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="390" y="240" width="130" height="70" as="geometry" />
        </mxCell>
        
        <!-- Controller Node -->
        <mxCell id="controller" value="Controller Router&#xa;(e.g. AuthController)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="560" y="240" width="130" height="70" as="geometry" />
        </mxCell>
        
        <!-- Service Node -->
        <mxCell id="service" value="Service Logic&#xa;(e.g. AuthService)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="730" y="240" width="130" height="70" as="geometry" />
        </mxCell>
        
        <!-- Prisma DB Node -->
        <mxCell id="prisma" value="Prisma ORM&#xa;&amp; PostgreSQL" style="shape=datastore;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="745" y="380" width="100" height="90" as="geometry" />
        </mxCell>
        
        <!-- Response Interceptor Node -->
        <mxCell id="interceptor" value="Response Interceptor&#xa;(Success Wrap + i18n)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="390" y="100" width="130" height="70" as="geometry" />
        </mxCell>
        
        <!-- Exception Filter Node -->
        <mxCell id="filter" value="Global Exception Filter&#xa;(Error Wrap + i18n)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="390" y="380" width="130" height="70" as="geometry" />
        </mxCell>

        <!-- Connections -->
        <mxCell id="c1" value="1. Request" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="client" target="norm_pipe" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="c2" value="2. Clean" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="norm_pipe" target="val_pipe" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="c3" value="3. Validate" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="val_pipe" target="controller" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="c4" value="4. Process" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="controller" target="service" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="c5" value="5. Query" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="service" target="prisma" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="c6" value="6. Validation Fail" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;strokeColor=#b85450;fontColor=#b85450;" edge="1" source="val_pipe" target="filter" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="c7" value="6. Success Return" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;strokeColor=#82b366;fontColor=#82b366;" edge="1" source="service" target="interceptor" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="c8" value="7. Error Throw" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0;exitY=1;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;strokeColor=#b85450;fontColor=#b85450;" edge="1" source="service" target="filter" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="c9" value="8. Standard JSON" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;strokeColor=#82b366;fontColor=#82b366;" edge="1" source="interceptor" target="client" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        
        <mxCell id="c10" value="8. Localized JSON" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;strokeColor=#b85450;fontColor=#b85450;" edge="1" source="filter" target="client" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

### Diagram 2: Passwordless OTP Authentication Flow
This diagram displays the flow when requesting and verifying the SMS OTP code.

```xml
<mxfile host="Electron" modified="2026-06-06T00:00:00.000Z" agent="MaroVarso Diagram Builder" version="21.0.0" type="device">
  <diagram id="otp-flow" name="OTP Authentication Flow">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- Request Section -->
        <mxCell id="start_req" value="POST /auth/otp/request" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="100" y="60" width="160" height="50" as="geometry" />
        </mxCell>
        
        <mxCell id="check_lockout_req" value="Is Phone Locked Out?&#xa;(failedOtpAttempts &gt;= 5)" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;" vertex="1" parent="1">
          <mxGeometry x="80" y="150" width="200" height="100" as="geometry" />
        </mxCell>
        
        <mxCell id="lockout_error" value="Throw BadRequest&#xa;(Lockout expired? Reset else Error)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
          <mxGeometry x="340" y="175" width="200" height="50" as="geometry" />
        </mxCell>
        
        <mxCell id="cooldown_check" value="Is Cooldown active?&#xa;(&lt; 30 seconds elapsed)" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;" vertex="1" parent="1">
          <mxGeometry x="80" y="290" width="200" height="100" as="geometry" />
        </mxCell>
        
        <mxCell id="cooldown_error" value="Throw BadRequest&#xa;(Wait before requesting)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
          <mxGeometry x="340" y="315" width="200" height="50" as="geometry" />
        </mxCell>
        
        <mxCell id="generate_otp" value="1. Generate 6-digit OTP&#xa;2. Invalidate previous OTP&#xa;3. Save new OTP record" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="80" y="440" width="200" height="70" as="geometry" />
        </mxCell>
        
        <mxCell id="send_sms" value="Send OTP via SMS&#xa;(SmsService)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="100" y="550" width="160" height="50" as="geometry" />
        </mxCell>
        
        <mxCell id="req_success" value="Return JSON&#xa;(AUTH_OTP_SENT)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="100" y="640" width="160" height="50" as="geometry" />
        </mxCell>

        <!-- Verification Section -->
        <mxCell id="start_verify" value="POST /auth/otp/verify" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="640" y="60" width="160" height="50" as="geometry" />
        </mxCell>
        
        <mxCell id="check_lockout_verify" value="Is Phone Locked Out?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;" vertex="1" parent="1">
          <mxGeometry x="620" y="150" width="200" height="100" as="geometry" />
        </mxCell>
        
        <mxCell id="validate_otp" value="Does unused, unexpired&#xa;OTP match code?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;" vertex="1" parent="1">
          <mxGeometry x="620" y="290" width="200" height="100" as="geometry" />
        </mxCell>
        
        <mxCell id="fail_handling" value="Increment failed attempts.&#xa;If attempts &gt;= 5, lock for 30m.&#xa;Throw AUTH_INVALID_OTP / AUTH_OTP_EXPIRED" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
          <mxGeometry x="880" y="305" width="260" height="70" as="geometry" />
        </mxCell>
        
        <mxCell id="mark_used" value="1. Mark OTP as used&#xa;2. Reset lockout counters" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="620" y="440" width="200" height="60" as="geometry" />
        </mxCell>
        
        <mxCell id="find_create" value="Does user exist in DB?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;" vertex="1" parent="1">
          <mxGeometry x="620" y="530" width="200" height="90" as="geometry" />
        </mxCell>
        
        <mxCell id="create_user" value="Create new User account&#xa;(isNewUser = true)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;" vertex="1" parent="1">
          <mxGeometry x="880" y="550" width="180" height="50" as="geometry" />
        </mxCell>
        
        <mxCell id="issue_tokens" value="1. Sign JWT Access Token&#xa;2. Sign JWT Refresh Token" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="620" y="660" width="200" height="60" as="geometry" />
        </mxCell>
        
        <mxCell id="verify_success" value="Return JSON&#xa;(AUTH_SUCCESS)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="640" y="760" width="160" height="50" as="geometry" />
        </mxCell>

        <!-- Connections (Request) -->
        <mxCell id="cr1" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="start_req" target="check_lockout_req" parent="1" />
        <mxCell id="cr2" value="Locked" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;strokeColor=#b85450;fontColor=#b85450;" edge="1" source="check_lockout_req" target="lockout_error" parent="1" />
        <mxCell id="cr3" value="Not Locked" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;strokeColor=#82b366;fontColor=#82b366;" edge="1" source="check_lockout_req" target="cooldown_check" parent="1" />
        <mxCell id="cr4" value="Active" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;strokeColor=#b85450;fontColor=#b85450;" edge="1" source="cooldown_check" target="cooldown_error" parent="1" />
        <mxCell id="cr5" value="Elapsed" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;strokeColor=#82b366;fontColor=#82b366;" edge="1" source="cooldown_check" target="generate_otp" parent="1" />
        <mxCell id="cr6" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="generate_otp" target="send_sms" parent="1" />
        <mxCell id="cr7" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="send_sms" target="req_success" parent="1" />

        <!-- Connections (Verify) -->
        <mxCell id="cv1" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="start_verify" target="check_lockout_verify" parent="1" />
        <mxCell id="cv2" value="Locked" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;strokeColor=#b85450;fontColor=#b85450;" edge="1" source="check_lockout_verify" target="lockout_error" parent="1" />
        <mxCell id="cv3" value="Not Locked" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;strokeColor=#82b366;fontColor=#82b366;" edge="1" source="check_lockout_verify" target="validate_otp" parent="1" />
        <mxCell id="cv4" value="No / Expired" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;strokeColor=#b85450;fontColor=#b85450;" edge="1" source="validate_otp" target="fail_handling" parent="1" />
        <mxCell id="cv5" value="Yes" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;strokeColor=#82b366;fontColor=#82b366;" edge="1" source="validate_otp" target="mark_used" parent="1" />
        <mxCell id="cv6" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="mark_used" target="find_create" parent="1" />
        <mxCell id="cv7" value="No" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;strokeColor=#82b366;fontColor=#82b366;" edge="1" source="find_create" target="create_user" parent="1" />
        <mxCell id="cv8" value="Yes" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;strokeColor=#82b366;fontColor=#82b366;" edge="1" source="find_create" target="issue_tokens" parent="1" />
        <mxCell id="cv9" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="create_user" target="issue_tokens" parent="1" />
        <mxCell id="cv10" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="issue_tokens" target="verify_success" parent="1" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```
