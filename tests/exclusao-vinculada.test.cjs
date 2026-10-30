/* Executar com: node --test tests/exclusao-vinculada.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../exclusao-vinculada.js'), 'utf8');

function ambiente(dados, opcoes = {}) {
  const storage = new Map(), avisos = [], envios = [], dialogs = [];
  function elemento(tag) {
    return { tag, children: [], handlers: {}, style: {}, dataset: {},
      appendChild(x) { this.children.push(x); return x; },
      setAttribute() {}, addEventListener(k, f) { this.handlers[k] = f; },
      close() {}, remove() {},
      showModal() {
        dialogs.push(this);
        if (opcoes.aoAbrir) opcoes.aoAbrir();
        const acoes = this.children[this.children.length - 1];
        acoes.children[opcoes.cancelar ? 0 : 1].handlers.click();
      }
    };
  }
  const ctx = { db: dados, console, JSON, Date, Promise,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    document: { activeElement: null, createElement: elemento, body: elemento('body') },
    alert: x => avisos.push(x), confirm: () => true,
    fmModuloCarregado: m => m !== opcoes.bloqueado,
    salvarNuvem: async mods => { envios.push([...mods]); return true; },
    dispatchEvent() {}, CustomEvent: function (tipo, init) { this.detail = init.detail; }
  };
  ctx.window = ctx;
  vm.runInNewContext(source, ctx);
  return { ctx, avisos, envios, dialogs, storage };
}

function cadeia() {
  return { estoque: [{ eid: 'e1', _rid: 's1' }, { eid: 'e2' }],
    manutencoes: [{ _rid: 'm1', morigem: 'estoque', mestoqueid: 'e1' }],
    preLancamentos: [
      { id: 'p1', origemChave: 'manutencoes:m1', origemModulo: 'manutencoes', situacaoPre: 'pendente' },
      { id: 'p2', origemChave: 'manutencoes:antiga', origemModulo: 'manutencoes', digitalOrigem: 'manutencoes|2026-01-01|ABC1234|50.00|est:e1', situacaoPre: 'confirmado' },
      { id: 'p3', origemModulo: 'manutencoes', digitalOrigem: 'manutencoes|2026-01-01|ABC1234|50.00|est:e2' }
    ], custos: [
      { id: 'c1', origemChave: 'manutencoes:m1' },
      { id: 'c2', origemChave: 'manutencoes:antiga', origemModulo: 'manutencoes', digitalOrigem: 'manutencoes|2026-01-01|ABC1234|50.00|est:e1' },
      { id: 'manual', veiculo: 'ABC1234', data: '2026-01-01', valor: 50 }
    ], pneus: [], eventosPneus: [] };
}

test('exclui toda a cadeia, inclusive confirmados, sem seleção de módulos', async () => {
  const dados = cadeia(), a = ambiente(dados);
  assert.equal(await a.ctx.fmExcluirVinculado('estoque', 0), true);
  assert.equal(dados.estoque.length, 1);
  assert.equal(dados.manutencoes.length, 0);
  assert.deepEqual(dados.preLancamentos.map(x => x.id), ['p3']);
  assert.deepEqual(dados.custos.map(x => x.id), ['manual']);
  assert.deepEqual(a.envios[0].sort(), ['custos', 'estoque', 'manutencoes', 'preLancamentos']);
  assert.equal(a.ctx.fmFiltrarRegistrosExcluidos('manutencoes', [{ _rid: 'm1' }]).length, 0);
  const botoes = a.dialogs[0].children.at(-1).children.map(x => x.textContent);
  assert.deepEqual(botoes, ['Cancelar', 'Excluir origem e todos os vínculos']);
});

test('cancelar não modifica dados, fila ou proteção de exclusão', async () => {
  const dados = cadeia(), antes = JSON.stringify(dados), a = ambiente(dados, { cancelar: true });
  assert.equal(await a.ctx.fmExcluirVinculado('estoque', 0), false);
  assert.equal(JSON.stringify(dados), antes);
  assert.equal(a.envios.length, 0);
  assert.equal(a.storage.size, 0);
});

test('bloqueia exclusão enquanto os vínculos não terminaram de carregar', async () => {
  const dados = cadeia(), antes = JSON.stringify(dados), a = ambiente(dados, { bloqueado: 'custos' });
  assert.equal(await a.ctx.fmExcluirVinculado('estoque', 0), false);
  assert.equal(JSON.stringify(dados), antes);
  assert.equal(a.dialogs.length, 0);
});

test('revalida vínculos alterados durante a confirmação', async () => {
  const dados = cadeia();
  const a = ambiente(dados, { aoAbrir: () => dados.custos.push({ id: 'novo', origemChave: 'manutencoes:m1' }) });
  assert.equal(await a.ctx.fmExcluirVinculado('estoque', 0), false);
  assert.equal(dados.estoque.length, 2);
  assert.equal(a.envios.length, 0);
  assert.equal(a.storage.size, 0);
});

test('cadastro de pneu remove vínculos explícitos mesmo com IDs numéricos antigos', async () => {
  const dados = { pneus: [{ pid: 7 }], estoque: [{ eid: 'e1', epneuid: '7' }],
    manutencoes: [{ _rid: 'm1', morigem: 'estoque', mpneuid: '7' }],
    eventosPneus: [{ id: 'ev1', origem: 'cadastro_pneus', cadastroPneuId: '7' }, { id: 'manual' }],
    preLancamentos: [{ id: 'p1', origemModulo: 'manutencoes', origemRegistroId: 'm1' }],
    custos: [{ id: 'c1', origemModulo: 'manutencoes', origemRegistroId: 'm1' }] };
  const a = ambiente(dados);
  assert.equal(await a.ctx.fmExcluirVinculado('pneus', 0), true);
  for (const mod of ['pneus', 'estoque', 'manutencoes', 'preLancamentos', 'custos']) assert.equal(dados[mod].length, 0);
  assert.deepEqual(dados.eventosPneus.map(x => x.id), ['manual']);
});
