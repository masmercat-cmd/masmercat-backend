"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesService = exports.CreateMessageDto = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const message_entity_1 = require("../entities/message.entity");
const lot_entity_1 = require("../entities/lot.entity");
const log_service_1 = require("../log/log.service");
const log_entity_1 = require("../entities/log.entity");
class CreateMessageDto {
}
exports.CreateMessageDto = CreateMessageDto;
let MessagesService = class MessagesService {
    constructor(messageRepository, lotRepository, logService) {
        this.messageRepository = messageRepository;
        this.lotRepository = lotRepository;
        this.logService = logService;
    }
    async createMessage(createMessageDto, buyer) {
        const lot = await this.lotRepository.findOne({
            where: { id: createMessageDto.lotId },
            relations: ['seller'],
        });
        if (!lot) {
            throw new common_1.NotFoundException('Lot not found');
        }
        const message = this.messageRepository.create({
            ...createMessageDto,
            buyerId: buyer.id,
            sellerId: lot.sellerId,
        });
        const savedMessage = await this.messageRepository.save(message);
        await this.logService.createLog({
            userId: buyer.id,
            eventType: log_entity_1.EventType.MESSAGE_SEND,
            detail: `Message sent to seller for lot ${createMessageDto.lotId}`,
            metadata: {
                messageId: savedMessage.id,
                lotId: createMessageDto.lotId,
                sellerId: lot.sellerId,
            },
        });
        return this.messageRepository.findOne({
            where: { id: savedMessage.id },
            relations: ['buyer', 'seller', 'lot', 'lot.fruit', 'lot.market'],
        });
    }
    async getMessagesForSeller(seller, page = 1, limit = 50) {
        const [messages, total] = await this.messageRepository.findAndCount({
            where: { sellerId: seller.id },
            relations: ['buyer', 'lot', 'lot.fruit', 'lot.market'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            messages,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
    async getMessagesForBuyer(buyer, page = 1, limit = 50) {
        const [messages, total] = await this.messageRepository.findAndCount({
            where: { buyerId: buyer.id },
            relations: ['seller', 'lot', 'lot.fruit', 'lot.market'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            messages,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
    async markAsRead(messageId, user) {
        const message = await this.messageRepository.findOne({
            where: { id: messageId },
        });
        if (!message) {
            throw new common_1.NotFoundException('Message not found');
        }
        if (message.sellerId !== user.id) {
            throw new common_1.NotFoundException('Message not found');
        }
        message.status = message_entity_1.MessageStatus.READ;
        return this.messageRepository.save(message);
    }
    async getAllMessages(page = 1, limit = 50) {
        const [messages, total] = await this.messageRepository.findAndCount({
            relations: ['buyer', 'seller', 'lot', 'lot.fruit', 'lot.market'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            messages,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
};
exports.MessagesService = MessagesService;
exports.MessagesService = MessagesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(message_entity_1.Message)),
    __param(1, (0, typeorm_1.InjectRepository)(lot_entity_1.Lot)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        log_service_1.LogService])
], MessagesService);
//# sourceMappingURL=messages.service.js.map