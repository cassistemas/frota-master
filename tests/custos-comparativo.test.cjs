const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregar() {
  const db = {
    veiculos: [{ vplaca: 'AAA-1234' }, { vplaca: 'BBB-1234' }, { vplaca: 'CCC-1234' }],
    quilometragens: [{ veiculo: 'AAA-1234', data: '2026-11-12', kmRodado: 100 }, { veiculo: 'BBB-1234', data: '2026-11-12', kmRodado: 300 }],
    producoes: [{ veiculo: 'AAA-1234', competencia: '2026-11', receitaBruta: 1000, descontos: 100 }],
  };
  const window = { addEventListener() {} };
  const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, getElementById() { return null; } };
  const ctx = vm.createContext({ window, document, db, setInterval() {} });
  for (const nome of ['custos-frota.js', 'resultado-frota.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', nome), 'utf8'), ctx, { filename: nome });
  }
  return window.FMResultadoAPI;
}

const filtro = { ini: '2026-11-01', fim: '2026-11-30', modo: 'competencia' };
function custo(categoria, valor, campos = {}) {
  return { categoria, valor, data: '2026-11-12', competencia: '2026-11', tipo: 'variavel', status: 'Realizado', ...campos };
}

test('comparativo soma somente as parcelas dos veículos escolhidos, sem recalcular o rateio sobre a seleção', () => {
  const api = carregar();
  const base = [custo('Combustível', 100, { veiculo: 'AAA1234' }), custo('Pedágio', 80, { rateio: 'km' }), custo('Seguro', 90, { rateio: 'igual', tipo: 'fixo' }), custo('Outros', 50, { rateio: 'nao' })];
  const dados = api.dadosComparativo(['AAA-1234', 'CCC-1234'], filtro, base, false);
  assert.equal(dados.linhas.length, 2);
  assert.equal(dados.linhas[0].total, 150);
  assert.equal(dados.linhas[0].faturamento, 1000);
  assert.equal(dados.linhas[0].receitaLiquida, 900);
  assert.equal(dados.linhas[1].km, 0);
  assert.equal(dados.linhas[1].total, 30);
  assert.equal(dados.categorias.get('Pedágio'), 20);
  assert.equal(dados.categorias.get('Seguro'), 60);
  assert.equal(dados.categorias.has('Outros'), false);
  assert.equal(dados.naoAlocados, 0);
});

test('o rateio por placa usa a frota inteira mesmo quando a seleção tem só um veículo', () => {
  const api = carregar();
  const base = [custo('Seguro', 90, { rateio: 'igual', tipo: 'fixo' })];
  const frotaRateio = ['AAA-1234', 'BBB-1234', 'CCC-1234'];
  const dados = api.dadosComparativo(['AAA-1234'], { ...filtro, frotaRateio }, base, false);
  assert.equal(dados.linhas[0].fix, 30);
  assert.equal(dados.categorias.get('Seguro'), 30);
  assert.equal(base[0].valor, 90);
});

test('visão geral inclui custos sem rateio e os painéis usam os mesmos filtros da tabela', () => {
  const api = carregar();
  const base = [custo('Combustível', 100, { veiculo: 'AAA1234' }), custo('Combustível', 50, { rateio: 'nao' }), custo('Pedágio', 80, { rateio: 'km' })];
  const dados = api.dadosComparativo(['AAA-1234', 'BBB-1234', 'CCC-1234'], { ...filtro, cat: 'Combustível' }, base, true);
  assert.equal(dados.naoAlocados, 50);
  assert.equal(dados.categorias.get('Combustível'), 150);
  assert.equal(dados.categorias.has('Pedágio'), false);
  assert.equal(dados.linhas.reduce((s, x) => s + x.total, dados.naoAlocados), 150);
});
