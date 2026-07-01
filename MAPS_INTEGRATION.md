# NMS-EOC Mobile App — Dev Guide

This covers everything you need to build the driver/crew mobile app for the Nairobi Emergency Operations Centre system. The backend is already running and the endpoints are live. Read this before you write a single line of code.

---

## The basics

**Base URL:** `http://156.67.25.84:8080`

All requests need a Bearer token in the Authorization header except the login endpoint. Every response comes back as `{ ok: true, data: ... }` on success or `{ ok: false, message: "..." }` on error.

The app is for three roles: **DRIVER**, **EMT**, and **NURSE**. They all use the same endpoints. The backend figures out which role they are from the token and acts accordingly.

---

## Auth

```
POST /auth/login
Body: { "email": "driver@nms.go.ke", "password": "..." }
```

Returns a JWT. Store it securely (not in plain SharedPreferences — use EncryptedSharedPreferences on Android or Keychain on iOS). Every subsequent request needs:

```
Authorization: Bearer <token>
```

The token doesn't expire quickly but you should handle 401 responses gracefully — show the login screen again when that happens.

---

## Shift start — checking in to a vehicle

Before a crew member can receive tasks they need to check in to their assigned ambulance. This is what tells the system which vehicle has which crew on board.

**1. Get the list of vehicles for their agency:**
```
GET /fleet/vehicles
```
Returns all vehicles belonging to the crew member's agency. Show this as a list for them to pick from.

**2. Check in:**
```
POST /fleet/:vehicleId/checkin
```
No body needed — it uses the user ID from the token. The driver, EMT, and nurse each check in separately. The system links all three to the vehicle.

**3. Check current check-in status:**
```
GET /fleet/my-checkin
```
Use this on app launch to see if they're already checked in from a previous session. If they are, skip the check-in screen and go straight to the task screen.

**4. Check out at end of shift:**
```
DELETE /fleet/:vehicleId/checkin
```

---

## GPS location pushing

This is important. The dispatcher's map only shows ambulances if the mobile app is pushing location. Do this on a background service, every 10–15 seconds while the app is running.

```
POST /fleet/location
Body: {
  "imei": "the vehicle's IMEI number",
  "lat": -1.2921,
  "lng": 36.8219
}
```

You get the vehicle IMEI from the `/fleet/my-checkin` response. Push location even when the app is in the background — use a foreground service on Android so it doesn't get killed. Stop pushing when the crew checks out.

---

## Real-time — Socket.io

Tasks are assigned in real time. Don't poll for tasks — use the socket.

**Connect:**
```javascript
const socket = io("http://156.67.25.84:8080", {
  transports: ["websocket"],
  auth: { token: "<bearer token>" }
})
```

**Events to listen for:**

| Event | When it fires | What to do |
|---|---|---|
| `task:assigned` | Dispatcher assigns this vehicle to an incident | Show incoming task alert, play sound |
| `task:cancelled` | Task was cancelled by dispatcher | Show notification, go back to standby |
| `incident:update` | Details on the incident were updated | Refresh the active task screen |

When `task:assigned` fires, the payload includes the task ID. Fetch the full task details immediately using `GET /tasks/active`.

---

## Tasks — the main flow

**Get active task:**
```
GET /tasks/active
```
Returns the current task if one exists, or null if the crew is on standby. Call this on app launch and after receiving a `task:assigned` socket event.

The task object includes `incident` with all the scene details — location name, coordinates, chief complaint, patient info, etc.

**Update task status:**
```
PATCH /tasks/:id/status
Body: { "status": "EN_ROUTE" }
```

The status flow is strictly:
```
PENDING → ACCEPTED → EN_ROUTE → AT_SCENE → PATIENT_PICKED → AT_HOSPITAL → COMPLETED
```

Each status change is timestamped on the backend — this is how TAT (turnaround time) is calculated for analytics, so make sure the crew is actually updating these at the right moments, not all at once at the end.

| Status | When to update |
|---|---|
| `ACCEPTED` | Crew acknowledges the task |
| `EN_ROUTE` | Vehicle starts moving toward the scene |
| `AT_SCENE` | Vehicle arrives at the incident location |
| `PATIENT_PICKED` | Patient is loaded into the ambulance |
| `AT_HOSPITAL` | Vehicle arrives at the receiving facility |
| `COMPLETED` | Patient handed over, crew available again |

If the task needs to be cancelled (wrong vehicle, crew unavailable):
```
PATCH /tasks/:id/status
Body: { "status": "CANCELLED", "reason": "Vehicle breakdown" }
```

**View task history:**
```
GET /tasks/history?page=1&limit=20
```

---

## Patient data

After picking up the patient, the crew can log pre-hospital management notes:

```
POST /tasks/:id/patient-data
Body: {
  "preHospitalManagement": "O2 administered, IV line established, c-spine precautions taken",
  "dispatcherChallenges": "Traffic on Mombasa Road delayed response by 8 minutes"
}
```

---

