const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuração PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres.vbkcmfsuvxdoechacald:Mebhiq-6bubsy-kimwof@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

// Configuração Supabase (adicionar depois)
// const { createClient } = require('@supabase/supabase-js');
// const supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_SUPABASE_ANON_KEY');

// ===== ROTAS DE ABSENTEÍSMO =====

// 1. Dashboard Geral de Absenteísmo
app.get('/api/absenteeism/overview', async (req, res) => {
  try {
    const { empresa_id = 1, start_date, end_date } = req.query;

    const metricsQuery = `
      WITH absenteeism_stats AS (
        SELECT 
          COUNT(DISTINCT f.id_funcionario) as funcionarios_com_falta,
          COUNT(*) as total_faltas,
          AVG(f.total_de_faltas) as media_faltas_por_ocorrencia,
          (SELECT COUNT(DISTINCT id_funcionario) FROM f_funcionario_dados WHERE id_empresa = $1) as total_funcionarios
        FROM f_faltas f
        WHERE f.id_empresa = $1
        ${start_date ? 'AND f.datapu >= $2' : ''}
        ${end_date ? 'AND f.datapu <= $3' : ''}
      ),
      top_departments AS (
        SELECT 
          c.cargo,
          COUNT(*) as total_faltas,
          COUNT(DISTINCT f.id_funcionario) as funcionarios_afetados,
          ROUND(AVG(f.total_de_faltas), 2) as media_faltas
        FROM f_faltas f
        JOIN d_cargos c ON f.id_cargo = c.id_cargo
        WHERE f.id_empresa = $1
        GROUP BY c.cargo
        ORDER BY total_faltas DESC
        LIMIT 5
      )
      SELECT 
        a.*,
        CAST((a.funcionarios_com_falta::float / a.total_funcionarios * 100) AS DECIMAL(5,2)) as taxa_absenteismo,
        json_agg(t.*) as top_departments
      FROM absenteeism_stats a, top_departments t
      GROUP BY a.funcionarios_com_falta, a.total_faltas, a.media_faltas_por_ocorrencia, a.total_funcionarios;
    `;

    const params = [empresa_id];
    if (start_date) params.push(start_date);
    if (end_date) params.push(end_date);

    const result = await pool.query(metricsQuery, params);
    const metrics = result.rows[0];

    res.json({
      success: true,
      data: {
        taxaAbsenteismo: `${metrics.taxa_absenteismo}%`,
        funcionariosAfetados: metrics.funcionarios_com_falta,
        totalFuncionarios: metrics.total_funcionarios,
        totalFaltas: metrics.total_faltas,
        mediaFaltasPorOcorrencia: parseFloat(metrics.media_faltas_por_ocorrencia).toFixed(2),
        departamentosCriticos: metrics.top_departments.slice(0, 3),
        processedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Erro no overview:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Funcionários Críticos
app.get('/api/alerts/critical-employees', async (req, res) => {
  try {
    const { empresa_id = 1, threshold = 50 } = req.query;

    const query = `
      SELECT 
        f.id_funcionario,
        fd.genero,
        fd.idade2,
        c.cargo,
        COUNT(*) as total_faltas,
        STRING_AGG(DISTINCT f.tipo_de_falta, ', ') as tipos_falta,
        MAX(f.datapu) as ultima_falta,
        CASE 
          WHEN COUNT(*) >= 100 THEN 'CRÍTICO'
          WHEN COUNT(*) >= 50 THEN 'ALTO'
          WHEN COUNT(*) >= 20 THEN 'MÉDIO'
          ELSE 'BAIXO'
        END as status_risco
      FROM f_faltas f
      LEFT JOIN f_funcionario_dados fd ON f.id_funcionario = fd.id_funcionario
      LEFT JOIN d_cargos c ON f.id_cargo = c.id_cargo
      WHERE f.id_empresa = $1
      GROUP BY f.id_funcionario, fd.genero, fd.idade2, c.cargo
      HAVING COUNT(*) >= $2
      ORDER BY total_faltas DESC
      LIMIT 20
    `;

    const result = await pool.query(query, [empresa_id, threshold]);

    res.json({
      success: true,
      data: {
        funcionariosCriticos: result.rows,
        totalCriticos: result.rows.length,
        threshold: threshold,
        processedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Erro nos funcionários críticos:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Análise por Departamento
app.get('/api/absenteeism/by-department', async (req, res) => {
  try {
    const { empresa_id = 1, limit = 10 } = req.query;

    const query = `
      SELECT 
        c.cargo,
        c.id_cargo,
        COUNT(*) as total_faltas,
        COUNT(DISTINCT f.id_funcionario) as funcionarios_com_falta,
        CAST(AVG(f.total_de_faltas) AS DECIMAL(10,2)) as media_faltas_por_funcionario,
        CAST((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER()) AS DECIMAL(5,2)) as percentual_do_total,
        CASE 
          WHEN AVG(f.total_de_faltas) >= 20 THEN 'CRÍTICO'
          WHEN AVG(f.total_de_faltas) >= 10 THEN 'ALTO'
          WHEN AVG(f.total_de_faltas) >= 5 THEN 'MÉDIO'
          ELSE 'BAIXO'
        END as nivel_risco
      FROM f_faltas f
      JOIN d_cargos c ON f.id_cargo = c.id_cargo
      WHERE f.id_empresa = $1
      GROUP BY c.cargo, c.id_cargo
      ORDER BY total_faltas DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [empresa_id, limit]);

    res.json({
      success: true,
      data: result.rows,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro na análise por departamento:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== ROTAS DE DADOS BRUTOS =====

// 4. Dados de Funcionários
app.get('/api/employees', async (req, res) => {
  try {
    const { empresa_id = 1, limit = 100, offset = 0 } = req.query;

    const query = `
      SELECT 
        fd.id_funcionario,
        fd.genero,
        fd.idade2,
        fd.data_admissao,
        fd.tempo_de_empresa_em_anos,
        c.cargo,
        e.escala,
        t.turno
      FROM f_funcionario_dados fd
      LEFT JOIN d_cargos c ON fd.id_cargo = c.id_cargo
      LEFT JOIN d_escalas e ON fd.id_escala = e.id_escala
      LEFT JOIN id_turno t ON fd.id_turno = t.id_turno
      WHERE fd.id_empresa = $1
      ORDER BY fd.id_funcionario
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `SELECT COUNT(*) FROM f_funcionario_dados WHERE id_empresa = $1`;

    const [result, countResult] = await Promise.all([
      pool.query(query, [empresa_id, limit, offset]),
      pool.query(countQuery, [empresa_id])
    ]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(countResult.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Erro nos dados de funcionários:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Dados de Ponto/Horas
app.get('/api/timesheet', async (req, res) => {
  try {
    const { empresa_id = 1, funcionario_id, start_date, end_date, limit = 100 } = req.query;

    let whereClause = `WHERE th.id_empresa = $1`;
    const params = [empresa_id];
    let paramCount = 1;

    if (funcionario_id) {
      paramCount++;
      whereClause += ` AND th.id_funcionario = $${paramCount}`;
      params.push(funcionario_id);
    }

    if (start_date) {
      paramCount++;
      whereClause += ` AND th.datapu >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereClause += ` AND th.datapu <= $${paramCount}`;
      params.push(end_date);
    }

    const query = `
      SELECT 
        th.id_funcionario,
        th.datapu,
        th.total_de_horas,
        th.carga_hor_ria,
        th.situacoes_ponto,
        c.cargo
      FROM f_total_de_horas th
      LEFT JOIN d_cargos c ON th.id_cargo = c.id_cargo
      ${whereClause}
      ORDER BY th.datapu DESC, th.id_funcionario
      LIMIT $${paramCount + 1}
    `;

    params.push(limit);
    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      filters: { empresa_id, funcionario_id, start_date, end_date },
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro nos dados de ponto:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== ROTAS DE RELATÓRIOS =====

// 6. Relatório Completo
app.get('/api/reports/complete/:empresa_id', async (req, res) => {
  try {
    const { empresa_id } = req.params;

    // Executar múltiplas consultas em paralelo
    const [overview, topDepartments, criticalEmployees, faultTypes] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(DISTINCT f.id_funcionario) as funcionarios_com_falta,
          COUNT(*) as total_faltas,
          (SELECT COUNT(DISTINCT id_funcionario) FROM f_funcionario_dados WHERE id_empresa = $1) as total_funcionarios
        FROM f_faltas f WHERE f.id_empresa = $1
      `, [empresa_id]),
      
      pool.query(`
        SELECT c.cargo, COUNT(*) as total_faltas, COUNT(DISTINCT f.id_funcionario) as funcionarios_afetados
        FROM f_faltas f JOIN d_cargos c ON f.id_cargo = c.id_cargo
        WHERE f.id_empresa = $1 GROUP BY c.cargo ORDER BY total_faltas DESC LIMIT 10
      `, [empresa_id]),
      
      pool.query(`
        SELECT f.id_funcionario, COUNT(*) as total_faltas, c.cargo
        FROM f_faltas f LEFT JOIN d_cargos c ON f.id_cargo = c.id_cargo
        WHERE f.id_empresa = $1 GROUP BY f.id_funcionario, c.cargo 
        HAVING COUNT(*) >= 50 ORDER BY total_faltas DESC LIMIT 20
      `, [empresa_id]),
      
      pool.query(`
        SELECT tipo_de_falta, COUNT(*) as total_ocorrencias
        FROM f_faltas WHERE id_empresa = $1 GROUP BY tipo_de_falta ORDER BY total_ocorrencias DESC
      `, [empresa_id])
    ]);

    const report = {
      empresa_id: parseInt(empresa_id),
      data_processamento: new Date().toISOString(),
      overview: overview.rows[0],
      departamentos_criticos: topDepartments.rows,
      funcionarios_criticos: criticalEmployees.rows,
      tipos_falta: faultTypes.rows,
      metricas_calculadas: {
        taxa_absenteismo: ((overview.rows[0].funcionarios_com_falta / overview.rows[0].total_funcionarios) * 100).toFixed(2) + '%',
        risco_geral: overview.rows[0].funcionarios_com_falta > (overview.rows[0].total_funcionarios * 0.15) ? 'ALTO' : 'MÉDIO'
      }
    };

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Erro no relatório completo:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== ROTAS DE UTILITÁRIOS =====

// 7. Health Check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW(), version()');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].now,
      version: result.rows[0].version
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// 8. Estatísticas do Sistema
app.get('/api/system/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        'funcionarios' as tabela, COUNT(*) as registros FROM f_funcionario_dados
      UNION ALL SELECT 'faltas', COUNT(*) FROM f_faltas
      UNION ALL SELECT 'total_horas', COUNT(*) FROM f_total_de_horas
      UNION ALL SELECT 'cargos', COUNT(*) FROM d_cargos
      UNION ALL SELECT 'interjornada', COUNT(*) FROM f_interjornada
      ORDER BY registros DESC
    `);

    const empresas = await pool.query(`
      SELECT DISTINCT id_empresa, COUNT(*) as funcionarios 
      FROM f_funcionario_dados 
      GROUP BY id_empresa 
      ORDER BY id_empresa
    `);

    res.json({
      success: true,
      data: {
        tabelas: stats.rows,
        empresas: empresas.rows,
        systemHealth: 'operational',
        lastUpdate: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Buscar Funcionário Específico
app.get('/api/employee/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { empresa_id = 1 } = req.query;

    const query = `
      SELECT 
        fd.*,
        c.cargo,
        e.escala,
        t.turno,
        (SELECT COUNT(*) FROM f_faltas WHERE id_funcionario = fd.id_funcionario) as total_faltas,
        (SELECT AVG(total_de_horas) FROM f_total_de_horas WHERE id_funcionario = fd.id_funcionario) as media_horas_trabalhadas
      FROM f_funcionario_dados fd
      LEFT JOIN d_cargos c ON fd.id_cargo = c.id_cargo
      LEFT JOIN d_escalas e ON fd.id_escala = e.id_escala
      LEFT JOIN id_turno t ON fd.id_turno = t.id_turno
      WHERE fd.id_funcionario = $1 AND fd.id_empresa = $2
    `;

    const result = await pool.query(query, [id, empresa_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Funcionário não encontrado'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao buscar funcionário:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10. Histórico de Faltas de um Funcionário
app.get('/api/employee/:id/absences', async (req, res) => {
  try {
    const { id } = req.params;
    const { empresa_id = 1, limit = 50 } = req.query;

    const query = `
      SELECT 
        f.datapu,
        f.tipo_de_falta,
        f.total_de_faltas,
        c.cargo
      FROM f_faltas f
      LEFT JOIN d_cargos c ON f.id_cargo = c.id_cargo
      WHERE f.id_funcionario = $1 AND f.id_empresa = $2
      ORDER BY f.datapu DESC
      LIMIT $3
    `;

    const result = await pool.query(query, [id, empresa_id, limit]);

    res.json({
      success: true,
      data: {
        funcionario_id: id,
        historico_faltas: result.rows,
        total_registros: result.rows.length
      }
    });

  } catch (error) {
    console.error('Erro no histórico de faltas:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== MIDDLEWARE DE ERRO =====
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: err.message
  });
});

// ===== INICIALIZAR SERVIDOR =====
// Endpoint de demonstração (sem banco de dados)
app.get('/api/demo/overview', (req, res) => {
  res.json({
    success: true,
    data: {
      taxaAbsenteismo: "88.87%",
      funcionariosAfetados: 447,
      totalFuncionarios: 503,
      totalFaltas: 4963,
      departamentosCriticos: [
        {
          cargo: "Auxiliar de Producao",
          total_faltas: 2500,
          funcionarios_afetados: 200,
          media_faltas: 12.5
        },
        {
          cargo: "Operador de Maquina II", 
          total_faltas: 1200,
          funcionarios_afetados: 120,
          media_faltas: 10.0
        },
        {
          cargo: "Operador de Maquina I",
          total_faltas: 1000,
          funcionarios_afetados: 100,
          media_faltas: 10.0
        }
      ],
      processedAt: new Date().toISOString()
    }
  });
});
app.listen(port, () => {
  console.log(`🚀 API de RH/Absenteísmo rodando em http://localhost:${port}`);
  console.log(`\n📊 ENDPOINTS DISPONÍVEIS:`);
  console.log(`\n🏥 SISTEMA:`);
  console.log(`   GET  /api/health                     - Health check`);
  console.log(`   GET  /api/system/stats               - Estatísticas gerais`);
  console.log(`\n📈 ABSENTEÍSMO:`);
  console.log(`   GET  /api/absenteeism/overview       - Dashboard geral`);
  console.log(`   GET  /api/absenteeism/by-department  - Análise por departamento`);
  console.log(`   GET  /api/alerts/critical-employees  - Funcionários críticos`);
  console.log(`\n👥 FUNCIONÁRIOS:`);
  console.log(`   GET  /api/employees                  - Lista funcionários`);
  console.log(`   GET  /api/employee/:id               - Funcionário específico`);
  console.log(`   GET  /api/employee/:id/absences      - Histórico faltas funcionário`);
  console.log(`\n⏰ PONTO/HORAS:`);
  console.log(`   GET  /api/timesheet                  - Dados de ponto`);
  console.log(`\n📋 RELATÓRIOS:`);
  console.log(`   GET  /api/reports/complete/:empresa_id - Relatório completo`);
  console.log(`\n🌐 Teste rápido: curl http://localhost:${port}/api/health\n`);
});

module.exports = app;
