import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('store_sub_categories')
@Unique(['storeId', 'subCategoryId'])
export class StoreSubCategoryEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'store_id', type: 'text' }) storeId!: string;
  @Column({ name: 'sub_category_id', type: 'text' }) subCategoryId!: string;
  @Column('text') name!: string;
  @Column({ name: 'sort_order', type: 'integer', default: 0 }) sortOrder!: number;
}
