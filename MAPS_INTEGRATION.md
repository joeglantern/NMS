# Maps Integration

This covers how Google Maps is wired into the system — what's enabled on the web side and what the mobile app needs to do for driver navigation.

---

## APIs to enable in Google Cloud Console

Three APIs, nothing else:

- **Maps JavaScript API** — renders the map in the web dashboard (dispatcher view, fleet tracking)
- **Directions API** — calculates route from ambulance to incident scene, returns ETA with live traffic
- **Places API** — location autocomplete when logging an incident (understands Nairobi streets and landmarks properly)

For the mobile app specifically:
- **Maps SDK for Android** or **Maps SDK for iOS** depending on your platform
- The Directions API above covers both web and mobile so no need to enable a separate one

---

## Web app (already set up)

The web app reads the API key from the environment variable `VITE_GOOGLE_MAPS_KEY`. Once that's filled in on the server, three things activate automatically:

1. All maps (dispatcher dashboard, fleet, incident detail, facility picker, incident wizard) render on Google Maps vector tiles instead of the free OSM/Carto raster tiles, with a live traffic toggle
2. Location search in the watcher's incident form switches from Nominatim to Google Places
3. When a vehicle is en-route to a scene, the incident detail page shows a live ETA card — travel time with traffic, distance, and the first turn instruction

Without the key (or if Google auth fails, e.g. referrer blocked), everything falls back gracefully to the Leaflet/OSM map, Nominatim search, and no ETA card.

Optional: set `VITE_GOOGLE_MAPS_MAP_ID` to a Map ID created in the Cloud Console for custom cloud-based map styling; defaults to `DEMO_MAP_ID` otherwise.

---

## Vehicle tracking

Vehicle locations on the dispatcher map come from the **Kimiitrack/Uffizio GPS tracker** hardware on the ambulances — the mobile app does not need to push location. That's already handled.

---

## Mobile app — navigation to scene

When a task is assigned, the incident response includes the scene coordinates:

```json
{
  "incident": {
    "lat": -1.2864,
    "lng": 36.8172,
    "locationName": "Uhuru Highway, near Globe Roundabout"
  }
}
```

Use `lat` and `lng` as the navigation destination. Device GPS is the origin. When the driver accepts the task and marks status as `EN_ROUTE`, launch turn-by-turn navigation to those coordinates using the Maps SDK.

On Android, use the Navigation SDK (`NavigationApi`) rather than just dropping a pin — it gives proper voice guidance. Note that the Navigation SDK has a separate billing enablement in Google Cloud from the regular Maps SDK, make sure that's enabled before testing in production.

---

## API key

One key covers everything — both the web app and the mobile app can use the same key. Restrict it in the Google Cloud Console to only the APIs listed above and to your domain/app package name so it can't be used elsewhere if it leaks.

The web team will share the key once it's set up.
