import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('ai_scan_results')
export class AiScanResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'text', nullable: true })
  imagePath: string | null;

  @Column({ length: 100, nullable: true })
  categoria: string | null;

  @Column({ length: 120, nullable: true })
  producto: string | null;

  @Column({ length: 120, nullable: true })
  envase: string | null;

  @Column({ type: 'int', default: 0 })
  cajasAprox: number;

  @Column({ type: 'int', default: 0 })
  piezasPorCaja: number;

  @Column({ type: 'int', default: 0 })
  cantidadAprox: number;

  @Column({ type: 'float', default: 0 })
  taraKg: number;

  @Column({ type: 'float', default: 0 })
  pesoBrutoKg: number;

  @Column({ type: 'float', default: 0 })
  pesoNetoKg: number;

  @Column({ type: 'simple-json', nullable: true })
  resultadoAi: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
