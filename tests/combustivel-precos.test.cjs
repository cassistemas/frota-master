/* Executar com: node --test tests/combustivel-precos.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const fonte = fs.readFileSync(path.join(__dirname, '../combustivel-precos.js'), 'utf8');
function ambiente() {
  const alvo = { innerHTML: '', firstElementChild: {} };
  const ctx = { document: {
    readyState: 'loading', addEventListener() {},
    getElementById: id => id === 'combPrecosConteudo' ? alvo : null
  } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fonte, ctx);
  return { ctx, alvo, calcular: ctx.FMCombustivelPrecos.calcular };
}
function cupom(litros, preco, posto = 'Posto A', tipo = 'Diesel S10', extra = {}) {
  return Object.assign({ clitros: litros, cvalorlitro: preco, cposto: posto, ctipo: tipo }, extra);
}

test('média ponderada por litros e extremos preservam dados e ordem', () => {
  const { calcular } = ambiente();
  const dados = [cupom(10, 8, 'Mais caro'), cupom(90, 6, 'Mais barato')];
  const antes = JSON.stringify(dados);
  const [g] = calcular(dados);
  assert.equal(g.media, 6.2);
  assert.equal(g.totalCentavos, 62000);
  assert.equal(g.litros, 100);
  assert.equal(g.maior.preco, 8);
  assert.equal(g.maior.postos[0], 'Mais caro');
  assert.equal(g.menor.preco, 6);
  assert.equal(g.menor.postos[0], 'Mais barato');
  assert.equal(JSON.stringify(dados), antes);
});

test('separa tipos de combustível e ARLA, sem misturar seus preços', () => {
  const { calcular } = ambiente();
  const lista = calcular([cupom(10, 6), cupom(10, 7, 'B', 'Gasolina'),
    cupom(10, 5, 'C', 'Diesel S500'), cupom(5, 3, 'D', 'Arla32'),
    cupom(5, 4, 'E', 'ARLA 32')]);
  assert.deepEqual(Array.from(lista, g => g.tipo), ['Gasolina', 'Diesel S500', 'Diesel S10', 'ARLA 32']);
  assert.equal(lista[3].media, 3.5);
  assert.equal(lista[3].quantidade, 2);
});

test('lê moeda brasileira e respeita o total efetivamente registrado em centavos', () => {
  const { calcular } = ambiente();
  const [g] = calcular([cupom('1.000,5', 'R$ 6,1234', 'A', 'Diesel S10', { ctotal: 'R$ 6.126,46' })]);
  assert.equal(g.totalCentavos, 612646);
  assert.equal(g.litros, 1000.5);
  assert.equal(g.maior.preco, 6.1234);
  assert.equal(g.media, 6126.46 / 1000.5);
});

test('empates mostram todos os postos distintos e identificam posto ausente', () => {
  const { calcular } = ambiente();
  const [g] = calcular([cupom(10, 6, 'A'), cupom(20, 6, 'B'), cupom(5, 6, 'A'), cupom(5, 6, ' ')]);
  assert.deepEqual(Array.from(g.menor.postos), ['A', 'B', 'Posto não informado']);
  assert.deepEqual(Array.from(g.maior.postos), ['A', 'B', 'Posto não informado']);
});

test('ignora valores incompletos, negativos e não finitos sem criar mínimo zero', () => {
  const { calcular } = ambiente();
  const [g] = calcular([cupom(10, 6), cupom(0, 1), cupom(10, 0), cupom(10, -1),
    cupom('inválido', 2), cupom(10, Infinity), cupom(10, 1, 'A', 'Diesel S10', { ctotal: 0 })]);
  assert.equal(g.media, 6);
  assert.equal(g.quantidade, 1);
  assert.equal(g.ignorados, 6);
  assert.equal(g.menor.preco, 6);
  const [incompleto] = calcular([cupom('', '')]);
  assert.equal(incompleto.media, null);
  assert.equal(incompleto.menor, null);
  assert.equal(calcular([]).length, 0);
});

test('renderiza toda a seleção filtrada, protege nomes e atualiza após limpar seleção', () => {
  const { ctx, alvo } = ambiente();
  // A fonte é a seleção completa do módulo, não a página visível da tabela.
  ctx.obterCombustiveisFiltrados = () => [cupom(10, 8, '<img src=x>'), cupom(90, 6, 'Posto B')];
  ctx.FMCombustivelPrecos.atualizar();
  assert.match(alvo.innerHTML, /6,20/);
  assert.match(alvo.innerHTML, /&lt;img src=x&gt;/);
  assert.doesNotMatch(alvo.innerHTML, /<img/);
  assert.match(alvo.innerHTML, /Posto B/);
  ctx.obterCombustiveisFiltrados = () => [];
  ctx.FMCombustivelPrecos.atualizar();
  assert.match(alvo.innerHTML, /Nenhum abastecimento no filtro atual/);
});
