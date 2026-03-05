CREATE TYPE "WorkItemState" AS ENUM ('INGESTED', 'CLASSIFIED', 'SCREENED', 'ROUTED', 'EXCEPTION', 'READY');

CREATE TABLE "work_items" (
  "id" SERIAL PRIMARY KEY,
  "message_type" TEXT NOT NULL,
  "raw_message" TEXT NOT NULL,
  "domain" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "rationale" TEXT,
  "confidence" DOUBLE PRECISION,
  "state" "WorkItemState" NOT NULL DEFAULT 'INGESTED',
  "queue_id" INTEGER REFERENCES "queues"("id"),
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "agent_steps" (
  "id" SERIAL PRIMARY KEY,
  "work_item_id" INTEGER NOT NULL REFERENCES "work_items"("id") ON DELETE CASCADE,
  "step_name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "rationale" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "screening_results" (
  "id" SERIAL PRIMARY KEY,
  "work_item_id" INTEGER NOT NULL UNIQUE REFERENCES "work_items"("id") ON DELETE CASCADE,
  "tool_name" TEXT NOT NULL,
  "hit" BOOLEAN NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "risk_factors" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "policy_decisions" (
  "id" SERIAL PRIMARY KEY,
  "work_item_id" INTEGER NOT NULL REFERENCES "work_items"("id") ON DELETE CASCADE,
  "agent_step_id" INTEGER REFERENCES "agent_steps"("id") ON DELETE SET NULL,
  "policy_name" TEXT NOT NULL,
  "allow" BOOLEAN NOT NULL,
  "rationale" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "work_item_state_transitions" (
  "id" SERIAL PRIMARY KEY,
  "work_item_id" INTEGER NOT NULL REFERENCES "work_items"("id") ON DELETE CASCADE,
  "from_state" "WorkItemState" NOT NULL,
  "to_state" "WorkItemState" NOT NULL,
  "rationale" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
