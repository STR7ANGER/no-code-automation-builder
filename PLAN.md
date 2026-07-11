# No-Code Automation Builder — Build Plan

## Outcome

Enable users to visually compose, version, execute, and debug durable trigger-condition-action workflows.

## Architecture

Event-driven workflow platform: Next.js visual builder; Hono control API; Go durable orchestrator; TypeScript connector workers; PostgreSQL/Prisma; MongoDB execution payloads; Redis queues.

Use domain modules with controllers/resolvers, application services, repositories, and infrastructure adapters. This keeps an MVC-like request flow while preserving clean service boundaries. Begin as a modular deployment unless a worker needs independent scaling; split services only when the boundary is operationally useful.

## Technology selection

Next.js, TypeScript, shadcn/ui, Zustand, React Flow, Hono, Go, Prisma, PostgreSQL, MongoDB, Redis, Docker

## Core domain

Workspace, Workflow, WorkflowVersion, Node, Edge, Trigger, Credential, Connector, Execution, StepRun, Approval, Schedule.

## API strategy

GraphQL for builder/read models; REST for webhooks and commands; WebSockets for execution traces.

## Shared repository layout

```text
apps/
  web/            # Next.js frontend only
  api/            # Hono/API gateway; no UI code
services/         # Go/Rust workers or domain services when required
packages/
  contracts/      # API schemas, generated clients, event contracts
  ui/             # shared shadcn/ui components
  config/         # lint, TypeScript, environment validation
prisma/           # PostgreSQL schema and migrations
infra/            # Docker Compose, local dependencies, deployment notes
tests/            # integration, contract, and end-to-end suites
```

Frontend and backend must be independently runnable, independently testable, and connected only through versioned API/event contracts. Never import server-only code into the frontend.

## Engineering rules

- TypeScript strict mode; linting, formatting, and CI checks are mandatory.
- PostgreSQL is the transactional source of truth. Use MongoDB only for flexible document/event payloads identified in this plan.
- Prisma owns PostgreSQL migrations. Add indexes, uniqueness constraints, tenant filters, and transactional boundaries deliberately.
- Every command endpoint supports validation, authorization, structured errors, and idempotency where retries are possible.
- Use GraphQL queries/mutations where clients need flexible composed reads/writes. Keep REST for uploads, webhooks, health checks, and simple commands. This is the practical interpretation of a “query request” that goes beyond basic GET/POST usage.
- Background jobs must define retry, timeout, cancellation, deduplication, and dead-letter behavior.
- Secrets stay server-side and are validated at startup. Gemini calls require structured output, grounding, timeouts, cost limits, and redaction.
- Docker Compose is the local source of truth. Include health checks and seeded development data.
- Add unit, integration, contract, and Playwright E2E tests in proportion to risk.
- Record architecture decisions in `docs/adr/`; expose health, metrics, logs, and traces.

## Delivery sequence

1. **Foundation:** repository boundaries, containers, schemas, authentication, CI, and observability.
2. **Core domain:** implement the main user journey end-to-end with transactional safety.
3. **Advanced capability:** workers, AI/chain/realtime behavior, integrations, and operational controls.
4. **Hardening:** security, accessibility, performance, failure recovery, tests, seed data, and runbooks.

## Definition of done

- All 30 tasks in `TASKS.md` are complete and linked to tested acceptance criteria.
- The main journey works in Docker from a clean checkout with one documented command.
- Frontend and backend deploy separately and use generated/versioned contracts.
- Database migrations, seed data, API documentation, environment examples, and rollback notes exist.
- No critical security issues; important race, retry, tenant-isolation, and failure cases are tested.
- A short demo script, screenshots, architecture diagram, and production-readiness gaps are documented.

