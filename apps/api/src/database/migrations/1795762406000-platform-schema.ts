import type { MigrationInterface, QueryRunner } from 'typeorm';
import { InitialSchema1795757960000 } from './1795757960000-initial-schema.js';

const IDENTITY = `
  CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "disabled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_users" PRIMARY KEY ("id"),
    CONSTRAINT "uq_users_email" UNIQUE ("email"),
    CONSTRAINT "ck_users_email_lowercase" CHECK ("email" = lower("email"))
  );

  CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "pk_sessions" PRIMARY KEY ("id"),
    CONSTRAINT "uq_sessions_token_hash" UNIQUE ("token_hash"),
    CONSTRAINT "fk_sessions_user_id" FOREIGN KEY ("user_id")
      REFERENCES "users" ("id") ON DELETE CASCADE
  );
  CREATE INDEX "idx_sessions_user_id" ON "sessions" ("user_id");

  CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "purpose" VARCHAR(16) NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_email_tokens" PRIMARY KEY ("id"),
    CONSTRAINT "uq_email_tokens_token_hash" UNIQUE ("token_hash"),
    CONSTRAINT "fk_email_tokens_user_id" FOREIGN KEY ("user_id")
      REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "ck_email_tokens_purpose"
      CHECK ("purpose" IN ('verify_email', 'reset_password'))
  );
  CREATE INDEX "idx_email_tokens_user_id" ON "email_tokens" ("user_id");
`;

const WORKSPACES = `
  CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(48) COLLATE "C" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_workspaces" PRIMARY KEY ("id"),
    CONSTRAINT "uq_workspaces_slug" UNIQUE ("slug")
  );

  CREATE TABLE "workspace_members" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_workspace_members" PRIMARY KEY ("workspace_id", "user_id"),
    CONSTRAINT "fk_workspace_members_workspace_id" FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces" ("id") ON DELETE CASCADE,
    CONSTRAINT "fk_workspace_members_user_id" FOREIGN KEY ("user_id")
      REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "ck_workspace_members_role"
      CHECK ("role" IN ('owner', 'admin', 'member'))
  );
  CREATE INDEX "idx_workspace_members_user_id"
    ON "workspace_members" ("user_id");

  CREATE TABLE "workspace_invitations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "invited_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_workspace_invitations" PRIMARY KEY ("id"),
    CONSTRAINT "uq_workspace_invitations_token_hash" UNIQUE ("token_hash"),
    CONSTRAINT "uq_workspace_invitations_workspace_id_email"
      UNIQUE ("workspace_id", "email"),
    CONSTRAINT "fk_workspace_invitations_workspace_id"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces" ("id") ON DELETE CASCADE,
    CONSTRAINT "fk_workspace_invitations_invited_by_user_id"
      FOREIGN KEY ("invited_by_user_id")
      REFERENCES "users" ("id") ON DELETE SET NULL,
    CONSTRAINT "ck_workspace_invitations_role"
      CHECK ("role" IN ('admin', 'member'))
  );

  CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_prefix" VARCHAR(16) NOT NULL,
    "key_hash" BYTEA NOT NULL,
    "created_by_user_id" UUID,
    "last_used_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_api_keys" PRIMARY KEY ("id"),
    CONSTRAINT "uq_api_keys_key_hash" UNIQUE ("key_hash"),
    CONSTRAINT "fk_api_keys_workspace_id" FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces" ("id") ON DELETE CASCADE,
    CONSTRAINT "fk_api_keys_created_by_user_id"
      FOREIGN KEY ("created_by_user_id")
      REFERENCES "users" ("id") ON DELETE SET NULL
  );
  CREATE INDEX "idx_api_keys_workspace_id" ON "api_keys" ("workspace_id");

  CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID,
    "actor_type" VARCHAR(16) NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_audit_log" PRIMARY KEY ("id"),
    CONSTRAINT "fk_audit_log_workspace_id" FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces" ("id") ON DELETE CASCADE,
    CONSTRAINT "ck_audit_log_actor_type"
      CHECK ("actor_type" IN ('user', 'api_key', 'system'))
  );
  CREATE INDEX "idx_audit_log_workspace_id_created_at"
    ON "audit_log" ("workspace_id", "created_at");
`;

