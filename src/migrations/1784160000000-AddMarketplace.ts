import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketplace1784160000000 implements MigrationInterface {
  name = 'AddMarketplace1784160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "marketplace_profiles_accounttype_enum" AS ENUM ('producer', 'buyer', 'forwarder')`);
    await queryRunner.query(`CREATE TYPE "marketplace_profiles_trustlevel_enum" AS ENUM ('registered', 'identity_verified', 'company_verified', 'certified_producer', 'trusted_supplier')`);
    await queryRunner.query(`CREATE TYPE "supplier_certificates_status_enum" AS ENUM ('pending', 'approved', 'rejected', 'expired')`);
    await queryRunner.query(`CREATE TYPE "forwarder_services_category_enum" AS ENUM ('road_freight', 'sea_freight', 'air_freight', 'cold_chain', 'customs', 'storage', 'cargo_insurance')`);
    await queryRunner.query(`CREATE TYPE "trade_currency_enum" AS ENUM ('USD', 'ARS', 'BRL', 'PYG', 'UYU', 'EUR')`);
    await queryRunner.query(`CREATE TYPE "trade_requests_status_enum" AS ENUM ('open', 'negotiating', 'accepted', 'cancelled', 'expired')`);
    await queryRunner.query(`CREATE TYPE "trade_offers_party_enum" AS ENUM ('buyer', 'seller')`);
    await queryRunner.query(`CREATE TYPE "trade_offers_status_enum" AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn')`);
    await queryRunner.query(`CREATE TYPE "trade_orders_status_enum" AS ENUM ('stock_reserved', 'confirmed', 'completed', 'cancelled', 'expired')`);
    await queryRunner.query(`CREATE TYPE "freight_requests_status_enum" AS ENUM ('open', 'quote_selected', 'closed', 'cancelled')`);
    await queryRunner.query(`CREATE TYPE "freight_quotes_status_enum" AS ENUM ('pending', 'selected', 'declined', 'withdrawn')`);

    await queryRunner.query(`
      CREATE TABLE "marketplace_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "accountType" "marketplace_profiles_accounttype_enum" NOT NULL,
        "trustLevel" "marketplace_profiles_trustlevel_enum" NOT NULL DEFAULT 'registered',
        "legalName" character varying(180) NOT NULL,
        "taxId" character varying(80),
        "country" character varying(120) NOT NULL,
        "region" character varying(120),
        "website" character varying(255),
        "description" text,
        "identityVerified" boolean NOT NULL DEFAULT false,
        "companyVerified" boolean NOT NULL DEFAULT false,
        "isPublic" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_marketplace_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_marketplace_profiles_user" UNIQUE ("userId"),
        CONSTRAINT "FK_marketplace_profiles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "supplier_certificates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "profileId" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "issuer" character varying(180) NOT NULL,
        "certificateNumber" character varying(120),
        "issuedAt" date,
        "expiresAt" date,
        "documentUrl" character varying(500) NOT NULL,
        "status" "supplier_certificates_status_enum" NOT NULL DEFAULT 'pending',
        "reviewNote" text,
        "reviewedBy" character varying,
        "reviewedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_supplier_certificates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_supplier_certificates_profile" FOREIGN KEY ("profileId") REFERENCES "marketplace_profiles"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "forwarder_services" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "profileId" uuid NOT NULL,
        "category" "forwarder_services_category_enum" NOT NULL,
        "title" character varying(160) NOT NULL,
        "description" text NOT NULL,
        "coverage" character varying(500) NOT NULL,
        "coldChain" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_forwarder_services" PRIMARY KEY ("id"),
        CONSTRAINT "FK_forwarder_services_profile" FOREIGN KEY ("profileId") REFERENCES "marketplace_profiles"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "trade_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "lotId" uuid NOT NULL,
        "buyerId" uuid NOT NULL,
        "sellerId" uuid NOT NULL,
        "quantity" numeric(12,2) NOT NULL,
        "currency" "trade_currency_enum" NOT NULL DEFAULT 'USD',
        "status" "trade_requests_status_enum" NOT NULL DEFAULT 'open',
        "note" text,
        "expiresAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trade_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_trade_requests_lot" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_trade_requests_buyer" FOREIGN KEY ("buyerId") REFERENCES "users"("id"),
        CONSTRAINT "FK_trade_requests_seller" FOREIGN KEY ("sellerId") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "trade_offers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "requestId" uuid NOT NULL,
        "createdById" uuid NOT NULL,
        "party" "trade_offers_party_enum" NOT NULL,
        "unitPrice" numeric(12,2) NOT NULL,
        "quantity" numeric(12,2) NOT NULL,
        "currency" "trade_currency_enum" NOT NULL,
        "status" "trade_offers_status_enum" NOT NULL DEFAULT 'pending',
        "note" text,
        "validUntil" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trade_offers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_trade_offers_request" FOREIGN KEY ("requestId") REFERENCES "trade_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_trade_offers_creator" FOREIGN KEY ("createdById") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "trade_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "requestId" uuid NOT NULL,
        "acceptedOfferId" uuid NOT NULL,
        "lotId" uuid NOT NULL,
        "buyerId" uuid NOT NULL,
        "sellerId" uuid NOT NULL,
        "quantity" numeric(12,2) NOT NULL,
        "unitPrice" numeric(12,2) NOT NULL,
        "total" numeric(14,2) NOT NULL,
        "currency" "trade_currency_enum" NOT NULL,
        "status" "trade_orders_status_enum" NOT NULL DEFAULT 'stock_reserved',
        "reservedUntil" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trade_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_trade_orders_request" UNIQUE ("requestId"),
        CONSTRAINT "FK_trade_orders_lot" FOREIGN KEY ("lotId") REFERENCES "lots"("id"),
        CONSTRAINT "FK_trade_orders_buyer" FOREIGN KEY ("buyerId") REFERENCES "users"("id"),
        CONSTRAINT "FK_trade_orders_seller" FOREIGN KEY ("sellerId") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "freight_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "requestedById" uuid NOT NULL,
        "origin" character varying(255) NOT NULL,
        "destination" character varying(255) NOT NULL,
        "pickupFrom" TIMESTAMP,
        "deliveryBefore" TIMESTAMP,
        "coldChainRequired" boolean NOT NULL DEFAULT true,
        "requirements" text,
        "status" "freight_requests_status_enum" NOT NULL DEFAULT 'open',
        "selectedQuoteId" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_freight_requests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_freight_requests_order" UNIQUE ("orderId"),
        CONSTRAINT "FK_freight_requests_order" FOREIGN KEY ("orderId") REFERENCES "trade_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_freight_requests_requester" FOREIGN KEY ("requestedById") REFERENCES "users"("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "freight_quotes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "requestId" uuid NOT NULL,
        "forwarderProfileId" uuid NOT NULL,
        "price" numeric(14,2) NOT NULL,
        "currency" "trade_currency_enum" NOT NULL,
        "transitDays" integer NOT NULL,
        "conditions" text NOT NULL,
        "validUntil" TIMESTAMP,
        "status" "freight_quotes_status_enum" NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_freight_quotes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_freight_quotes_request" FOREIGN KEY ("requestId") REFERENCES "freight_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_freight_quotes_forwarder" FOREIGN KEY ("forwarderProfileId") REFERENCES "marketplace_profiles"("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_marketplace_profiles_public_type" ON "marketplace_profiles" ("isPublic", "accountType")`);
    await queryRunner.query(`CREATE INDEX "IDX_supplier_certificates_profile_status" ON "supplier_certificates" ("profileId", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_forwarder_services_active" ON "forwarder_services" ("isActive", "profileId")`);
    await queryRunner.query(`CREATE INDEX "IDX_trade_requests_parties" ON "trade_requests" ("buyerId", "sellerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_trade_requests_lot_status" ON "trade_requests" ("lotId", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_trade_offers_request_status" ON "trade_offers" ("requestId", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_trade_orders_parties" ON "trade_orders" ("buyerId", "sellerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_trade_orders_lot" ON "trade_orders" ("lotId")`);
    await queryRunner.query(`CREATE INDEX "IDX_trade_orders_status_expiry" ON "trade_orders" ("status", "reservedUntil")`);
    await queryRunner.query(`CREATE INDEX "IDX_freight_requests_status" ON "freight_requests" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_freight_quotes_request_status" ON "freight_quotes" ("requestId", "status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "freight_quotes"`);
    await queryRunner.query(`DROP TABLE "freight_requests"`);
    await queryRunner.query(`DROP TABLE "trade_orders"`);
    await queryRunner.query(`DROP TABLE "trade_offers"`);
    await queryRunner.query(`DROP TABLE "trade_requests"`);
    await queryRunner.query(`DROP TABLE "forwarder_services"`);
    await queryRunner.query(`DROP TABLE "supplier_certificates"`);
    await queryRunner.query(`DROP TABLE "marketplace_profiles"`);
    await queryRunner.query(`DROP TYPE "freight_quotes_status_enum"`);
    await queryRunner.query(`DROP TYPE "freight_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE "trade_orders_status_enum"`);
    await queryRunner.query(`DROP TYPE "trade_offers_status_enum"`);
    await queryRunner.query(`DROP TYPE "trade_offers_party_enum"`);
    await queryRunner.query(`DROP TYPE "trade_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE "trade_currency_enum"`);
    await queryRunner.query(`DROP TYPE "forwarder_services_category_enum"`);
    await queryRunner.query(`DROP TYPE "supplier_certificates_status_enum"`);
    await queryRunner.query(`DROP TYPE "marketplace_profiles_trustlevel_enum"`);
    await queryRunner.query(`DROP TYPE "marketplace_profiles_accounttype_enum"`);
  }
}
