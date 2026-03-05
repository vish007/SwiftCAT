CREATE TYPE "work_item_status" AS ENUM ('RECEIVED', 'CLASSIFIED', 'ROUTED');
CREATE TYPE "agent_run_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "agent_step_type" AS ENUM ('CLASSIFY', 'SCREEN', 'POLICY_CHECK', 'TOOL_CALL', 'STATE_TRANSITION', 'RECON_MATCH', 'CREATE_EXCEPTION');
CREATE TYPE "agent_step_status" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TABLE "work_items" (
  "id" SERIAL PRIMARY KEY,
  "reference" TEXT NOT NULL UNIQUE,
  "status" "work_item_status" NOT NULL DEFAULT 'RECEIVED',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "agent_runs" (
  "id" SERIAL PRIMARY KEY,
  "work_item_id" INTEGER NOT NULL REFERENCES "work_items"("id"),
  "status" "agent_run_status" NOT NULL DEFAULT 'RUNNING',
  "started_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "finished_at" TIMESTAMP,
  "started_by_user_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "error" JSONB
);

CREATE TABLE "agent_steps" (
  "id" SERIAL PRIMARY KEY,
  "agent_run_id" INTEGER NOT NULL REFERENCES "agent_runs"("id"),
  "step_name" TEXT NOT NULL,
  "step_type" "agent_step_type" NOT NULL,
  "status" "agent_step_status" NOT NULL,
  "input" JSONB,
  "output" JSONB,
  "rationale" TEXT,
  "started_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "finished_at" TIMESTAMP
);

CREATE INDEX "agent_runs_work_item_id_idx" ON "agent_runs"("work_item_id");
CREATE INDEX "agent_steps_agent_run_id_idx" ON "agent_steps"("agent_run_id");
