import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface DatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

class PostgresDatabaseClient implements DatabaseClient {
  constructor(private pool: pg.Pool) {}

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    const res = await this.pool.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PGliteDatabaseClient implements DatabaseClient {
  constructor(private pglite: PGlite) {}

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    const res = await this.pglite.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.affectedRows ?? res.rows.length,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.pglite.exec(sql);
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}

let dbInstance: DatabaseClient | null = null;

export async function getDbClient(inMemory = false): Promise<DatabaseClient> {
  if (dbInstance && !inMemory) {
    return dbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && !inMemory) {
    // Connect to external Postgres (e.g. docker-compose, RDS, local postgres)
    const pool = new pg.Pool({ connectionString: databaseUrl });
    dbInstance = new PostgresDatabaseClient(pool);
  } else {
    // Connect to embedded Postgres WASM engine
    if (inMemory || process.env.NODE_ENV === 'test') {
      const pglite = new PGlite();
      const client = new PGliteDatabaseClient(pglite);
      if (!inMemory) dbInstance = client;
      return client;
    }

    const dataDir = process.env.PGLITE_DATA_DIR || path.resolve(process.cwd(), '.data/pglite');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const pglite = new PGlite(dataDir);
    dbInstance = new PGliteDatabaseClient(pglite);
  }

  return dbInstance;
}

