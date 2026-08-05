import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../entities/user.entity';
import { LogModule } from '../log/log.module';
import { MarketplaceProfile } from './marketplace-profile.entity';
import { SupplierCertificate } from './supplier-certificate.entity';
import { MarketplaceProfileController } from './marketplace-profile.controller';
import { MarketplaceProfileService } from './marketplace-profile.service';
import { ForwarderService } from './forwarder-service.entity';
import { TradeRequest } from './trade-request.entity';
import { TradeOffer } from './trade-offer.entity';
import { TradeOrder } from './trade-order.entity';
import { TradeService } from './trade.service';
import { Lot } from '../entities/lot.entity';
import { FreightRequest } from './freight-request.entity';
import { FreightQuote } from './freight-quote.entity';
import { PasswordResetToken } from './password-reset-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Lot,
      MarketplaceProfile,
      SupplierCertificate,
      ForwarderService,
      TradeRequest,
      TradeOffer,
      TradeOrder,
      FreightRequest,
      FreightQuote,
      PasswordResetToken,
    ]),
    PassportModule,
    LogModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRATION') || '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, MarketplaceProfileController],
  providers: [AuthService, JwtStrategy, MarketplaceProfileService, TradeService],
  exports: [AuthService],
})
export class AuthModule {}
