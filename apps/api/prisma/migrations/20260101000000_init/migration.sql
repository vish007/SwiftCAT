CREATE TABLE "roles" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE
);

CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "refresh_token" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "role_id" INTEGER NOT NULL REFERENCES "roles"("id")
);

CREATE TABLE "permissions" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL,
  "role_id" INTEGER NOT NULL REFERENCES "roles"("id")
);

CREATE TABLE "queues" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "message_actions" (
  "id" SERIAL PRIMARY KEY,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "details" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "performed_by" INTEGER NOT NULL REFERENCES "users"("id")
);

CREATE TABLE "swift_mt_codes" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
