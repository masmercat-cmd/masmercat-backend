import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../entities/user.entity';
import {
  MarketplaceAccountType,
  MarketplaceProfile,
  TrustLevel,
} from './marketplace-profile.entity';
import {
  CertificateStatus,
  SupplierCertificate,
} from './supplier-certificate.entity';
import { ForwarderService, ForwarderServiceCategory } from './forwarder-service.entity';

export interface CreateMarketplaceProfileData {
  accountType: MarketplaceAccountType;
  legalName: string;
  taxId?: string;
  country: string;
  region?: string;
  website?: string;
  description?: string;
}

export interface AddCertificateData {
  name: string;
  issuer: string;
  certificateNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  documentUrl: string;
}

export interface CreateForwarderServiceData {
  category: ForwarderServiceCategory;
  title: string;
  description: string;
  coverage: string;
  coldChain?: boolean;
}

@Injectable()
export class MarketplaceProfileService {
  constructor(
    @InjectRepository(MarketplaceProfile)
    private readonly profileRepository: Repository<MarketplaceProfile>,
    @InjectRepository(SupplierCertificate)
    private readonly certificateRepository: Repository<SupplierCertificate>,
    @InjectRepository(ForwarderService)
    private readonly forwarderServiceRepository: Repository<ForwarderService>,
  ) {}

  async create(userId: string, data: CreateMarketplaceProfileData) {
    const existing = await this.profileRepository.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException('Marketplace profile already exists');
    }

