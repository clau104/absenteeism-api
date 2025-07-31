require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { attachDatabase } = require('./middleware/database');

const app = express();
const port = process.env.PORT || 3001;

// Middleware básico
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(attachDatabase);

// Logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode >= 400 ? '❌' : '✅';
    console.log(`${status} ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Importar rotas
const executiveRoutes = require('./routes/executive');
const lovableRoutes = require('./routes/lovable');

// Usar rotas
app.use('/api/executive', executiveRoutes);
app.use('/api/lovable', lovableRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const startTime = Date.now();
    const result = await req.pool.query('SELECT NOW() as timestamp, version() as pg_version');
    const dbResponseTime = Date.now() - startTime;
    
    res.json({
      status: 'healthy',
      database: {
        status: 'connected',
        responseTime: `${dbResponseTime}ms`,
        timestamp: result.rows[0].timestamp,
        version: result.rows[0].pg_version.split(' ')[0]
      },
      api: {
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
      },
      endpoints: {
        executive: '/api/executive/dashboard',
        lovable: '/api/lovable/dashboard-data',
        config: '/api/lovable/config'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: '🚀 HR Analytics API v2.0 - APIs Executivas Ativas',
    version: '2.0.0',
    endpoints: {
      health: '/api/health',
      executive: '/api/executive/dashboard',
      lovable: '/api/lovable/dashboard-data'
    }
  });
});

app.listen(port, () => {
  console.log('\n🚀 ===== HR ANALYTICS API v2.0 =====');
  console.log(`📡 Servidor: http://localhost:${port}`);
  console.log(`🎯 Executive Dashboard: http://localhost:${port}/api/executive/dashboard`);
  console.log(`📱 Lovable Data: http://localhost:${port}/api/lovable/dashboard-data`);
  console.log(`⚙️ Lovable Config: http://localhost:${port}/api/lovable/config`);
  console.log('');
});

module.exports = app;
