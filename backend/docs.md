# NMS-EOC Backend — Living Documentation

This is the single source of truth for the NMS-EOC backend system. It is written for both the backend team and the **frontend team** so everyone understands what is built, what each file does, and how to connect to the API.

---

## For the Frontend Team

### Base URL
```
http://localhost:3000       ← Development
https://api.nms-eoc.com    ← Production (TBD)
```

### How to Test the API is Running
Make a `GET` request to the root endpoint:
```
GET http://localhost:3000/
```
Expected response:
```json
{
  "ok": true,
  "service": "NMS-EOC API",
  "version": "1.0.0"
}
```

### Authentication (Coming in Chunk 2.x)
All protected endpoints will require a **Bearer token** in the `Authorization` header:
```
Authorization: Bearer <your_jwt_token>
```
Tokens are obtained from `POST /auth/login`. We will document each endpoint here as it is built.

### CORS
The API is configured to accept requests from any origin (`*`) in development. In production, the allowed origin will be locked down to the deployed frontend URL via the `CORS_ORIGIN` environment variable.

---

## File & Folder Architecture Tracker

This section is a living map of the codebase. Every file and folder is documented here. We update it as each chunk is completed.

### Root Files
| File | Purpose |
|---|---|
| `package.json` | Project dependencies and npm scripts (`dev`, `build`, `start`) |
| `tsconfig.json` | TypeScript config — targets ES2022, uses NodeNext module resolution |
| `.env` | Local environment variables (never committed to git) |
| `.env.example` | Template showing all required env vars — copy this to create `.env` |
| `docs.md` | This file |

### `/src`
| File | Purpose |
|---|---|
| `server.ts` | **Entry point.** Loads `.env`, calls `buildApp()`, and starts listening on the configured port. This is the file you run. |
| `app.ts` | **App factory.** Creates the Fastify instance, registers all plugins (env, helmet, cors), and registers routes. Kept separate from `server.ts` for clean unit testing. |

### `/src/config`
| File | Purpose |
|---|---|
| `env.ts` | Defines the JSON schema for all environment variables. The app **refuses to start** if required vars are missing. Exposes config via `app.config.*` with full TypeScript types. |

---

## Phase 1: Core Foundation & Infrastructure

### Chunk 1.1 — Project Initialization ✅

**What was done:**
- Initialized a Fastify + TypeScript project inside `backend/`
- Configured `nodemon` + `tsx` for a fast development workflow
- Set up strict TypeScript (`NodeNext` module resolution)
- Registered `@fastify/helmet` (security headers) and `@fastify/cors`
- Built the `app.ts` / `server.ts` split pattern for testability
- Exposed a `GET /` health check endpoint

**Scripts:**
```bash
npm run dev     # Starts the dev server with hot-reload
npm run build   # Compiles TypeScript to dist/
npm run start   # Runs the compiled production build
```

---

### Chunk 1.2 — Environment & Config ✅

**What was done:**
- Installed `@fastify/env` for schema-based environment validation
- Created `.env.example` — the canonical template for all required variables
- Created `src/config/env.ts` — defines and validates the env schema
- Registered the env plugin **first** in `app.ts` so all other plugins can safely use `app.config.*`
- Replaced all raw `process.env.*` access with typed `app.config.*` calls

**Required environment variables (copy `.env.example` to `.env`):**
| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Port the server listens on |
| `HOST` | No | `0.0.0.0` | Host binding |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin(s) |
| `DATABASE_URL` | **Yes** | — | Supabase PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | — | Secret key for signing JWTs (min 16 chars) |
| `JWT_EXPIRES_IN` | No | `7d` | JWT token expiry duration |

**What happens if a required variable is missing:**
The app will crash on startup with a clear error message — it will **not** silently run in a broken state.

**How other plugins access config (type-safe):**
```typescript
// ✅ Correct — typed, validated
app.config.JWT_SECRET
app.config.DATABASE_URL
app.config.NODE_ENV

// ❌ Avoid — untyped, unvalidated
process.env.JWT_SECRET
```

---

### Chunk 1.3 — Folder Structure ✅

**What was done:**
- Created the full domain-driven directory structure under `/src`
- Created `src/shared/errors/AppError.ts` — a reusable custom error class
- Created `src/shared/types/index.ts` — shared types used across all modules

**Full directory layout:**
```
src/
├── config/
│   └── env.ts              ← Environment validation
├── modules/
│   ├── auth/               ← Registration, login, OTP, RBAC
│   ├── incidents/          ← Incident lifecycle
│   ├── dispatch/           ← Assignment & nearest vehicle logic
│   ├── handoff/            ← Partner forwarding
│   ├── tracking/           ← GPS ingestion
│   └── notifications/      ← Push/SMS alerts
├── plugins/
│   └── prisma.ts           ← Fastify Prisma plugin
├── shared/
│   ├── errors/
│   │   └── AppError.ts     ← Custom error classes
│   ├── schemas/            ← Zod validation schemas (populated per module)
│   ├── types/
│   │   └── index.ts        ← Shared TypeScript types
│   └── utils/              ← Utility functions (populated per chunk)
├── generated/
│   └── prisma/             ← Auto-generated Prisma client (NOT committed)
├── app.ts
└── server.ts
```

**Error classes available (`src/shared/errors/AppError.ts`):**
```typescript
throw new NotFoundError('Incident')       // 404
throw new UnauthorizedError()             // 401
throw new ForbiddenError()                // 403
throw new BadRequestError('Invalid data') // 400
throw new ConflictError('Email taken')    // 409
```

