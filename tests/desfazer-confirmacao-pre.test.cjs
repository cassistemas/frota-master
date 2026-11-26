const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
const fonte = ler('custos-frota.js');
const html = ler('index.html');
const trechoBanco = html.slice(html.indexOf('window.fmSalvarReversaoPre ='), html.indexOf('// A tela do modulo esta aberta?'));
const copiar = obj => JSON.parse(JSON.stringify(obj));

function iniciar({ banco, confirmar = true, falha = false, fila = [] } = {}) {
  const doc = { exists: true };
  const fonteOrigem = { id: 'a', cdata: '2026-12-10', cveiculo: 'ABC1D23', ctotal: 70 };
  const db = { ...copiar(banco), combustivel: [fonteOrigem], custosRecorrentes: [] };
  const alertas = [], avisos = [], escritas = [];
  const tabela = { innerHTML: '' };
  const ctx = vm.createContext({
    db, console: { error() {}, warn() {} }, auth: { currentUser: {} },
    dbCloud: {
      collection(nome) { assert.equal(nome, 'frota'); return { doc: nome => nome }; },
      async runTransaction(callback) {
        const propostas = [];
        const resultado = await callback({
          get: async nome => ({ ...doc, data: () => ({ dados: copiar(banco[nome]) }) }),
          set: (nome, payload) => propostas.push([nome, copiar(payload.dados)])
        });
        if (falha) throw Error('Transação recusada');
        for (const [nome, registros] of propostas) { banco[nome] = registros; escritas.push(nome); }
        return resultado;
      }
    },
    document: { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'cusLista' ? tabela : null },
    window: { fmAssinaturasBanco: {}, FMCompetenciaDespesas: { competencia: (_, x, dt) => dt.slice(0, 7), manual: () => false } },
    statusNuvem() {}, fmFilaLer: () => fila, fmAssinaturaModulo: JSON.stringify,
    confirm: aviso => { avisos.push(aviso); return confirmar; }, alert: msg => alertas.push(msg), setTimeout, clearTimeout
  });
  vm.runInContext(trechoBanco, ctx);
  vm.runInContext(fonte.replace(/\}\)\(\);\s*$/, 'window.teste = {renderTabela, prePendentes, aplicarConfirmacaoPre}; })();'), ctx);
  return { db, fonteOrigem, alertas, avisos, escritas, tabela, api: ctx.window, desfazer: ctx.window.desfazerConfirmacaoPreLancamento };
}

function dadosConfirmados() {
  const campos = { data: '2026-12-10', categoria: 'Combustível', tipo: 'variavel', veiculo: 'ABC1D23', valor: 70, digitalOrigem: 'combustivel|2026-12-10|ABC1D23|70.00', origemModulo: 'combustivel' };
  const pre = id => ({ ...campos, id: 'pre-' + id, origemChave: 'combustivel:' + id, origemRegistroId: id, origemNome: 'Combustível', competencia: '2026-12', situacaoPre: 'confirmado', confirmadoEm: '2026-12-11' });
  const custo = id => ({ ...pre(id), id: 'cus-' + id, origem: 'integrado', status: 'Realizado' });
  return { preLancamentos: [pre('a'), pre('b')], custos: [custo('a'), custo('b')] };
}

test('desfaz só o item escolhido do lote e mantém o pré-lançamento após recarregar', async () => {
  const banco = dadosConfirmados();
  banco.custos[0] = { ...banco.custos[0], valor: 95.35, descricao: 'Corrigido', competencia: '2027-01', parcelas: 2 };
  const outro = copiar({ custo: banco.custos[1], pre: banco.preLancamentos[1] });
  const app = iniciar({ banco });
  const base = app.api.FMCustosAPI.todosBase();
  app.api.teste.renderTabela(base);
  assert.match(app.tabela.innerHTML, /data-custo-id="cus-a"[^>]*>↶ Desfazer confirmação/);
  assert.equal(await app.desfazer('cus-a'), true);
  assert.match(app.avisos[0], /Todas as parcelas/);
  assert.deepEqual(app.escritas, ['custos', 'preLancamentos']);
  assert.deepEqual(banco.custos, [outro.custo]);
  assert.deepEqual(banco.preLancamentos[1], outro.pre);
  assert.equal(app.fonteOrigem.ctotal, 70);
  assert.equal(app.api.FMCustosAPI.todosBase().reduce((s, x) => s + x.valor, 0), 70);

  const recarregado = iniciar({ banco });
  recarregado.api.fmSincronizarPreLancamentos();
  const pre = recarregado.api.teste.prePendentes();
  assert.equal(pre.length, 1);
  assert.equal(pre[0].id, 'pre-a');
  assert.equal(pre[0].confirmadoEm, undefined);
  assert.equal(pre[0].valor, 95.35);
  assert.equal(pre[0].descricao, 'Corrigido');
  assert.equal(pre[0].competencia, '2027-01');
  assert.equal(pre[0].competenciaManual, true);
  assert.equal(recarregado.api.teste.aplicarConfirmacaoPre('pre-a', false).ok, true);
  assert.equal(recarregado.db.custos.length, 2);
  assert.equal(recarregado.db.custos[1].parcelas, 2);
});

test('não oferece a ação para custo manual nem para vínculo ambíguo', async () => {
  const banco = dadosConfirmados();
  banco.custos.push({ ...banco.custos[0], id: 'duplicado' });
  banco.custos[1].origem = 'manual';
  const app = iniciar({ banco });
  app.api.teste.renderTabela(app.api.FMCustosAPI.todosBase());
  assert.doesNotMatch(app.tabela.innerHTML, /Desfazer confirmação/);
  assert.equal(await app.desfazer('cus-a'), false);
  assert.equal(await app.desfazer('cus-b'), false);
  assert.deepEqual(app.escritas, []);
});

test('cancelamento, fila pendente e falha de gravação deixam as duas listas intactas', async () => {
  for (const opcoes of [{ confirmar: false }, { fila: ['custos'] }, { falha: true }]) {
    const banco = dadosConfirmados();
    const antes = copiar(banco);
    const app = iniciar({ banco, ...opcoes });
    assert.equal(await app.desfazer('cus-a'), false);
    assert.deepEqual(banco, antes);
    assert.deepEqual(app.escritas, []);
    assert.equal(app.db.custos.length, 2);
    assert.equal(app.api.teste.prePendentes().length, 0);
  }
});
