import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('admin_audit_logs')
export class AdminAuditLogEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index() @Column({ name: 'admin_user_id', type: 'uuid' }) adminUserId!: string;
  @Index() @Column({ type: 'text' }) action!: string;
  @Index() @Column({ name: 'resource_type', type: 'text' }) resourceType!: string;
  @Column({ name: 'resource_id', type: 'text', nullable: true }) resourceId!: string | null;
  @Column({ name: 'before_data', type: 'jsonb', nullable: true }) beforeData!: unknown;
  @Column({ name: 'after_data', type: 'jsonb', nullable: true }) afterData!: unknown;
  @Column({ name: 'ip_address', type: 'text', nullable: true }) ipAddress!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