## Patient Care Report (PCR) upload

After task completion the crew can upload a PCR document — photo, PDF, or Word doc:

```
POST /tasks/:id/patient-care-report
Content-Type: multipart/form-data

Fields:
  file: <the file>
  note: "optional text note"
```

Max file size is 10MB. Supported formats: JPEG, PNG, WEBP, HEIC, HEIF, PDF, DOCX.

---

## Google Maps — navigation

This is the main thing you're adding that the web app doesn't handle. When a task is assigned, you need to navigate the driver to the scene.

**APIs to enable in Google Cloud Console (same project as the web team):**
- Maps SDK for Android (or iOS depending on your platform)
- Directions API
- Places API

**The incident coordinates come from the task response:**
```json
{
  "incident": {
    "lat": -1.2864,
    "lng": 36.8172,
    "locationName": "Kenyatta National Hospital, Hospital Road"
  }
}
```

Use `lat` and `lng` as the navigation destination. The device GPS is the origin.

**What to build:**
1. When status changes to `EN_ROUTE`, launch navigation to the incident coordinates
2. Use the Google Maps SDK's built-in turn-by-turn navigation — don't try to build routing yourself
3. Show ETA on the task screen and ideally push it back to the backend so dispatchers can see it (you can PATCH the task with any extra fields you add)
4. When the crew arrives and marks `AT_SCENE`, stop navigation

On Android, the cleanest approach is to use `NavigationApi` from the Navigation SDK (part of Maps SDK) rather than just dropping a pin — it gives you proper turn-by-turn with voice guidance.

---

## What the incident object looks like

When you fetch an active task you get back something like this:

```json
{
  "id": "task-uuid",
  "status": "PENDING",
  "receivedAt": "2025-07-01T08:30:00Z",
  "vehicleId": "vehicle-uuid",
  "driverId": "user-uuid",
  "incident": {
    "id": "incident-uuid",
    "caseNumber": "EOC-INC-20250701-4823",
    "chiefComplaint": "Road traffic accident, multiple casualties",
    "locationName": "Uhuru Highway, near Globe Roundabout",
    "subCounty": "Starehe",
    "lat": -1.2864,
    "lng": 36.8172,
    "alertNature": "Trauma",
    "alertNatureDetail": "Road Traffic Accident",
    "massCasualty": false,
    "patientName": "John Doe",
    "patientAge": "34",
    "patientGender": "Male",
    "patientContact": "0722000000",
    "nextOfKin": "Jane Doe",
    "nextOfKinPhone": "0733000000",
    "preHospitalManagement": null,
    "watcherComments": "Caller reports victim is conscious but has leg injuries"
  }
}
```

---

## Screens you need to build

Rough list — design them however makes sense for the workflow:

1. **Login** — email + password
2. **Check-in** — pick vehicle from list, confirm crew position (driver/EMT/nurse)
3. **Standby** — show current status, vehicle, crew. Socket listens here for incoming tasks
4. **Incoming task alert** — fullscreen alert with chief complaint and location. Accept or (if necessary) reject
5. **Active task** — scene details, patient info, status update buttons, navigation button
6. **Navigation** — embedded or launched Google Maps navigation to the scene
7. **Patient data entry** — pre-hospital management notes, logged after patient pickup
8. **PCR upload** — camera or file picker for the patient care report
9. **Task history** — list of past tasks for the shift

---

## A few things to sort out with the team

- The web app already pushes location via the Uffizio GPS tracker (Kimiitrack). If the ambulances have that hardware, the mobile app location push might be redundant — worth checking with the ops team so you're not sending duplicate location pings for the same vehicle.

- The `isGbvCase` flag on incidents — if a case is flagged as GBV, you might want to handle it differently on the mobile side (discrete notifications, no loud alert sound, etc.). Check with the EOC coordinator on protocol.

- For the Navigation SDK on Android, you need a separate billing enablement in Google Cloud — it's billed differently from the regular Maps SDK. Make sure that's sorted before testing navigation in production.

---

## Quick reference

| Method | Endpoint | Who |
|---|---|---|
| POST | `/auth/login` | Everyone |
| GET | `/fleet/vehicles` | Driver, EMT, Nurse |
| POST | `/fleet/:id/checkin` | Driver, EMT, Nurse |
| DELETE | `/fleet/:id/checkin` | Driver, EMT, Nurse |
| GET | `/fleet/my-checkin` | Driver, EMT, Nurse |
| POST | `/fleet/location` | Driver |
| GET | `/tasks/active` | Driver, EMT, Nurse |
| PATCH | `/tasks/:id/status` | Driver, EMT, Nurse |
| POST | `/tasks/:id/patient-data` | Driver, EMT, Nurse |
| POST | `/tasks/:id/patient-care-report` | Driver, EMT, Nurse |
| GET | `/tasks/history` | Driver, EMT, Nurse |

Any questions, reach out to the backend team before building something in a way that doesn't match how the API works — easier to clarify upfront than to refactor later.
