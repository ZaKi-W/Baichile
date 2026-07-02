import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseOptions } from '../src/database/database.config';

describe('createDatabaseOptions', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it('requires DATABASE_URL', () => {
    delete process.env.DATABASE_URL;

    expect(() => createDatabaseOptions()).toThrow('DATABASE_URL');
  });

  it('disables schema synchronization', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/baichile';

    expect(createDatabaseOptions()).toMatchObject({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      synchronize: false,
    });
  });
});
