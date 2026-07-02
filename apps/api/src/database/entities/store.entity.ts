import type { ManagedContentStatus } from '@baichile/api-contract';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('stores')
export class StoreEntity {
  @PrimaryColumn('text') id!: string;
  @Index() @Column({ name: 'category_id', type: 'text' }) categoryId!: string;
  @Column('text') name!: string;
  @Column('text') description!: string;
  @Column({ name: 'cover_url', type: 'text', nullable: true }) coverUrl!: string | null;
  @Column('text', { array: true, default: '{}' }) tags!: string[];
  @Column({ name: 'delivery_fee_cents', type: 'integer' }) deliveryFeeCents!: number;
  @Column({ name: 'packing_fee_cents', type: 'integer' }) packingFeeCents!: number;
  @Column({ name: 'minimum_order_cents', type: 'integer' }) minimumOrderCents!: number;
  @Column({ name: 'virtual_delivery_minutes', type: 'integer' }) virtualDeliveryMinutes!: number;
  @Column({ name: 'monthly_sales', type: 'integer' }) monthlySales!: number;
  @Column({ name: 'distance_km', type: 'double precision' }) distanceKm!: number;
  @Column({ type: 'double precision' }) rating!: number;
  @Column({ name: 'recent_viewers', type: 'integer' }) recentViewers!: number;
  @Column({ name: 'system_heat', type: 'integer' }) systemHeat!: number;
  @Column({ name: 'source_type', type: 'text' }) sourceType!: string;
  @Column({ name: 'sort_order', type: 'integer', default: 0 }) sortOrder!: number;
  @Column({ type: 'text', default: 'active' }) status!: ManagedContentStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
