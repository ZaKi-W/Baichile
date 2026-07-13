import { BaichileRouter } from './router';

const router = new BaichileRouter();

export async function main(event: unknown, context?: unknown) {
  return router.handle(event as any, context);
}

export function createRouter(surface: 'public' | 'admin' | 'all') {
  return new BaichileRouter(undefined, surface);
}

export { BaichileRouter } from './router';
export { MemoryDatabase, createCloudBaseDatabase } from './database';
export { collectionNames, collectionSpecs } from './collections';
