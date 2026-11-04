/* Executar com: node --test tests/veiculos-fipe.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
function ambiente(registros = [], resposta = {}) {
  const elementos = {}, salvos = [];
  const ctx = {
    console, db: { detran: registros },
    document: { readyState: 'loading', addEventListener() {},
      getElementById: id => elementos[id] || null, querySelector: () => null },
    fetch: async () => ({ ok: true, text: async () => JSON.stringify([resposta]) }),
    setTimeout, clearTimeout,
    dbCloud: { collection: () => ({ doc: () => ({ set: async payload => {
      salvos.push(JSON.parse(JSON.stringify(payload)));
    } }) }) }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const codigo = ler('veiculos-detran.js');
  // Acesso ao salvamento somente no ambiente de teste, sem API pública adicional.
  vm.runInContext(codigo.replace('  /* ---------------- boot ---------------- */',
    '  window.salvarDetranTeste = salvarDetran;\n' +
    '  window.detalheDetranTeste = detalheHtml;\n' +
    '  window.aplicarFipeTeste = function(p) { FIPE.atual = p; aplicarAnoFipe(); };\n' +
    '  /* ---------------- boot ---------------- */'), ctx);
  function el(id, valor = '') {
    return elementos[id] = { value: valor, innerHTML: '', textContent: '', style: {} };
  }
  async function atualizar() {
    await new Promise((resolve, reject) => ctx.atualizarFipeDetran(0,
      (ok, erro) => ok ? resolve() : reject(new Error(erro))));
  }
  return { ctx, api: ctx.FMVeiculosFipe, el, elementos, salvos, atualizar };
}
function registro(ref, valor, extras = {}) {
  return Object.assign({ dtPlaca: 'ABC1234', dtMarca: 'Marca / Modelo', dtAnoMod: '2020',
    dtCombustivel: 'Diesel', dtFipeCodigo: '123456-7', dtFipeRef: ref,
    dtFipeValor: valor, dtObs: 'Manter esta anotação.' }, extras);
}
test('sintaxe válida e módulo carregado na página principal', () => {
  new vm.Script(ler('veiculos-detran.js'));
  assert.match(ler('index.html'), /src="\.\/veiculos-detran\.js\?v=3-observacoes-fipe"/);
});
test('olhinho separa observações da grade e mantém notas e comparativo em largura completa', () => {
  const { ctx, api } = ambiente();
  const notas = 'Primeira linha\nSegunda linha <teste>';
  const x = api.registrar(registro('março de 2026', 'R$ 100.000,00'),
    registro('abril de 2026', 'R$ 98.500,00', { dtObs: notas }));
  const antes = JSON.stringify(x);
  const html = ctx.detalheDetranTeste(x, 0);
  const inicioObs = html.indexOf('<section class="fm-det-obs"');
  assert.ok(inicioObs > html.indexOf('<div class="fm-det-grid">'));
  assert.ok(html.slice(0, inicioObs).endsWith('</span></div></div>'));
  assert.doesNotMatch(html.slice(0, inicioObs), /Observações|Comparativo mensal FIPE/);
  assert.match(html.slice(inicioObs), /Observações do veículo/);
  assert.match(html, /Primeira linha\nSegunda linha &lt;teste&gt;/);
  assert.equal((html.match(/class="fm-det-fipe-card"/g) || []).length, 3);
  assert.match(html, /FIPE anterior — março\/2026/);
  assert.match(html, /FIPE atual — abril\/2026/);
  assert.match(html, /Queda de/);
  assert.equal(JSON.stringify(x), antes);
});
for (const [valor, texto] of [
  ['R$ 101.500,10', 'Aumento de'],
  ['R$ 98.500,00', 'Queda de'],
  ['R$ 100.000,00', 'sem alteração']
]) test(`quadro do comparativo apresenta ${texto} sem alterar o registro`, () => {
  const { ctx, api } = ambiente();
  const x = api.registrar(registro('março de 2026', 'R$ 100.000,00'), registro('abril de 2026', valor));
  const antes = JSON.stringify(x);
  assert.ok(ctx.detalheDetranTeste(x, 0).includes(texto));
  assert.equal(JSON.stringify(x), antes);
});
test('quadro informa ausência de histórico sem criar valores anteriores', () => {
  const { ctx } = ambiente();
  const x = registro('abril de 2026', 'R$ 98.500,00');
  const html = ctx.detalheDetranTeste(x, 0);
  assert.match(html, /Sem histórico do mês anterior/);
  assert.match(html, /Diferença no mês<\/span><strong class="fm-det-fipe-valor">Indisponível/);
  assert.equal(x.dtFipeHistorico, undefined);
});
test('normaliza referências mensais e valores em centavos sem usar a data da consulta', () => {
  const { api } = ambiente();
  for (const ref of ['março de 2026', 'March/2026', '03/2026', '2026-03'])
    assert.equal(api.mes(ref), '2026-03');
  assert.equal(api.mes('13/2026'), '');
  assert.equal(api.mes('sem referência'), '');
  assert.equal(api.centavos('R$ 100.001,29'), 10000129);
  assert.equal(api.centavos('inválido'), null);
  assert.equal(api.centavos('R$ 0,00'), null);
});
for (const [titulo, valor, esperado] of [
  ['aumento', 'R$ 101.500,10', 150010],
  ['queda', 'R$ 98.500,00', -150000],
  ['sem alteração', 'R$ 100.000,00', 0]
]) test(`compara ${titulo} com o mês imediatamente anterior`, () => {
  const { api } = ambiente();
  const antigo = registro('março de 2026', 'R$ 100.000,00');
  const novo = registro('abril de 2026', valor);
  api.registrar(antigo, novo);
  const c = api.comparar(novo);
  assert.equal(c.anterior.mes, '2026-03');
  assert.equal(c.atual.mes, '2026-04');
  assert.equal(c.diferenca, esperado);
  assert.equal(novo.dtObs, antigo.dtObs);
});
test('atualizações no mesmo mês não criam mês anterior e mantêm uma amostra por mês', () => {
  const { api } = ambiente();
  const marco = registro('março de 2026', 'R$ 100.000,00');
  const abril = api.registrar(marco, registro('abril de 2026', 'R$ 99.000,00'));
  const repetido = api.registrar(abril, registro('abril de 2026', 'R$ 98.500,00'));
  assert.equal(repetido.dtFipeHistorico.length, 2);
  assert.equal(api.comparar(repetido).diferenca, -150000);
  assert.equal(api.comparar(repetido).anterior.centavos, 10000000);
  const soAbril = api.registrar(null, registro('abril de 2026', 'R$ 99.000,00'));
  api.registrar(soAbril, soAbril);
  assert.equal(api.comparar(soAbril).anterior, null);
});
test('ausência de histórico, lacuna mensal e mudança de variante não inventam diferença', () => {
  const { api } = ambiente();
  for (const antigo of [null, registro('fevereiro de 2026', 'R$ 100.000,00'),
    registro('março de 2026', 'R$ 100.000,00', { dtFipeCodigo: '765432-1' }),
    registro('março de 2026', 'R$ 100.000,00', { dtAnoMod: '2021' })]) {
    const novo = api.registrar(antigo, registro('abril de 2026', 'R$ 99.000,00'));
    assert.equal(api.comparar(novo).diferenca, null);
  }
});
test('compara janeiro com dezembro do ano anterior e a leitura não modifica registros', () => {
  const { api } = ambiente();
  const novo = api.registrar(registro('dezembro de 2025', 'R$ 100.000,00'),
    registro('janeiro de 2026', 'R$ 99.000,00'));
  const antes = JSON.stringify(novo);
  assert.equal(api.comparar(novo).diferenca, -100000);
  assert.equal(JSON.stringify(novo), antes);
});
test('Atualizar FIPE salva histórico e mostra o comparativo nas observações do olhinho', async () => {
  const x = registro('março de 2026', 'R$ 100.000,00');
  const amb = ambiente([x], { anoModelo: 2020, valor: 'R$ 98.500,00',
    mesReferencia: 'abril de 2026', codigoFipe: '123456-7', marca: 'Marca', modelo: 'Modelo' });
  const td = { innerHTML: '' };
  amb.elementos.fmDet0 = { style: {}, setAttribute() {}, querySelector: () => td };
  await amb.atualizar();
  assert.equal(amb.salvos.length, 1);
  assert.equal(amb.salvos[0].dados[0].dtFipeHistorico.length, 2);
  assert.match(x.dtObs, /Manter esta anotação/);
  x.dtObs += ' comentário adicional após a FIPE';
  assert.match(td.innerHTML, /FIPE anterior — março\/2026/);
  assert.match(td.innerHTML, /FIPE atual — abril\/2026/);
  assert.match(td.innerHTML, /Diferença no mês<\/span><strong class="fm-det-fipe-valor">Queda de/);
  await amb.atualizar();
  assert.equal(x.dtFipeHistorico.length, 2);
  assert.match(x.dtObs, /comentário adicional após a FIPE/);
  assert.equal(amb.api.comparar(x).diferenca, -150000);
});
test('consulta inválida não sobrescreve o valor nem persiste histórico', async () => {
  const x = registro('março de 2026', 'R$ 100.000,00');
  const amb = ambiente([x], { anoModelo: 2020, valor: 'indisponível', mesReferencia: 'abril de 2026' });
  const antes = JSON.stringify(x);
  await assert.rejects(amb.atualizar(), /referência mensal válida/);
  assert.equal(JSON.stringify(x), antes);
  assert.equal(amb.salvos.length, 0);
});
test('Aplicar FIPE só grava histórico ao salvar o formulário existente', () => {
  const x = registro('março de 2026', 'R$ 100.000,00');
  const amb = ambiente([x]);
  for (const m of ler('veiculos-detran.js').matchAll(/\["(dt\w+)"/g))
    amb.el(m[1], x[m[1]] || '');
  amb.el('dt_idx', '0');
  amb.el('dtStatus');
  amb.el('fipeTipo', 'caminhoes');
  amb.ctx.aplicarFipeTeste({ Marca: 'Marca', Modelo: 'Modelo', AnoModelo: 2020,
    Combustivel: 'Diesel', CodigoFipe: '123456-7', Valor: 'R$ 98.500,00', MesReferencia: 'abril de 2026' });
  assert.equal(x.dtFipeValor, 'R$ 100.000,00');
  assert.equal(amb.salvos.length, 0);
  amb.ctx.salvarDetranTeste();
  const salvo = amb.ctx.db.detran[0];
  assert.equal(salvo.dtFipeHistorico.length, 2);
  assert.equal(amb.api.comparar(salvo).diferenca, -150000);
  assert.match(salvo.dtObs, /Manter esta anotação/);
  assert.equal(amb.salvos.length, 1);
});
