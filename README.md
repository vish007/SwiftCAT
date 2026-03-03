# SwiftCAT (M7 Production Hardening)

SwiftCAT provides SWIFT message ingestion, matching, exception handling, and compliance routing with production hardening controls.

## Features
- Observability: structured logs, correlation IDs, metrics endpoint, and trace IDs.
- Security: RBAC, sensitive-op audit trail, rate limiting, input validation, and PII log redaction.
- Performance: indexed lookup maps, mandatory pagination, and reference match caching.
- Testing: unit + integration + E2E tests for required banker scenarios.

## Quickstart
```bash
pnpm dev
```

## Validation
```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
```

## OpenAPI
See `docs/openapi.yaml`.

## Release checklist
- [ ] Full validation command suite passes
- [ ] Dashboard imported in Grafana
- [ ] Runbook reviewed
- [ ] Demo script executed end-to-end
