# Check App

Mobile-first church attendance app for a fixed QR code. The browser runtime uses the unauthenticated Firebase Web/Firestore repository by default. This repository contains no Firebase project credentials and is not a live deployment; incomplete Firebase settings produce a visible configuration error instead of silently switching to demo storage.

## Local Demo

The demo repository is an explicit local-only fallback. It keeps records in module memory, so it is useful for unit/UI tests but cannot share attendance between browser processes or survive a full page restart. Copying `.env.example` does not select this mode; set it explicitly so shared Firebase persistence is never lost silently.

Install and run:

```bash
npm ci
VITE_ATTENDANCE_MODE=demo VITE_ATTENDANCE_URL=http://localhost:5173/attend npm run dev
```

Open:

- QR management: `http://localhost:5173/admin?view=qr-generation`
- Attendee base target: `http://localhost:5173/attend` (the selected service date and part are appended automatically)
- Public MVP admin: `http://localhost:5173/admin`

No mobile app install is needed. QR management reads `VITE_ATTENDANCE_URL`, and that value must be an absolute HTTP(S) URL whose path is exactly `/attend`.

## Phone Testing

For a phone on the same Wi-Fi/LAN:

```bash
VITE_ATTENDANCE_MODE=demo VITE_ATTENDANCE_URL=http://<your-lan-ip>:5173/attend npm run dev -- --host 0.0.0.0
```

Then open `http://<your-lan-ip>:5173/admin?view=qr-generation`, select an upcoming Sunday, and scan one of the 1·2·3부 QR codes from the phone. A temporary HTTPS tunnel can be useful for remote demos, but tunnel URLs are not stable deployment targets.

## Release Checks

```bash
npm run typecheck
npm test -- --reporter=dot
npm run test:rules
npm run privacy:scan
npm run release:check
npm run build
```

`npm run release:check` intentionally repeats the rules test, privacy scan, test suite, and production build as one hard local gate.

## Firebase Hosting Prep

This repo includes `firebase.json`, `firestore.rules`, `firestore.indexes.json`, and `.firebaserc.example` for a Firebase free-tier/public HTTPS path. Use Firebase mode for real shared browser persistence across a phone and `/admin`.

Create `.env.local` with all six Firebase Web settings and the attendee URL:

```dotenv
VITE_ATTENDANCE_MODE=firebase
VITE_FIREBASE_API_KEY=<Firebase Web app apiKey>
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>
VITE_FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<messaging-sender-id>
VITE_FIREBASE_APP_ID=<Firebase Web app appId>
VITE_ATTENDANCE_URL=https://<hosting-domain>/attend
```

These six values are public Web SDK configuration. Do not put private keys or server credentials in `.env.local`, source, fixtures, or the deployed bundle.

Deployment setup is intentionally credential-free in source:

1. Create a Firebase project outside this repository.
2. Enable Firebase Hosting and Cloud Firestore.
3. Copy `.firebaserc.example` to `.firebaserc` locally and replace the placeholder project ID.
4. Set `VITE_ATTENDANCE_MODE=firebase`, the six Web settings above, and `VITE_ATTENDANCE_URL=https://<your-hosting-domain>/attend`.
5. Generate the public dummy seed with `npm run demo:seed -- --service-key 2026-08-16 --count 2000`. Load its `members/{memberId}`, `serviceConfig/currentServiceKey`, and `serviceSessions/{serviceKey}` documents with approved authenticated tooling or the Firebase console; its `attendanceServices/{serviceKey}/submissions` object is empty by design.
6. Run `npm run release:check` with Firebase mode and the Web settings present.
7. Build and deploy only Hosting plus rules/indexes: `npm run build`, then `firebase deploy --only hosting,firestore:rules,firestore:indexes` from an already authenticated local Firebase CLI. Never commit its credentials.

The repository enforces bounded reads: attendee name searches require at least two characters and return at most 10 member documents, current-service admin rows and count query at 2,000, and one member's current-service history at 25. QR URLs carry a pre-registered `serviceSessions/{serviceKey}` date and a fixed service part, while submissions remain scoped to `attendanceServices/{serviceKey}/submissions`. Firestore query rules are not filters, so list rules intentionally validate only the request path and bound; direct gets and submission creates validate document shape. The dummy-only seed contract is therefore a hard data boundary, not a substitute for future authenticated operations.

If the Firebase CLI and Java are available, run a local emulator with `firebase emulators:start --only firestore,hosting` and set `VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` alongside Firebase mode and the six Web settings. Seed dummy members and the current service config only, then run `npm run test:emulator` for the optional Web-SDK integration hook. It skips with an explicit reason when the CLI, Java, endpoint, or seed data is unavailable. The shared-persistence contract test remains separate, uses an in-process fake backend, and needs no credentials.

## Hard Boundary

This MVP is dummy data only. The no-login `/admin` route is public and is not safe for real operation. Do not use real member names, real attendance records, Firebase Admin SDK/server credentials, service-account JSON, or `GOOGLE_APPLICATION_CREDENTIALS` in source, docs, fixtures, seed data, or deployable inputs.
