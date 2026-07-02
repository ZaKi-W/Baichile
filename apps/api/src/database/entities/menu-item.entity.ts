import type { ManagedContentStatus } from '@baichile/api-contract';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('menu_items')
export class MenuItemEntity {
  @PrimaryColumn('text') id!: string;
  @Index() @Column({ name: 'store_id', type: 'text' }) storeId!: string;
  @Column({ name: 'category_id', type: 'text' }) categoryId!: string;
  @Column({ name: 'sub_category_id', type: 'text', nullable: true }) subCategoryId!: string | null;
  @Column('text') name!: string;
  @Column({ type: 'text', nullable: true }) subtitle!: string | null;
  @Column({ name: 'image_url', type: 'text', nullable: true }) imageUrl!: string | null;
  @Column({ name: 'base_price_cents', type: 'integer' }) basePriceCents!: number;
  @Column({ name: 'calories_kcal', type: 'integer' }) caloriesKcal!: number;
  @Column({ name: 'calorie_source', type: 'jsonb' }) calorieSource!: unknown;
  @Column({ name: 'monthly_sales', type: 'integer' }) monthlySales!: number;
  @Column({ name: 'spec_groups', type: 'jsonb' }) specGroups!: unknown[];
  @Column({ name: 'source_type', type: 'text' }) sourceType!: string;
  @Column({ name: 'sort_order', type: 'integer', default: 0 }) sortOrder!: number;
  @Column({ type: 'text', default: 'active' }) status!: ManagedContentStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
