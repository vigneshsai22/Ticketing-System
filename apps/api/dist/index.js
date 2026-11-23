"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = start;
const app_js_1 = require("./app.js");
const migrate_js_1 = require("./db/migrate.js");
const seed_js_1 = require("./db/seed.js");
const client_js_1 = require("./db/client.js");
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
async function start() {
    console.log('Initializing Frontdesk API...');
    const db = await (0, client_js_1.getDbClient)();
    // Run migrations and seeds if not disabled
    if (process.env.AUTO_MIGRATE !== 'false') {
        await (0, migrate_js_1.runMigrations)();
    }
    if (process.env.AUTO_SEED !== 'false') {
        await (0, seed_js_1.runFullSeed)(db);
    }
    const app = await (0, app_js_1.buildApp)({
        enableSchedulerTimer: true,
        logger: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
            ? { level: 'info' }
            : false
    });
    // Keep-alive ping loop for free-tier hosting (e.g. Render, Koyeb, Railway)
    if (process.env.KEEP_ALIVE_URL) {
        const pingUrl = process.env.KEEP_ALIVE_URL;
        const intervalMinutes = Number(process.env.KEEP_ALIVE_INTERVAL_MINUTES) || 10;
        console.log(`Setting up free-tier keep-alive ping to ${pingUrl} every ${intervalMinutes} minutes`);
        setInterval(async () => {
            try {
                const res = await fetch(pingUrl);
                console.log(`[Keep-Alive] Pinged ${pingUrl} - status: ${res.status}`);
            }
            catch (err) {
                console.warn(`[Keep-Alive] Failed to ping ${pingUrl}:`, err);
            }
        }, intervalMinutes * 60 * 1000).unref();
    }
    try {
        await app.listen({ port: PORT, host: HOST });
        console.log(`Frontdesk API server running at http://${HOST}:${PORT}`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
// Auto-start when executed directly
if (process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js') || process.argv[1].includes('index'))) {
    start().catch((err) => {
        console.error('Fatal startup error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map