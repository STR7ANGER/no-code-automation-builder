# Publishing and GraphQL

Publishing is an immutable, optimistic transaction: the caller supplies the draft revision and SHA-256 checksum it reviewed. The API rejects stale revisions or changed content, creates or reuses a content-addressed version, advances the published pointer, and records an audit event. A workflow-scoped idempotency key makes retries safe and rejects reuse with different input.

`POST /v1/graphql` exposes authenticated workflow reads and publishing. Operations are limited to eight levels and 500 selected fields. Tenant membership is derived from the API key rather than accepted from the query. The builder disables publishing while autosave is pending or graph errors remain and asks for confirmation before publishing.

## Demo

1. Create or load a workflow in `/builder` and wait for autosave.
2. Select **Publish** and confirm the reviewed revision.
3. Query `workflow(id: ..., include: [DRAFT, VERSIONS])` to inspect the immutable version.
4. Repeating the mutation with the same input and idempotency key returns `replayed: true`; changing the input with that key returns `IDEMPOTENCY_CONFLICT`.
