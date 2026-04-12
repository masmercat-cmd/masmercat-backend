import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { User } from '../entities/user.entity';
import { Message } from '../entities/message.entity';

@Injectable()
export class MessagesRealtimeService {
  private wss: WebSocketServer | null = null;
  private readonly socketsByUser = new Map<string, Set<WebSocket>>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  attachServer(server: any): void {
    if (this.wss) {
      return;
    }

    this.wss = new WebSocketServer({
      server,
      path: '/messages/live',
    });

    this.wss.on('connection', async (socket, request) => {
      const user = await this.authenticateSocket(request);
      if (!user) {
        socket.close(1008, 'Unauthorized');
        return;
      }

      this.registerSocket(user.id, socket);
      this.sendToSocket(socket, 'messages.connected', {
        userId: user.id,
      });

      socket.on('close', () => {
        this.unregisterSocket(user.id, socket);
      });
    });
  }

  emitMessageCreated(message: Message): void {
    const payload = {
      id: message.id,
      lotId: message.lotId,
      buyerId: message.buyerId,
      sellerId: message.sellerId,
      senderId: message.senderId,
      status: message.status,
      createdAt: message.createdAt,
    };
    this.sendToUser(message.buyerId, 'messages.created', payload);
    this.sendToUser(message.sellerId, 'messages.created', payload);
  }

  emitMessageRead(message: Message): void {
    const payload = {
      id: message.id,
      lotId: message.lotId,
      buyerId: message.buyerId,
      sellerId: message.sellerId,
      senderId: message.senderId,
      status: message.status,
      updatedAt: message.updatedAt,
    };
    this.sendToUser(message.buyerId, 'messages.read', payload);
    this.sendToUser(message.sellerId, 'messages.read', payload);
  }

  private async authenticateSocket(
    request: IncomingMessage,
  ): Promise<User | null> {
    try {
      const url = new URL(
        request.url ?? '',
        'http://localhost',
      );
      const token =
        url.searchParams.get('token') ||
        this.extractBearerToken(
          `${request.headers.authorization ?? ''}`,
        );

      if (!token) {
        return null;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      if (!payload?.sub) {
        return null;
      }

      return this.userRepository.findOne({
        where: { id: payload.sub, isActive: true },
      });
    } catch {
      return null;
    }
  }

  private extractBearerToken(value: string): string | null {
    const normalized = value.trim();
    if (!normalized.toLowerCase().startsWith('bearer ')) {
      return null;
    }

    return normalized.slice(7).trim() || null;
  }

  private registerSocket(userId: string, socket: WebSocket): void {
    const existing = this.socketsByUser.get(userId) ?? new Set<WebSocket>();
    existing.add(socket);
    this.socketsByUser.set(userId, existing);
  }

  private unregisterSocket(userId: string, socket: WebSocket): void {
    const existing = this.socketsByUser.get(userId);
    if (!existing) {
      return;
    }

    existing.delete(socket);
    if (existing.size === 0) {
      this.socketsByUser.delete(userId);
    }
  }

  private sendToUser(userId: string, event: string, payload: any): void {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets?.size) {
      return;
    }

    for (const socket of sockets) {
      this.sendToSocket(socket, event, payload);
    }
  }

  private sendToSocket(socket: WebSocket, event: string, payload: any): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        event,
        payload,
      }),
    );
  }
}
