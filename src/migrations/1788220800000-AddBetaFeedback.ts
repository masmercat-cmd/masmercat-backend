import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBetaFeedback1788220800000 implements MigrationInterface {
  name = 'AddBetaFeedback1788220800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."beta_feedback_category_enum" AS ENUM(
          'works_well', 'something_broken', 'suggestion'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "beta_feedback" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "category" "public"."beta_feedback_category_enum" NOT NULL,
        "comment" text NOT NULL DEFAULT '',
        "platform" character varying(30) NOT NULL DEFAULT 'unknown',
        "appVersion" character varying(30) NOT NULL DEFAULT 'beta',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_beta_feedback" PRIMARY KEY ("id"),
        CONSTRAINT "FK_beta_feedback_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_feedback_user" ON "beta_feedback" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_feedback_created" ON "beta_feedback" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "beta_feedback"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."beta_feedback_category_enum"`);
  }
}
