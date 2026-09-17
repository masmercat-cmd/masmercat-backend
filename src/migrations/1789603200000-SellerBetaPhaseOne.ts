import { MigrationInterface, QueryRunner } from 'typeorm';

export class SellerBetaPhaseOne1789603200000 implements MigrationInterface {
  name = 'SellerBetaPhaseOne1789603200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "lot_currency_enum" AS ENUM ('EUR', 'USD')`);
    await queryRunner.query(`CREATE TYPE "lot_incoterm_enum" AS ENUM ('EXW', 'DAP')`);
    await queryRunner.query(`ALTER TABLE "lots" ADD "variety" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "lots" ADD "packaging" character varying(160)`);
    await queryRunner.query(`ALTER TABLE "lots" ADD "currency" "lot_currency_enum" NOT NULL DEFAULT 'EUR'`);
    await queryRunner.query(`ALTER TABLE "lots" ADD "incoterm" "lot_incoterm_enum" NOT NULL DEFAULT 'EXW'`);
    await queryRunner.query(`ALTER TABLE "lots" ADD "origin" character varying(160)`);
    await queryRunner.query(`ALTER TABLE "lots" ADD "loadingLocation" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "lots" ADD "availableFrom" date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "lots" DROP COLUMN "availableFrom"`);
    await queryRunner.query(`ALTER TABLE "lots" DROP COLUMN "loadingLocation"`);
    await queryRunner.query(`ALTER TABLE "lots" DROP COLUMN "origin"`);
    await queryRunner.query(`ALTER TABLE "lots" DROP COLUMN "incoterm"`);
    await queryRunner.query(`ALTER TABLE "lots" DROP COLUMN "currency"`);
    await queryRunner.query(`ALTER TABLE "lots" DROP COLUMN "packaging"`);
    await queryRunner.query(`ALTER TABLE "lots" DROP COLUMN "variety"`);
    await queryRunner.query(`DROP TYPE "lot_incoterm_enum"`);
    await queryRunner.query(`DROP TYPE "lot_currency_enum"`);
  }
}