**Shared types available (`src/shared/types/index.ts`):**
- `Role` — union type matching all Prisma roles
- `JwtPayload` — shape of decoded JWT (`userId`, `role`, `agencyId`)
- `PaginationQuery` / `PaginatedResponse<T>` — standard list response shape
- `ApiResponse<T>` — standard success response envelope
- `Coordinates` — `{ lat, lng }` object

---

### Chunk 1.4 — Prisma Init ✅ (Pending DB connection test)

**What was done:**
- Installed `prisma` and `@prisma/client`
- Ran `npx prisma init` — created `prisma/schema.prisma` and `prisma.config.ts`
- Set `provider = "postgresql"` and `url = env("DATABASE_URL")` in schema
- Created `src/plugins/prisma.ts` — Fastify plugin that:
  - Instantiates a single shared `PrismaClient`
  - Decorates the app as `app.prisma` (fully typed)
  - Gracefully disconnects on server shutdown via `onClose` hook
- Registered `prismaPlugin` in `app.ts` (after env validation)

**⚠️ Action required before the DB step works:**
Update `DATABASE_URL` in your `.env` file with your real Supabase connection string:
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres
```
Then run:
```bash
npx prisma generate    # generates the typed client from the schema
npx prisma db push     # pushes the schema to Supabase (requires DATABASE_URL)
```

**How routes use the DB (once connected):**
```typescript
// In any route handler or service:
const incident = await app.prisma.incident.findUnique({ where: { id } })
const users    = await app.prisma.user.findMany()
```

---

### Chunks 1.5, 1.6, 1.7 — Full Prisma Schema ✅

**What was done:**
- Defined the complete database schema in `prisma/schema.prisma`
- Ran `npx prisma generate` — TypeScript client now lives in `src/generated/prisma/` (gitignored)
- All models follow snake_case in the DB (`@@map`) with camelCase in TypeScript

**Models defined:**

| Model | Table | Purpose |
|---|---|---|
| `Agency` | `agencies` | Internal NMS and external Partner agencies |
| `User` | `users` | All system users across all roles |
| `Incident` | `incidents` | Emergency cases from initial log to resolution |
| `Task` | `tasks` | Crew dispatch assignments linked to incidents |
| `Vehicle` | `vehicles` | Ambulances with IMEI for GPS tracking |
| `Facility` | `facilities` | Hospitals/clinics with KEPH level classification |
| `ForwardingLog` | `forwarding_logs` | Audit trail for every case handoff to partner agencies |
| `AuditLog` | `audit_logs` | System-wide action log for accountability |

**Enums defined:**

| Enum | Values |
|---|---|
| `Role` | `SUPER_ADMIN, ADMIN, WATCHER, DISPATCHER, DRIVER, EMT, NURSE, PARTNER` |
| `AgencyType` | `INTERNAL, PARTNER` |
| `IncidentStatus` | `DRAFT → SUBMITTED → DISPATCH_HANDLING → DISPATCH_ON_HOLD → DISPATCHED → RESOLVED` |
| `TaskStatus` | `PENDING → ACCEPTED → EN_ROUTE → AT_SCENE → PATIENT_PICKED → AT_HOSPITAL → COMPLETED / CANCELLED` |

**Note for frontend team:**
These status flows are the exact values you will receive from the API. Build your UI state machines around these enums.

**⚠️ Pending:** Run `npx prisma db push` once `DATABASE_URL` is set with the real Supabase connection string.

---

## Phase 2: Authentication

### Chunk 2.1 — Password Hashing Utility ✅

**What was done:**
- Installed `bcrypt` for secure password hashing.
- Created `src/shared/utils/hash.ts` with `hashPassword` and `comparePassword` functions.

### Chunk 2.2 — JWT Plugin ✅

**What was done:**
- Installed `@fastify/jwt`.
- Created `src/plugins/jwt.ts` to register the JWT plugin and expose `app.authenticate` as a route guard.
- Registered the JWT plugin in `src/app.ts`.

### Chunk 2.3 & 2.4 — Auth Module (Register & Login) ✅

**What was done:**
- Created `src/modules/auth/auth.service.ts` to encapsulate business logic for `register` and `login`.
- Created `src/modules/auth/auth.routes.ts` defining endpoints `POST /auth/register` and `POST /auth/login`.
- Hooked `authRoutes` into the main fastify app (`src/app.ts`) under the `/auth` prefix.

### Chunk 2.5 — Auth Middleware (RBAC Guard) ✅

**What was done:**
- Created `src/shared/guards/requireRole.ts` to implement Role-Based Access Control.
- Example usage for protecting endpoints:
```typescript
app.get('/protected-route', {
  preValidation: [app.authenticate, requireRole(['SUPER_ADMIN'])]
}, async (request, reply) => {
  // accessible only to super admin
});
```

---

## Phase 3: Incident Module

### Chunk 3.1 & 3.2 & 3.3 — Incident Creation, Listing & Updates ✅

**What was done:**
- Created `src/modules/incidents/incident.service.ts` to handle business logic.
- Created `src/modules/incidents/incident.routes.ts` defining:
  - `POST /incidents` (Creates a new incident, auto-generates Case Number, defaults to SUBMITTED).
  - `GET /incidents` (Paginated list, filterable by `status`).
  - `GET /incidents/:id` (Fetches full details including dispatcher/watcher relations).
  - `PATCH /incidents/:id/status` (Updates incident status, locked down to DISPATCHER, ADMIN, SUPER_ADMIN via `requireRole`).
- Registered `incidentRoutes` in `app.ts` under `/incidents`.
- Used TypeScript strict checking and exact Prisma types (`IncidentStatus`, `Role`) for complete type safety.
