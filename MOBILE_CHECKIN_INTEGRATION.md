# Mobile Check‑In Integration — Selfie + Location

**Audience:** mobile responder app dev (`nms-responder`, Expo / React Native).
**Status:** backend is live. This doc is what you need to wire up the app side.

## What changed

Check‑in used to be a plain JSON `POST` that just assigned the crew member to a
vehicle. It now records an **accountability event** at shift start: the driver
(or EMT / nurse) must submit a **selfie** and their **GPS location** when they
check in. Both are **required** — a check‑in without them is rejected.

The backend now:
- stores the selfie on the server,
- saves a `CheckIn` record (`user`, `vehicle`, `role`, `lat`, `lng`, `selfiePath`, `checkedInAt`),
- still sets the live crew assignment on the vehicle exactly as before.

Nothing else about the responder flow changes. **Check‑out is unchanged.**

---

## The endpoint

```
POST /fleet/{vehicleId}/checkin
```

| | |
|---|---|
| **Auth** | `Authorization: Bearer <token>` (same token as every other call — your axios client already attaches it) |
| **Allowed roles** | `DRIVER`, `EMT`, `NURSE` |
| **Content‑Type** | `multipart/form-data` (was `application/json`) |

### Form fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `lat` | text | ✅ | GPS latitude, e.g. `-1.2921` |
| `lng` | text | ✅ | GPS longitude, e.g. `36.8219` |
| `file` | file (image/*) | ✅ | The selfie. JPEG/PNG/WebP. Max **10 MB**. |

> ⚠️ **Field order matters.** Append `lat` and `lng` **before** the `file` part.
> The server reads the text fields off the same stream as the file, and only
> fields that arrive *before* the file are captured. If you append the file
> first you’ll get `Valid "lat" and "lng" fields are required`.

### Success — `200 OK`

Returns the updated vehicle (same shape check‑in returned before), so your
existing "you are now checked in to vehicle X" UI keeps working:

```json
{
  "ok": true,
  "data": {
    "id": "veh-uuid",
    "registrationNumber": "KDA 123A",
    "currentDriver": { "id": "user-uuid", "name": "Jane Mwangi", "phone": "+254…" },
    "currentEmt": null,
    "currentNurse": null
  }
}
```

### Errors — `400`

| Message | Cause |
|---------|-------|
| `A check-in selfie image (field "file") is required` | no file part sent |
| `The check-in selfie must be an image` | file part isn’t `image/*` |
| `Valid "lat" and "lng" fields are required (send them before the file part)` | missing/NaN coords, or file appended before the coords |
| `Vehicle not found` | bad `vehicleId` |

---

## Device prerequisites

You already have `expo-location`. You’ll need a camera capture lib — add:

```bash
npx expo install expo-image-picker
```

Permissions to request at check‑in time:
- **Camera** (`expo-image-picker` → `requestCameraPermissionsAsync`)
- **Location** (`expo-location` → `requestForegroundPermissionsAsync`)

Add the usage strings to `app.json` (iOS) so the store build isn’t rejected:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "Take a check-in selfie to start your shift.",
        "NSLocationWhenInUseUsageDescription": "Record where you checked in."
      }
    },
    "plugins": ["expo-image-picker", "expo-location"]
  }
}
```

---

## Reference implementation (Expo / React Native + axios)

Drop this into `src/api/responder.ts` (your axios `client` already injects the
Bearer token, so don’t set auth or `Content-Type` manually):

```ts
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import client from './client';
import type { ApiResponse } from './types'; // adjust to your types

/**
 * Capture a selfie + current location and check in to a vehicle.
 * Throws if the user denies camera/location or cancels the selfie.
 */
export async function checkInToVehicle(vehicleId: string) {
  // 1. Camera permission + selfie (front camera)
  const cam = await ImagePicker.requestCameraPermissionsAsync();
  if (!cam.granted) throw new Error('Camera permission is required to check in.');

  const shot = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    quality: 0.6,          // keep it well under the 10 MB limit
    allowsEditing: false,
  });
  if (shot.canceled) throw new Error('Check-in selfie is required.');
  const photo = shot.assets[0];

  // 2. Location permission + current fix
  const loc = await Location.requestForegroundPermissionsAsync();
  if (!loc.granted) throw new Error('Location permission is required to check in.');
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  // 3. Build multipart body — TEXT FIELDS FIRST, then the file
  const form = new FormData();
  form.append('lat', String(pos.coords.latitude));
  form.append('lng', String(pos.coords.longitude));
  form.append('file', {
    uri: photo.uri,
    name: photo.fileName ?? `checkin-${Date.now()}.jpg`,
    type: photo.mimeType ?? 'image/jpeg',
  } as any); // RN's FormData file shape

  // 4. POST. Do NOT set Content-Type — let RN set the multipart boundary.
  const res = await client.post<ApiResponse<unknown>>(
    `/fleet/${vehicleId}/checkin`,
    form,
  );
  return res.data.data; // the updated vehicle
}
```

> If axios ever tries to JSON‑stringify the `FormData` (some RN setups), pass
> `{ transformRequest: (d) => d }` as the third arg to `client.post` to force it
> to send the body untouched.

### Suggested UX
1. User signs in → lands on the vehicle picker (`GET /fleet/vehicles`, unchanged).
2. User taps a vehicle → **front camera opens for the selfie** → then the
   location fix is taken silently → `checkInToVehicle(vehicleId)` fires.
3. On success, proceed to the shift/home screen as today.
4. Surface the specific `400` message on failure so the responder knows what to fix.

---

## Check‑out (no change)

```
DELETE /fleet/{vehicleId}/checkin
```
Still a plain authenticated call, no body. No selfie/location needed.

---

## Dispatcher‑facing endpoints (FYI — you don’t call these)

The web dispatcher/admin app can review check‑ins:

- `GET /fleet/checkins?vehicleId=&limit=` → recent check‑ins with user, vehicle, coords, timestamp.
- `GET /fleet/checkins/{id}/selfie` → streams the selfie image (auth required).

---

## Quick backend test (curl)

```bash
curl -X POST "$API/fleet/$VEHICLE_ID/checkin" \
  -H "Authorization: Bearer $TOKEN" \
  -F "lat=-1.2921" \
  -F "lng=36.8219" \
  -F "file=@./selfie.jpg;type=image/jpeg"
```

Note the field order: `lat`, `lng`, then `file`.

---

## Questions for backend

- Need extra fields on the check‑in record (e.g. device id, accuracy, battery)? Easy to add.
- Want check‑in to also emit a real‑time socket event to dispatch? Say the word.
