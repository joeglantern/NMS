# NMS-EOC Feature Backlog
_Nairobi City County Emergency Operations Centre — items agreed in team meetings_

---

## How to use this file
Add items under the relevant section. Move them to **Done** once shipped. Keep each item short — one paragraph max, enough for a developer to know what to build.

---

## 🔴 Priority 1 — Next to build

### 1. Driver Navigation — Google Maps Directions + ETA
**Context:** Drivers currently have no in-app navigation after being dispatched. They get a task assigned on mobile but no route guidance.

**What to build:**
- Subscribe to **Google Maps Platform** (Maps JavaScript API + Directions API + Places API)
- In the **driver mobile view / task screen**: show a Google Maps embed with a drawn route from the vehicle's current GPS position to the incident scene coordinates
- Display **estimated time of arrival (ETA)** that accounts for real-time traffic conditions (Google's `drivingOptions` with `departureTime: now`)
- ETA should update as the driver moves (re-request every 60s or when position drifts > 100m from last calculation)
- In the **dispatcher Incident Detail page**: show the same ETA next to the assigned vehicle so the dispatcher knows when to expect crew on scene
- Use **Google Places API** to replace the current Nominatim search in the Add Facility modal and New Incident Wizard — better Nairobi coverage for local place names and landmarks

**APIs needed:** Maps JavaScript API, Directions API, Places API (Autocomplete)
**Billing estimate:** ~$200 free credit/month should cover internal usage. Enable billing alerts at $50.

---

## 🟡 Priority 2 — Planned

_Add items here as they come out of team meetings._

---

## 🟢 Priority 3 — Nice to have / future

_Add items here._

---

## ✅ Done

- Facility management UI (add, edit, activate/deactivate, map picker, sub-county auto-detect)
- Vehicle status colours: Green = Ready (driver checked in), Yellow = No Driver, Red = Engaged, Grey = Unavailable
- Dispatch requires driver only (EMT no longer mandatory)
- Real-time vehicle icon colour updates without page refresh
- Location search using Nominatim in facility and incident wizard forms
- Sub-county auto-detection from map pin and search results
- 3-step incident wizard restored and synced
- Dark theme support across all pages
