# Approvals, templates, subflows, quotas, and analytics

Approval nodes pause an execution and create one tenant-scoped request per execution node. Editors may request approval; only owners and administrators may decide it. Decisions are compare-and-set, audited, and append an execution event so workers can safely resume or terminate.

Templates store validated workflow graphs within a tenant. Instantiation copies the graph into a new workflow draft and checksum, preserving the template as an immutable source. `SUBFLOW` nodes require a target workflow ID; the runtime must cap nested execution depth at five and use the parent execution ID in its idempotency key.

Daily execution quotas are tenant records checked in the same transaction that creates replays or trigger executions. Analytics aggregate only bounded status counts and pending approvals, with no payload dimensions or tenant IDs in metric labels. The operator metrics endpoint remains separately authenticated.

Acceptance cases include one-decision-only approvals, tenant isolation, invalid-template rejection, independent instantiated drafts, quota rejection, bounded analytics, authorization failures, and audit records for state-changing operations.
