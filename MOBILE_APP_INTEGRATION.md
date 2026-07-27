# Mobile App Integration: Crew, Stops, Handover Vitals

Audience: the mobile responder app developer (Expo / React Native).
Status: the backend is live. This document describes the new endpoints the app
should use. The existing check-in flow is covered separately in
MOBILE_CHECKIN_INTEGRATION.md and has not changed.

All calls use the same base URL and the same auth as the rest of the app. Send the
JWT you already store on login as an Authorization header:

```
Authorization: Bearer <token>
Content-Type: application/json
```

Responses follow the standard shape used across the API:

```json
{ "ok": true, "data": ... }
```

On error you get a non-2xx status and `{ "ok": false, "error": "message" }`.

There are three new areas below: crew assignment, task stops, and handover vitals.


## 1. Crew assignment (driver assigns EMT and nurse)

A driver who is checked in to a vehicle can set or clear the EMT and the nurse on
that vehicle. This is the driver-side action for requested change number 9.

First, load the people the driver can pick from. This returns the active EMT and
nurse users in the driver's own agency.

```
GET /fleet/crew-members
```

Allowed roles: DRIVER, EMT, NURSE, ADMIN, SUPER_ADMIN.

Response:

```json
{
  "ok": true,
  "data": [
    { "id": "u1", "name": "Jane Doe", "phone": "0712345678", "role": "EMT" },
    { "id": "u2", "name": "John Roe", "phone": "0700111222", "role": "NURSE" }
  ]
}
```

Then assign or clear crew on the vehicle:

```
POST /fleet/{vehicleId}/crew
```

Allowed roles: DRIVER (must be the driver currently checked in to that vehicle),
ADMIN, SUPER_ADMIN.

Body. Send only the keys you want to change. Pass a user id to set that seat, pass
null to clear it, and omit the key to leave it as it is.

```json
{ "emtId": "u1", "nurseId": null }
```

Response is the updated vehicle including the current crew:

```json
{
  "ok": true,
  "data": {
    "id": "veh-123",
    "registrationNumber": "KDA 123A",
    "currentDriver": { "id": "u9", "name": "Driver Name" },
    "currentEmt": { "id": "u1", "name": "Jane Doe" },
    "currentNurse": null
  }
}
```

Notes:
- Only the driver checked in to the vehicle can assign its crew. If a different
  driver tries, the call returns 403.
- Assigning crew here is separate from check-in. A crew member is still expected to
  do their own check-in (selfie plus GPS) for accountability.


## 2. Task stops (re-route to another destination during a task)

During an active task the crew can add extra destinations, for example moving a
patient from Kenyatta National Hospital to Mama Lucy. This is requested change
number 6.

Add a stop:

```
POST /tasks/{taskId}/stops
```

Allowed roles: DRIVER, EMT, NURSE (assigned to the task), DISPATCHER, ADMIN,
SUPER_ADMIN.

Body:

```json
{
  "name": "Mama Lucy Hospital",
  "facilityId": "fac-55",
  "lat": -1.2789,
  "lng": 36.8925,
  "note": "Patient needs a CT scan not available at the first facility"
}
```

Only `name` is required. `facilityId`, `lat`, `lng`, and `note` are optional. If you
have the facility from the facilities list, send its id and coordinates so the stop
can be shown on the map.

Response is the created stop:

```json
{
  "ok": true,
  "data": {
    "id": "stop-1",
    "taskId": "task-9",
    "name": "Mama Lucy Hospital",
    "facilityId": "fac-55",
    "lat": -1.2789,
    "lng": 36.8925,
    "note": "Patient needs a CT scan...",
    "sequence": 1,
    "arrivedAt": null,
    "createdAt": "2026-07-27T09:15:00.000Z"
  }
}
```

List the stops for a task, in visit order:

```
GET /tasks/{taskId}/stops
```

Mark a stop as reached:

```
PATCH /tasks/{taskId}/stops/{stopId}/arrived
```

This sets `arrivedAt` to the server time and returns the updated stop.


### Realtime and push notifications for stops

When a stop is added or marked arrived, the backend emits over Socket.IO:

```
task:stop-added     payload: { taskId, stop }
task:stop-updated   payload: { taskId, stop }
```

Delivery uses the rooms the socket already joins from your auth token, so there is
nothing extra to join. Every assigned crew member receives these on their own
personal room, and dispatchers receive them on the dispatcher room. This means a
stop added by a dispatcher reaches the crew, and a stop added by the crew reaches
the dispatcher.

