import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1795757960000 implements MigrationInterface {
  name = 'InitialSchema1795757960000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "url_mappings" (
        "id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
        "short_code" VARCHAR(32) COLLATE "C" NOT NULL,
        "long_url" TEXT NOT NULL,
        "owner_id" VARCHAR(64),
        "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
        "expires_at" TIMESTAMPTZ,
        "click_count" BIGINT NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_url_mappings" PRIMARY KEY ("id"),
        CONSTRAINT "uq_url_mappings_short_code" UNIQUE ("short_code"),
        CONSTRAINT "ck_url_mappings_long_url_length"
          CHECK (char_length("long_url") <= 2048),
        CONSTRAINT "ck_url_mappings_status"
          CHECK ("status" IN ('ACTIVE', 'DISABLED'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "click_events" (
        "event_id" UUID NOT NULL,
        "link_id" BIGINT NOT NULL,
        "clicked_at" TIMESTAMPTZ NOT NULL,
        "referrer_host" VARCHAR(255),
        "ua_class" VARCHAR(16) NOT NULL,
        CONSTRAINT "pk_click_events" PRIMARY KEY ("event_id"),
        CONSTRAINT "fk_click_events_link_id" FOREIGN KEY ("link_id")
          REFERENCES "url_mappings" ("id") ON DELETE CASCADE,
        CONSTRAINT "ck_click_events_ua_class"
          CHECK ("ua_class" IN ('desktop', 'mobile', 'bot', 'other'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_click_events_link_id_clicked_at"
        ON "click_events" ("link_id", "clicked_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "click_events"`);
    await queryRunner.query(`DROP TABLE "url_mappings"`);
  }
}
