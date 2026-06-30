import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CartSheet', () => {
  it('shows current cart lines in a closable bottom sheet', () => {
    const source = readFileSync(new URL('./CartSheet.vue', import.meta.url), 'utf8');

    expect(source).toContain('<view v-if="visible" class="mask" @tap="$emit(\'close\')">');
    expect(source).toContain('class="sheet" @tap.stop');
    expect(source).toContain('v-for="line in lines"');
    expect(source).toContain('{{ line.item.name }}');
    expect(source).toContain("line.optionNames.join('、')");
    expect(source).toContain('× {{ line.quantity }}');
    expect(source).toContain('(line.totalCents / 100).toFixed(2)');
  });
});
