# ADR 001: Immutable publishing and GraphQL read models

Status: accepted for Tasks 10–12.

## Context

The canvas saves frequently, while production execution must remain stable.
Builder screens also need a workflow, its draft, version history, and latest
execution without coordinating several REST reads. Mutation retries and
multi-editor races must not publish an unexpected graph twice.

## Decision

Draft editing remains REST because it is a simple cacheable command with clear
HTTP conflict semantics. Flexible builder/read composition uses the versioned
GraphQL schema in `packages/contracts/schema.graphql`. Publishing is a GraphQL
mutation because the caller requests the resulting workflow and immutable
version in one typed operation.

`publishWorkflow` requires:

- authenticated owner, admin, or editor membership;
- tenant ownership of the workspace and workflow;
- the exact draft revision and SHA-256 checksum the user reviewed;
- a caller idempotency key; and
- zero graph diagnostics with `ERROR` severity.

One serializable PostgreSQL transaction locks the workflow/draft, rechecks the
revision and checksum, allocates `max(version)+1`, inserts the immutable graph,
points `publishedVersionId` at it, marks the workflow published, stores the
idempotency result, and appends an audit event. A retry returns that same
version with `replayed: true`. A checksum already published for the workflow
also resolves to its existing version; versions are never updated or deleted by
normal application commands.

The editable draft remains after publish. Later edits increase its revision but
do not alter the active version. Archive stops new triggers but retains drafts,
versions, executions, and audit evidence. Rollback is a new publish operation
whose graph is copied from an earlier version; history stays linear and
immutable.

## GraphQL controls

Authentication is HTTP bearer middleware and tenant identity never comes from a
GraphQL argument. Resolvers call application services rather than Prisma
directly. Queries use opaque cursor pagination, a maximum page size of 100,
depth 8, complexity 500, persisted-query allowlisting in production, bounded
JSON graph bytes, a 5-second timeout, and field-level authorization before
loading draft or execution data. DataLoader batches tenant-filtered repository
calls. Introspection is an operator choice outside development.

Errors use stable extensions codes: `UNAUTHENTICATED`, `FORBIDDEN`,
`WORKFLOW_NOT_FOUND`, `REVISION_CONFLICT`, `CHECKSUM_MISMATCH`,
`GRAPH_INVALID`, and `IDEMPOTENCY_CONFLICT`. User input is never interpolated
into logs or metric labels.

## Smallest vertical slice and acceptance

Tasks 11–12 will implement `workflow` plus `publishWorkflow`, GraphQL depth/cost
guards, transactional Prisma persistence, idempotency, audit, contract tests,
and a builder publish confirmation. Acceptance requires concurrent publish
tests, tenant-isolation tests, stale-revision and invalid-graph failures, an
identical retry returning the same version, cursor pagination, and a clean
migration replay.

## Consequences

The API has separate command/read protocols but one authorization and domain
layer. Clients gain precise composed reads without a generic “super request”
that bypasses service boundaries. Publishing costs a transaction and checksum
comparison; in exchange, executions can always name the exact immutable graph
they used.
