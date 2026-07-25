# Tenant access, credentials, and audit

## Acceptance contract

- Bootstrap requires a separate operator credential and returns the first owner
  API key exactly once. Only its peppered SHA-256 digest is persisted.
- Every authenticated principal is resolved through a live, unexpired API key
  and a membership in the key's tenant.
- Owners and admins may write credentials and read audit history; editors and
  viewers cannot. Workspace ownership is checked in the repository query.
- Credential values are encrypted with AES-256-GCM and unique nonces before
  persistence. Responses and audit metadata expose identifiers only.
- Bootstrap and credential rotation are atomic with their audit events.

## Risks and operations

The bootstrap credential, session pepper, encryption key, and metrics token
must be independent secrets. Rotate a connector value by writing the same
workspace/name pair. A future KMS envelope layer can replace the local AES key
without changing application contracts. Audit records are tenant-filtered,
append-only application events and contain no request bodies.

Revocation is immediate because authentication reads `revokedAt` on every
request. Production should add short-lived user sessions, SSO, key inventory,
automated KMS rotation, and database-level row security as defense in depth.
