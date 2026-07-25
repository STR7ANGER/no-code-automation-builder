# Day 1 demo

1. Start dependencies with `docker compose up -d --wait`, apply the Prisma
   migration, then run the API and web app independently.
2. Open `/setup`, bootstrap a tenant, and copy the one-time owner key. Save a
   synthetic connector credential and show that the response contains metadata
   only.
3. Open `/builder`, create a workflow, add action/condition/loop nodes, connect
   branches, and observe autosave revisions and diagnostics.
4. Undo a local change. In a second tab save the same revision, then show that a
   stale first tab receives `REVISION_CONFLICT` instead of overwriting it.
5. Review the GraphQL schema and publish ADR: the current draft is editable,
   while the future publish command will create a checksum-addressed immutable
   version.

Expected result: one tenant-isolated path covers setup, encryption, RBAC, audit,
typed visual composition, validation, undo, and concurrency-safe persistence.
