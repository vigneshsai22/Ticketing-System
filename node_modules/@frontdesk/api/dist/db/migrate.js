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
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const client_js_1 = require("./client.js");
async function runMigrations() {
    const db = await (0, client_js_1.getDbClient)();
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
        const db = await (0, client_js_1.getDbClient)();
        await db.close();
        process.exit(0);
    })
        .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate.js.map