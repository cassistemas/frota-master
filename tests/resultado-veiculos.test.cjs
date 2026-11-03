/* Executar com: node --test tests/resultado-veiculos.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
function ambiente(dados = {}, opcoes = {}) {
  const eventos = {}, salvos = [], alertas = [];
  const db = Object.assign({ veiculos: [], custos: [], custosRecorrentes: [], quilometragens: [], producoes: [], gestaoDepreciacoes: [] }, dados);
  const ctx = {
    db, console, alert: msg => alertas.push(msg), confirm: () => opcoes.confirmar !== false,
    salvarNuvem: async mods => { salvos.push(Array.from(mods)); return opcoes.salvar !== false; },
    fmModuloCarregado: mod => mod !== opcoes.pendente,
    document: { getElementById: () => null, addEventListener: (tipo, fn) => { eventos[tipo] = fn; } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('resultado-veiculos.js'), ctx);
  async function clicar(placa, restaurar = false) {
    const botao = {
      disabled: false, dataset: restaurar ? { resultadoRestaurar: placa } : { resultadoExcluir: placa },
      hasAttribute: () => restaurar
    };
    eventos.click({ target: { closest: () => botao } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(botao.disabled, false);
  }
  return { db, ctx, api: ctx.FMResultadoVeiculos, salvos, alertas, clicar };
}
test('scripts alterados têm sintaxe válida e estão carregados na página', () => {
  for (const arquivo of ['resultado-veiculos.js', 'resultado-frota.js']) new vm.Script(ler(arquivo));
  const html = ler('index.html');
  assert.ok(html.indexOf('src="./resultado-veiculos.js?') < html.indexOf('src="./resultado-frota.js?'));
  assert.match(html, /src="\.\/resultado-veiculos\.js\?v=1"/);
});
test('lista normaliza duplicatas e não altera os dados durante a leitura', () => {
  const amb = ambiente({ veiculos: [{ vplaca: 'ABC-1234', resultadoListaOculto: true }] });
  const antes = JSON.stringify(amb.db);
  assert.deepEqual(Array.from(amb.api.lista(['ABC1234', 'DEF-5678', 'def5678'])), ['DEF-5678']);
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
test('exclusão salva apenas visibilidade e conserva valores, vínculos e registros', async () => {
  const amb = ambiente({
    veiculos: [{ vid: 'v1', vplaca: 'ABC-1234' }],
    custos: [{ id: 'c1', veiculo: 'abc1234', valor: 500 }, { id: 'c2', veiculo: 'DEF-5678', valor: 90 }],
    gestaoDepreciacoes: [{ id: 'd1', veiculo: 'ABC1234', valorAquisicao: 200000 }]
  });
  await amb.clicar('ABC-1234');
  assert.equal(amb.db.custos.length, 2);
  assert.equal(amb.db.custos[0].valor, 500);
  assert.equal(amb.db.custos[0].veiculo, 'abc1234');
  assert.equal(amb.db.gestaoDepreciacoes[0].valorAquisicao, 200000);
  assert.equal(amb.db.veiculos[0].vid, 'v1');
  assert.equal(amb.db.custos[1].resultadoListaOculto, undefined);
  assert.deepEqual(amb.salvos, [['veiculos', 'custos', 'gestaoDepreciacoes']]);
  assert.deepEqual(Array.from(amb.api.lista(['ABC-1234', 'DEF-5678'])), ['DEF-5678']);
  await amb.clicar('ABC1234', true);
  assert.deepEqual(Array.from(amb.api.lista(['ABC-1234', 'DEF-5678'])), ['ABC-1234', 'DEF-5678']);
  assert.equal(amb.db.custos[0].resultadoListaOculto, false);
});
test('permite remover placa órfã que existe somente nos lançamentos', async () => {
  const amb = ambiente({ quilometragens: [{ id: 'q1', veiculo: 'ANT-0001', km: 150 }] });
  await amb.clicar('ANT0001');
  assert.equal(amb.db.quilometragens[0].km, 150);
  assert.equal(amb.db.quilometragens.length, 1);
  assert.equal(amb.api.lista(['ANT-0001']).length, 0);
});
test('cancelamento e carregamento incompleto não modificam ou salvam registros', async () => {
  for (const opcoes of [{ confirmar: false }, { pendente: 'custos' }]) {
    const amb = ambiente({ veiculos: [{ vplaca: 'ABC-1234' }] }, opcoes);
    const antes = JSON.stringify(amb.db);
    await amb.clicar('ABC-1234');
    assert.equal(JSON.stringify(amb.db), antes);
    assert.equal(amb.salvos.length, 0);
  }
});
test('falha no salvamento restaura os objetos anteriores sem remover histórico', async () => {
  const amb = ambiente({ custos: [{ id: 'c1', veiculo: 'ABC-1234', valor: 350 }] }, { salvar: false });
  const antes = JSON.stringify(amb.db);
  await amb.clicar('ABC-1234');
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.alertas.length, 1);
  assert.deepEqual(Array.from(amb.api.lista(['ABC-1234'])), ['ABC-1234']);
});
test('visibilidade não é aplicada aos cálculos ou ao relatório mensal', () => {
  const codigo = ler('resultado-frota.js');
  const render = codigo.slice(codigo.indexOf('function renderResultado()'), codigo.indexOf('function renderRelatorio()'));
  assert.match(render, /visibilidade\.lista\(listaPlacas\)/);
  assert.match(render, /visibilidade\.acoes\(pl\)/);
  assert.doesNotMatch(codigo.slice(codigo.indexOf('function totalGeral('), codigo.indexOf('function opcoes(')), /FMResultadoVeiculos|resultadoListaOculto/);
  assert.doesNotMatch(codigo.slice(codigo.indexOf('function renderRelatorio()'), codigo.indexOf('function salvarProducao()')), /FMResultadoVeiculos|resultadoListaOculto/);
});
