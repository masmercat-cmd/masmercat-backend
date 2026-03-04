import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageStatus } from '../entities/message.entity';
import { Lot } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
import { LogService } from '../log/log.service';
import { EventType } from '../entities/log.entity';

export class CreateMessageDto {
  lotId: string;
  message: string;
  requestCall?: boolean;
  requestVideo?: boolean;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Lot)
    private lotRepository: Repository<Lot>,
    private logService: LogService,
  ) {}

  async createMessage(createMessageDto: CreateMessageDto, buyer: User): Promise<Message> {
    const lot = await this.lotRepository.findOne({
      where: { id: createMessageDto.lotId },
      relations: ['seller'],
    });

    if (!lot) {
      throw new NotFoundException('Lot not found');
    }

    const message = this.messageRepository.create({
      ...createMessageDto,
      buyerId: buyer.id,
      sellerId: lot.sellerId,
    });

    const savedMessage = await this.messageRepository.save(message);

    await this.logService.createLog({
      userId: buyer.id,
      eventType: EventType.MESSAGE_SEND,
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

  async getMessagesForSeller(seller: User, page: number = 1, limit: number = 50) {
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

  async getMessagesForBuyer(buyer: User, page: number = 1, limit: number = 50) {
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

  async markAsRead(messageId: string, user: User): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.sellerId !== user.id) {
      throw new NotFoundException('Message not found');
    }

    message.status = MessageStatus.READ;
    return this.messageRepository.save(message);
  }

  async getAllMessages(page: number = 1, limit: number = 50) {
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
}
