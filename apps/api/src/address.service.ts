import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { Address } from '@baichile/api-contract';
import { EntityManager, Repository } from 'typeorm';
import { AddressEntity } from './database/entities/address.entity';

type Identity = { visitorId?: string; accountId?: string };

@Injectable()
export class AddressService {
  constructor(@InjectRepository(AddressEntity) private readonly addresses: Repository<AddressEntity>) {}

  async list(identity: Identity): Promise<Address[]> {
    if (!identity.accountId && !identity.visitorId) return [];
    const rows = await this.addresses.find({
      where: identity.accountId ? { accountId: identity.accountId } : { visitorId: identity.visitorId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.toAddress(row));
  }

  async save(input: Omit<Address, 'id'> & { id?: string }, identity: Identity): Promise<Address> {
    this.requireIdentity(identity);
    return this.addresses.manager.transaction(async (manager) => {
      const repo = manager.getRepository(AddressEntity);
      const id = input.id || `addr_${randomUUID()}`;
      const existing = await repo.findOneBy({ id });
      if (existing && !this.belongsTo(existing, identity)) throw new BadRequestException('无权修改该地址');
      const where = identity.accountId ? { accountId: identity.accountId } : { visitorId: identity.visitorId };
      const siblings = await repo.find({ where });
      const isDefault = input.isDefault || siblings.length === 0;
      if (isDefault) await repo.update(where, { isDefault: false });
      const saved = await repo.save(repo.create({
        ...existing,
        ...input,
        id,
        visitorId: identity.visitorId ?? null,
        accountId: identity.accountId ?? null,
        isDefault,
      }));
      return this.toAddress(saved);
    });
  }

  async remove(id: string, identity: Identity) {
    const row = await this.addresses.findOneBy({ id });
    if (!row || !this.belongsTo(row, identity)) throw new BadRequestException('地址不存在');
    await this.addresses.manager.transaction(async (manager) => {
      const repo = manager.getRepository(AddressEntity);
      await repo.remove(row);
      if (row.isDefault) {
        const where = identity.accountId ? { accountId: identity.accountId } : { visitorId: identity.visitorId };
        const next = await repo.findOne({ where, order: { createdAt: 'ASC' } });
        if (next) await repo.update(next.id, { isDefault: true });
      }
    });
    return { removed: true };
  }

  async merge(visitorId: string, accountId: string, manager?: EntityManager) {
    const repo = (manager ?? this.addresses.manager).getRepository(AddressEntity);
    const result = await repo.update({ visitorId }, { visitorId: null, accountId });
    return { merged: result.affected ?? 0 };
  }

  private belongsTo(row: AddressEntity, identity: Identity) {
    return Boolean((identity.accountId && row.accountId === identity.accountId)
      || (identity.visitorId && row.visitorId === identity.visitorId));
  }

  private requireIdentity(identity: Identity) {
    if (!identity.accountId && !identity.visitorId) throw new BadRequestException('请先建立用户身份');
  }

  private toAddress(row: AddressEntity): Address {
    return {
      id: row.id, name: row.name, phone: row.phone, address: row.address, detail: row.detail,
      tag: row.tag, lat: row.lat, lng: row.lng, isDefault: row.isDefault,
    };
  }
}