Connect the socket with the same token you use for the REST calls, then listen:

```js
const socket = io(BASE_URL, { auth: { token } });
socket.on('task:stop-added', ({ taskId, stop }) => {
  // show an in-app banner and a local notification
});
socket.on('task:stop-updated', ({ taskId, stop }) => {
  // update the stop in your local state
});
```

This covers the case where the app is in the foreground with a live socket.

For background push (app closed or backgrounded), you need device push. The backend
does not send device push yet. The simplest path is Expo push: register for a push
token on the device, then send it to the server so it can push when the socket is
not connected. Tell me you want this and I will add two things: an endpoint to store
the device token against the user, and a server-side send that fires alongside the
socket emit above. Until then, use a local notification triggered by the socket
event while the app is running.


## 3. Handover vitals (vital signs at hospital handover)

At hospital handover the crew records the patient's vital signs. This is requested
change number 7. It reuses the existing patient-data endpoint, which now also
accepts a `handoverVitals` object.

```
POST /tasks/{taskId}/patient-data
```

Allowed roles: DRIVER, EMT, NURSE (assigned to the task).

Body:

```json
{
  "preHospitalManagement": "IV fluids started, oxygen given",
  "handoverVitals": {
    "temperature": "37.2",
    "pulseRate": "88",
    "respirationRate": "18",
    "bp": "120/80",
    "spo2": "97",
    "gcs": "15"
  }
}
```

`preHospitalManagement` is still required. `handoverVitals` is optional and its keys
are free-form, but please use the keys above where they apply so the dispatcher view
shows friendly labels. Any extra keys are stored and displayed using their raw name.
The dispatcher sees these under "Vitals at Hospital Handover" on the incident page.


## 4. Automatic GPS capture (auto-pin the scene)

This is requested change number 4. On the device, capture the phone's GPS instead of
asking the user to pin a location by hand. Use the platform location API (in Expo,
`expo-location`): request permission, get the current position, and send `lat` and
`lng` with the incident you create. Send them as numbers.

Request foreground permission first, then read the position once when the user starts
a capture. If permission is denied, fall back to manual entry and let the user type
the location. Do not block the whole capture on GPS; a capture with a typed location
is still valid.

The web dispatcher form also has a "Use my current location" button now, but on the
web the operator is usually not at the scene, so GPS matters most on the mobile app.


## 5. Offline capture and sync

This is requested change number 17. Field devices lose signal, so the app should let a
user capture an incident (and its photos) while offline and sync it when the connection
returns. The backend now supports safe sync so a replayed capture never creates a
duplicate.

How to do it on the device:

1. When the user saves a capture, generate a stable unique id on the device, for
   example a UUID. Call it the client reference. Store the whole capture (fields plus
   any file paths) in a local queue, for example SQLite or AsyncStorage.
2. While offline, keep captures in the queue and show them as pending.
3. When back online, send each queued capture to the incident create endpoint and
   include the client reference as `clientRef`:

```
POST /incidents
{
  "chiefComplaint": "...",
  "locationName": "...",
  "subCounty": "...",
  "lat": -1.29,
  "lng": 36.82,
  "clientRef": "b2f1c8e2-9c1a-4a77-9a1e-3d2f5e6a7b8c"
}
```

4. On a 2xx response, mark that capture as synced and remove it from the queue.

The `clientRef` is an idempotency key. If the network drops after the server saved the
incident but before the app got the response, the app will retry with the same
`clientRef`, and the server returns the incident it already created instead of making a
second one. Generate the `clientRef` once per capture and never change it on retry.

Notes and limits:
- `clientRef` must be at least 8 characters. A UUID is ideal.
- Attach photos (selfies, PCR files) after the incident or task exists, using the
  existing upload endpoints, once you have the id back from sync.
- This covers incident capture. If you also need offline queueing for other writes
  (stops, status changes, handover vitals), tell me and I will add the same
  idempotency handling to those endpoints.


## Quick reference

| Purpose | Method and path |
|---|---|
| List assignable crew | GET /fleet/crew-members |
| Assign or clear crew | POST /fleet/{vehicleId}/crew |
| Add a task stop | POST /tasks/{taskId}/stops |
| List task stops | GET /tasks/{taskId}/stops |
| Mark stop reached | PATCH /tasks/{taskId}/stops/{stopId}/arrived |
| Save handover vitals | POST /tasks/{taskId}/patient-data |
| Create incident (with offline clientRef) | POST /incidents |

If anything here is unclear or you need a field added, let me know and I will adjust
the backend to fit the app rather than the other way around.
