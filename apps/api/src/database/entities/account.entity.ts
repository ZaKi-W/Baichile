import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('accounts')
export class AccountEntity {
  @PrimaryColumn('text') id!: string;
  @Column({ name: 'wechat_openid_hash', type: 'text', nullable: true, unique: true }) wechatOpenIdHash!: string | null;
  @Column({ type: 'text', nullable: true }) nickname!: string | null;
  @Column({ name: 'avatar_url', type: 'text', nullable: true }) avatarUrl!: string | null;
  @Column({ name: 'balance_cents', type: 'integer', default: 0 }) balanceCents!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
