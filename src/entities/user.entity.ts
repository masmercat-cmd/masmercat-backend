import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Lot } from './lot.entity';
import { Message } from './message.entity';
import { Alert } from './alert.entity';

export enum UserRole {
  ADMIN = 'admin',
  SELLER = 'seller',
  BUYER = 'buyer'
}

export enum Language {
  ES = 'es',
  EN = 'en',
  FR = 'fr',
  DE = 'de',
  PT = 'pt',
  AR = 'ar',
  ZH = 'zh',
  HI = 'hi'
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ unique: true, length: 150 })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.BUYER
  })
  role: UserRole;

  @Column({ length: 100 })
  country: string;

  @Column({
    type: 'enum',
    enum: Language,
    default: Language.ES
  })
  language: Language;

  @Column({ nullable: true, length: 20 })
  phone: string;

  @Column({ nullable: true, length: 255 })
  company: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Lot, lot => lot.seller)
  lots: Lot[];

  @OneToMany(() => Message, message => message.buyer)
  sentMessages: Message[];

  @OneToMany(() => Message, message => message.seller)
  receivedMessages: Message[];

  @OneToMany(() => Alert, alert => alert.user)
  alerts: Alert[];
}
