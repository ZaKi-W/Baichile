import type { VirtualOrder } from '@baichile/api-contract';
import { catalogService } from '../services/catalog';
import { useCartStore } from '../stores/cart';

export async function reorder(order: VirtualOrder): Promise<void> {
  const store = await catalogService.store(order.storeId);
  const cart = useCartStore();
  let restored = 0;
  for (const line of order.lines) {
    const item = store.menu.find((candidate) => candidate.id === line.menuItemId);
    if (!item) continue;
    const optionIds = item.specGroups.flatMap((group) => group.options)
      .filter((option) => line.optionNames.includes(option.name))
      .map((option) => option.id);
    await cart.add(store, item, optionIds, line.quantity);
    restored += line.quantity;
  }
  if (!restored) throw new Error('原订单菜品已下架，暂时无法再来一单');
  uni.navigateTo({ url: `/pages/store/index?id=${encodeURIComponent(order.storeId)}&reordered=1` });
}
