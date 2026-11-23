import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDbClient } from './client.js';

export async function runMigrations() {
  const db = await getDbClient();
  const candidatePaths = [
    path.resolve(__dirname, 'schema.sql'),
    path.resolve(__dirname, '../../src/db/schema.sql'),
    path.resolve(__dirname, '../src/db/schema.sql'),
    path.resolve(process.cwd(), 'apps/api/src/db/schema.sql'),
    path.resolve(process.cwd(), 'src/db/schema.sql')
  ];
  const schemaPath = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0];
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  console.log(`Applying database schema and triggers from ${schemaPath}...`);
  await db.exec(sql);
  console.log('Database schema and triggers successfully applied.');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(async () => {
      const db = await getDbClient();
      await db.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
