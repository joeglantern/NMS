# NMS-EOC Frontend Handover Guide

This document is the single source of truth for the frontend engineer building the NMS Emergency Operations Centre web application.

---

## 1. Project Context

The backend API is complete and running. Your job is to build the web application that consumes it.

The app is **role-intelligent** — one codebase, one build, one URL. After login the app reads the user's role from the JWT token and renders an entirely different navigation, layout, and feature set. There is no separate "admin app" or "partner app" — routing guards handle everything.

**Roles in the system:**

| Role | What they do |
|------|-------------|
| `SUPER_ADMIN` | God-mode: full access, cross-agency |
| `ADMIN` | Agency management, user/vehicle/facility CRUD |
| `WATCHER` | Creates incident reports from incoming calls |
| `DISPATCHER` | Manages the incident queue, assigns crews |
| `DRIVER` | Crew mobile view — accepts tasks, updates status |
| `EMT` | Crew mobile view — logs patient data |
| `NURSE` | Crew mobile view — logs patient data |
| `PARTNER` | External agency — views forwarded incidents only |

---

## 2. Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| **Vite** | ^6 | Build tool |
| **React** | ^19 | UI framework |
| **TypeScript** | ^5 | Type safety |
| **React Router v7** | latest | Client-side routing |
| **TanStack Query v5** | latest | Server state (API calls + caching) |
| **Tailwind CSS v4** | latest | Styling |
| **Socket.io Client** | ^4 | Real-time events |
| **Axios** | latest | HTTP client |
| **Zustand** | latest | Auth / UI client state |
| **React Hook Form** | latest | Form management |
| **Zod** | ^3 | Form schema validation |
| **date-fns** | latest | Date formatting |
| **Phosphor Icons** | latest | Icon library (matches the design) |
| **Leaflet + React-Leaflet** | latest | Map (live operations screen) |

Do **not** use class-based components, Redux, MUI, Chakra, or Ant Design. Tailwind + custom components only.

---

## 3. Project Setup

### 3.1 Scaffold

```bash
cd NMS
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

### 3.2 Install dependencies

```bash
npm install \
  react-router-dom \
  @tanstack/react-query \
  axios \
  socket.io-client \
  zustand \
  react-hook-form \
  @hookform/resolvers \
  zod \
  date-fns \
  @phosphor-icons/react \
  leaflet react-leaflet \
  @types/leaflet
```

```bash
npm install -D tailwindcss @tailwindcss/vite autoprefixer
```

### 3.3 Environment file

Create `NMS/frontend/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

In production these point to the deployed backend URL.

---

## 4. Design System

The design folder is at:
```
stitch_nms_command_center (1)/stitch_nms_command_center/
```

Each sub-folder contains:
- `screen.png` — the reference screenshot
- `code.html` — the static HTML prototype

Always use the `code.html` as the layout reference and `screen.png` for visual verification.

### 4.1 Brand

| Token | Value | Usage |
|-------|-------|-------|
| Brand Green | `#88c241` | Primary buttons, active nav, focus rings |
| Dark Sidebar | `#233c46` | Navigation background |
| Darkest Teal | `#273238` | Card headers, headings |
| Page Background | `#acb0b1` | App background (between cards) |
| White Surface | `#ffffff` | Cards, content panels |
| Slate Border | `#d1d5d6` | Card borders, dividers |
| Slate Text | `#6f7a7f` | Body text, secondary labels |
| Danger | `#f83f37` | Destructive actions, critical alerts |
| Warning | `#f5a623` | Warning status |
| Success | `#3ec28f` | Resolved/OK status |

### 4.2 Tailwind Configuration

In `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#88c241',
          sidebar: '#233c46',
          teal: '#273238',
        },
        surface: {
          page: '#acb0b1',
          card: '#ffffff',
          border: '#d1d5d6',
        },
        slate: {
          text: '#6f7a7f',
        },
        status: {
          danger: '#f83f37',
          warning: '#f5a623',
          success: '#3ec28f',
          info: '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['Nunito', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '4px',
        lg: '8px',
        full: '9999px',
      },
    },
  },
} satisfies Config;
```

### 4.3 Typography

