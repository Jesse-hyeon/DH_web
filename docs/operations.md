# Operations

## Routes

- `/attend` is the exact attendee target for the fixed QR code.
- `/qr` renders the fixed monitor QR and encodes `VITE_ATTENDANCE_URL`.
- `/admin` shows the MVP admin screen without login.

The app is a browser web app. Attendees scan the QR and open the page; no app install is needed.

## Install And Demo Run

```bash
npm ci
VITE_ATTENDANCE_MODE=demo VITE_ATTENDANCE_URL=http://localhost:5173/attend npm run dev
```

Use `http://localhost:5173/attend` for the desktop attendee demo, `http://localhost:5173/qr` for the QR display, and `http://localhost:5173/admin` for the admin view. Demo records are module-local and are not cross-device or reload persistence.

Without `VITE_ATTENDANCE_MODE=demo`, the app selects Firebase mode and visibly reports which `VITE_FIREBASE_*` settings are missing.

## Local LAN Phone Test

Run Vite on all network interfaces and set the QR target to the phone-reachable LAN URL:

```bash
VITE_ATTENDANCE_MODE=demo VITE_ATTENDANCE_URL=http://<your-lan-ip>:5173/attend npm run dev -- --host 0.0.0.0
```

Open `http://<your-lan-ip>:5173/qr` on the display machine, scan from a phone on the same Wi-Fi, and confirm the phone lands on `/attend`. If the phone cannot load it, check firewall settings, Wi-Fi isolation, and that the target path is exactly `/attend`.

Temporary tunnels can provide HTTPS for a remote demo, but tunnel URLs can expire or change. Do not print a permanent fixed QR for a temporary tunnel.

## Dummy Seed Data

For either mode, generate deterministic dummy data only. Firebase mode uses these documents as its public registered-member allowlist and current-service config:

```bash
npm run demo:seed -- --service-key 2026-08-10 --count 2000
```

The script prints JSON for:

- `serviceConfig/currentServiceKey`
- `members/{memberId}` with public-safe dummy labels
- an empty `attendanceServices/{serviceKey}/submissions` object

It does not create real attendance records, does not authenticate, and does not write to Firebase.

## Firebase Public HTTPS Steps

1. Create a Firebase project and keep it on the free tier unless your organization approves otherwise.
2. Enable Firebase Hosting and Cloud Firestore.
3. Create a local `.firebaserc` from `.firebaserc.example` and replace only the placeholder project ID.
4. Create `.env.local` from `.env.example`; set `VITE_ATTENDANCE_MODE=firebase`, all six `VITE_FIREBASE_*` Web settings, and `VITE_ATTENDANCE_URL=https://<your-hosting-domain>/attend`.
5. Run `npm run demo:seed -- --service-key 2026-08-10 --count 2000` and seed only its dummy `members` and `serviceConfig/currentServiceKey` documents.
6. Run `npm run release:check` with the Firebase settings present. A real project/deployment smoke cannot be run in this credential-free coding workspace.
7. Deploy with authenticated Firebase tooling: `firebase deploy --only hosting,firestore:rules,firestore:indexes`. This repo intentionally has no credentialed deploy workflow.

For a local emulator, run `firebase emulators:start --only firestore,hosting` and set `VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` in addition to Firebase mode and the six Web settings. The browser uses the same bounded queries and public rules against the emulator. With dummy seed data imported, `npm run test:emulator` runs the optional integration check through the Firebase Web SDK only; it reports an explicit skip when emulator tooling, endpoint, or seed data is absent. It does not claim live project coverage.

`firebase.json` serves `dist` and rewrites all SPA routes to `/index.html`. It references `firestore.rules` and `firestore.indexes.json`. Attendance records live at `attendanceServices/{serviceKey}/submissions`; the composite index documents the bounded member-history query by `memberId` then `submittedAt`. The current-service list and count use the service-scoped path and a limit of 100.

Firestore query rules are not filters. The public list rules intentionally enforce only the service path/member-list bound and query limit; direct document reads and submission creates perform shape and allowlist validation. Keep every imported member, service-config, and attendance document dummy/public-safe until a later authenticated design replaces this MVP boundary.

## Release Gate

Before any public demo or deployment candidate:

```bash
npm run release:check
```

The gate runs the static Firestore rules contract, privacy scan, test suite, and production build. It blocks obvious credential and PII mistakes, including service-account JSON, Firebase Admin SDK/server client usage, Google application credentials usage, real/prod member or attendance data filenames, contact fields, birthdate/address fields, and Korean resident/mobile number patterns.

## Real Operation Warning

The MVP `/admin` route has no login. Anyone with the URL can open it, and Firestore-readable data must be treated as public demo data. This is not safe for real church operation.

Do not deploy or seed real member names, real attendance records, service credentials, service-account JSON, or `GOOGLE_APPLICATION_CREDENTIALS`. Real operation requires a later admin-auth and service-session release.
