import type { ShareRewardConfig } from '@baichile/api-contract';
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('share_reward_configs')
export class ShareConfigEntity {
  @PrimaryColumn('text') id!: 'default';
  @Column({ type: 'jsonb' }) config!: ShareRewardConfig;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
