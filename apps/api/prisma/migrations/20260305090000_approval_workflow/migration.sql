CREATE TYPE "ApprovalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ActionType" AS ENUM ('OUTBOUND_SWIFT_SEND', 'POST_TO_CBS', 'CLOSE_CASE');
CREATE TYPE "RequestedBy" AS ENUM ('ai', 'user');
CREATE TYPE "WorkItemState" AS ENUM ('WAITING_APPROVAL', 'APPROVED', 'EXECUTED', 'REJECTED');

CREATE TABLE "work_items" (
  "id" SERIAL PRIMARY KEY,
  "action_type" "ActionType" NOT NULL,
  "payload" JSONB NOT NULL,
  "state" "WorkItemState" NOT NULL DEFAULT 'WAITING_APPROVAL',
  "requested_by" "RequestedBy" NOT NULL,
  "created_by_id" INTEGER NOT NULL REFERENCES "users"("id"),
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "approvals" (
  "id" SERIAL PRIMARY KEY,
  "work_item_id" INTEGER NOT NULL REFERENCES "work_items"("id") ON DELETE CASCADE,
  "requested_by" "RequestedBy" NOT NULL,
  "action_type" "ActionType" NOT NULL,
  "payload" JSONB NOT NULL,
  "state" "ApprovalState" NOT NULL DEFAULT 'PENDING',
  "maker_user_id" INTEGER REFERENCES "users"("id"),
  "checker_user_id" INTEGER REFERENCES "users"("id"),
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "decided_at" TIMESTAMP
);

CREATE TABLE "agent_steps" (
  "id" SERIAL PRIMARY KEY,
  "work_item_id" INTEGER NOT NULL REFERENCES "work_items"("id") ON DELETE CASCADE,
  "step_type" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "performed_by" INTEGER REFERENCES "users"("id")
);

CREATE INDEX "approvals_work_item_id_idx" ON "approvals"("work_item_id");
CREATE INDEX "agent_steps_work_item_id_idx" ON "agent_steps"("work_item_id");
