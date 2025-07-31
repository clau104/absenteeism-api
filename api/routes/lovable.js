const express = require('express');
const router = express.Router();

// =============================================
// MIDDLEWARE CORS - PERMITIR ACESSO DO LOVABLE
// =============================================
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

// CONFIG - Configurações do dashboard
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      apiEndpoints: {
        dashboard: '/api/lovable/dashboard-data',
        resumo: '/api/lovable/resumo',
        absenteismo: '/api/lovable/absenteismo-genero',
        turnover: '/api/lovable/turnover',
        executive: '/api/executive/dashboard'
      },
      ui: {
        refreshInterval: 300000,
        chartColors: {
          primary: '#3B82F6',
          danger: '#EF4444', 
          warning: '#F59E0B',
          success: '#10B981',
          maleColor: '#3B82F6',
          femaleColor: '#EC4899'
        }
      },
      filtros: {
        periodo: [
          { key: '30_dias', label: 'Últimos 30 dias', days: 30 },
          { key: '3_meses', label: 'Últimos 3 meses', days: 90 },
          { key: '6_meses', label: 'Últimos 6 meses', days: 180 },
          { key: '1_ano', label: 'Último ano', days: 365 },
          { key: 'tudo', label: 'Todo histórico', days: null }
        ],
        faixaIdade: [
          { key: '18-24', label: '18-24 anos', min: 18, max: 24 },
          { key: '25-34', label: '25-34 anos', min: 25, max: 34 },
          { key: '35-44', label: '35-44 anos', min: 35, max: 44 },
          { key: '45-54', label: '45-54 anos', min: 45, max: 54 },
          { key: '55+', label: '55+ anos', min: 55, max: 999 }
        ],
        genero: [
          { key: 'M', label: 'Masculino', color: '#3B82F6' },
          { key: 'F', label: 'Feminino', color: '#EC4899' }
        ]
      },
      baseURL: 'https://absenteeism-api-claudia-azevedos-projects.vercel.app'
    }
  });
});

