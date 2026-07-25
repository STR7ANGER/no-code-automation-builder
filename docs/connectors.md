# Connector SDK

Connectors are isolated adapters with JSON inputs/outputs and injected capabilities: outbound fetch, credential lookup, structured logging, cancellation, and an idempotency key. They never receive database clients or raw tenant credentials. The executor applies timeouts and bounded exponential retries only to explicit transient failures.

The first adapters cover generic HTTP, provider-neutral email, GitHub issue creation, and Slack incoming webhooks. Shared egress policy requires HTTPS, rejects loopback/link-local/private hosts, disables redirects, and supports exact hostname allow-lists. Production must also enforce these rules at DNS resolution and network-policy layers to prevent DNS rebinding.

Secrets are resolved at execution time and never included in logs or outputs. Every outbound request carries the execution idempotency key. Connector-specific schemas, response caps, DNS pinning, and failure-injection verification are Task 21.
