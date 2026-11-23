"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbClient = getDbClient;
const pg_1 = __importDefault(require("pg"));
const pglite_1 = require("@electric-sql/pglite");
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
class PostgresDatabaseClient {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async query(sql, params) {
        const res = await this.pool.query(sql, params);
        return {
            rows: res.rows,
            rowCount: res.rowCount ?? 0,
        };
    }
    async exec(sql) {
        await this.pool.query(sql);
    }
    async close() {
        await this.pool.end();
    }
}
class PGliteDatabaseClient {
    pglite;
    constructor(pglite) {
        this.pglite = pglite;
    }
    async query(sql, params) {
        const res = await this.pglite.query(sql, params);
        return {
            rows: res.rows,
            rowCount: res.affectedRows ?? res.rows.length,
        };
    }
    async exec(sql) {
        await this.pglite.exec(sql);
    }
    async close() {
        await this.pglite.close();
    }
}
let dbInstance = null;
async function getDbClient(inMemory = false) {
    if (dbInstance && !inMemory) {
        return dbInstance;
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl && !inMemory) {
        // Connect to external Postgres (e.g. docker-compose, RDS, local postgres)
        const pool = new pg_1.default.Pool({ connectionString: databaseUrl });
        dbInstance = new PostgresDatabaseClient(pool);
    }
    else {
        // Connect to embedded Postgres WASM engine
        if (inMemory || process.env.NODE_ENV === 'test') {
            const pglite = new pglite_1.PGlite();
            const client = new PGliteDatabaseClient(pglite);
            if (!inMemory)
                dbInstance = client;
            return client;
        }
        const dataDir = process.env.PGLITE_DATA_DIR || path.resolve(process.cwd(), '.data/pglite');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const pglite = new pglite_1.PGlite(dataDir);
        dbInstance = new PGliteDatabaseClient(pglite);
    }
    return dbInstance;
}
//# sourceMappingURL=client.js.map