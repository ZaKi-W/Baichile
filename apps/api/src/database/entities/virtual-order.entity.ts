import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('virtual_orders')
export class VirtualOrderEntity {
  @PrimaryColumn('uuid') id!: string;
  @Index() @Column({ name: 'visitor_id', type: 'text', nullable: true }) visitorId!: string | null;
  @Index() @Column({ name: 'account_id', type: 'text', nullable: true }) accountId!: string | null;
  @Column('text') status!: string;
  @Column({ name: 'store_id', type: 'text' }) storeId!: string;
  @Column({ name: 'destination_id', type: 'text' }) destinationId!: string;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ name: 'duration_ms', type: 'integer' }) durationMs!: number;
  @Column('text') seed!: string;
  @Column({ name: 'items_total_cents', type: 'integer' }) itemsTotalCents!: number;
  @Column({ name: 'delivery_fee_cents', type: 'integer' }) deliveryFeeCents!: number;
  @Column({ name: 'packing_fee_cents', type: 'integer' }) packingFeeCents!: number;
  @Column({ name: 'total_cents', type: 'integer' }) totalCents!: number;
  @Column('jsonb') lines!: unknown[];
  @Column('jsonb') route!: unknown;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
