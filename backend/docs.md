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