Use **Nunito** from Google Fonts. Add to `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
```

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| h1 | 32px | 700 | Page titles |
| h2 | 24px | 700 | Section headers |
| h3 | 20px | 600 | Card headers |
| body-lg | 16px | 400 | Primary body text |
| body-md | 14px | 400 | Secondary body, table rows |
| body-sm | 12px | 400 | Metadata, timestamps |
| label-caps | 11px / 700 / UPPERCASE | 0.06em tracking | Table column headers, form labels |

### 4.4 Component Patterns

**Primary Button**
```tsx
<button className="bg-brand-green text-white px-4 py-2 rounded text-sm font-semibold hover:brightness-95">
  Action
</button>
```

**Secondary Button**
```tsx
<button className="border border-brand-sidebar text-brand-sidebar px-4 py-2 rounded text-sm font-semibold hover:bg-brand-sidebar/5">
  Action
</button>
```

**Destructive Button**
```tsx
<button className="bg-status-danger text-white px-4 py-2 rounded text-sm font-semibold">
  Delete
</button>
```

**Status Chip**
```tsx
// SUBMITTED
<span className="bg-status-info/15 text-status-info text-xs font-bold uppercase px-2 py-1 rounded-full">Submitted</span>
// DISPATCHED
<span className="bg-status-success/15 text-status-success text-xs font-bold uppercase px-2 py-1 rounded-full">Dispatched</span>
// DRAFT
<span className="bg-slate-100 text-slate-text text-xs font-bold uppercase px-2 py-1 rounded-full">Draft</span>
```

**Input Field**
```tsx
<div className="flex flex-col gap-1">
  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-text">Field Name</label>
  <input className="border border-surface-border rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20" />
</div>
```

**Card**
```tsx
<div className="bg-white border border-surface-border rounded-lg">
  <div className="px-4 py-3 border-b border-surface-border">
    <h3 className="text-brand-teal font-bold text-base">Card Title</h3>
  </div>
  <div className="p-4">
    {/* content */}
  </div>
</div>
```

**Sidebar Nav Item (active)**
```tsx
<a className="flex items-center gap-3 px-4 py-2.5 bg-brand-green/20 text-brand-green font-semibold rounded mx-2">
  <Icon size={18} />
  Label
</a>
```

**Sidebar Nav Item (inactive)**
```tsx
<a className="flex items-center gap-3 px-4 py-2.5 text-white/70 hover:text-white hover:bg-white/5 rounded mx-2">
  <Icon size={18} />
  Label
</a>
```

---

## 5. Recommended File Structure

```
src/
├── api/
│   ├── client.ts          # Axios instance, JWT injection, error handling
│   ├── auth.ts
│   ├── incidents.ts
│   ├── dispatch.ts
│   ├── fleet.ts
│   ├── tasks.ts
│   ├── admin.ts
│   └── partner.ts
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx       # Sidebar + main content wrapper
│   │   ├── Sidebar.tsx        # Role-aware navigation
│   │   └── TopBar.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── StatusChip.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   └── Spinner.tsx
│   └── shared/
│       ├── IncidentBadge.tsx
│       └── RoleGuard.tsx
├── hooks/
│   ├── useSocket.ts
│   └── useCurrentUser.ts
├── pages/
│   ├── auth/
│   │   └── LoginPage.tsx
│   ├── dispatcher/
│   │   ├── DashboardPage.tsx
│   │   ├── QueuePage.tsx
│   │   ├── MapPage.tsx
│   │   └── IncidentDetailPage.tsx
│   ├── watcher/
│   │   └── NewIncidentFlow.tsx   # 5-step wizard
│   ├── admin/
│   │   ├── UserManagementPage.tsx
│   │   ├── UserDetailPage.tsx
│   │   ├── AgencyManagementPage.tsx
│   │   ├── AgencyDetailPage.tsx
│   │   ├── FleetManagementPage.tsx
│   │   ├── VehicleDetailPage.tsx
│   │   └── FacilityManagementPage.tsx
│   ├── partner/
│   │   ├── PartnerDashboardPage.tsx
│   │   └── PartnerIncidentDetailPage.tsx
│   └── crew/
│       └── ActiveTaskPage.tsx
├── stores/
│   └── authStore.ts       # Zustand: JWT token, user object
├── lib/
│   ├── queryClient.ts     # TanStack Query client config
│   └── socket.ts          # Socket.io singleton
├── types/
│   └── api.ts             # TypeScript types mirroring backend schemas
└── router/
    └── index.tsx          # All routes + role-based guards
```

