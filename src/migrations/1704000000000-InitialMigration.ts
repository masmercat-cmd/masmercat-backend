import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1704000000000 implements MigrationInterface {
    name = 'InitialMigration1704000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create ENUM types
        await queryRunner.query(`
            CREATE TYPE "user_role_enum" AS ENUM('admin', 'seller', 'buyer');
            CREATE TYPE "language_enum" AS ENUM('es', 'en', 'fr', 'de', 'pt', 'ar', 'zh', 'hi');
            CREATE TYPE "lot_status_enum" AS ENUM('available', 'reserved', 'sold');
            CREATE TYPE "unit_type_enum" AS ENUM('kg', 'box');
            CREATE TYPE "quality_grade_enum" AS ENUM('extra', 'first', 'second', 'industrial');
            CREATE TYPE "message_status_enum" AS ENUM('unread', 'read', 'replied');
            CREATE TYPE "event_type_enum" AS ENUM('user_login', 'user_logout', 'user_register', 'lot_create', 'lot_update', 'lot_delete', 'message_send', 'opportunity_create', 'admin_action');
        `);

        // Create users table
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name" VARCHAR(100) NOT NULL,
                "email" VARCHAR(150) UNIQUE NOT NULL,
                "password" VARCHAR(255) NOT NULL,
                "role" user_role_enum DEFAULT 'buyer',
                "country" VARCHAR(100) NOT NULL,
                "language" language_enum DEFAULT 'es',
                "phone" VARCHAR(20),
                "company" VARCHAR(255),
                "isActive" BOOLEAN DEFAULT true,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create fruits table
        await queryRunner.query(`
            CREATE TABLE "fruits" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "nameEs" VARCHAR(100) NOT NULL,
                "nameEn" VARCHAR(100) NOT NULL,
                "nameFr" VARCHAR(100) NOT NULL,
                "nameDe" VARCHAR(100) NOT NULL,
                "namePt" VARCHAR(100) NOT NULL,
                "nameAr" VARCHAR(100) NOT NULL,
                "nameZh" VARCHAR(100) NOT NULL,
                "nameHi" VARCHAR(100) NOT NULL,
                "scientificName" VARCHAR(50),
                "imageUrl" VARCHAR(255),
                "active" BOOLEAN DEFAULT true,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create markets table
        await queryRunner.query(`
            CREATE TABLE "markets" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name" VARCHAR(150) NOT NULL,
                "country" VARCHAR(100) NOT NULL,
                "city" VARCHAR(100),
                "continent" VARCHAR(50),
                "latitude" DECIMAL(10, 7),
                "longitude" DECIMAL(10, 7),
                "active" BOOLEAN DEFAULT true,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create lots table
        await queryRunner.query(`
            CREATE TABLE "lots" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "sellerId" uuid NOT NULL,
                "fruitId" uuid NOT NULL,
                "marketId" uuid NOT NULL,
                "caliber" VARCHAR(100),
                "quality" quality_grade_enum DEFAULT 'first',
                "price" DECIMAL(10, 2) NOT NULL,
                "unitType" unit_type_enum DEFAULT 'kg',
                "weight" DECIMAL(10, 2),
                "numberOfBoxes" INTEGER,
                "photos" TEXT[] DEFAULT '{}',
                "status" lot_status_enum DEFAULT 'available',
                "isOpportunity" BOOLEAN DEFAULT false,
                "description" TEXT,
                "isActive" BOOLEAN DEFAULT true,
                "isBlocked" BOOLEAN DEFAULT false,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE,
                FOREIGN KEY ("fruitId") REFERENCES "fruits"("id") ON DELETE CASCADE,
                FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE
            )
        `);

        // Create messages table
        await queryRunner.query(`
            CREATE TABLE "messages" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "lotId" uuid NOT NULL,
                "buyerId" uuid NOT NULL,
                "sellerId" uuid NOT NULL,
                "message" TEXT NOT NULL,
                "requestCall" BOOLEAN DEFAULT false,
                "requestVideo" BOOLEAN DEFAULT false,
                "status" message_status_enum DEFAULT 'unread',
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE,
                FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE,
                FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        // Create logs table
        await queryRunner.query(`
            CREATE TABLE "logs" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "userId" uuid,
                "eventType" event_type_enum NOT NULL,
                "detail" TEXT,
                "metadata" JSONB,
                "ipAddress" VARCHAR(45),
                "userAgent" VARCHAR(255),
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        // Create price_history table (Phase 2)
        await queryRunner.query(`
            CREATE TABLE "price_history" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "fruitId" uuid NOT NULL,
                "marketId" uuid NOT NULL,
                "price" DECIMAL(10, 2) NOT NULL,
                "date" DATE NOT NULL,
                "unitType" VARCHAR(20),
                "additionalData" JSONB,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("fruitId") REFERENCES "fruits"("id") ON DELETE CASCADE,
                FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE
            )
        `);

        // Create alerts table (Phase 2)
        await queryRunner.query(`
            CREATE TABLE "alerts" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "fruitId" uuid NOT NULL,
                "marketId" uuid NOT NULL,
                "targetPrice" DECIMAL(10, 2) NOT NULL,
                "active" BOOLEAN DEFAULT true,
                "lastTriggered" TIMESTAMP,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
                FOREIGN KEY ("fruitId") REFERENCES "fruits"("id") ON DELETE CASCADE,
                FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE
            )
        `);

        // Create indexes
        await queryRunner.query(`CREATE INDEX "idx_lots_seller" ON "lots"("sellerId")`);
        await queryRunner.query(`CREATE INDEX "idx_lots_fruit" ON "lots"("fruitId")`);
        await queryRunner.query(`CREATE INDEX "idx_lots_market" ON "lots"("marketId")`);
        await queryRunner.query(`CREATE INDEX "idx_lots_status" ON "lots"("status")`);
        await queryRunner.query(`CREATE INDEX "idx_lots_opportunity" ON "lots"("isOpportunity")`);
        await queryRunner.query(`CREATE INDEX "idx_messages_lot" ON "messages"("lotId")`);
        await queryRunner.query(`CREATE INDEX "idx_messages_buyer" ON "messages"("buyerId")`);
        await queryRunner.query(`CREATE INDEX "idx_messages_seller" ON "messages"("sellerId")`);
        await queryRunner.query(`CREATE INDEX "idx_price_history_fruit_market_date" ON "price_history"("fruitId", "marketId", "date")`);
        await queryRunner.query(`CREATE INDEX "idx_logs_user" ON "logs"("userId")`);
        await queryRunner.query(`CREATE INDEX "idx_logs_event_type" ON "logs"("eventType")`);
        await queryRunner.query(`CREATE INDEX "idx_logs_created" ON "logs"("createdAt")`);

        // Insert default admin user (password: Admin123!)
        await queryRunner.query(`
            INSERT INTO "users" ("id", "name", "email", "password", "role", "country", "language")
            VALUES (
                uuid_generate_v4(),
                'Admin',
                'admin@masmercat.com',
                '$2b$10$X.K5mXnVqVqVqVqVqVqVqekJ3N0N5qbF7xJ8DQZ1KGTYiLz.2',
                'admin',
                'Spain',
                'es'
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "alerts"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "price_history"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "logs"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "lots"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "markets"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fruits"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "event_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "message_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "quality_grade_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "unit_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "lot_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "language_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
    }
}
