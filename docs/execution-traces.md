# Execution traces, replay, and redaction

An execution trace is an append-only sequence of bounded structured events attached to the immutable workflow version that ran. Events carry a type, optional node ID, severity, timestamp, and JSON fields. The API derives tenant scope from the authenticated principal and never accepts a tenant identifier from clients.

All trace reads pass through recursive redaction. Keys matching password, secret, token, authorization, cookie, or API-key patterns become `[REDACTED]`; bearer-looking values are also removed. Event writers must cap individual fields and never persist decrypted credentials. A snapshot SSE endpoint makes the contract compatible with later streaming transports without coupling orchestration to HTTP.

Replay creates a new queued execution referencing the original payload document and workflow version. It never mutates the original, requires editor access, gets a fresh idempotency key, emits an audit event, and is quota checked in the control-plane repository.

Acceptance cases: cross-tenant reads return not found, nested secrets are redacted, viewers cannot replay, a replay preserves immutable inputs, and telemetry records trace reads and replays.
