import { AuthService, RegisterDto, LoginDto } from './auth.service';
import { Request } from 'express';
export declare class UpdateProfileDto {
    name?: string;
    language?: string;
    country?: string;
    phone?: string;
    company?: string;
}
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    register(registerDto: RegisterDto, req: Request): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: import("../entities").UserRole;
            country: string;
            language: import("../entities").Language;
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
    login(loginDto: LoginDto, req: Request): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
            role: import("../entities").UserRole;
            country: string;
            language: import("../entities").Language;
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
    getProfile(req: any): Promise<any>;
    updateProfile(req: any, updateDto: UpdateProfileDto): Promise<{
        id: string;
        name: string;
        email: string;
        role: import("../entities").UserRole;
        country: string;
        language: import("../entities").Language;
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
}
