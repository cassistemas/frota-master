/* Executar com: node --test tests/combustivel-confirmacao.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function trecho(inicio, fim) {
  const a = html.indexOf(inicio), b = html.indexOf(fim, a + inicio.length);
  assert.ok(a >= 0 && b > a);
  return html.slice(a, b);
}
const proximoCiclo = () => new Promise(resolve => setImmediate(resolve));
function nuvem() {
  const estados = [], envios = [], timers = new Map(), fila = new Set();
  let id = 0;
  const ctx = {
    db: { combustivel: [{ _rid: 'a', ctotal: 100 }] },
    MAP: { combustivel: 'FM_C' }, auth: { currentUser: { uid: 'u' } },
    fmModulosCarregados: { combustivel: true }, fmAssinaturasBanco: {},
    fmAssinaturaModulo: lista => JSON.stringify(lista),
    fmFilaLer: () => Array.from(fila),
    fmFilaAdicionar: mods => mods.forEach(m => fila.add(m)),
    fmFilaRemover: mods => mods.forEach(m => fila.delete(m)),
    statusNuvem() {}, console: { warn() {}, error() {} },
    setTimeout(fn) { timers.set(++id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    dbCloud: { collection: () => ({ doc: mod => ({ set: payload => new Promise((resolve, reject) => {
      envios.push({ mod, payload, resolve, reject });
    }) }) }) }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(trecho('function salvarNuvem(', '// Edicao pontual de um custo existente.'), ctx);
  const salvar = () => ctx.salvarNuvem(['combustivel'], { aoEstado: e => estados.push(e) });
  return { ctx, estados, envios, fila, timers, salvar };
}
test('só confirma após resposta do servidor e cancela o temporizador', async () => {
  const a = nuvem(), p = a.salvar();
  await proximoCiclo();
  assert.deepEqual(a.estados, ['enviando']);
  assert.equal(a.fila.has('combustivel'), true);
  a.envios[0].resolve();
  assert.equal(await p, true);
  assert.deepEqual(a.estados, ['enviando', 'confirmado']);
  assert.equal(a.fila.size, 0);
  assert.equal(a.timers.size, 0);
});
test('demora não é erro e uma confirmação tardia atualiza o mesmo envio uma vez', async () => {
  const a = nuvem(), p = a.salvar();
  await proximoCiclo();
  Array.from(a.timers.values()).forEach(fn => fn());
  assert.equal(await p, false);
  assert.deepEqual(a.estados, ['enviando', 'pendente']);
  assert.equal(a.fila.has('combustivel'), true);
  a.envios[0].resolve();
  await proximoCiclo();
  assert.deepEqual(a.estados, ['enviando', 'pendente', 'confirmado']);
  assert.equal(a.envios.length, 1);
  assert.equal(a.fila.size, 0);
});
test('erro real mantém a fila e não anuncia confirmação', async () => {
  const a = nuvem(), p = a.salvar();
  await proximoCiclo();
  a.envios[0].reject({ code: 'permission-denied' });
  assert.equal(await p, false);
  assert.deepEqual(a.estados, ['enviando', 'erro']);
  assert.equal(a.fila.has('combustivel'), true);
});
test('confirmação antiga não remove alteração mais nova da fila', async () => {
  const a = nuvem(), p = a.salvar();
  await proximoCiclo();
  a.ctx.db.combustivel[0].ctotal = 200;
  a.envios[0].resolve();
  assert.equal(await p, true);
  assert.equal(a.envios[0].payload.dados[0].ctotal, 100);
  assert.equal(a.ctx.fmAssinaturasBanco.combustivel, JSON.stringify([{ _rid: 'a', ctotal: 100 }]));
  assert.equal(a.fila.has('combustivel'), true);
});
test('sem login ou sem leitura inicial, não anuncia que enviou', async () => {
  for (const motivo of ['login', 'leitura']) {
    const a = nuvem();
    if (motivo === 'login') a.ctx.auth.currentUser = null;
    else a.ctx.fmModulosCarregados.combustivel = false;
    assert.equal(await a.salvar(), false);
    assert.deepEqual(a.estados, ['fila']);
    assert.equal(a.envios.length, 0);
    assert.equal(a.fila.has('combustivel'), true);
  }
});
function formulario(comArla = false, indice = '') {
  const valores = { c_idx: indice, cveiculo: 'ABC1234', cdata: '2026-01-02',
    ctipo: 'Diesel S10', clitros: '10', cvalorlitro: '6', ckm: '1000',
    cposto: 'Posto Teste', ccompetencia: '2026-01',
    carlaLitros: comArla ? '2' : '', carlaValor: comArla ? '4' : '' };
  const elementos = Object.fromEntries(Object.entries(valores).map(([k, value]) => [k, { value }]));
  elementos.cFotoAviso = { textContent: '', setAttribute() {} };
  let id = 0;
  const envios = [], limpezas = [];
  const ctx = { document: { getElementById: k => elementos[k] || null },
    db: { combustivel: [], veiculos: [] },
    confirmarKmCombustivel: () => true,
    fmPrepararRegistro: (_mod, obj, anterior) => Object.assign(obj, {
      _rid: anterior ? anterior._rid : obj._rid || 'produto-' + (++id)
    }),
    FMCompetenciaDespesas: {
      camposFormulario: (_mod, campos) => campos.concat('ccompetencia'), validar: () => true
    },
    salvarNuvem(mods, opcoes) {
      envios.push({ mods: Array.from(mods), dados: JSON.parse(JSON.stringify(ctx.db.combustivel)), opcoes });
      opcoes.aoEstado('enviando');
      return Promise.resolve(true);
    },
    limparForm: (...args) => limpezas.push(args),
    obterCombustiveisFiltrados: () => ctx.db.combustivel.slice(),
    renderModulo() {}, atualizarResumoCombustivel() {}, alert: () => assert.fail('Validação inesperada')
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(trecho('function salvar(mod, campos, idCampo, contexto)', 'function feriasParaUtc('), ctx);
  vm.runInContext(trecho('function salvarCombustivelCustom(', 'function filtrarCombustivel('), ctx);
  return { ctx, envios, elementos, limpezas };
}
test('cupom simples ou com ARLA envia uma vez, com totais e identidades prontos', () => {
  for (const comArla of [false, true]) {
    const a = formulario(comArla);
    a.ctx.salvarCombustivelCustom();
    assert.equal(a.envios.length, 1);
    assert.deepEqual(a.envios[0].mods, ['combustivel']);
    const dados = a.envios[0].dados;
    assert.equal(dados.length, comArla ? 2 : 1);
    assert.equal(dados[0].ctotal, 60);
    assert.equal(dados[0].ccompetencia, '2026-01');
    if (comArla) {
      assert.equal(dados[1].ctotal, 8);
      assert.equal(dados[1].ctipo, 'Arla32');
      assert.notEqual(dados[0]._rid, dados[1]._rid);
      assert.equal(dados[1].cveiculo, dados[0].cveiculo);
      assert.equal(dados[1].ccompetencia, dados[0].ccompetencia);
    }
    assert.match(a.elementos.cFotoAviso.textContent, /Aguardando/);
    a.envios[0].opcoes.aoEstado('confirmado');
    assert.match(a.elementos.cFotoAviso.textContent, /confirmad/);
  }
});
test('edição preserva identidade e atualiza total antes do único envio', () => {
  const a = formulario(false, '0');
  a.ctx.db.combustivel.push({ _rid: 'original', ctotal: 1, _registradoPor: 'Autor' });
  a.ctx.salvarCombustivelCustom();
  assert.equal(a.envios.length, 1);
  assert.equal(a.envios[0].dados.length, 1);
  assert.equal(a.envios[0].dados[0]._rid, 'original');
  assert.equal(a.envios[0].dados[0]._registradoPor, 'Autor');
  assert.equal(a.envios[0].dados[0].ctotal, 60);
});
test('cancelar a conferência do KM não grava, limpa nem inclui ARLA', () => {
  const a = formulario(true);
  a.ctx.confirmarKmCombustivel = () => false;
  assert.equal(a.ctx.salvarCombustivelCustom(), false);
  assert.equal(a.envios.length, 0);
  assert.equal(a.limpezas.length, 0);
  assert.equal(a.ctx.db.combustivel.length, 0);
});
test('repetir cupom ainda pendente continua bloqueado sem novo envio', () => {
  const a = formulario(true);
  a.ctx.salvarCombustivelCustom();
  let alertas = 0;
  a.ctx.alert = () => { alertas++; };
  a.ctx.salvarCombustivelCustom();
  assert.equal(alertas, 1);
  assert.equal(a.envios.length, 1);
  assert.equal(a.ctx.db.combustivel.length, 2);
});
