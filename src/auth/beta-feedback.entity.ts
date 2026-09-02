import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum BetaFeedbackCategory {
  WORKS_WELL = 'works_well',
  SOMETHING_BROKEN = 'something_broken',
  SUGGESTION = 'suggestion',
}

@Entity('beta_feedback')
export class BetaFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: BetaFeedbackCategory })
  category: BetaFeedbackCategory;

  @Column({ type: 'text', default: '' })
  comment: string;

  @Column({ length: 30, default: 'unknown' })
  platform: string;

  @Column({ length: 30, default: 'beta' })
  appVersion: string;

  @CreateDateColumn()
  createdAt: Date;
}
