import 'dotenv/config';
import dataSource from './typeorm.data-source';
import { seedCatalog } from './catalog.seed-runner';

async function main() {
  await dataSource.initialize();
  try {
    const counts = await seedCatalog(dataSource);
    console.log(`Catalog seeded: ${counts.categories} categories, ${counts.stores} stores, ${counts.menuItems} menu items`);
  } finally {
    await dataSource.destroy();
  }
}

void main();
