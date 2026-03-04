import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { User, UserRole, Language } from '../entities/user.entity';
import { LogService } from '../log/log.service';
export declare class RegisterDto {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    country: string;
    language?: Language;
    phone?: string;
    company?: string;
}
export declare class LoginDto {
    email: string;
    password: string;
}
export declare class AuthService {
    private userRepository;
    private jwtService;
    private logService;
    constructor(userRepository: Repository<User>, jwtService: JwtService, logService: LogService);
    register(registerDto: RegisterDto, ipAddress?: string, userAgent?: string): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: UserRole;
            country: string;
            language: Language;
            phone: string;
            company: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            lots: import("../entities").Lot[];
            sentMessages: import("../entities").Message[];
            receivedMessages: import("../entities").Message[];
            alerts: import("../entities").Alert[];
        };
        token: string;
    }>;
    login(loginDto: LoginDto, ipAddress?: string, userAgent?: string): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: UserRole;
            country: string;
            language: Language;
            phone: string;
            company: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            lots: import("../entities").Lot[];
            sentMessages: import("../entities").Message[];
            receivedMessages: import("../entities").Message[];
            alerts: import("../entities").Alert[];
        };
        token: string;
    }>;
    updateProfile(userId: string, updateData: any): Promise<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        country: string;
        language: Language;
        phone: string;
        company: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        lots: import("../entities").Lot[];
        sentMessages: import("../entities").Message[];
        receivedMessages: import("../entities").Message[];
        alerts: import("../entities").Alert[];
    }>;
    private generateToken;
    validateUser(userId: string): Promise<User>;
}
