# Execution semantics

A published workflow version is immutable. One `(workflow, idempotencyKey)`
pair creates at most one execution. PostgreSQL owns status, retry counters,
availability timestamps, and step uniqueness; MongoDB owns the flexible input
and output payload documents. Queue messages carry identifiers, not secrets or
payload bodies.

The future Go orchestrator leases runnable steps and moves them through
`PENDING → RUNNING → SUCCEEDED`, `WAITING`, or terminal failure/cancellation.
Retries create a new numbered `StepRun`; late results cannot overwrite a newer
attempt. Conditions choose a labeled branch, loops must declare a bound, and a
cancelled execution cannot return to running. Delays are represented by
`availableAt`, never by sleeping workers.

Failure risks include duplicate webhooks, worker loss after side effects,
cycles, unbounded loops, stale revisions, and payload leakage. The model
addresses identity and state invariants now; queue leases, connector
idempotency, recovery, and redaction are implemented in later task groups.
