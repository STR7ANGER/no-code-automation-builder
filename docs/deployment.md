# Deployment runbook

## Managed topology

- Deploy `apps/web` to Vercel using the root `vercel.json`; set `NEXT_PUBLIC_API_URL` to the public API origin.
- Deploy the API container and Go orchestrator to a container platform. Do not place the orchestrator on Vercel functions.
- Use Neon PostgreSQL with pooled `DATABASE_URL` for runtime and a direct connection for `prisma migrate deploy`.
- Use MongoDB Atlas for encrypted execution payload documents and managed Redis for distributed queues/rate buckets.

Set every variable listed in `.env.example` through the platform secret manager. Generate independent random values for the 32-byte credential key, session pepper, bootstrap key, and operator token. Restrict database/firewall access to the API and worker networks.

## Release

1. Run `npm ci && npm run check && npm run build` and `docker compose config --quiet`.
2. Build the three Dockerfiles with immutable commit tags and scan them.
3. Back up PostgreSQL, then run `npx prisma migrate deploy` once with the direct Neon URL.
4. Deploy API and orchestrator, verify `/health`, then deploy the web application.
5. Bootstrap the first tenant once, disable or rotate the bootstrap credential, create a synthetic workflow, publish it, trigger it, and inspect its redacted trace.

Rollback application images independently. Migrations are forward-only; if a schema release fails, restore the database backup or deploy a corrective migration. Rotate keys and revoke API credentials during an incident, preserve audit events, and never copy raw customer payloads into tickets.
