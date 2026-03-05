# Bank demo talk-track

## Opening
- SwiftCat ingests SWIFT/ISO messages and creates auditable work items.
- Agent runs are deterministic, policy checked, and approval gated.

## Scenario A: Payments (MX pacs.008)
- Ingest to canonical mapping.
- Agent classifies to payments queue and screens.
- `tool.cbs.payment.post` executes with idempotency key and closes item.

## Scenario B: Category-7 LC (MT700)
- MT700 with soft clause is classified as trade.
- Policy requires compliance review.
- Human approval is recorded with rationale, then outbound send.

## Scenario C: Recon break (MT202)
- MT202 arrives with no matching statement.
- Recon exception is created automatically.
- Ops performs manual match and item closes.

## Close
- Show correlation IDs on every timeline step/tool call.
- Explain pagination and indexed query paths for scale.
