/* Executar: node --test tests/importar-planilha-fretes.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
function ambiente(dados = {}) {
  const ctx = {
    db: Object.assign({ veiculos: [], terceiros: [], fretes: [] }, dados),
    console, Date, Event: function () {},
    document: { readyState: 'loading', documentElement: {}, addEventListener() {}, getElementById() { return null; } },
    MutationObserver: function () { this.observe = function () {}; },
    addEventListener() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('importar-planilha-fretes.js'), ctx);
  return { api: ctx.FMPlanilhaFretes, db: ctx.db };
}
function planilha(extra = []) {
  return [['Viagem', 'V001'], ['Veículo', 'ABC-1234'], ['Linha', 'Sul'],
    ['CT-e', 'Peso', 'Valor do Frete', 'Cidade Origem', 'Estado Origem', 'Cidade Destino', 'Estado Destino', 'Valor da Viagem'],
    ['101', 1000, 100, 'Curitiba', 'PR', 'São Paulo', 'SP', 150],
    ['102', 2000, 200, 'Curitiba', 'PR', 'São Paulo', 'SP', 150], ...extra];
}
test('scripts modificados continuam com sintaxe válida', () => {
  for (const nome of ['importar-planilha-fretes.js', 'fretes-terceiros.js', 'custos-frota.js']) new vm.Script(ler(nome));
});
test('cada CT-e entra uma vez e Valor da Viagem não aumenta a receita', () => {
  const { api } = ambiente();
  const itens = api.ler(planilha([['101', 1000, 100, 'Curitiba', 'PR', 'São Paulo', 'SP', 150], ['Total', '', 300]]));
  assert.equal(itens.length, 2);
  assert.equal(itens.reduce((s, x) => s + x.frete, 0), 30000);
  assert.equal(itens.reduce((s, x) => s + x.custo, 0), 15000);
  assert.equal(itens[0].custo, 5000);
  assert.equal(itens[1].custo, 10000);
  assert.equal(itens[0].divergente, false);
  assert.equal(itens[0].origem, 'Curitiba-PR');
  assert.equal(itens[0].destino, 'São Paulo-SP');
});
test('rateio mantém o total em centavos e contratos divergentes ficam pendentes', () => {
  const { api } = ambiente();
  const rows = planilha(); rows[4][2] = 1; rows[5][2] = 2;
  rows[4][7] = 1; rows[5][7] = 1;
  const itens = api.ler(rows);
  assert.equal(itens[0].custo + itens[1].custo, 100);
  rows[5][7] = 2;
  assert.ok(api.ler(rows).every(x => Number.isNaN(x.custo)));
});
test('placas próprias ignoram pontuação e desconhecidas não criam cadastros', () => {
  const { api, db } = ambiente({ veiculos: [{ vplaca: 'abc1234', vtipo: 'Truck' }] });
  const item = api.ler(planilha())[0];
  assert.equal(api.identificar(item).propria, true);
  item.placa = 'XYZ-9A99';
  assert.equal(api.identificar(item).propria, false);
  assert.equal(db.terceiros.length, 0);
  assert.equal(db.fretes.length, 0);
});
test('competência preenche período mensal e não inventa horários reais', () => {
  const { api } = ambiente(); const item = {};
  api.periodo(item, '2028-02');
  assert.equal(item.inicio, '2028-02-01');
  assert.equal(item.fim, '2028-02-29');
  assert.equal(item.data, '2028-02-01');
  assert.equal(item.carregamento, undefined);
  api.periodo(item, '2026-13'); assert.equal(item.inicio, '');
});
test('bloqueia duplicados, divergências e pagamentos não conferidos', () => {
  const { api, db } = ambiente({ terceiros: [{ terempresa: 'Transportes', terplaca: 'ABC1234' }] });
  const item = api.ler(planilha())[0]; api.periodo(item, '2026-11');
  assert.equal(api.motivo(item), 'Confirme Valor da Viagem como pagamento');
  item.aceitarRateio = true; assert.equal(api.motivo(item), 'Pronto');
  db.fretes.push({ freobs: 'CT-e: 101 | Viagem: V001' });
  assert.equal(api.jaExiste(item), true);
  assert.equal(api.motivo(item), 'Duplicado: já cadastrado');
  db.fretes.length = 0;
  db.fretes.push({ freplanilha: { cte: '101' } }); assert.equal(api.jaExiste(item), true);
  db.fretes.length = 0;
  const conflitantes = api.ler(planilha([['101', 1000, 999, 'Curitiba', 'PR', 'São Paulo', 'SP', 150]]));
  assert.equal(conflitantes[0].divergente, true);
  assert.equal(api.motivo(conflitantes[0]), 'Divergência entre CT-e repetidos');
});
test('pagamento ausente nunca é assumido como zero', () => {
  const { api } = ambiente({ terceiros: [{ terempresa: 'Transportes', terplaca: 'ABC1234' }] });
  const rows = planilha(); rows[4][7] = ''; rows[5][7] = '';
  const item = api.ler(rows)[0]; api.periodo(item, '2026-11');
  assert.ok(Number.isNaN(item.custo));
  assert.equal(api.motivo(item), 'Informe o valor pago ao terceiro');
});
