# Webhook and cron triggers

Webhook signatures cover the exact raw bytes as `HMAC-SHA256(secret, timestamp + "." + body)`. Requests require `X-Relay-Delivery`, `X-Relay-Timestamp`, and `X-Relay-Signature`; timestamps older than five minutes are rejected. Delivery IDs are unique per trigger, so retries return a duplicate acknowledgement without a second execution. Secrets are returned once and the production repository must encrypt them at rest.

The service applies a per-trigger minute bucket before enqueueing and records rejected overflow in the dead-letter boundary. Enqueue must atomically save the payload reference and execution against the currently published workflow version. Cron schedules use fixed, auditable intervals and advance only after dispatch. Production workers should invoke the admin-only due-dispatch endpoint under a singleton lease.
