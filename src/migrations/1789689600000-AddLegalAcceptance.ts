import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLegalAcceptance1789689600000 implements MigrationInterface {
  name = 'AddLegalAcceptance1789689600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "termsVersion" character varying(20)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "publicContactConsent" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "publicContactConsent"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "termsVersion"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "termsAcceptedAt"`);
  }
}
