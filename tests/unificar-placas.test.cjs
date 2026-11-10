/* Executar: node --test tests/unificar-placas.test.cjs tests/dashboard-veiculos.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const codigo = fs.readFileSync(path.join(__dirname, '..', 'unificar-placas.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const campos = {
  manutencoes: 'mveiculo', revisoes: 'rveiculo', combustivel: 'cveiculo',
  multas: 'muveiculo', saidaVeiculos: 'svveiculo', seguros: 'sveiculo',
  licenciamento: 'lveiculo', tacografo: 'tveiculo', licencas: 'leveiculo',
  agendamentos: 'agveiculo', estoque: 'eplaca', pneus: 'pveiculo', detran: 'dtPlaca',
  custos: 'veiculo', custosRecorrentes: 'veiculo', quilometragens: 'veiculo',
  producoes: 'veiculo', metasVeiculos: 'veiculo', gestaoDepreciacoes: 'veiculo',
  implementos: 'veiculo', eventosPneus: 'veiculo', importacoesPedagio: 'veiculo'
};
const copiar = x => JSON.parse(JSON.stringify(x));
function iniciar(base, carregados) {
  const salvos = [], telas = [];
  const ctx = { db: copiar(base), console, setInterval() {},
    fmModuloCarregado: mod => !carregados || carregados.has(mod),
    salvarNuvem: mods => salvos.push(Array.from(mods)),
    renderDashboard: () => telas.push('dashboard'),
    renderCustosFrota: () => telas.push('custos')
  };
  ctx.window = ctx;
  vm.runInNewContext(codigo, ctx);
  ctx.fmUnificarPlacas();
  return { ctx, salvos, telas, dados: () => copiar(ctx.db) };
}
const veiculos = () => [{ _rid: 'scania', vplaca: 'TRI-2G29' }, { _rid: 'daf', vplaca: 'TRL-8B61' }];
test('aplica somente os aliases aprovados em todos os campos e mantém dados e quantidades', () => {
  const base = { veiculos: veiculos() };
  Object.entries(campos).forEach(([mod, campo]) => {
    base[mod] = ['Scania laranja', 'Daf-10', 'DAF-310', 'Estoque', 'Outro'].map((valor, i) => ({
      _rid: mod + i, [campo]: valor, valor: 'R$ 123,45', data: '2026-01-12', obs: valor,
      vinculos: [{ veiculo: valor, valor: 987.65 }]
    }));
  });
  base.importacoesPedagio[0].placa = 'Scania laranja';
  const esperado = copiar(base);
  Object.entries(campos).forEach(([mod, campo]) => {
    ['TRI-2G29', 'TRL-8B61', 'TRL-8B61'].forEach((placa, i) => {
      esperado[mod][i][campo] = placa;
      esperado[mod][i].vinculos[0].veiculo = placa;
    });
  });
  esperado.importacoesPedagio[0].placa = 'TRI-2G29';
  const r = iniciar(base);
  assert.deepEqual(r.dados(), esperado, 'Só nomes/vínculos mudam; nenhum registro é removido ou criado');
  assert.deepEqual(r.salvos, [Object.keys(campos)]);
  assert.deepEqual(r.telas, ['custos', 'dashboard']);
  r.ctx.fmUnificarPlacas();
  assert.equal(r.salvos.length, 1, 'Reexecutar não provoca nova gravação');
});
test('não corrige nem salva aliases sem a respectiva placa cadastrada', () => {
  const base = { veiculos: [{ vplaca: 'ABC-1234' }], manutencoes: [
    { mveiculo: 'Scania laranja', mvalor: 'R$ 10,00' },
    { mveiculo: 'Daf-10', mvalor: 'R$ 20,00' },
    { mveiculo: 'DAF-310', mvalor: 'R$ 30,00' }
  ] };
  const r = iniciar(base);
  assert.deepEqual(r.dados(), base);
  assert.equal(r.salvos.length, 0);
});
test('aguarda o cadastro e cada módulo, aplicando apenas o destino disponível', () => {
  const base = { veiculos: [veiculos()[0]], manutencoes: [
    { mveiculo: 'Scania laranja' }, { mveiculo: 'Daf-10' }
  ] };
  const carregados = new Set(['manutencoes']);
  const r = iniciar(base, carregados);
  assert.deepEqual(r.dados(), base);
  carregados.clear(); carregados.add('veiculos');
  r.ctx.fmUnificarPlacas();
  assert.deepEqual(r.dados(), base);
  carregados.add('manutencoes'); r.ctx.fmUnificarPlacas();
  assert.deepEqual(r.dados().manutencoes, [{ mveiculo: 'TRI-2G29' }, { mveiculo: 'Daf-10' }]);
  assert.deepEqual(r.salvos, [['manutencoes']]);
});
test('depois da correção, o gráfico reúne os custos nas placas e deixa Estoque preservado fora dele', () => {
  const r = iniciar({ veiculos: veiculos(), manutencoes: [
    { mveiculo: 'Scania laranja', mvalor: 100, mvalornfse: 20 },
    { mveiculo: 'Daf-10', mvalor: 30 }, { mveiculo: 'DAF-310', mvalor: 40 },
    { mveiculo: 'Estoque', mvalor: 50 }
  ] });
  const inicio = html.indexOf('function dadosCustosVeiculosDashboard(base){');
  const fim = html.indexOf('function renderDashboard(){', inicio);
  assert.ok(inicio >= 0 && fim > inicio);
  const antes = r.dados();
  r.ctx.moedaParaFloat = x => Number(x) || 0;
  r.ctx.totalManutencaoRegistro = x => (Number(x.mvalor) || 0) + (Number(x.mvalornfse) || 0);
  vm.runInNewContext(html.slice(inicio, fim) + '\nresultado = dadosCustosVeiculosDashboard(db);', r.ctx);
  assert.deepEqual(copiar(r.ctx.resultado), { labels: ['TRI-2G29', 'TRL-8B61'], valores: [120, 70] });
  assert.deepEqual(r.dados(), antes, 'A projeção não altera nenhum lançamento');
  assert.equal(r.dados().manutencoes.reduce((s, x) => s + x.mvalor + (x.mvalornfse || 0), 0), 240);
});
