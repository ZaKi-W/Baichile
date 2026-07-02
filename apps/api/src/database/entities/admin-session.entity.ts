import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('admin_sessions')
export class AdminSessionEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index() @Column({ name: 'admin_user_id', type: 'uuid' }) adminUserId!: string;
  @Column({ name: 'token_hash', type: 'text', unique: true }) tokenHash!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
