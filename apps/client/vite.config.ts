import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

const clientRoot = dirname(fileURLToPath(import.meta.url));

function copyCatalogImages() {
  const source = resolve(clientRoot, 'static/choutuan-img');
  if (!existsSync(source)) return;
  for (const mode of ['dev', 'build']) {
    const target = resolve(clientRoot, `dist/${mode}/mp-weixin/static/choutuan-img`);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
  }
}

export default defineConfig({
  plugins: [
    uni(),
    {
      name: 'copy-catalog-images',
      closeBundle() {
        if (process.env.UNI_PLATFORM === 'mp-weixin') copyCatalogImages();
      },
    },
  ],
});
