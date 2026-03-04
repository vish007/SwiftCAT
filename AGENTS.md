# AGENTS.md — SwiftCat Codex Instructions

## Repo goals
Build SwiftCat™: SWIFT message library, chaining, reconciliation (103/202/910 ↔ 940/950), Nostro ageing, integrations, and agentic AI with full audit.

## Required commands
- Install: `pnpm install` (or `npm install` if you choose npm)
- Dev: `docker compose up -d` then `pnpm dev`
- Test: `pnpm test` and `pnpm test:e2e`
- Lint/typecheck: `pnpm lint` and `pnpm typecheck`
- DB migrate/seed: `pnpm db:migrate` `pnpm db:seed`

## Quality bar
- TypeScript strict, no any where avoidable
- DB migrations required for schema changes
- All sensitive actions write audit rows
- Don’t add features beyond the prompt

## Architecture guardrails
- API-first: OpenAPI maintained
- Event-driven ingest is idempotent
- Integrations are adapters with mocks (no real bank creds)
- AI actions require user confirmation, logged with rationale
