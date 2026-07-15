import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

describe('persona share landing', () => {
  it('renders and saves the shared gacha canvas poster', () => {
    expect(source).toContain('<canvas canvas-id="personaPoster"');
    expect(source).toContain('saveGachaPoster');
    expect(source).toContain("kind: 'persona'");
  });

  it('renders a persona capsule with identity, stats, and a mini program code', () => {
    expect(source).toContain('class="persona-machine gacha-capsule"');
    expect(source).toContain('class="gacha-machine-window persona-window"');
    expect(source).toContain('class="persona-stats"');
    expect(source).toContain('data.miniProgramCodeUrl');
    expect(source).not.toContain('食堂编辑部');
  });

  it('routes old non-persona links to their dedicated pages while preserving reward context', () => {
    expect(source).toContain('legacyShareTarget');
    expect(source).toContain("uni.redirectTo({ url: `${target}?${query}` })");
    expect(source).toContain("rewardCents.value = Number(options?.reward || 0) || 0");
  });

  it('resolves the persona illustration from CloudBase without blocking the first data request', () => {
    expect(source).toContain('await resolvePersonaImage(landing.persona.id)');
    expect(source).toContain('cloud.getTempFileURL({ fileList: [fileID] })');
    expect(source).not.toContain('onReady(');
  });
});
