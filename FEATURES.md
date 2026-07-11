# No-Code Automation Builder — Features and Requirements

## Product promise

Enable users to visually compose, version, execute, and debug durable trigger-condition-action workflows.

## Functional scope

1. **Drag-and-drop workflow canvas** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.
2. **Triggers, actions, conditions, loops, and branches** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.
3. **Webhook and cron triggers** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.
4. **Versioned publish/draft lifecycle** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.
5. **Durable execution with retries and delays** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.
6. **Encrypted credentials and connector SDK** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.
7. **Execution logs and replay** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.
8. **Human approval steps** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.
9. **Reusable templates and subflows** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.
10. **Rate limits, quotas, and dead-letter handling** — deliver the complete UI/API/domain flow, validation, authorization, persistence, and observable failure states.

## User surfaces

- **Primary application:** responsive Next.js interface using shadcn/ui, accessible forms, empty/loading/error states, and optimistic updates only when rollback is safe.
- **Operations/admin:** tenant configuration, audit history, job/event inspection, replay or recovery controls, and usage visibility.
- **API consumers:** versioned REST/GraphQL contracts, generated TypeScript client, examples, pagination, rate-limit headers, and stable error codes.
- **Background processing:** visible progress, retries, cancellation where meaningful, and support-safe correlation IDs.

## Data and security requirements

- Core records: Workspace, Workflow, WorkflowVersion, Node, Edge, Trigger, Credential, Connector, Execution, StepRun, Approval, Schedule.
- Tenant-owned tables include `tenantId`/organization ownership, indexed filters, and isolation tests.
- Encrypt sensitive values, hash tokens/keys, redact logs, and apply least-privilege authorization.
- Validate all external payloads with shared schemas; quarantine untrusted files and verify webhook signatures.
- Define retention, export, and deletion behavior. Audit privileged operations and irreversible transitions.
- Backups, migration rollback, seed fixtures, and recovery procedures must be documented.

## Quality targets

- No known critical/high security findings in the scoped threat review.
- Critical command paths are idempotent and covered by integration tests.
- p95 interactive API target: under 500 ms excluding explicitly asynchronous work.
- UI meets practical WCAG 2.1 AA checks for keyboard use, labels, focus, contrast, and errors.
- Health checks, structured logs, metrics, traces, dashboards, and actionable alerts exist.
- Local development runs through Docker Compose without requiring production credentials.

## Out of scope for the first complete version

- Premature microservice decomposition, multi-region active-active deployment, custom cryptography, and unsupported provider-specific behavior.
- Native mobile apps; the responsive web app and API come first.
- Machine-learning claims without measurable evaluation data and a deterministic fallback.

