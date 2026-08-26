# Mobile App Integration: OTP Login for Drivers and EMTs

Audience: the mobile responder app developer (Expo / React Native).
Status: the backend is live. This document describes the new phone plus OTP
login flow and how to wire it into the app.

## What this is

Drivers and EMTs can now log in to the mobile app with just their phone
number. The backend sends a 6 digit code by SMS, the app collects it, and the
backend exchanges it for the same JWT the app already gets from password
login. There is no password to type on a phone screen.

This applies to the DRIVER and EMT roles only. Every other role
(SUPER_ADMIN, ADMIN, WATCHER, DISPATCHER, NURSE, PARTNER) works from the web
dashboard and keeps signing in with email and password there. Nothing about
the web login changes. `POST /auth/login` still exists and still works for
every role, including DRIVER and EMT, so it stays available as a fallback if
a driver or EMT ever needs to sign in from a browser or SMS delivery is down.

All calls use the same base URL as the rest of the app. These two endpoints
are the only ones that do not need an Authorization header, since their whole
purpose is to obtain the token in the first place.

```
Content-Type: application/json
```

Responses follow the standard shape used across the API:

```json
{ "ok": true, "data": ... }
```

On error you get a non-2xx status and `{ "ok": false, "error": "message" }`.

## 1. Request a code

```
POST /auth/otp/request
```

No auth header. Body:

```json
{ "phone": "0712345678" }
```

Send the phone number the way the user types it. The backend accepts
`0712345678`, `254712345678`, `+254712345678`, and `712345678`, and
normalizes all of them to the same value internally, so you do not need to
format it on the device.

Success response:

```json
{
  "ok": true,
  "data": {
    "message": "Code sent",
    "expiresInSeconds": 300
  }
}
```

The code is 6 digits and is valid for 5 minutes. The SMS reads:

```
Your EOC login code is 123456. It expires in 5 minutes. Do not share this code.
```

In development only (backend `NODE_ENV` is not `production`), the response
also includes `devCode` with the plain code, so you can test the flow without
waiting on an SMS. It is never present in production, so do not build any
logic around it beyond local testing.

### Errors

| Status | Error message | Meaning | What to show the user |
|---|---|---|---|
| 400 | `Enter a valid phone number` | The number does not match a valid Kenyan MSISDN | Ask them to check the number |
| 401 | `No active driver or EMT account found for this number` | No DRIVER or EMT user has this phone on file | Tell them to contact their admin to have their phone number added |
| 409 | `Multiple accounts share this phone number, contact an admin` | Two accounts share one phone number, a data problem on the backend side | Tell them to contact an admin, this is not something the app can fix |
| 400 | `Please wait a minute before requesting another code` | A code was already sent in the last 60 seconds | Disable the resend button and count down, see below |
| 400 | `Too many code requests for this number, try again later` | 5 codes already sent to this number in the last hour | Show a generic "try again later" message |

## 2. Verify the code and log in

```
POST /auth/otp/verify
```

No auth header. Body:

```json
{ "phone": "0712345678", "code": "123456" }
```

Success response, same shape as `POST /auth/login`:

```json
{
  "ok": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "u-123",
      "email": "jane.driver@nms.local",
      "name": "Jane Mwangi",
      "role": "DRIVER",
      "agencyId": "agency-1"
    }
  }
}
```

Because this is the exact same shape the app already gets back from
`POST /auth/login`, you can store the token and set up the authenticated
session using the code you already have. No new storage logic, no new user
object shape, nothing downstream needs to know whether the user logged in
with a password or a code.

### Errors

| Status | Error message | Meaning | What to show the user |
|---|---|---|---|
| 400 | `Enter a valid phone number` | Same as above | Ask them to check the number |
| 400 | `Code expired or not found, request a new one` | No pending code for this number, or it expired | Send them back to the request screen |
| 400 | `Too many incorrect attempts, request a new code` | 5 wrong tries against the current code | Send them back to the request screen |
| 401 | `Incorrect code` | Wrong code, attempts still remain | Let them try again, show attempts are limited |
| 401 | `No active driver or EMT account found for this number` | Account was deactivated or changed role between request and verify | Send them back to the request screen |

Every wrong code counts as an attempt. After 5 wrong attempts against the
same code, the app must go back to the request screen for a fresh code, even
if the 5 minute window has not passed yet.

## 3. Reference implementation (Expo / React Native + axios)

Drop this into `src/api/auth.ts`, next to your existing `login()` call. It
uses the same `client` (axios instance) you already use for `POST
/auth/login`, so it inherits the same base URL and error handling.

```ts
import client from './client';
import type { ApiResponse } from './types'; // adjust to your types

interface OtpRequestResult {
  message: string;
  expiresInSeconds: number;
  devCode?: string; // only present when the backend is not in production
}

interface LoginResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    agencyId: string;
  };
}

/** Ask the backend to text a login code to this phone number. */
export async function requestOtp(phone: string) {
  const res = await client.post<ApiResponse<OtpRequestResult>>(
    '/auth/otp/request',
    { phone },
  );
  return res.data.data;
}

/** Exchange the code the user typed for a session, same shape as login(). */
export async function verifyOtp(phone: string, code: string) {
  const res = await client.post<ApiResponse<LoginResult>>(
    '/auth/otp/verify',
    { phone, code },
  );
  return res.data.data; // { token, user }, store it exactly as you do after login()
}
```

### Suggested screen flow

1. **Phone entry screen.** A single phone number field and a "Send code"
   button. On submit, call `requestOtp(phone)`. On success, navigate to the
   code entry screen and pass the phone number along. Start a 60 second
   countdown and disable "Resend code" until it reaches zero, since the
   backend rejects a resend before then anyway.
2. **Code entry screen.** A 6 digit input. On submit, call
   `verifyOtp(phone, code)`. On success, store the token and user exactly the
   way you do today after `login()`, then navigate into the app as normal.
3. On a `400` or `401`, surface the message from the response body directly.
   The messages above are written to be shown to the user as they are.
4. If the code entry screen sits idle for 5 minutes, treat the code as
   expired on the client too and prompt the user to go back and request a
   new one, rather than waiting for the server to say so.

### Where this replaces the password screen

For DRIVER and EMT, replace the existing email and password form with the
phone entry and code entry screens above. Do not send `passwordRaw` at all
for these two roles, there is nothing to send it to. If your app also
supports other roles signing in from the same device (for example a
dispatcher testing the app), keep the existing `POST /auth/login` form
available as a separate path, since OTP login only exists for DRIVER and
EMT accounts.

## 4. Before this works for a given user

Each driver and EMT needs their phone number set on their account. This is
the same `phone` field already shown on the crew list
(`GET /fleet/crew-members`) and set by an admin from the web dashboard user
management page. If `POST /auth/otp/request` returns
`No active driver or EMT account found for this number`, the most likely
cause is that the admin has not filled in that field yet, or filled it in
with a typo. Two accounts must never share the same phone number, since the
backend cannot tell them apart, if that happens it is a data cleanup task for
an admin, not something the app can work around.

## Quick reference

| Purpose | Method and path | Auth |
|---|---|---|
| Request an OTP | POST /auth/otp/request | None |
| Verify an OTP and log in | POST /auth/otp/verify | None |
| Email and password login (still available, all roles) | POST /auth/login | None |

If anything here is unclear or you need a field added, let me know and I
will adjust the backend to fit the app rather than the other way around.
