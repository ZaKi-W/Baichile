import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rewriteCatalogRecordImages } from '../src/catalog-images';
import { collectionNames } from '../src/collections';
import { createCloudBaseDatabase } from '../src/database';

async function main() {
  const input = resolve(process.env.CLOUDBASE_EXPORT_FILE || 'tmp/cloudbase-export.json');
  const payload = JSON.parse(readFileSync(input, 'utf8')) as Record<string, Array<Record<string, any>>>;
  const db = createCloudBaseDatabase();
  const batchSize = Number(process.env.CLOUDBASE_IMPORT_BATCH_SIZE || 100);
  for (const name of collectionNames) {
    const rows = (payload[name] ?? []).map((row) => rewriteCatalogRecordImages(name, row));
    const collection = db.collection(name);
    for (let index = 0; index < rows.length; index += batchSize) {
      const batch = rows.slice(index, index + batchSize);
      await Promise.all(batch.map((row) => collection.upsert(String(row._id ?? row.id), row)));
    }
    console.log(`${name}: imported ${rows.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
