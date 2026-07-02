export interface SpecOption {
  id: string;
  name: string;
  priceDeltaCents: number;
  calorieDeltaKcal: number;
  isDefault?: boolean;
}

export interface SpecGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: SpecOption[];
}

export function calculateLineTotal(
  basePriceCents: number,
  optionPriceDeltas: number[],
  quantity: number,
): number {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('商品数量必须是正整数');
  return (basePriceCents + optionPriceDeltas.reduce((sum, price) => sum + price, 0)) * quantity;
}

export function calculateOrderTotal(
  lineTotals: number[],
  deliveryFeeCents: number,
  packingFeeCents: number,
): number {
  return lineTotals.reduce((sum, total) => sum + total, 0) + deliveryFeeCents + packingFeeCents;
}

export function calculateLineCalories(
  baseCaloriesKcal: number,
  optionCalorieDeltas: number[],
  quantity: number,
): number {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('商品数量必须是正整数');
  const unitCalories = baseCaloriesKcal
    + optionCalorieDeltas.reduce((sum, calories) => sum + calories, 0);
  if (unitCalories < 0) throw new Error('卡路里不能小于 0');
  return unitCalories * quantity;
}

export function validateSelections(
  groups: SpecGroup[],
  optionIds: string[],
): { valid: true } | { valid: false; message: string } {
  const selected = new Set(optionIds);
  for (const group of groups) {
    const count = group.options.filter((option) => selected.has(option.id)).length;
    if (count < group.minSelect || (group.required && count === 0)) {
      return { valid: false, message: `请选择${group.name}` };
    }
    if (count > group.maxSelect) return { valid: false, message: `${group.name}最多选择${group.maxSelect}项` };
  }
  return { valid: true };
}
