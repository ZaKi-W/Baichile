import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CartSheet', () => {
  it('shows current cart lines in a closable bottom sheet', () => {
    const source = readFileSync(new URL('./CartSheet.vue', import.meta.url), 'utf8');

    expect(source).toContain('<view v-if="visible" class="mask" @tap="$emit(\'close\')">');
    expect(source).toContain('class="sheet" @tap.stop');
    expect(source).toContain('v-for="line in lines"');
    expect(source).toContain('{{ line.item.name }}');
    expect(source).toContain(':src="line.item.imageUrl"');
    expect(source).toContain('imageVisible(line)');
    expect(source).toContain('v-for="optionName in line.optionNames"');
    expect(source).toContain('unitPriceCents(line)');
    expect(source).toContain('formatMoney(line.totalCents)');
    expect(source).toContain('小计');
    expect(source).toContain('{{ line.quantity }}');
    expect(source).toContain('increase: [key: string]');
    expect(source).toContain('decrease: [key: string]');
    expect(source).toContain('clear: []');
    expect(source).toContain('checkout: []');
    expect(source).toContain("@tap=\"$emit('remove', line.key)\"");
    expect(source).toContain('清空');
    expect(source).toContain('checkoutText');
  });
});
