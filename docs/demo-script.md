# SwiftCat Demo Script (R7)

## Fresh environment

```bash
docker compose down -v
docker compose up -d
pnpm install
pnpm --filter @swiftcat/api db:migrate
pnpm --filter @swiftcat/api db:seed
```

## Start apps

```bash
pnpm --filter @swiftcat/api dev
pnpm --filter @swiftcat/web dev
```

## Demo flow

1. Login as `amira / password123`.
2. Open **Milestone R7 Scenarios** dashboard.
3. Walk scenario A: payment pacs.008 straight-through (closed with tool call).
4. Walk scenario B: MT700 trade with compliance approval.
5. Walk scenario C: MT202 recon break with manual match close.
6. Highlight correlation IDs shown across timeline steps.
