const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  min: 2,
  acquireTimeoutMillis: 30000,
  createTimeoutMillis: 30000,
  destroyTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

const attachDatabase = (req, res, next) => {
  req.pool = pool;
  next();
};

pool.on('connect', () => {
  console.log('📦 Nova conexão PostgreSQL estabelecida');
});

pool.on('error', (err) => {
  console.error('❌ Erro no pool PostgreSQL:', err);
});

module.exports = { pool, attachDatabase };
