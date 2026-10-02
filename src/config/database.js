try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const { Pool, types } = require('pg');

// TIMESTAMP (no zone) columns hold UTC (the session is pinned to UTC below), but
// node-pg parses them in the Node process's own timezone. Read them as UTC so the
// app behaves the same on a laptop in any timezone as on the UTC production host.
const TIMESTAMP_OID = 1114;
types.setTypeParser(TIMESTAMP_OID, (value) => new Date(`${value.replace(' ', 'T')}Z`));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  options: '-c timezone=UTC',
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : undefined
});

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));

module.exports = pool;