// DASHBOARD-DATA - Endpoint principal atualizado
router.get('/dashboard-data', async (req, res) => {
  try {
    const startTime = Date.now();
    const pool = req.pool;

    // Usar nossas views reais
    const dashboardQuery = `
      SELECT 
        secao,
        dados
      FROM vw_dashboard_completo
      ORDER BY 
        CASE secao 
          WHEN 'kpis' THEN 1
          WHEN 'ausencias_departamento' THEN 2  
          WHEN 'turnover_departamento' THEN 3
          ELSE 4
        END
    `;

    const result = await pool.query(dashboardQuery);
    const queryTime = Date.now() - startTime;

    // Organizar dados por seção
    const dashboardData = {};
    result.rows.forEach(row => {
      dashboardData[row.secao] = row.dados;
    });

    // Garantir estrutura mínima
    const responseData = {
      kpis: dashboardData.kpis || {
        media_ausencias_mes: 0,
        media_dias_perdidos_mes: 0,
        fopag_medio_mes: 0,
        absenteismo_medio: 0,
        turnover_percentual: 0
      },
      ausencias_departamento: dashboardData.ausencias_departamento || [],
      turnover_departamento: dashboardData.turnover_departamento || [],
      
      // Dados adicionais de gênero (baseados nos funcionários reais)
      distribuicao_genero: await getDistribuicaoGenero(pool),
      
      // Metadata
      metadata: {
        performance: {
          queryTime: `${queryTime}ms`,
          timestamp: new Date().toISOString()
        },
        fonte: 'Dados reais - Jan/Abr 2025',
        totalRegistros: 29998,
        totalFuncionarios: 507
      }
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('[DASHBOARD-DATA ERROR]:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        code: 'DASHBOARD_ERROR',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// RESUMO - Endpoint simplificado
router.get('/resumo', async (req, res) => {
  try {
    const result = await req.pool.query(`
      SELECT dados as resumo 
      FROM vw_dashboard_completo 
      WHERE secao = 'kpis'
    `);
    
    res.json({
      success: true,
      data: result.rows[0]?.resumo || {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ABSENTEISMO-GENERO - Baseado em funcionários reais
router.get('/absenteismo-genero', async (req, res) => {
  try {
    const query = `
      SELECT 
        f.genero,
        COUNT(DISTINCT f.id_funcionario) as total_funcionarios,
        COUNT(CASE WHEN rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109) THEN 1 END) as total_ausencias,
        ROUND(
          CASE WHEN COUNT(CASE WHEN rh.cod_situacao = 1 THEN 1 END) > 0
          THEN (COUNT(CASE WHEN rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109) THEN 1 END)::DECIMAL / 
                COUNT(CASE WHEN rh.cod_situacao = 1 THEN 1 END)) * 100
          ELSE 0 END, 1
        ) as percentual_absenteismo
      FROM funcionarios f
      LEFT JOIN registro_horas rh ON f.id_funcionario = rh.id_funcionario
      WHERE f.genero IN ('M', 'F')
      GROUP BY f.genero
      ORDER BY f.genero
    `;
    
    const result = await req.pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// TURNOVER - Usar nossa view real
router.get('/turnover', async (req, res) => {
  try {
    const result = await req.pool.query(`
      SELECT dados as turnover 
      FROM vw_dashboard_completo 
      WHERE secao = 'turnover_departamento'
    `);
    
    res.json({
      success: true,
      data: result.rows[0]?.turnover || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DISTRIBUICAO-GENERO - Dados reais de funcionários
router.get('/distribuicao-genero', async (req, res) => {
  try {
    const result = await getDistribuicaoGenero(req.pool);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// CID-AFASTAMENTOS - Baseado em códigos reais de situação
router.get('/cid-afastamentos', async (req, res) => {
  try {
    const query = `
      SELECT 
        cod_situacao as codigo,
        descr_cod_situacao as descricao,
        COUNT(*) as total_ocorrencias,
        COUNT(DISTINCT id_funcionario) as funcionarios_afetados,
        ROUND(AVG(carga_horaria_hs), 2) as media_horas
      FROM registro_horas
      WHERE cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109)
        AND descr_cod_situacao IS NOT NULL
      GROUP BY cod_situacao, descr_cod_situacao
      ORDER BY total_ocorrencias DESC
      LIMIT 10
    `;
    
    const result = await req.pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// TEST-CONNECTION - Testar nossas views reais
router.get('/test-connection', async (req, res) => {
  try {
    const startTime = Date.now();
    const pool = req.pool;

    // Testar nossas views reais
    const tests = [
      { name: 'vw_dashboard_completo', query: 'SELECT COUNT(*) as count FROM vw_dashboard_completo' },
      { name: 'vw_kpis_dashboard', query: 'SELECT COUNT(*) as count FROM vw_kpis_dashboard' },
      { name: 'vw_ausencias_departamento', query: 'SELECT COUNT(*) as count FROM vw_ausencias_departamento' },
      { name: 'vw_turnover_departamento', query: 'SELECT COUNT(*) as count FROM vw_turnover_departamento' },
      { name: 'registro_horas', query: 'SELECT COUNT(*) as count FROM registro_horas' },
      { name: 'funcionarios', query: 'SELECT COUNT(*) as count FROM funcionarios' }
    ];

    const results = {};
    
    for (const test of tests) {
      try {
        const result = await pool.query(test.query);
        results[test.name] = {
          status: 'success',
          count: result.rows[0]?.count?.toString() || '0'
        };
      } catch (error) {
        results[test.name] = {
          status: 'error',
          error: error.message
        };
      }
    }

    const totalTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        connectionTest: 'success',
        viewsStatus: results,
        performance: {
          totalTime: `${totalTime}ms`,
          timestamp: new Date().toISOString()
        },
        baseInfo: {
          totalRegistros: results.registro_horas?.count || '0',
          totalFuncionarios: results.funcionarios?.count || '0',
          viewsDisponiveis: Object.keys(results).filter(k => results[k].status === 'success').length
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Função auxiliar para distribuição por gênero
async function getDistribuicaoGenero(pool) {
  try {
    const query = `
      SELECT 
        genero,
        COUNT(*) as total,
        ROUND((COUNT(*)::DECIMAL / (SELECT COUNT(*) FROM funcionarios WHERE genero IN ('M', 'F'))) * 100, 1) as percentual
      FROM funcionarios 
      WHERE genero IN ('M', 'F')
      GROUP BY genero
      ORDER BY genero
    `;
    
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Erro ao buscar distribuição por gênero:', error);
    return [
      { genero: 'M', total: 0, percentual: 0 },
      { genero: 'F', total: 0, percentual: 0 }
    ];
  }
}

module.exports = router;
