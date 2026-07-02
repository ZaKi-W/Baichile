import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import type { WalletTransactionType } from '@baichile/api-contract';

@Entity('wallet_transactions')
@Index('wallet_transactions_daily_checkin_unique', ['accountId', 'businessDate'], {
  unique: true,
  where: `"type" = 'daily_checkin'`,
})
@Index('wallet_transactions_order_refund_unique', ['orderId'], {
  unique: true,
  where: `"type" = 'order_refund'`,
})
export class WalletTransactionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Index() @Column({ name: 'account_id', type: 'text' }) accountId!: string;
  @Column('text') type!: WalletTransactionType;
  @Column({ name: 'amount_cents', type: 'integer' }) amountCents!: number;
  @Column({ name: 'balance_after_cents', type: 'integer' }) balanceAfterCents!: number;
  @Column({ name: 'order_id', type: 'uuid', nullable: true }) orderId!: string | null;
  @Column('text') description!: string;
  @Column({ name: 'business_date', type: 'date', nullable: true }) businessDate!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
