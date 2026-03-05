# SwiftCat R7 Hardening Milestone

SwiftCat delivers banker-ready demos for payments, trade, and reconciliation workflows with agent timelines, approvals, and audit-friendly correlation IDs.

## Architecture diagram

```text
 SWIFT/MX Ingest
      |
      v
 +------------------+      +-------------------------+
 | API (Fastify)    |----->| Agent Classifier/Policy |
 | - Auth           |      | - Queue/work item logic |
 | - Demo scenarios |      +-------------------------+
 | - Pagination     |                 |
 +------------------+                 v
      |                         +------------------+
      |                         | Tool adapters    |
      |                         | - CBS payment    |
      |                         | - SWIFT outbound |
      |                         | - Recon close    |
      v                         +------------------+
 +------------------+
 | React UI         |
 | - Scenario cards |
 | - Timeline       |
 | - Approvals      |
 +------------------+
```

## Run locally

```bash
pnpm install
docker compose up -d
pnpm --filter @swiftcat/api db:migrate
pnpm --filter @swiftcat/api db:seed
pnpm --filter @swiftcat/api dev
pnpm --filter @swiftcat/web dev
```

## Validation commands

```bash
pnpm -r test
pnpm -r lint
pnpm -r typecheck
```

E2E demo reset flow is in [`docs/demo-script.md`](docs/demo-script.md).

## Demo scenarios delivered

1. **Payments (MX pacs.008):** ingest → canonical mapping → work item → classify/screen → `tool.cbs.payment.post` → CLOSED.
2. **Category-7 LC (MT700):** ingest with soft clause → trade classify → policy + compliance review → action proposal → approval → outbound send.
3. **Recon break (MT202):** ingest unmatched statement → recon classify → exception creation → manual match → CLOSED.

## Glossary

- **Canonical model:** normalized representation of inbound SWIFT/ISO payloads.
- **Work item:** operational task tracked to closure.
- **Agent timeline:** ordered log of ingest/agent/tool/human steps.
- **Correlation ID:** shared trace ID across a scenario’s run steps and tool calls.
- **Idempotency key:** unique key preventing duplicate tool side-effects.

## Demo narration

Use [`docs/bank-demo-talk-track.md`](docs/bank-demo-talk-track.md) during stakeholder walkthroughs.
