try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : undefined
});

pool.on('connect', (client) => client.query("SET TIME ZONE 'UTC'"));
pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));

module.exports = pool;