# Architecture and first vertical slice

The repository is a modular service-oriented deployment. `apps/web` owns the
Next.js interaction layer, `apps/api` owns HTTP/auth/application services,
`packages/contracts` owns versioned validation, PostgreSQL stores transactional
workflow state, MongoDB stores untrusted execution payload documents, and Redis
will carry bounded orchestration queues. No frontend module imports server code.

The first vertical slice is: bootstrap a tenant and workspace, authenticate an
owner API key, create an encrypted connector credential, create a workflow,
visually edit a typed draft, and autosave it using an optimistic revision.
Execution and publishing are deliberately separate commands so editing cannot
silently affect active automations.

## Acceptance criteria

- Docker starts PostgreSQL, MongoDB, and Redis with health checks.
- CI generates Prisma, checks formatting/types/tests/build, audits dependencies,
  validates Compose, and replays migrations on an empty database.
- Transactional records carry indexed tenant ownership and destructive
  relationships are explicit.
- Flexible payload bytes are referenced from PostgreSQL by a Mongo document ID;
  they are not duplicated into audit logs.
- Health, protected metrics, bounded structured logs, and stable error codes
  make failures observable.
