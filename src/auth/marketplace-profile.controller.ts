import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MarketplaceAccountType } from './marketplace-profile.entity';
import { MarketplaceProfileService } from './marketplace-profile.service';
import { CertificateStatus } from './supplier-certificate.entity';
import { ForwarderServiceCategory } from './forwarder-service.entity';
import { TradeCurrency } from './trade-request.entity';
import { TradeService } from './trade.service';

class CreateMarketplaceProfileDto {
  @IsEnum(MarketplaceAccountType)
  accountType: MarketplaceAccountType;

  @IsString() @IsNotEmpty() @MaxLength(180)
  legalName: string;

  @IsOptional() @IsString() @MaxLength(80)
  taxId?: string;

  @IsString() @IsNotEmpty() @MaxLength(120)
  country: string;

  @IsOptional() @IsString() @MaxLength(120)
  region?: string;

  @IsOptional() @IsUrl() @MaxLength(255)
  website?: string;

  @IsOptional() @IsString() @MaxLength(3000)
  description?: string;
}

class AddCertificateDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;

  @IsString() @IsNotEmpty() @MaxLength(180)
  issuer: string;

  @IsOptional() @IsString() @MaxLength(120)
  certificateNumber?: string;

  @IsOptional() @IsDateString()
  issuedAt?: string;

  @IsOptional() @IsDateString()
  expiresAt?: string;

  @IsUrl() @MaxLength(500)
  documentUrl: string;
}

class ReviewCertificateDto {
  @IsIn([CertificateStatus.APPROVED, CertificateStatus.REJECTED])
  status: CertificateStatus.APPROVED | CertificateStatus.REJECTED;

  @IsOptional() @IsString() @MaxLength(1000)
  reviewNote?: string;
}

class CreateForwarderServiceDto {
  @IsEnum(ForwarderServiceCategory)
  category: ForwarderServiceCategory;

  @IsString() @IsNotEmpty() @MaxLength(160)
  title: string;

  @IsString() @IsNotEmpty() @MaxLength(3000)
  description: string;

  @IsString() @IsNotEmpty() @MaxLength(500)
  coverage: string;

  @IsOptional() @IsBoolean()
  coldChain?: boolean;
}

class CreateTradeRequestDto {
  @IsString() @IsNotEmpty()
  lotId: string;

  @Type(() => Number) @IsNumber() @Min(0.01)
  quantity: number;

  @Type(() => Number) @IsNumber() @Min(0)
  unitPrice: number;

  @IsEnum(TradeCurrency)
  currency: TradeCurrency;

  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;

  @IsOptional() @IsDateString()
  validUntil?: string;
}

class CreateTradeOfferDto {
  @Type(() => Number) @IsNumber() @Min(0.01)
  quantity: number;

  @Type(() => Number) @IsNumber() @Min(0)
  unitPrice: number;

  @IsEnum(TradeCurrency)
  currency: TradeCurrency;

  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;

  @IsOptional() @IsDateString()
  validUntil?: string;
}

class CreateFreightRequestDto {
  @IsString() @IsNotEmpty()
  orderId: string;
  @IsString() @IsNotEmpty() @MaxLength(255)
  origin: string;
  @IsString() @IsNotEmpty() @MaxLength(255)
  destination: string;
  @IsOptional() @IsDateString()
  pickupFrom?: string;
  @IsOptional() @IsDateString()
  deliveryBefore?: string;
  @IsOptional() @IsBoolean()
  coldChainRequired?: boolean;
  @IsOptional() @IsString() @MaxLength(3000)
  requirements?: string;
}

class CreateFreightQuoteDto {
  @Type(() => Number) @IsNumber() @Min(0)
  price: number;
  @IsEnum(TradeCurrency)
  currency: TradeCurrency;
  @Type(() => Number) @IsNumber() @Min(1)
  transitDays: number;
  @IsString() @IsNotEmpty() @MaxLength(3000)
  conditions: string;
  @IsOptional() @IsDateString()
  validUntil?: string;
}

@Controller('marketplace')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class MarketplaceProfileController {
  constructor(
    private readonly marketplace: MarketplaceProfileService,
    private readonly trades: TradeService,
  ) {}

  @Get('profiles')
  listPublic(@Query('accountType') accountType?: MarketplaceAccountType) {
    return this.marketplace.listPublic(accountType);
  }

  @Get('forwarder-services')
  listForwarderServices(@Query('country') country?: string) {
    return this.marketplace.listForwarderServices(country);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile')
  create(@Req() req: any, @Body() dto: CreateMarketplaceProfileDto) {
    return this.marketplace.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getMine(@Req() req: any) {
    return this.marketplace.getMine(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('certificates')
  addCertificate(@Req() req: any, @Body() dto: AddCertificateDto) {
    return this.marketplace.addCertificate(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('forwarder-services')
  createForwarderService(@Req() req: any, @Body() dto: CreateForwarderServiceDto) {
    return this.marketplace.createForwarderService(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trade-requests')
  createTradeRequest(@Req() req: any, @Body() dto: CreateTradeRequestDto) {
    return this.trades.createRequest(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trade-requests/:id/offers')
  createTradeOffer(@Req() req: any, @Param('id') id: string, @Body() dto: CreateTradeOfferDto) {
    return this.trades.createOffer(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trade-offers/:id/accept')
  acceptTradeOffer(@Req() req: any, @Param('id') id: string) {
    return this.trades.acceptOffer(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('trades/mine')
  listMyTrades(@Req() req: any) {
    return this.trades.listMine(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('orders/:id/confirm')
  confirmOrder(@Req() req: any, @Param('id') id: string) {
    return this.trades.confirmOrder(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('orders/:id/cancel')
  cancelOrder(@Req() req: any, @Param('id') id: string) {
    return this.trades.cancelOrder(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('orders/:id/complete')
  completeOrder(@Req() req: any, @Param('id') id: string) {
    return this.trades.completeOrder(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('freight-requests')
  createFreightRequest(@Req() req: any, @Body() dto: CreateFreightRequestDto) {
    return this.trades.createFreightRequest(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('freight-requests/open')
  listOpenFreightRequests(@Req() req: any) {
    return this.trades.listOpenFreightRequests(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('freight-requests/mine')
  listMyFreightRequests(@Req() req: any) {
    return this.trades.listMyFreightRequests(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('freight-requests/:id/quotes')
  createFreightQuote(@Req() req: any, @Param('id') id: string, @Body() dto: CreateFreightQuoteDto) {
    return this.trades.createFreightQuote(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('freight-quotes/:id/select')
  selectFreightQuote(@Req() req: any, @Param('id') id: string) {
    return this.trades.selectFreightQuote(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('certificates/:id/review')
  reviewCertificate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReviewCertificateDto,
  ) {
    return this.marketplace.reviewCertificate(req.user, id, dto.status, dto.reviewNote);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/certificates')
  listCertificatesForAdmin(
    @Req() req: any,
    @Query('status') status?: CertificateStatus,
  ) {
    return this.marketplace.listCertificatesForAdmin(req.user, status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/profiles')
  listProfilesForAdmin(@Req() req: any) {
    return this.marketplace.listProfilesForAdmin(req.user);
  }
}
