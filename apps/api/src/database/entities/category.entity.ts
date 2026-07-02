import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('categories')
export class CategoryEntity {
  @PrimaryColumn('text') id!: string;
  @Column('text') name!: string;
  @Column('text') icon!: string;
  @Column({ name: 'sort_order', type: 'integer', default: 0 }) sortOrder!: number;
}
