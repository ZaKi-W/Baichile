import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalories1760000002000 implements MigrationInterface {
  name = 'AddCalories1760000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE menu_items
        ADD COLUMN calories_kcal integer NOT NULL DEFAULT 1 CHECK (calories_kcal > 0),
        ADD COLUMN calorie_source jsonb NOT NULL DEFAULT
          '{"type":"composition_estimate","description":"待目录种子数据校准","referenceUrl":"https://nutrition.zju.edu.cn/"}';
      ALTER TABLE virtual_orders
        ADD COLUMN items_total_calories_kcal integer NOT NULL DEFAULT 0
          CHECK (items_total_calories_kcal >= 0);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE virtual_orders DROP COLUMN IF EXISTS items_total_calories_kcal;
      ALTER TABLE menu_items
        DROP COLUMN IF EXISTS calorie_source,
        DROP COLUMN IF EXISTS calories_kcal;
    `);
  }
}
