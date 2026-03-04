import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Lot } from './lot.entity';

@Entity('fruits')
export class Fruit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  nameEs: string;

  @Column({ length: 100 })
  nameEn: string;

  @Column({ length: 100 })
  nameFr: string;

  @Column({ length: 100 })
  nameDe: string;

  @Column({ length: 100 })
  namePt: string;

  @Column({ length: 100 })
  nameAr: string;

  @Column({ length: 100 })
  nameZh: string;

  @Column({ length: 100 })
  nameHi: string;

  @Column({ nullable: true, length: 50 })
  scientificName: string;

  @Column({ nullable: true, length: 255 })
  imageUrl: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Lot, lot => lot.fruit)
  lots: Lot[];
}