    const profile = this.profileRepository.create({
      ...data,
      legalName: data.legalName.trim(),
      country: data.country.trim(),
      taxId: this.optional(data.taxId),
      region: this.optional(data.region),
      website: this.optional(data.website),
      description: this.optional(data.description),
      userId,
      trustLevel: TrustLevel.REGISTERED,
    });
    return this.profileRepository.save(profile);
  }

  async getMine(userId: string) {
    const profile = await this.profileRepository.findOne({
      where: { userId },
      relations: ['certificates'],
    });
    if (!profile) throw new NotFoundException('Marketplace profile not found');
    const certificatesExpired = await this.markExpiredCertificates(profile.certificates);
    if (certificatesExpired) {
      await this.refreshTrustLevel(profile);
    }
    return profile;
  }

  async listPublic(accountType?: MarketplaceAccountType) {
    const profiles = await this.profileRepository.find({
      where: {
        isPublic: true,
        ...(accountType ? { accountType } : {}),
      },
      relations: ['certificates'],
      order: { createdAt: 'DESC' },
    });

    for (const profile of profiles) {
      const certificatesExpired = await this.markExpiredCertificates(profile.certificates);
      if (certificatesExpired) {
        await this.refreshTrustLevel(profile);
      }
    }

    return profiles.map(profile => ({
      ...profile,
      taxId: undefined,
      certificates: profile.certificates
        .filter(certificate => this.isPublicCertificate(certificate))
        .map(({ documentUrl, reviewNote, ...certificate }) => certificate),
    }));
  }

  async addCertificate(userId: string, data: AddCertificateData) {
    const profile = await this.getMine(userId);
    if (profile.accountType !== MarketplaceAccountType.PRODUCER) {
      throw new ForbiddenException('Only producer profiles can submit certificates');
    }
    if (data.issuedAt && data.expiresAt && data.expiresAt < data.issuedAt) {
      throw new BadRequestException('Certificate expiration must be after its issue date');
    }
    const certificate = this.certificateRepository.create({
      ...data,
      name: data.name.trim(),
      issuer: data.issuer.trim(),
      profileId: profile.id,
      status: CertificateStatus.PENDING,
    });
    return this.certificateRepository.save(certificate);
  }

  async createForwarderService(userId: string, data: CreateForwarderServiceData) {
    const profile = await this.getMine(userId);
    if (profile.accountType !== MarketplaceAccountType.FORWARDER) {
      throw new ForbiddenException('Only forwarder profiles can publish services');
    }
    return this.forwarderServiceRepository.save(
      this.forwarderServiceRepository.create({
        ...data,
        title: data.title.trim(),
        description: data.description.trim(),
        coverage: data.coverage.trim(),
        profileId: profile.id,
      }),
    );
  }

  async listForwarderServices(country?: string) {
    const query = this.forwarderServiceRepository
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.profile', 'profile')
      .where('service.isActive = :active', { active: true })
      .andWhere('profile.isPublic = :public', { public: true });
    if (country?.trim()) {
      query.andWhere('LOWER(service.coverage) LIKE :country', {
        country: `%${country.trim().toLowerCase()}%`,
      });
    }
    const services = await query.orderBy('service.createdAt', 'DESC').getMany();
    return services.map(service => ({
      ...service,
      profile: this.toPublicProfile(service.profile),
    }));
  }

  async reviewCertificate(
    reviewer: { id: string; role: UserRole },
    certificateId: string,
    status: CertificateStatus.APPROVED | CertificateStatus.REJECTED,
    reviewNote?: string,
  ) {
    if (reviewer.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    const certificate = await this.certificateRepository.findOne({
      where: { id: certificateId },
      relations: ['profile', 'profile.certificates'],
    });
    if (!certificate) throw new NotFoundException('Certificate not found');

    certificate.status = status;
    certificate.reviewNote = this.optional(reviewNote);
    certificate.reviewedBy = reviewer.id;
    certificate.reviewedAt = new Date();
    await this.certificateRepository.save(certificate);
    await this.refreshTrustLevel(certificate.profile);
    return certificate;
  }

  async listCertificatesForAdmin(
    reviewer: { role: UserRole },
    status?: CertificateStatus,
  ) {
    this.requireAdmin(reviewer);
    const certificates = await this.certificateRepository.find({
      where: status ? { status } : {},
      relations: ['profile'],
      order: { createdAt: 'DESC' },
    });
    return certificates.map(certificate => ({
      ...certificate,
      profile: {
        id: certificate.profile.id,
        userId: certificate.profile.userId,
        legalName: certificate.profile.legalName,
        accountType: certificate.profile.accountType,
        country: certificate.profile.country,
        region: certificate.profile.region,
        trustLevel: certificate.profile.trustLevel,
      },
    }));
  }

  async listProfilesForAdmin(reviewer: { role: UserRole }) {
    this.requireAdmin(reviewer);
    return this.profileRepository.find({
      relations: ['certificates'],
      order: { createdAt: 'DESC' },
    });
  }

  private async refreshTrustLevel(profile: MarketplaceProfile) {
    const certificates = await this.certificateRepository.find({
      where: { profileId: profile.id },
    });
    const hasValidCertificate = certificates.some(certificate =>
      this.isPublicCertificate(certificate),
    );
    profile.trustLevel = hasValidCertificate && profile.accountType === MarketplaceAccountType.PRODUCER
      ? TrustLevel.CERTIFIED_PRODUCER
      : profile.companyVerified
        ? TrustLevel.COMPANY_VERIFIED
        : profile.identityVerified
          ? TrustLevel.IDENTITY_VERIFIED
          : TrustLevel.REGISTERED;
    await this.profileRepository.save(profile);
  }

  private async markExpiredCertificates(
    certificates: SupplierCertificate[],
  ): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const expired = certificates.filter(certificate =>
      certificate.status === CertificateStatus.APPROVED &&
      certificate.expiresAt && certificate.expiresAt < today,
    );
    if (expired.length === 0) return false;
    expired.forEach(certificate => certificate.status = CertificateStatus.EXPIRED);
    await this.certificateRepository.save(expired);
    return true;
  }

  private isPublicCertificate(certificate: SupplierCertificate) {
    const today = new Date().toISOString().slice(0, 10);
    return certificate.status === CertificateStatus.APPROVED &&
      (!certificate.expiresAt || certificate.expiresAt >= today);
  }

  private toPublicProfile(profile: MarketplaceProfile) {
    const {
      taxId,
      identityVerified,
      companyVerified,
      certificates,
      user,
      ...publicProfile
    } = profile;
    return publicProfile;
  }

  private optional(value?: string) {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private requireAdmin(user: { role: UserRole }) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
  }
}
