import type { Address } from '@baichile/api-contract';

// This is a checkout-only fallback for the virtual-delivery experience. It is
// deliberately not persisted, so a user's first saved address replaces it.
export const DEFAULT_DELIVERY_ADDRESS: Address = {
  id: 'addr_default_ganfan_station',
  name: '干饭研究员',
  phone: '138 0013 8000',
  address: '上海市黄浦区干饭研究院',
  detail: '饿了就吃路 1024 号，橘猫值班台',
  tag: '默认收货点',
  lat: 31.2304,
  lng: 121.4737,
  isDefault: true,
};

export function isDefaultDeliveryAddress(address: Pick<Address, 'id'> | null | undefined): boolean {
  return address?.id === DEFAULT_DELIVERY_ADDRESS.id;
}
