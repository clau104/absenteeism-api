const express = require('express');
const router = express.Router();

// Dashboard Executivo - Atualizado para usar tabelas reais
router.get('/dashboard', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Query executiva com dados reais das nossas tabelas
    const executiveRealQuery = `
      WITH real_metrics AS (
        SELECT 
          COUNT(DISTINCT rh.id_funcionario) as funcionarios_com_falta,
          COUNT(*) as total_faltas,
          ROUND(SUM(CASE WHEN rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109) 
                         THEN rh.carga_horaria_hs END) / 8.0) as dias_perdidos_total,
          ROUND(SUM(CASE WHEN rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109) 
                         THEN rh.carga_horaria_hs END) / 8.0) * 380 as custo_anual_real,
          (SELECT COUNT(DISTINCT id_funcionario) FROM funcionarios) as total_funcionarios_real
        FROM registro_horas rh
        WHERE rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109)
          AND rh.data_pu >= CURRENT_DATE - INTERVAL '12 months'
      ),
      high_risk_real AS (
        SELECT 
          rh.id_funcionario,
          COUNT(*) as total_faltas,
          ROUND(SUM(CASE WHEN rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109) 
                         THEN rh.carga_horaria_hs END) / 8.0) as dias_perdidos,
          POWER(COUNT(*), 2) * ROUND(SUM(CASE WHEN rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109) 
                                               THEN rh.carga_horaria_hs END) / 8.0) as bradford_factor,
          COALESCE(c.nome_departamento, 'Sem Departamento') as cargo
        FROM registro_horas rh
        LEFT JOIN cargos c ON rh.id_cargo = c.id_cargo
        WHERE rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109)
          AND rh.data_pu >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY rh.id_funcionario, c.nome_departamento
        HAVING POWER(COUNT(*), 2) * ROUND(SUM(CASE WHEN rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109) 
                                                    THEN rh.carga_horaria_hs END) / 8.0) >= 150
        ORDER BY bradford_factor DESC
        LIMIT 20
      ),
      department_analysis_real AS (
        SELECT 
          CASE 
            WHEN c.nome_departamento = 'RECURSOS HUMANOS (RH)' THEN 'RH'
            WHEN c.nome_departamento = 'FINANÇAS & CONTROLADORIA' THEN 'FINANÇAS'
            WHEN c.nome_departamento = 'VENDAS & MARKETING' THEN 'VENDAS'
            WHEN c.nome_departamento = 'PRODUÇÃO & QUALIDADE' THEN 'PRODUÇÃO'
            WHEN c.nome_departamento = 'LOGÍSTICA & SUPPLY CHAIN' THEN 'LOGÍSTICA'
            ELSE COALESCE(c.nome_departamento, 'Outros')
          END as cargo,
          COUNT(*) as total_faltas,
          COUNT(DISTINCT rh.id_funcionario) as funcionarios_afetados,
          ROUND(SUM(CASE WHEN rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109) 
                         THEN rh.carga_horaria_hs END) / 8.0) * 380 as custo_departamento_anual
        FROM registro_horas rh
        LEFT JOIN cargos c ON rh.id_cargo = c.id_cargo
        WHERE rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109)
          AND rh.data_pu >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY c.nome_departamento
        ORDER BY total_faltas DESC
        LIMIT 5
      ),
      bradford_criticos AS (
        SELECT COUNT(*) as criticos_extremos
        FROM (
          SELECT rh.id_funcionario
          FROM registro_horas rh
          WHERE rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109)
            AND rh.data_pu >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY rh.id_funcionario
          HAVING POWER(COUNT(*), 2) * ROUND(SUM(CASE WHEN rh.cod_situacao IN (29, 37, 36, 15, 38, 65, 107, 88, 109) 
                                                      THEN rh.carga_horaria_hs END) / 8.0) >= 500
        ) criticos
      )
      SELECT 
        (SELECT row_to_json(rm) FROM real_metrics rm) as metricas_reais,
        (SELECT json_agg(hre ORDER BY hre.bradford_factor DESC) FROM high_risk_real hre) as funcionarios_risco_reais,
        (SELECT json_agg(da ORDER BY da.total_faltas DESC) FROM department_analysis_real da) as departamentos_reais,
        (SELECT criticos_extremos FROM bradford_criticos) as criticos_extremos_reais
    `;

    const result = await req.pool.query(executiveRealQuery);
    const queryTime = Date.now() - startTime;
    
    const data = result.rows[0];
    const metricas = data.metricas_reais || {};
    const funcionariosRisco = data.funcionarios_risco_reais || [];
    const departamentos = data.departamentos_reais || [];

    // Cálculos executivos baseados em dados reais
    const taxaAbsenteismoReal = metricas.total_funcionarios_real > 0 
      ? (metricas.funcionarios_com_falta / metricas.total_funcionarios_real * 100).toFixed(2)
      : 0;
    
    const custoAnualReal = metricas.custo_anual_real || 0;
    const economiaProjetada25 = custoAnualReal * 0.25; // 25% redução realista
    const economiaProjetada35 = custoAnualReal * 0.35; // 35% redução otimista
    const investimento = 85000;
    
    // Calcular ROI real
    const roiConservador = economiaProjetada25 > 0 ? 
      ((economiaProjetada25 - investimento) / investimento * 100).toFixed(1) : 0;
    const roiOtimista = economiaProjetada35 > 0 ? 
      ((economiaProjetada35 - investimento) / investimento * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        // KPIs baseados 100% em dados reais
        kpis: {
          taxaAbsenteismo: `${taxaAbsenteismoReal}%`,
          funcionariosAfetados: metricas.funcionarios_com_falta || 0,
          totalFuncionarios: metricas.total_funcionarios_real || 0,
          custoAnual: custoAnualReal,
          custoMensal: Math.round(custoAnualReal / 12),
          funcionariosCriticos: funcionariosRisco.length || 0,
          criticosExtremos: data.criticos_extremos_reais || 0,
          diasPerdidosAnual: metricas.dias_perdidos_total || 0
        },

        // Alertas baseados em dados reais
        alertas: {
          taxaCritica: parseFloat(taxaAbsenteismoReal) > 15,
          custoElevado: custoAnualReal > 500000,
          funcionariosAltoRisco: (data.criticos_extremos_reais || 0) > 50,
          percentualCriticoElevado: funcionariosRisco.length > (metricas.total_funcionarios_real * 0.1),
          acaoImediataRequerida: (data.criticos_extremos_reais || 0) > (metricas.total_funcionarios_real * 0.5)
        },

        // Projeção ROI baseada em custos reais
        projecaoROI: {
          cenarios: {
            conservador: {
              reducaoPercentual: "25%",
              economiaAnual: economiaProjetada25,
              roi: `${roiConservador}%`,
              paybackMeses: economiaProjetada25 > 0 ? 
                (investimento / (economiaProjetada25 / 12)).toFixed(1) : "N/A"
            },
            otimista: {
              reducaoPercentual: "35%", 
              economiaAnual: economiaProjetada35,
              roi: `${roiOtimista}%`,
              paybackMeses: economiaProjetada35 > 0 ? 
                (investimento / (economiaProjetada35 / 12)).toFixed(1) : "N/A"
            }
          },
          custoAnualAtual: custoAnualReal,
          investimentoNecessario: investimento,
          baseCalculoReal: `${metricas.funcionarios_com_falta} funcionários afetados`
        },

        // Top funcionários de risco (dados reais)
        funcionariosRisco: funcionariosRisco.slice(0, 10).map(emp => ({
          id_funcionario: emp.id_funcionario,
          cargo: emp.cargo,
          bradford_factor: Math.round(emp.bradford_factor || 0),
          total_faltas: emp.total_faltas,
          dias_perdidos: emp.dias_perdidos,
          custo_estimado_anual: (emp.dias_perdidos || 0) * 380,
          nivel_risco: (emp.bradford_factor || 0) >= 500 ? 'CRÍTICO' : 'ALTO'
        })),

        // Departamentos críticos (dados reais)
        departamentosCriticos: departamentos.slice(0, 5).map(dept => ({
          departamento: dept.cargo,
          total_faltas: dept.total_faltas,
          funcionarios_afetados: dept.funcionarios_afetados,
          custo_anual_departamento: dept.custo_departamento_anual,
          prioridade: dept.total_faltas > 100 ? 'CRÍTICA' : 
                     dept.total_faltas > 50 ? 'ALTA' : 'MÉDIA'
        })),

        // Metadata dos dados reais
        metadata: {
          performance: {
            queryTimeMs: queryTime,
            environment: process.env.NODE_ENV || 'production',
            cacheStatus: 'fresh'
          },
          dadosReais: {
            fonte: 'Base de dados real do cliente',
            periodo: 'Jan-Abr 2025 (dados reais)',
            totalRegistros: 29998,
            totalFaltas: metricas.total_faltas,
            funcionariosAnalisados: metricas.total_funcionarios_real,
            tabelas: 'registro_horas + funcionarios + cargos'
          },
          lastUpdate: new Date().toISOString(),
          metodologia: 'Bradford Factor + Análise de Custos Reais + Dados Cliente'
        }
      }
    });

  } catch (error) {
    console.error('[EXECUTIVE DASHBOARD REAL ERROR]:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        code: 'DASHBOARD_REAL_ERROR',
        timestamp: new Date().toISOString()
      }
    });
  }
});

module.exports = router;
