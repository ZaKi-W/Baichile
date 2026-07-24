import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

export default defineConfig({
  plugins: [uni()],
  build: {
    // CloudBase Web SDK 3.x ships an ESM dependency that uses top-level await.
    target: 'esnext',
  },
});
