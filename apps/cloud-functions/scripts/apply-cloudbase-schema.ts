import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CloudBase = require('@cloudbase/manager-node');
import { sanitizeLogMessage } from '../src/redaction';
import {
  buildManagementCollectionState,
  createIndexRequest,
  indexDefinitionMismatch,
  normalizeManagementIndex,
  type ManagementCollectionState,
  type RawManagementIndex,
} from '../src/schema-management';
import { CLOUDBASE_SCHEMA_MANIFEST, validateSchemaManifest } from '../src/schema-manifest';

const APPLY = process.env.CLOUDBASE_SCHEMA_APPLY === 'true';

interface DescribeTableResult {
  Indexes?: RawManagementIndex[];
}

async function main() {
  const manifestFailures = validateSchemaManifest();
  if (manifestFailures.length) {
    throw new Error(`Invalid schema manifest: ${manifestFailures.join('; ')}`);
  }
  const envId = requiredEnv('CLOUDBASE_ENV_ID');
  const manager = CloudBase.init({
    envId,
    secretId: process.env.TENCENTCLOUD_SECRETID,
    secretKey: process.env.TENCENTCLOUD_SECRETKEY,
    token: process.env.TENCENTCLOUD_SESSIONTOKEN,
  });
  const aclService = manager.commonService('tcb', '2018-06-08');
  const actions: string[] = [];

  for (const spec of CLOUDBASE_SCHEMA_MANIFEST.collections) {
    const exists = await manager.database.checkCollectionExists(spec.name);
    if (!exists.Exists) {
      actions.push(`${spec.name}: create collection`);
      if (APPLY) await manager.database.createCollection(spec.name);
    }
    const rawIndexes = exists.Exists
      ? await describeIndexes(manager, spec.name)
      : [];
    const actualByName = new Map(
      rawIndexes
        .map(normalizeManagementIndex)
        .filter((index): index is NonNullable<typeof index> => Boolean(index))
        .map((index) => [index.name, index]),
    );
    for (const index of spec.indexes) {
      const actual = actualByName.get(index.name);
      if (actual) {
        const mismatch = indexDefinitionMismatch(index, actual);
        if (mismatch) {
          throw new Error(`${spec.name}/${index.name}: existing index ${mismatch} differs from manifest`);
        }
        continue;
      }
      actions.push(`${spec.name}: create index ${index.name}`);
      if (APPLY) {
        await updateCollectionWithRetry(manager, spec.name, {
          CreateIndexes: [createIndexRequest(index)],
        });
      }
    }
    const currentAccess = exists.Exists
      ? await describeAccess(aclService, envId, spec.name)
      : '';
    if (currentAccess !== CLOUDBASE_SCHEMA_MANIFEST.collectionAccess) {
      actions.push(`${spec.name}: set access ${CLOUDBASE_SCHEMA_MANIFEST.collectionAccess}`);
      if (APPLY) {
        await aclService.call({
          Action: 'ModifyDatabaseACL',
          Param: {
            EnvId: envId,
            CollectionName: spec.name,
            AclTag: CLOUDBASE_SCHEMA_MANIFEST.collectionAccess,
          },
        });
      }
    }
  }

  const state = APPLY
    ? await readManagementState(manager, aclService, envId)
    : null;
  const statePath = process.env.CLOUDBASE_SCHEMA_STATE_FILE
    ? resolve(process.env.CLOUDBASE_SCHEMA_STATE_FILE)
    : '';
  if (APPLY && statePath && state) {
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  }
  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    schemaVersion: CLOUDBASE_SCHEMA_MANIFEST.version,
    changed: actions.length,
    actions,
    ...(statePath ? { stateFile: APPLY ? statePath : 'not written during dry-run' } : {}),
  }, null, 2));
}

async function describeIndexes(
  manager: CloudBase,
  collectionName: string,
): Promise<RawManagementIndex[]> {
  const result = await manager.database.describeCollection(collectionName) as DescribeTableResult;
  return Array.isArray(result.Indexes) ? result.Indexes : [];
}

async function describeAccess(
  aclService: ReturnType<CloudBase['commonService']>,
  envId: string,
  collectionName: string,
): Promise<string> {
  const result = await aclService.call({
    Action: 'DescribeDatabaseACL',
    Param: { EnvId: envId, CollectionName: collectionName },
  }) as { AclTag?: unknown };
  return typeof result.AclTag === 'string' ? result.AclTag : '';
}

async function readManagementState(
  manager: CloudBase,
  aclService: ReturnType<CloudBase['commonService']>,
  envId: string,
) {
  const collections: ManagementCollectionState[] = [];
  for (const spec of CLOUDBASE_SCHEMA_MANIFEST.collections) {
    collections.push(buildManagementCollectionState(
      spec,
      await describeAccess(aclService, envId, spec.name),
      await describeIndexes(manager, spec.name),
    ));
  }
  return {
    schemaVersion: CLOUDBASE_SCHEMA_MANIFEST.version,
    generatedAt: new Date().toISOString(),
    envId,
    collections,
  };
}

async function updateCollectionWithRetry(
  manager: CloudBase,
  collectionName: string,
  request: { CreateIndexes: ReturnType<typeof createIndexRequest>[] },
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await manager.database.updateCollection(collectionName, request);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 9) await delay(500);
    }
  }
  throw lastError;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

main().catch((error) => {
  console.error(sanitizeLogMessage(error instanceof Error ? error.message : 'Schema apply failed'));
  process.exit(1);
});
