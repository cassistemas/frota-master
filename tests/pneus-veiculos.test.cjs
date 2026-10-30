/* Executar com: node --test tests/pneus-veiculos.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
function ambiente(dados = {}, opcoes = {}) {
  const eventos = {}, nos = {}, salvos = [], alertas = [];
  const db = Object.assign({ veiculos: [], pneus: [], eventosPneus: [] }, dados);
  const ctx = {
    db, console, setTimeout: () => {}, setInterval: () => {},
    confirm: () => true, alert: msg => alertas.push(msg),
    salvarNuvem: async mods => { salvos.push(mods.slice()); return opcoes.salvar !== false; },
    document: {
      readyState: 'loading', getElementById: id => nos[id] || null,
      querySelector: () => null, querySelectorAll: () => [],
      addEventListener: (tipo, fn) => { (eventos[tipo] ||= []).push(fn); }
    },
    addEventListener: () => {}, matchMedia: () => ({ matches: true }),
    FMCustosAPI: {
      filtros: () => ({ v: '', ini: '2026-01-01', fim: '2026-01-31' }),
      veiculos: () => [], kmPeriodo: () => 0
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('pneus-veiculos.js'), ctx);
  function no(id) {
    return nos[id] = { value: '', textContent: '', innerHTML: '',
      classList: { toggle: () => {} }, scrollIntoView: () => {} };
  }
  return { ctx, db, nos, no, salvos, alertas, eventos, api: ctx.FMPneusVeiculos };
}
const pneu = (placa = 'TRP-2H05') => ({ pid: 'p1', pnumero: 'PN-001', pstatus: 'Em Uso', pveiculo: placa, pvalor: 2500 });
const ciclo = (extra = {}) => Object.assign({ ativo: true, pneuId: 'PN-001', eventos: [{ tipo: 'Instalação', cadastroPneuId: 'p1' }] }, extra);

test('scripts da tela e da integração têm sintaxe válida', () => {
  for (const arquivo of ['pneus-veiculos.js', 'resultado-frota.js']) new vm.Script(ler(arquivo));
});

test('inclui cadastro Em Uso e veículos sem eventos, normalizando placas', () => {
  const { api } = ambiente({ veiculos: [{ vplaca: 'TRP-2H05' }, { vplaca: 'ABC-1234' }], pneus: [pneu('trp2h05'), pneu('DEF-5678')] });
  assert.deepEqual(Array.from(api.lista(['TRP2H05'])), ['ABC-1234', 'DEF-5678', 'TRP-2H05']);
});

test('respeita vendidos, ocultos e o filtro sem afetar registros', () => {
  const { api, db, no } = ambiente({
    veiculos: [{ vplaca: 'TRP-2H05' }, { vplaca: 'ABC-1234', pneusKmOculto: true }, { vplaca: 'DEF-5678', vstatus: ' Vendido ' }],
    pneus: [pneu(), pneu('ABC1234'), pneu('DEF5678')]
  });
  const antes = JSON.stringify(db);
  assert.deepEqual(Array.from(api.lista([])), ['TRP-2H05']);
  no('cusFiltroVeiculo').value = 'trp2h05';
  assert.deepEqual(Array.from(api.lista([])), ['TRP-2H05']);
  no('cusFiltroVeiculo').value = 'ZZZ9999';
  assert.equal(api.lista([]).length, 0);
  assert.equal(JSON.stringify(db), antes);
});

test('cadastro sem ciclo conta como ativo pendente sem inventar eventos ou custos', () => {
  const { api, db } = ambiente({ pneus: [pneu()] });
  const antes = JSON.stringify(db), resumo = api.resumoCadastro('TRP2H05', []);
  assert.equal(resumo.total, 1);
  assert.equal(resumo.semIntegracao.length, 1);
  assert.equal(JSON.stringify(db), antes);
});

test('vínculo por ID e número legado não duplica pneu já integrado', () => {
  const { api } = ambiente({ pneus: [pneu()] });
  for (const c of [ciclo(), ciclo({ pneuId: ' pn-001 ', eventos: [{ tipo: 'Instalação' }] })]) {
    const resumo = api.resumoCadastro('TRP-2H05', [c]);
    assert.equal(resumo.total, 1);
    assert.equal(resumo.semIntegracao.length, 0);
  }
  assert.equal(api.resumoCadastro('TRP-2H05', [ciclo({ eventos: [{ tipo: 'Instalação', cadastroPneuId: 'outro' }] })]).semIntegracao.length, 1);
});

test('retirada e legado sem instalação não ocultam integração pendente', () => {
  const { api } = ambiente({ pneus: [pneu()] });
  const retirado = api.resumoCadastro('TRP-2H05', [ciclo({ ativo: false })]);
  assert.equal(retirado.total, 1);
  assert.equal(retirado.semIntegracao.length, 1);
  const legado = api.resumoCadastro('TRP-2H05', [ciclo({ eventos: [{ tipo: 'Rodízio' }] })]);
  assert.equal(legado.total, 1);
  assert.equal(legado.semIntegracao.length, 1);
});

async function restaurar(amb, placa) {
  const botao = { disabled: false, dataset: { pneuRestaurar: placa }, hasAttribute: () => true };
  amb.eventos.click[0]({ target: { closest: () => botao } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(botao.disabled, false);
}

test('restauração usa salvamento compartilhado sem recriar pneus ou eventos', async () => {
  const amb = ambiente({
    veiculos: [{ vplaca: 'TRP-2H05', pneusKmOculto: true }],
    pneus: [Object.assign(pneu(), { pneusKmOculto: true })],
    eventosPneus: [{ id: 'e1', veiculo: 'TRP2H05', pneusKmOculto: true, valor: 2500 }]
  });
  assert.equal(amb.api.lista([]).length, 0);
  await restaurar(amb, 'TRP-2H05');
  assert.deepEqual(Array.from(amb.api.lista([])), ['TRP-2H05']);
  assert.deepEqual(Array.from(amb.salvos[0]), ['veiculos', 'eventosPneus', 'pneus']);
  assert.equal(amb.db.pneus.length, 1);
  assert.equal(amb.db.eventosPneus.length, 1);
  assert.equal(amb.db.eventosPneus[0].valor, 2500);
  assert.equal(amb.db.pneus[0].pneusKmOculto, false);
});

test('falha no salvamento devolve visibilidade anterior', async () => {
  const amb = ambiente({ veiculos: [{ vplaca: 'TRP-2H05', pneusKmOculto: true }], pneus: [pneu()] }, { salvar: false });
  const antes = JSON.stringify(amb.db);
  await restaurar(amb, 'TRP2H05');
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.api.lista([]).length, 0);
  assert.equal(amb.alertas.length, 1);
});

test('tela mostra cadastro pendente em vez de zero ativos e Regular, sem gravar', () => {
  const amb = ambiente({ veiculos: [{ vplaca: 'TRP-2H05' }], pneus: [pneu()] });
  for (const id of ['resPneuVeiculos', 'resPneuQtd', 'resPneuAviso']) amb.no(id);
  const antes = JSON.stringify(amb.db);
  vm.runInContext(ler('resultado-frota.js'), amb.ctx);
  amb.ctx.abrirVeiculoPneus('TRP-2H05');
  assert.match(amb.nos.resPneuVeiculos.innerHTML, /1 ativos/);
  assert.match(amb.nos.resPneuVeiculos.innerHTML, /Integração pendente/);
  assert.doesNotMatch(amb.nos.resPneuVeiculos.innerHTML, />Regular</);
  assert.equal(amb.nos.resPneuQtd.textContent, '1');
  assert.match(amb.nos.resPneuAviso.textContent, /PN-001/);
  assert.match(amb.nos.resPneuAviso.textContent, /somente os ciclos do histórico/);
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
