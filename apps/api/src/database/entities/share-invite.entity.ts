import type { ShareKind } from '@baichile/api-contract';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('share_invites')
export class ShareInviteEntity {
  @PrimaryColumn('uuid') token!: string;
  @Index() @Column({ name: 'inviter_account_id', type: 'text' }) inviterAccountId!: string;
  @Column('text') kind!: ShareKind;
  @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId!: string | null;
  @Column({ type: 'text' }) title!: string;
  @Column({ type: 'jsonb' }) snapshot!: {
    dishNames: string[];
    savedMoneyCents: number;
    savedCaloriesKcal: number;
    completedOrderCount: number;
  };
  @Column({ name: 'initiated_reward_granted', type: 'boolean', default: false })
  initiatedRewardGranted!: boolean;
  @Index({ unique: true, where: '"invitee_account_id" IS NOT NULL' })
  @Column({ name: 'invitee_account_id', type: 'text', nullable: true })
  inviteeAccountId!: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