const LINKS = `
  CREATE TABLE "domains" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID,
    "hostname" VARCHAR(253) COLLATE "C" NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "verification_token" VARCHAR(64) NOT NULL,
    "verified_at" TIMESTAMPTZ,
    "last_checked_at" TIMESTAMPTZ,
    "failed_checks" SMALLINT NOT NULL DEFAULT 0,
    "ownership_verified" BOOLEAN NOT NULL DEFAULT false,
    "routing_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_domains" PRIMARY KEY ("id"),
    CONSTRAINT "uq_domains_workspace_id_hostname"
      UNIQUE ("workspace_id", "hostname"),
    CONSTRAINT "fk_domains_workspace_id" FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces" ("id") ON DELETE CASCADE,
    CONSTRAINT "ck_domains_hostname_lowercase"
      CHECK ("hostname" = lower("hostname")),
    CONSTRAINT "ck_domains_status"
      CHECK ("status" IN ('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED'))
  );
  CREATE UNIQUE INDEX "uq_domains_serving_hostname" ON "domains" ("hostname")
    WHERE "status" IN ('ACTIVE', 'BLOCKED');

  CREATE TABLE "links" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "workspace_id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "code" VARCHAR(32) COLLATE "C" NOT NULL,
    "destination_url" TEXT NOT NULL,
    "title" VARCHAR(200),
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ,
    "qr_style" JSONB,
    "click_count" BIGINT NOT NULL DEFAULT 0,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_links" PRIMARY KEY ("id"),
    CONSTRAINT "uq_links_domain_id_code" UNIQUE ("domain_id", "code"),
    CONSTRAINT "fk_links_workspace_id" FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces" ("id") ON DELETE CASCADE,
    CONSTRAINT "fk_links_domain_id" FOREIGN KEY ("domain_id")
      REFERENCES "domains" ("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_links_created_by_user_id"
      FOREIGN KEY ("created_by_user_id")
      REFERENCES "users" ("id") ON DELETE SET NULL,
    CONSTRAINT "ck_links_destination_url_length"
      CHECK (char_length("destination_url") <= 2048),
    CONSTRAINT "ck_links_status"
      CHECK ("status" IN ('ACTIVE', 'DISABLED', 'BLOCKED'))
  );
  CREATE INDEX "idx_links_workspace_id_created_at"
    ON "links" ("workspace_id", "created_at");

  CREATE TABLE "link_variants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "link_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "destination_url" TEXT NOT NULL,
    "weight" SMALLINT NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pk_link_variants" PRIMARY KEY ("id"),
    CONSTRAINT "fk_link_variants_link_id" FOREIGN KEY ("link_id")
      REFERENCES "links" ("id") ON DELETE CASCADE,
    CONSTRAINT "ck_link_variants_destination_url_length"
      CHECK (char_length("destination_url") <= 2048),
    CONSTRAINT "ck_link_variants_weight" CHECK ("weight" BETWEEN 1 AND 99)
  );
  CREATE INDEX "idx_link_variants_link_id" ON "link_variants" ("link_id");
`;

const ANALYTICS = `
  CREATE TABLE "click_events" (
    "event_id" UUID NOT NULL,
    "clicked_at" TIMESTAMPTZ NOT NULL,
    "link_id" UUID NOT NULL,
    "variant_id" UUID,
    "source" VARCHAR(8) NOT NULL,
    "country" CHAR(2) NOT NULL,
    "device_type" VARCHAR(8) NOT NULL,
    "os" VARCHAR(32) NOT NULL,
    "browser" VARCHAR(32) NOT NULL,
    "referrer_host" VARCHAR(255),
    CONSTRAINT "pk_click_events" PRIMARY KEY ("event_id", "clicked_at"),
    CONSTRAINT "ck_click_events_source" CHECK ("source" IN ('link', 'qr')),
    CONSTRAINT "ck_click_events_device_type" CHECK
      ("device_type" IN ('desktop', 'mobile', 'tablet', 'bot', 'other'))
  ) PARTITION BY RANGE ("clicked_at");
  CREATE INDEX "idx_click_events_link_id_clicked_at"
    ON "click_events" ("link_id", "clicked_at");
  CREATE TABLE "click_events_default" PARTITION OF "click_events" DEFAULT;

  CREATE TABLE "link_daily_totals" (
    "link_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "unique_visitors" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "pk_link_daily_totals" PRIMARY KEY ("link_id", "day"),
    CONSTRAINT "fk_link_daily_totals_link_id" FOREIGN KEY ("link_id")
      REFERENCES "links" ("id") ON DELETE CASCADE
  );

  CREATE TABLE "link_daily_breakdowns" (
    "link_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "dimension" VARCHAR(16) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "pk_link_daily_breakdowns"
      PRIMARY KEY ("link_id", "day", "dimension", "value"),
    CONSTRAINT "fk_link_daily_breakdowns_link_id" FOREIGN KEY ("link_id")
      REFERENCES "links" ("id") ON DELETE CASCADE,
    CONSTRAINT "ck_link_daily_breakdowns_dimension" CHECK ("dimension" IN
      ('country', 'device', 'os', 'browser', 'referrer', 'source', 'variant'))
  );

`;

const TABLES_IN_DROP_ORDER = [
  'link_daily_breakdowns',
  'link_daily_totals',
  'click_events',
  'link_variants',
  'links',
  'domains',
  'audit_log',
  'api_keys',
  'workspace_invitations',
  'workspace_members',
  'workspaces',
  'email_tokens',
  'sessions',
  'users',
];

/**
 * Replaces the schema of the single-tenant MVP with the platform's. The MVP
 * tables are dropped rather than migrated: they were never deployed, and a
 * link there has no workspace or domain to belong to.
 */
export class PlatformSchema1795762406000 implements MigrationInterface {
  name = 'PlatformSchema1795762406000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await new InitialSchema1795757960000().down(queryRunner);
    for (const statements of [IDENTITY, WORKSPACES, LINKS, ANALYTICS]) {
      await queryRunner.query(statements);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES_IN_DROP_ORDER) {
      await queryRunner.query(`DROP TABLE "${table}"`);
    }
    await new InitialSchema1795757960000().up(queryRunner);
  }
}
