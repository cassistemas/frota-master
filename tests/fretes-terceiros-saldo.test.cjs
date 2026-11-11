const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'fretes-terceiros.js'), 'utf8');
const inicio = fonte.indexOf('  window.renderFretes = function renderFretes() {');
const fim = fonte.indexOf('  var renderFretes = window.renderFretes;', inicio);
const parser = fonte.match(/  function valorNum\(v\) \{[\s\S]*?\n  \}/)[0];

function renderizar(fretes) {
  const tabela = { innerHTML: '' };
  const contexto = {
    window: {},
    document: { getElementById: () => tabela },
    preencherSelectsFrete() {},
    val: () => '',
    esc: v => String(v == null ? '' : v),
    dataBR: v => v || '',
    dataHoraBR: v => v || '',
    fretes
  };
  vm.createContext(contexto);
  vm.runInContext(parser + '\n' + fonte.slice(inicio, fim), contexto);
  contexto.window.renderFretes();
  return tabela.innerHTML;
}

function celulas(html) {
  return [...html.matchAll(/<td class="money"[^>]*>([\s\S]*?)<\/td>/g)]
    .map(m => m[1].replace(/\u00a0/g, ' '));
}

test('exibe o pagamento ao terceiro e o saldo sem alterar o registro', () => {
  const frete = { freexecucao: 'terceiro', frevalor: 'R$ 3.055,00', frecustoterceiro: 'R$ 2.500,00' };
  const original = JSON.stringify(frete);
  assert.deepEqual(celulas(renderizar([frete])), ['R$ 3.055,00', 'R$ 2.500,00', 'R$ 555,00']);
  assert.equal(JSON.stringify(frete), original);
});

test('pagamento não informado não é tratado como zero', () => {
  const valores = celulas(renderizar([{ freexecucao: 'terceiro', frevalor: 'R$ 100,00' }]));
  assert.match(valores[1], /Não informado/);
  assert.equal(valores[2], '—');
});

test('pagamento explicitamente zero mantém o saldo integral', () => {
  const valores = celulas(renderizar([{ freexecucao: 'terceiro', frevalor: 'R$ 100,00', frecustoterceiro: 'R$ 0,00' }]));
  assert.deepEqual(valores, ['R$ 100,00', 'R$ 0,00', 'R$ 100,00']);
});

test('frota própria não desconta pagamento antigo de terceiro', () => {
  const valores = celulas(renderizar([{ freexecucao: 'propria', frevalor: 'R$ 100,00', frecustoterceiro: 'R$ 80,00' }]));
  assert.deepEqual(valores, ['R$ 100,00', '—', 'R$ 100,00']);
});

test('preserva saldo negativo e calcula em centavos', () => {
  const valores = celulas(renderizar([{ freexecucao: 'terceiro', frevalor: 'R$ 10,10', frecustoterceiro: 'R$ 10,30' }]));
  assert.equal(valores[2], '-R$ 0,20');
});

test('estado vazio acompanha as treze colunas da tabela', () => {
  assert.match(renderizar([]), /colspan="13"/);
  assert.match(fonte, /<th>Valor pago ao terceiro<\/th><th>Saldo<\/th>/);
});
