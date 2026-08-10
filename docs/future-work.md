# Future Work

The current release stays intentionally small and dummy-only. These items are deferred before real operation:

- Admin authentication and authorization for `/admin`.
- Real member database import with approved data handling, consent, and rollback procedures.
- Real service/session lifecycle: open, close, expiry, QR/session rotation, and service ownership.
- Historical cross-service reporting that does not require broad public Firestore reads.
- Duplicate policy: whether repeat submissions are allowed, counted, merged, or blocked per service.

Until those decisions are implemented and reviewed, the MVP must remain a public demo with synthetic data only.
