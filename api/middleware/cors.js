const cors = require('cors');

const cors = require('cors');

// Configuração CORS mais simples e robusta
const corsOptions = {
  origin: true, // Permitir qualquer origem durante desenvolvimento
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

module.exports = cors(corsOptions);