---

## 6. Authentication

### 6.1 API Calls

```
POST /auth/login       → { ok, data: { token, user } }
POST /auth/register    → { ok, data: user }        (admin use)
GET  /auth/me          → { ok, data: user }         (requires Authorization header)
```

### 6.2 Axios Client (`src/api/client.ts`)

```ts
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;
```

### 6.3 Auth Store (`src/stores/authStore.ts`)

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  userId: string;
  agencyId: string;
  role: string;
}

interface AuthStore {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'nms-auth' }
  )
);
```

### 6.4 Login Flow

1. User submits email + password
2. `POST /auth/login` returns `{ token, user: { userId, agencyId, role } }`
3. Store token + user in `authStore` (persisted to localStorage)
4. Redirect based on role (see section 8)

The JWT token contains `{ userId, agencyId, role }` in its payload. You can decode it on the client to read the role without an extra `/me` call, but call `GET /auth/me` on app load to verify it's still valid.

---

## 7. Real-time (Socket.io)

### 7.1 Connection

```ts
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

export const socket = io(import.meta.env.VITE_SOCKET_URL, {
  auth: { token: useAuthStore.getState().token },
  autoConnect: false,
});
```

Call `socket.connect()` after login. Call `socket.disconnect()` on logout.

### 7.2 Events to Listen For

| Event | Payload | Who receives it | Action |
|-------|---------|----------------|--------|
| `incident:new` | Full incident object | All users with role `DISPATCHER` | Add to queue, show toast |
| `task:created` | Full task object | The assigned driver, EMT, nurse | Show alert, navigate to active task |
| `task:status` | `{ taskId, status, updatedAt }` | Everyone on `incident:{id}` room | Update task card live |
| `vehicle:location` | `{ imei, lat, lng, speed, updatedAt }` | All dispatchers | Update map marker |

### 7.3 Rooms (server emits to these — client joins automatically based on JWT)

- `user:{userId}` — personal notifications
- `role:{ROLE}` — all users of a role (e.g. `role:DISPATCHER`)
- `incident:{id}` — anyone viewing that incident
- `agency:{id}` — all users in the agency

The backend joins users to rooms automatically on socket connection based on their JWT. The frontend does not need to manually join rooms.

---

## 8. Routing & Role Guards

### 8.1 Role → Landing Page

| Role | After Login |
|------|-------------|
| `SUPER_ADMIN`, `ADMIN` | `/admin/users` |
| `DISPATCHER` | `/dispatcher/dashboard` |
| `WATCHER` | `/watcher/new-incident` |
| `DRIVER`, `EMT`, `NURSE` | `/crew/active-task` |
| `PARTNER` | `/partner/dashboard` |

### 8.2 Route Guard Component

```tsx
function RoleGuard({ allowed, children }: { allowed: string[]; children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (!role || !allowed.includes(role)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}
```

### 8.3 Sidebar Navigation Per Role

**ADMIN / SUPER_ADMIN**
- Users
- Vehicles
- Agencies
- Facilities

**DISPATCHER**
- Dashboard (live stats)
- Incident Queue
- Live Map
- *(incident detail opens as a sub-page)*

**WATCHER**
- New Incident *(the 5-step form is the primary and only view)*

**DRIVER / EMT / NURSE**
- Active Task *(single-page crew view)*

**PARTNER**
- Incidents *(forwarded to them)*

---

## 9. Screen Inventory & API Calls

Each screen below maps to a design file. The folder name matches the name in `stitch_nms_command_center (1)/stitch_nms_command_center/`.

---

### 9.1 Login — `nms_portal_login`

**File:** `nms_portal_login/code.html`

**What it does:** Email + password login form. NMS logo centred on a dark background.

**API:**
```
POST /auth/login
Body: { email, passwordRaw }
Response: { token, user: { userId, agencyId, role } }
```

**Notes:**
- On success, store token, redirect to role-based landing page
- Show inline validation errors (Zod + React Hook Form)
- No "register" link — registration is admin-only

---

### 9.2 Dispatcher Dashboard — `dispatcher_operations_dashboard`

**File:** `dispatcher_operations_dashboard/code.html`

**Roles:** `DISPATCHER`, `ADMIN`, `SUPER_ADMIN`

**What it does:** KPI cards (incidents by status), recent incidents list, quick-access to queue.

**API:**
```
GET /incidents?limit=10                  → recent incidents
GET /dispatch/queue                      → pending queue count
```

**Real-time:**
- Listen: `incident:new` → increment queue counter, prepend to list, show toast

**Notes:**
- Incident count cards: Draft, Submitted, Handling, Dispatched, Resolved
- Clicking a row navigates to `/dispatcher/incidents/:id`

---

### 9.3 Incident Queue — `mission_critical_command`

**File:** `mission_critical_command/code.html`

**Roles:** `DISPATCHER`, `ADMIN`, `SUPER_ADMIN`

**What it does:** Full table of SUBMITTED incidents waiting to be claimed.

**API:**
```
GET /dispatch/queue                      → list of SUBMITTED incidents
POST /dispatch/assign/:id                → dispatcher claims the incident
```

**Real-time:**
- Listen: `incident:new` → push new row to top of table

**Notes:**
- Each row has a "Claim" button → calls `POST /dispatch/assign/:id`, then navigates to incident detail
- Sort by `createdAt` ascending (oldest first — FIFO queue)

---

### 9.4 Incident Detail — `incident_detail_management`

**File:** `incident_detail_management/code.html`

**Roles:** `DISPATCHER`, `ADMIN`, `SUPER_ADMIN`

**What it does:** Full incident record — patient details, location, status controls, assigned crew/vehicle, actions.

**API:**
```
GET  /incidents/:id                      → incident + tasks + watcher/dispatcher info
POST /tasks                              → assign a crew (body: incidentId, vehicleId, driverId, emtId, nurseId)
POST /dispatch/handoff/:id               → forward to partner (body: toAgencyId, reason)
PATCH /incidents/:id/status              → update status (body: status, comments)
GET  /dispatch/nearest-vehicles?lat=&lng= → suggest vehicles for dispatch
```

**Real-time:**
- Join room: `incident:{id}` after load (the server joins by JWT — you just need to listen)
- Listen: `task:status` → update task card status live

**Notes:**
- Status progression: `SUBMITTED → DISPATCH_HANDLING → DISPATCHED → RESOLVED`
- The "Dispatch Crew" panel opens a modal. It shows vehicles sorted by distance (use `/dispatch/nearest-vehicles` with the incident's lat/lng)
- The "Forward to Partner" button opens a modal with agency list (from `GET /admin/agencies?type=PARTNER`) and reason textarea
- Incident status chip changes colour per status (see Component Patterns)

---

### 9.5 Live Operations Map — `live_operations_map`

**File:** `live_operations_map/code.html`

**Roles:** `DISPATCHER`, `ADMIN`, `SUPER_ADMIN`

**What it does:** Full-screen Leaflet map with vehicle markers and incident pins.

**API:**
```
GET /fleet/vehicles                      → list of all vehicles with last known lat/lng
GET /incidents?status=DISPATCHED         → active incidents to place pins
```

**Real-time:**
- Listen: `vehicle:location` → update map marker position in real-time

**Notes:**
- Use OpenStreetMap tiles (no API key needed)
- Vehicle marker: ambulance icon, coloured green if moving, grey if stationary
- Incident marker: red pin with case number tooltip
- Clicking a vehicle marker shows a popup: reg number, speed, last seen
- Clicking an incident pin navigates to `/dispatcher/incidents/:id`

---

### 9.6 New Incident — 5-Step Wizard

**Roles:** `WATCHER`, `DISPATCHER`, `ADMIN`, `SUPER_ADMIN`

The new incident form is a linear wizard. Each step is a separate design file. The form state lives in React state (or a multi-step form store) until the final submit.

#### Step 1: Chief Complaint — `new_incident_chief_complaint`
```
Fields: chiefComplaint (text area), alertMode (radio), alertAt (datetime picker if scheduled)
```

#### Step 2: Alert / Notifier Info — `new_incident_alert_info`
```
Fields: notifierDetails[] — array of name/phone/relationship objects
        watcherComments (textarea)
```

#### Step 3: Location Info — `new_incident_location_info`
```
Fields: locationName (text), subCounty (select), lat (number), lng (number)
        Include a small Leaflet map to drop a pin and auto-fill lat/lng
```

#### Step 4: Patient Details — `new_incident_patient_details`
```
Fields: patientName, patientAge, patientGender (select), patientNhif, patientContact, nextOfKin
        massCasualty (toggle), massCasualtyCount (shows if toggle on)
```

#### Step 5: Review & Submit — `new_incident_review_submit`
```
Shows all collected data in read-only summary cards.
Submit button calls:
  POST /incidents
  Body: all collected fields
  Response: { ok, data: incident }
```

**API:**
```
POST /incidents
Body: {
  chiefComplaint, locationName, subCounty, lat?, lng?,
  alertMode?, alertAt?, notifierDetails?,
  patientName?, patientAge?, patientGender?, patientNhif?, patientContact?, nextOfKin?,
  massCasualty?, massCasualtyCount?, watcherComments?
}
```

**Notes:**
- WATCHER role → incident created as `DRAFT`
- Other roles → `SUBMITTED` (goes straight to queue)
- Progress bar at top showing current step
- "Back" button allowed on all steps
- Validate each step before proceeding to next

---

### 9.7 User Management — `user_management`

**File:** `user_management/code.html`

**Roles:** `ADMIN`, `SUPER_ADMIN`

**What it does:** Paginated table of all users with role/agency filters.

**API:**
```
GET /admin/users?role=&agencyId=&page=&limit=  → paginated list
```

**Notes:**
- Filter bar: Role (select), Agency (select)
- Each row: name, email, role chip, agency, status (active/inactive), "Edit" link
- "Add User" button opens a form modal (or navigate to a create page)

---

### 9.8 User Detail / Edit — `user_detail_edit`

**File:** `user_detail_edit/code.html`

**Roles:** `ADMIN`, `SUPER_ADMIN`

**API:**
```
GET   /admin/users/:id       → user object
POST  /admin/users           → create (body: email, passwordRaw, name, role, agencyId, phone?)
PATCH /admin/users/:id       → update (body: name?, phone?, role?, isActive?)
```

---

### 9.9 Agency Management — `agency_management`

**File:** `agency_management/code.html`

**Roles:** `ADMIN`, `SUPER_ADMIN`

**API:**
```
GET  /admin/agencies?type=   → list (filter by INTERNAL | PARTNER)
POST /admin/agencies         → create (body: name, type, location?, contactInfo?)
```

---

### 9.10 Agency Detail / Edit — `agency_detail_edit`

**File:** `agency_detail_edit/code.html`

**Roles:** `ADMIN`, `SUPER_ADMIN`

**API:**
```
PATCH /admin/agencies/:id    → update (body: name?, location?, contactInfo?, isActive?)
```

---

### 9.11 Fleet (Vehicle) Management — `fleet_management`

**File:** `fleet_management/code.html`

**Roles:** `ADMIN`, `SUPER_ADMIN`

**API:**
```
GET  /admin/vehicles?agencyId=&page=&limit=  → paginated list
POST /admin/vehicles                          → create (body: registrationNumber, imei, agencyId)
```

**Notes:**
- Columns: Reg Number, IMEI, Agency, Status (active/inactive), Last Location, Last Seen
- Status badge green/red for isActive

---

### 9.12 Vehicle Detail / Edit — `vehicle_detail_edit`

**File:** `vehicle_detail_edit/code.html`

**Roles:** `ADMIN`, `SUPER_ADMIN`

**API:**
```
PATCH /admin/vehicles/:id    → update (body: registrationNumber?, imei?, isActive?)
```

---

### 9.13 Facility Management — `facility_management`

**File:** `facility_management/code.html`

**Roles:** `ADMIN`, `SUPER_ADMIN`

**API:**
```
GET  /admin/facilities?subCounty=&kephLevel=  → list
POST /admin/facilities                         → create (body: name, type, kephLevel, subCounty, lat, lng)
PATCH /admin/facilities/:id                    → update (body: name?, type?, kephLevel?, isActive?)
```

**Notes:**
- KEPH level is a Kenya healthcare tier system: 1 (dispensary) to 6 (national referral hospital)
- Show KEPH level as a numeric badge

---

### 9.14 Partner Dashboard — `partner_portal_dashboard`

**File:** `partner_portal_dashboard/code.html`

**Roles:** `PARTNER`, `ADMIN`, `SUPER_ADMIN`

**What it does:** Table of incidents forwarded to this partner agency.

**API:**
```
GET /partner/incidents?page=&limit=  → paginated list of forwarded incidents
```

**Notes:**
- Each row: case number, chief complaint, status, date received, action button
- "Accept" button only shows for incidents not yet accepted (still in DISPATCHED/DISPATCH_HANDLING status from the partner's perspective)
- Clicking a row navigates to `/partner/incidents/:id`

---

### 9.15 Partner Incident Detail — `partner_incident_detail`

**File:** `partner_incident_detail/code.html`

**Roles:** `PARTNER`, `ADMIN`, `SUPER_ADMIN`

**API:**
```
GET  /partner/incidents/:id          → full incident detail
POST /partner/incidents/:id/accept   → acknowledge receipt
PATCH /partner/incidents/:id/status  → update status (body: status, comments?)
```

---

### 9.16 Crew Active Task — (no dedicated design file — build from spec)

**Roles:** `DRIVER`, `EMT`, `NURSE`

**What it does:** Single-screen view of the crew's current active task. Shows incident details and a status progression stepper.

**API:**
```
GET  /tasks/active                    → current active task
PATCH /tasks/:id/status               → advance task status
POST /tasks/:id/patient-data          → log pre-hospital management notes
```

**Task Status Progression:**
```
PENDING → ACCEPTED → EN_ROUTE → AT_SCENE → PATIENT_PICKED → AT_HOSPITAL → COMPLETED
```

Each step is a button the crew taps to advance. Once a step is tapped, it's timestamped on the server. The UI shows elapsed time between steps.

**Notes:**
- This is the primary mobile-facing screen — design it responsive (375px min width)
- If no active task, show a holding screen: "No active task assigned"
- `POST /tasks/:id/patient-data` is available in `AT_SCENE` or later status

---

## 10. API Response Shape

All responses follow this envelope:

```ts
// Success
{ ok: true, data: T }

// Success paginated
{ ok: true, data: T[], meta: { total, page, limit, totalPages } }

// Error
{ ok: false, message: string }
```

HTTP status codes:
- `200` — success
- `201` — created
- `400` — validation error
- `401` — not authenticated
- `403` — wrong role
- `404` — not found
- `500` — server error

---

## 11. TypeScript Types

Define these in `src/types/api.ts`. They mirror the Prisma schema exactly.

```ts
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'WATCHER' | 'DISPATCHER' | 'DRIVER' | 'EMT' | 'NURSE' | 'PARTNER';
export type AgencyType = 'INTERNAL' | 'PARTNER';

export type IncidentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'DISPATCH_HANDLING'
  | 'DISPATCH_ON_HOLD'
  | 'DISPATCHED'
  | 'RESOLVED';

export type TaskStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'AT_SCENE'
  | 'PATIENT_PICKED'
  | 'AT_HOSPITAL'
  | 'COMPLETED'
  | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: Role;
  agencyId: string;
  isActive: boolean;
  createdAt: string;
}

export interface Agency {
  id: string;
  name: string;
  type: AgencyType;
  location?: string;
  contactInfo?: Record<string, unknown>;
  isActive: boolean;
}

export interface Vehicle {
  id: string;
  registrationNumber: string;
  imei: string;
  isActive: boolean;
  lastLat?: number;
  lastLng?: number;
  lastLocationAt?: string;
  agencyId: string;
}

export interface Facility {
  id: string;
  name: string;
  type: string;
  kephLevel: number;
  subCounty: string;
  lat: number;
  lng: number;
  isActive: boolean;
}

export interface Incident {
  id: string;
  caseNumber: string;
  status: IncidentStatus;
  chiefComplaint: string;
  locationName: string;
  subCounty: string;
  lat?: number;
  lng?: number;
  alertMode?: string;
  alertAt?: string;
  notifierDetails?: Array<Record<string, string>>;
  patientName?: string;
  patientAge?: string;
  patientGender?: string;
  patientNhif?: string;
  patientContact?: string;
  nextOfKin?: string;
  massCasualty: boolean;
  massCasualtyCount?: number;
  watcherComments?: string;
  dispatcherComments?: string;
  preHospitalManagement?: string;
  createdAt: string;
  watcher?: Pick<User, 'id' | 'name' | 'phone'>;
  dispatcher?: Pick<User, 'id' | 'name' | 'phone'>;
  tasks?: Task[];
}

export interface Task {
  id: string;
  status: TaskStatus;
  receivedAt: string;
  acceptedAt?: string;
  sceneArrivalAt?: string;
  patientPickAt?: string;
  facilityArrivalAt?: string;
  completedAt?: string;
  incidentId: string;
  vehicleId: string;
  vehicle?: Vehicle;
  driverId: string;
  emtId: string;
  nurseId: string;
  driver?: Pick<User, 'name' | 'phone'>;
}
```

---

## 12. Full API Endpoint Reference

```
POST   /auth/login
POST   /auth/register                        (admin use only — no UI needed)
GET    /auth/me

GET    /incidents?status=&page=&limit=
POST   /incidents
GET    /incidents/:id
PATCH  /incidents/:id/status                 Body: { status, comments? }

GET    /dispatch/queue
POST   /dispatch/assign/:id
POST   /dispatch/handoff/:id                 Body: { toAgencyId, reason }
GET    /dispatch/nearest-vehicles?lat=&lng=&limit=

POST   /tasks                                Body: { incidentId, vehicleId, driverId, emtId, nurseId }
GET    /tasks/active
PATCH  /tasks/:id/status                     Body: { status, reason? }
POST   /tasks/:id/patient-data               Body: { preHospitalManagement, dispatcherChallenges? }

GET    /fleet/vehicles?agencyId=&page=&limit=
POST   /fleet/vehicles                       Body: { registrationNumber, imei, agencyId }

GET    /admin/users?role=&agencyId=&page=&limit=
GET    /admin/users/:id
POST   /admin/users
PATCH  /admin/users/:id

GET    /admin/vehicles?agencyId=&page=&limit=
POST   /admin/vehicles
PATCH  /admin/vehicles/:id

GET    /admin/agencies?type=
POST   /admin/agencies
PATCH  /admin/agencies/:id

GET    /admin/facilities?subCounty=&kephLevel=
POST   /admin/facilities
PATCH  /admin/facilities/:id

GET    /partner/incidents?page=&limit=
GET    /partner/incidents/:id
POST   /partner/incidents/:id/accept
PATCH  /partner/incidents/:id/status         Body: { status, comments? }
```

All authenticated endpoints require:
```
Authorization: Bearer <jwt_token>
```

---

## 13. Backend Connection Details

```
Backend base URL (local):  http://localhost:3000
Socket.io URL (local):     http://localhost:3000
```

The backend server is in `NMS/backend/`. To run it locally:

```bash
cd NMS/backend
cp .env.example .env    # fill in DATABASE_URL and JWT_SECRET
npm install
npm run db:generate     # generates Prisma client
npm run db:migrate      # runs migrations
npm run db:seed         # seeds test data
npm run dev
```

Test credentials after seeding:
- `admin@nms.go.ke` / `password123` (ADMIN)
- `dispatcher@nms.go.ke` / `password123` (DISPATCHER)
- `watcher@nms.go.ke` / `password123` (WATCHER)
- `driver@nms.go.ke` / `password123` (DRIVER)
- `partner@nairobiambulance.co.ke` / `password123` (PARTNER)

---

## 14. What NOT to Touch

The `NMS/backend/` directory is owned by the backend. Do not edit any file in it.

Your work lives entirely in `NMS/frontend/`.

---

## 15. Definition of Done

A screen is considered complete when:
1. It matches the reference design (`code.html` + `screen.png`) at 1280px width
2. All API calls are wired (loading states, error states, empty states handled)
3. Real-time updates work on screens that require them (dashboard, queue, map, incident detail)
4. Role guards block unauthorized access
5. TypeScript compiles with no errors (`tsc --noEmit`)
6. Mobile-responsive on screens flagged as such (crew active task page)
