# SwiftCAT Runbook

## Backup/Restore
- Persist application state in external DB/Redis in production.
- Back up DB nightly and Redis snapshots hourly.
- Restore: stop API, restore DB snapshot, warm Redis cache by replaying last 24h references.

## Migrations
- Add schema migration scripts under `migrations/` and run in CI before deploy.
- Rollback by applying last known good migration tag.

## Incident Steps
1. Check `/health` and `/metrics`.
2. Validate error spikes in Grafana dashboard (`docs/grafana/swiftcat-dashboard.json`).
3. Inspect audit log endpoint for suspicious actions.
4. Trigger failover + rollback release if SLO breach >15 minutes.
