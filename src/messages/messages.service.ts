import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageStatus } from '../entities/message.entity';
import { Lot } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
import { LogService } from '../log/log.service';
import { EventType } from '../entities/log.entity';
import { MessagesRealtimeService } from './messages-realtime.service';

export class CreateMessageDto {
  lotId: string;
  message: string;
  requestCall?: boolean;
  requestVideo?: boolean;
  recipientUserId?: string;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Lot)
    private lotRepository: Repository<Lot>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private logService: LogService,
    private messagesRealtimeService: MessagesRealtimeService,
  ) {}

  async createMessage(
    createMessageDto: CreateMessageDto,
    sender: User,
  ): Promise<Message> {
    const lot = await this.lotRepository.findOne({
      where: { id: createMessageDto.lotId },
      relations: ['seller'],
    });

    if (!lot) {
      throw new NotFoundException('Lot not found');
    }

    const trimmedMessage = `${createMessageDto.message ?? ''}`.trim();
    if (!trimmedMessage) {
      throw new BadRequestException('Message is required');
    }

    let buyerId = sender.id;
    let sellerId = lot.sellerId;

    if (sender.id === lot.sellerId) {
      if (!createMessageDto.recipientUserId) {
        throw new BadRequestException('recipientUserId is required for seller replies');
      }

      const recipient = await this.userRepository.findOne({
        where: { id: createMessageDto.recipientUserId, isActive: true },
      });
      if (!recipient) {
        throw new NotFoundException('Recipient not found');
      }

      const existingThread = await this.messageRepository.exist({
        where: {
          lotId: createMessageDto.lotId,
          buyerId: recipient.id,
          sellerId: sender.id,
        },
      });
      if (!existingThread) {
        throw new ForbiddenException('Seller can only reply to existing buyers for this lot');
      }

      buyerId = recipient.id;
      sellerId = sender.id;
    } else if (createMessageDto.recipientUserId && createMessageDto.recipientUserId !== lot.sellerId) {
      throw new ForbiddenException('Buyer can only contact the lot seller');
    }

    const message = this.messageRepository.create({
      lotId: createMessageDto.lotId,
      message: trimmedMessage,
      requestCall: !!createMessageDto.requestCall,
      requestVideo: !!createMessageDto.requestVideo,
      buyerId,
      sellerId,
      senderId: sender.id,
    });

    const savedMessage = await this.messageRepository.save(message);

    await this.logService.createLog({
      userId: sender.id,
      eventType: EventType.MESSAGE_SEND,
      detail: `Message sent to seller for lot ${createMessageDto.lotId}`,
      metadata: {
        messageId: savedMessage.id,
        lotId: createMessageDto.lotId,
        sellerId,
        buyerId,
        senderId: sender.id,
      },
    });

    const hydrated = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['buyer', 'seller', 'lot', 'lot.fruit', 'lot.market'],
    });
    if (!hydrated) {
      throw new NotFoundException('Message not found after save');
    }

    this.messagesRealtimeService.emitMessageCreated(hydrated);
    return hydrated;
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

    if (message.senderId === user.id) {
      throw new NotFoundException('Message not found');
    }

    if (message.sellerId !== user.id && message.buyerId !== user.id) {
      throw new NotFoundException('Message not found');
    }

    message.status = MessageStatus.READ;
    const saved = await this.messageRepository.save(message);
    this.messagesRealtimeService.emitMessageRead(saved);
    return saved;
  }

  async getThreadMessages(
    lotId: string,
    counterpartUserId: string,
    user: User,
  ): Promise<Message[]> {
    const lot = await this.lotRepository.findOne({
      where: { id: lotId },
    });
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }

    let buyerId = user.id;
    let sellerId = counterpartUserId;

    if (user.id === lot.sellerId) {
      sellerId = user.id;
      buyerId = counterpartUserId;
    } else if (counterpartUserId !== lot.sellerId) {
      throw new ForbiddenException('Thread not allowed');
    }

    return this.messageRepository.find({
      where: {
        lotId,
        buyerId,
        sellerId,
      },
      relations: ['buyer', 'seller', 'lot', 'lot.fruit', 'lot.market'],
      order: { createdAt: 'ASC' },
    });
  }

  async markThreadAsRead(
    lotId: string,
    counterpartUserId: string,
    user: User,
  ): Promise<{ updated: number }> {
    const thread = await this.getThreadMessages(lotId, counterpartUserId, user);
    const unread = thread.filter(
      (item) =>
        item.status === MessageStatus.UNREAD &&
        item.senderId !== user.id,
    );

    for (const message of unread) {
      message.status = MessageStatus.READ;
      const saved = await this.messageRepository.save(message);
      this.messagesRealtimeService.emitMessageRead(saved);
    }

    return { updated: unread.length };
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
