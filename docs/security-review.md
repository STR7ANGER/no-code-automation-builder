# Production security review

| Threat | Control | Residual action |
| --- | --- | --- |
| Cross-tenant object access | Tenant comes from API-key principal and scopes every repository query | Add automated PostgreSQL row-level-security defense in depth |
| Credential disclosure | AES-256-GCM at rest, injected secret capability, recursive response redaction | Use a managed KMS and rotate data keys |
| Webhook spoof/replay | Raw-body HMAC, constant-time comparison, five-minute timestamp, unique delivery ID | Store rate buckets in Redis for multi-instance consistency |
| SSRF | HTTPS-only URL validation, private-host blocking, no redirects, provider allow-lists | Enforce DNS pinning and egress network policy |
| Duplicate/late worker writes | Idempotency keys, leases, fencing generations, immutable versions | Persist Go engine leases with serializable claims |
| Resource exhaustion | Graph/GraphQL/body limits, retries, timeouts, quotas | Add distributed rate limiting and response-size caps |
| Privilege escalation | Explicit viewer/editor/admin checks and audit events | Add SSO/MFA and periodic access review |

No production secret is committed. CI performs format, type, unit/domain, Go race/failure cases, builds, dependency audit, Compose validation, and migrations against a fresh PostgreSQL service. Logs deliberately omit headers, bodies, payloads, and exception text from unknown errors.
