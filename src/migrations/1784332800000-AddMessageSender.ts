import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMessageSender1784332800000 implements MigrationInterface {
  name = 'AddMessageSender1784332800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN "senderId" uuid`);
    await queryRunner.query(`UPDATE "messages" SET "senderId" = "buyerId" WHERE "senderId" IS NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_messages_sender" ON "messages" ("senderId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_messages_sender"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "senderId"`);
  }
}
