import type { AccountStatus } from '@baichile/api-contract';
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('accounts')
export class AccountEntity {
  @PrimaryColumn('text') id!: string;
  @Column({ name: 'wechat_openid_hash', type: 'text', nullable: true, unique: true }) wechatOpenIdHash!: string | null;
  @Column({ type: 'text', nullable: true }) nickname!: string | null;
  @Column({ name: 'avatar_url', type: 'text', nullable: true }) avatarUrl!: string | null;
  @Column({ name: 'balance_cents', type: 'integer', default: 0 }) balanceCents!: number;
  @Column({ type: 'text', default: 'active' }) status!: AccountStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
