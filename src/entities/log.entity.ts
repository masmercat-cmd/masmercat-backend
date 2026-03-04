import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

export enum EventType {
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_REGISTER = 'user_register',
  LOT_CREATE = 'lot_create',
  LOT_UPDATE = 'lot_update',
  LOT_DELETE = 'lot_delete',
  MESSAGE_SEND = 'message_send',
  OPPORTUNITY_CREATE = 'opportunity_create',
  ADMIN_ACTION = 'admin_action'
}

@Entity('logs')
export class Log {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: EventType
  })
  eventType: EventType;

  @Column({ type: 'text', nullable: true })
  detail: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @Column({ length: 45, nullable: true })
  ipAddress: string;

  @Column({ length: 255, nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;
}
