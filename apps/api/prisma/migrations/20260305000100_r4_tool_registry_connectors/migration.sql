CREATE TABLE "tool_registry" (
  "tool_name" TEXT PRIMARY KEY,
  "domain" TEXT NOT NULL,
  "input_schema" JSONB NOT NULL,
  "output_schema" JSONB NOT NULL,
  "requires_approval" BOOLEAN NOT NULL DEFAULT FALSE,
  "retry_policy" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE "agent_runs" (
  "id" SERIAL PRIMARY KEY,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "agent_steps" (
  "id" SERIAL PRIMARY KEY,
  "run_id" INTEGER NOT NULL REFERENCES "agent_runs"("id"),
  "step_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "tool_invocations" (
  "id" SERIAL PRIMARY KEY,
  "agent_step_id" INTEGER NOT NULL REFERENCES "agent_steps"("id"),
  "tool_name" TEXT NOT NULL REFERENCES "tool_registry"("tool_name"),
  "idempotency_key" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "response" JSONB,
  "status" TEXT NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "tool_invocations_agent_step_id_idempotency_key_key" UNIQUE ("agent_step_id", "idempotency_key")
);
