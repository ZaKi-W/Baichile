import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('addresses')
export class AddressEntity {
  @PrimaryColumn('text') id!: string;
  @Index() @Column({ name: 'visitor_id', type: 'text', nullable: true }) visitorId!: string | null;
  @Index() @Column({ name: 'account_id', type: 'text', nullable: true }) accountId!: string | null;
  @Column('text') name!: string;
  @Column('text') phone!: string;
  @Column('text') address!: string;
  @Column('text') detail!: string;
  @Column('text') tag!: string;
  @Column('double precision') lat!: number;
  @Column('double precision') lng!: number;
  @Column({ name: 'is_default', type: 'boolean', default: false }) isDefault!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
