import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./index.vue', import.meta.url),
  'utf8',
);

describe('share landing poster', () => {
  it('renders and saves a dynamic canvas poster', () => {
    expect(source).toContain('<canvas');
    expect(source).toContain('canvasToTempFilePath');
    expect(source).toContain('saveImageToPhotosAlbum');
  });

  it('shows the poster story and mini program code', () => {
    expect(source).toContain('class="eyebrow"');
    expect(source).toContain('data.miniProgramCodeUrl');
    expect(source).toContain('class="persona-poster"');
    expect(source).toContain('class="persona-portrait"');
    expect(source).toContain('drawPersonaPoster');
  });

  it('shows the matching easter egg image for shared orders', () => {
    expect(source).toContain("import { orderEggImageUrl, orderEggPosterImageUrl } from '../../utils/order-easter-egg'");
    expect(source).toContain('const easterEggImageUrl = computed');
    expect(source).toContain('class="card-artwork"');
    expect(source).toContain(':src="easterEggImageUrl"');
    expect(source).toContain('const imageUrl = egg');
    expect(source).toContain('? easterEggPosterImageUrl.value');
    expect(source).toContain('我发现了${poster.value?.eyebrow || \'彩蛋\'}');
  });

  it('uses one collectible card template on screen and in the saved poster', () => {
    expect(source).toContain('class="egg-card"');
    expect(source).toContain('class="attribute-panel"');
    expect(source).toContain('class="story-archive"');
    expect(source).toContain('egg-card--legendary');
    expect(source).toContain('egg-card--epic');
    expect(source).toContain('drawEggPoster');
    expect(source).toContain('const easterEggPosterImageUrl = computed');
    expect(source).toContain('const eggImage = data.value.easterEgg ? easterEggPosterImageUrl.value');
    expect(source).not.toContain('class="egg-lines"');
    expect(source).not.toContain('<view class="card-header"');
    expect(source).not.toContain('<view class="card-footer"');
    expect(source).not.toContain('搞笑指数');
    expect(source).not.toContain('收藏价值');
    expect(source).not.toContain('card.subtitle');
    expect(source).not.toContain('card.result');
    expect(source).not.toContain('《{{ poster.title }}》');
  });

  it('shows the claim action only to invited visitors', () => {
    expect(source).toContain('v-if="sharing && data.active"');
    expect(source).toContain('v-else class="claim"');
  });

  it('shares persona identity instead of the legacy invitation coupon', () => {
    expect(source).toContain('我的这顿白吃人格是');
    expect(source).toContain('persona?.imageUrl');
    expect(source).toContain("persona?.imageUrl || '/static/share/order-cover.jpg'");
    expect(source).not.toContain("data.value?.kind === 'persona' ? '/static/share/invitation-cover-v2.jpg'");
  });

  it('resolves persona images from CloudBase and downloads them before drawing the saved poster', () => {
    expect(source).toContain("cloud://cloud1-d8g7o18ula3c12f10/baichile-home/personas");
    expect(source).toContain('await resolvePersonaImage(landing.persona.id)');
    expect(source).toContain('cloud.getTempFileURL({ fileList: [fileID] })');
    expect(source).toContain('await downloadCloudFile(`${PERSONA_CLOUD_PREFIX}/${data.value.persona.id}.png`)');
    expect(source).toContain('cloud.downloadFile({ fileID })');
    expect(source).not.toContain('await imagePath(data.value.persona.imageUrl)');
  });

  it('does not block landing data on poster generation', () => {
    expect(source).not.toContain('onReady(');
    expect(source).not.toContain('onReady(');
  });
});
