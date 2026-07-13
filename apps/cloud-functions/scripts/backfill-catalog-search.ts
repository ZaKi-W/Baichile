import { backfillStoreSearchText } from '../src/catalog-search';
import { createCloudBaseDatabase } from '../src/database';

async function main() {
  const updated = await backfillStoreSearchText(createCloudBaseDatabase());
  console.log(`CloudBase catalog search text backfilled for ${updated} stores.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
