# Go execution orchestrator

The execution domain is a deterministic state machine. Workers claim dependency-ready steps using expiring leases; every claim increments a fencing generation so a recovered step cannot be completed by an old worker. Failures retry with exponential delays up to the step limit. Terminal failure and cancellation stop new claims, with cancellation winning late worker responses.

The in-memory engine is the executable domain specification. The queue adapter added later must atomically persist status, lease owner, expiry, generation, attempts, and ready time in PostgreSQL. Queue delivery is at-least-once; fencing and connector idempotency provide correctness. Recovery scans expired leases and requeues them.

Acceptance tests cover DAG ordering, delayed retries, lease recovery/fencing, and cancellation races. Run `npm run orchestrator:test`.
