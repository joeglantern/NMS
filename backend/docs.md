# NMS-EOC Backend Documentation

This document serves as the living technical documentation for the NMS-EOC backend system. It tracks the architectural decisions, setup details, and implementation specifics as we build out the project chunk by chunk.

## File & Folder Architecture Tracker

This section serves as a living map of the codebase. It explains what each file and folder does. We will update this list continuously as new chunks are completed.

### Root Directory
- `package.json` — Manages project dependencies and run scripts (`dev`, `build`, `start`).
- `tsconfig.json` — TypeScript compiler settings configured for modern Node.js (`NodeNext`).
- `docs.md` — This living documentation file.

### `/src` (Application Source)
- `server.ts` — The main entry point. It handles loading environment variables (via `dotenv`), executing the Fastify app builder, and attaching the server to a network port.
- `app.ts` — The Fastify app factory (`buildApp`). It isolates the application configuration, plugin registration (like CORS/Helmet), and routing from the server startup logic. This separation is a best practice for clean unit testing.

---

## Phase 1: Core Foundation & Infrastructure

### 1. Project Initialization (Chunk 1.1)

#### Overview
The backend is a Node.js application built using **Fastify** and **TypeScript**, designed for high-performance and real-time operations. We adopted a modern tooling stack to ensure type safety, developer experience, and security.

#### Tech Stack & Tooling
- **Framework:** Fastify (`fastify`)
- **Language:** TypeScript (`typescript`, `@types/node`)
- **Execution & Watch:** `tsx` and `nodemon` (Replacing legacy `ts-node` for faster ESM/CommonJS handling)
- **Security Middleware:** `@fastify/helmet` (Security headers), `@fastify/cors` (CORS management)
- **Environment Management:** `dotenv`

#### TypeScript Configuration
We use a strict TypeScript configuration (`tsconfig.json`) optimized for modern Node.js environments:
- `target`: `ES2022`
- `module`: `NodeNext`
- `moduleResolution`: `NodeNext` (Modern standard preventing IDE errors and deprecation warnings)
- `strict`: `true`

#### TypeScript Configuration
We use a strict TypeScript configuration (`tsconfig.json`) optimized for modern Node.js environments:
- `target`: `ES2022`
- `moduleResolution`: `Bundler` (Modern standard preventing TS6 deprecation warnings for non-ESM projects)
- `strict`: `true`

#### Scripts
- `npm run dev`: Uses `nodemon` to watch `.ts` files and restarts the server via `tsx src/server.ts`.
- `npm run build`: Compiles the TypeScript source into the `dist/` directory.
- `npm run start`: Runs the compiled production build using `node dist/server.js`.

#### Health Check
A basic health check endpoint is available at `GET /`, returning:
```json
{
  "ok": true,
  "service": "NMS-EOC API",
  "version": "1.0.0"
}
```
