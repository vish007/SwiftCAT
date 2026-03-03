# SwiftCat M1 Scaffold

This repository delivers Milestone M1 foundation for SwiftCat:
- Monorepo layout with API, web, and shared package.
- Local dependencies through Docker Compose (Postgres, Redis, RabbitMQ broker).
- Auth foundation (login + refresh JWT), protected route, and RBAC primitives.
- Prisma migrations and seed scripts for core data model.
- OpenAPI docs scaffold for at least 5 API routes.

## Repository layout

- `apps/api` - Fastify + TypeScript API
- `apps/web` - React + TypeScript web app
- `packages/shared` - shared validators/types
- `infra` - local infra compose file

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose plugin

## Quick start

1. Copy env:
   ```bash
   cp .env.example .env
   ```
2. Start infra dependencies:
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Run DB migrations and seed:
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```
5. Start API and web in dev mode:
   ```bash
   pnpm dev
   ```
6. Open:
   - Web: `http://localhost:5173`
   - API docs (OpenAPI): `http://localhost:3001/docs`

## Seed users

All seeded users use password `password123`:
- `amira` (Maker)
- `john` (Compliance)
- `swiftcat_ai` (AI_Agent)

## API routes scaffolded

- `GET /health`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me` (protected)
- `GET /queues` (protected)
- `POST /actions/audit` (protected)
- `GET /admin/compliance` (protected + RBAC)

## Validation commands

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
```
