import type { AdminRole, AdminUserStatus } from '@baichile/api-contract';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('admin_users')
export class AdminUserEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'text', unique: true }) username!: string;
  @Column({ name: 'display_name', type: 'text' }) displayName!: string;
  @Column({ name: 'password_hash', type: 'text' }) passwordHash!: string;
  @Column({ type: 'text' }) role!: AdminRole;
  @Column({ type: 'text', default: 'active' }) status!: AdminUserStatus;
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true }) lastLoginAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
