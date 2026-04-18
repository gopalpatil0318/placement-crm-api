/**
 * ============================================================================
 * MIGRATION RUNNER — Execute SQL migration files against the database
 * ============================================================================
 * Usage:
 *   node migrations/run.js 010_phase4_fixes.sql
 *   node migrations/run.js               (runs ALL pending migrations)
 *
 * Tracks applied migrations in a `schema_migrations` table to avoid re-runs.
 * ============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { Pool } = require('pg');

const MIGRATIONS_DIR = __dirname;

// ============================================================================
// DB CONNECTION — Uses same env vars as app, but standalone pool
// ============================================================================

function createPool() {
    return new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
        max: 2,
        connectionTimeoutMillis: 10000,
    });
}

// ============================================================================
// MIGRATION TRACKING TABLE
// ============================================================================

async function ensureMigrationsTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        )
    `);
}

async function isApplied(pool, filename) {
    const result = await pool.query(
        `SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1`,
        [filename]
    );
    return result.rowCount > 0;
}

async function markApplied(pool, filename) {
    await pool.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
        [filename]
    );
}

// ============================================================================
// EXECUTE A SINGLE MIGRATION
// ============================================================================

async function runMigration(pool, filename) {
    const filePath = path.join(MIGRATIONS_DIR, filename);

    if (!fs.existsSync(filePath)) {
        console.error(`  ✗ File not found: ${filename}`);
        process.exit(1);
    }

    const already = await isApplied(pool, filename);
    if (already) {
        console.log(`  ⏭ ${filename} — already applied, skipping`);
        return false;
    }

    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`  ▶ Running ${filename}...`);
    const start = Date.now();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
            `INSERT INTO schema_migrations (filename) VALUES ($1)`,
            [filename]
        );
        await client.query('COMMIT');

        const duration = Date.now() - start;
        console.log(`  ✓ ${filename} — applied in ${duration}ms`);
        return true;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${filename} — FAILED`);
        console.error(`    ${err.message}`);
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// GET ALL MIGRATION FILES (sorted)
// ============================================================================

function getMigrationFiles() {
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql') && /^\d{3}_/.test(f))
        .sort();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    const pool = createPool();

    try {
        // Test connection
        const { rows } = await pool.query('SELECT version()');
        console.log(`\n🔗 Connected: ${rows[0].version.split(',')[0]}`);

        await ensureMigrationsTable(pool);

        const target = process.argv[2];
        let files;

        if (target) {
            // Run a specific migration
            files = [target];
        } else {
            // Run all pending migrations
            files = getMigrationFiles();
        }

        console.log(`\n📋 Migrations to check: ${files.length}\n`);

        let applied = 0;
        let skipped = 0;

        for (const file of files) {
            const wasApplied = await runMigration(pool, file);
            if (wasApplied) applied++;
            else skipped++;
        }

        console.log(`\n✅ Done: ${applied} applied, ${skipped} skipped\n`);
    } catch (err) {
        console.error(`\n❌ Migration failed: ${err.message}\n`);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
