import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('visitor_sessions')
export class VisitorSessionEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'visitor_id', type: 'text', unique: true }) visitorId!: string;
  @Index()
  @Column({ name: 'account_id', type: 'text', nullable: true }) accountId!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
