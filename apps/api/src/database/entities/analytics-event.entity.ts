import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('analytics_events')
export class AnalyticsEventEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id!: string;
  @Index() @Column({ name: 'visitor_id', type: 'text', nullable: true }) visitorId!: string | null;
  @Index() @Column({ name: 'account_id', type: 'text', nullable: true }) accountId!: string | null;
  @Index() @Column({ name: 'event_name', type: 'text' }) eventName!: string;
  @Column({ type: 'jsonb', default: {} }) payload!: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
