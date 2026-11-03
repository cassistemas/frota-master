/* Executar: node --test tests/competencia-despesas.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
const helper = ler('competencia-despesas.js');
const custos = ler('custos-frota.js');
const html = ler('index.html');
const specs = {
  combustivel: { cveiculo: 'ABC1234', cdata: '2026-10-10', ctotal: 100, ccompetencia: '2026-11' },
  manutencoes: { mveiculo: 'ABC1234', mdata: '2026-10-10', mvalor: 100, mcompetencia: '2026-11' },
  multas: { muveiculo: 'ABC1234', mudata: '2026-10-10', muvalor: 100, mucompetencia: '2026-11' },
  licenciamento: { lveiculo: 'ABC1234', lvencimento: '2026-10-10', lvalor: 100, lcompetencia: '2026-11' },
  tacografo: { tveiculo: 'ABC1234', tdataafericao: '2026-10-10', tvalor: 100, tcompetencia: '2026-11' },
  licencas: { leveiculo: 'ABC1234', venciv: '2026-10-10', levalor: 100, lecompetencia: '2026-11' },
  diarias: { diveiculo: 'ABC1234', didata: '2026-10-10', divalor: 100, dicompetencia: '2026-11' },
  revisoes: { rveiculo: 'ABC1234', rdata: '2026-10-10', rvalor: 100, rcompetencia: '2026-11' }
};
function ambiente(dados = {}) {
  const campos = {}, avisos = [];
  const db = Object.assign({ custos: [], preLancamentos: [], custosRecorrentes: [], veiculos: [] }, dados);
  const ctx = { db, console, Date, setTimeout() {}, clearTimeout() {},
    alert: msg => avisos.push(msg), confirm: () => true,
    fmModuloCarregado: () => true,
    FMManutencaoTipos: { categoria: () => 'Manutenção corretiva' },
    document: { readyState: 'loading', addEventListener() {}, getElementById: id => campos[id] || null },
    salvarNuvem() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('civ-competencia.js'), ctx);
  vm.runInContext(helper, ctx);
  vm.runInContext(custos.replace('function candidatosPreLancamento(){',
    'window.teste={candidatos:candidatosPreLancamento,sincronizar:sincronizarPreLancamentos,editar:editarPre,filtrar:preFiltrados,confirmar:aplicarConfirmacaoPre,filtrados:filtrados,periodo:periodoCompleto,validar:validarPre};function candidatosPreLancamento(){'), ctx);
  return { ctx, db, campos, avisos, api: ctx.teste, helper: ctx.FMCompetenciaDespesas };
}
test('scripts alterados mantêm sintaxe válida', () => {
  for (const arquivo of ['competencia-despesas.js', 'custos-frota.js', 'revisoes.js', 'estoque-pro.js', 'fretes-terceiros.js', 'pneus-sync.js', 'pneus-lote.js', 'pneus-frota.js', 'resultado-frota.js']) new vm.Script(ler(arquivo));
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[1].trim()) new vm.Script(m[1]);
  }
});
test('os oito módulos usam mês manual anterior ou posterior sem alterar a data', () => {
  for (const comp of ['2026-09', '2026-11']) {
    const dados = Object.fromEntries(Object.entries(specs).map(([mod, registro]) => [mod, [Object.assign({ id: mod }, registro,
      Object.fromEntries(Object.keys(registro).filter(k => k.endsWith('competencia')).map(k => [k, comp])))]]));
    const a = ambiente(dados), antes = JSON.stringify(a.db);
    const itens = a.api.candidatos();
    assert.equal(itens.length, 8);
    for (const item of itens) {
      assert.equal(item.competencia, comp);
      assert.equal(item.competenciaManual, true);
      assert.equal(item.data, '2026-10-10');
    }
    assert.equal(JSON.stringify(a.db), antes);
  }
});
test('campo vazio ou registro antigo mantém o mês da data e fallback dos documentos', () => {
  const dados = Object.fromEntries(Object.entries(specs).map(([mod, registro]) => [mod,
    [Object.fromEntries(Object.entries(registro).filter(([k]) => !k.endsWith('competencia')))]]));
  dados.multas[0].mudata = ''; dados.multas[0].muvenc = '2026-10-20';
  dados.tacografo[0].tdataafericao = ''; dados.tacografo[0].tvencimento = '2026-10-21';
  dados.licencas[0].venciv = ''; dados.licencas[0].vencipp = '2026-10-22';
  const a = ambiente(dados), itens = a.api.candidatos();
  assert.equal(itens.length, 8);
  for (const item of itens) { assert.equal(item.competencia, '2026-10'); assert.equal(item.competenciaManual, false); }
  assert.equal(itens.find(x => x.origemModulo === 'licencas').data, '2026-10-22');
});
test('mantém normalização de competências antigas de CIV/CIPP', () => {
  const a = ambiente({ licencas: [Object.assign({}, specs.licencas, { lecompetencia: '11/2026' })] });
  assert.equal(a.api.candidatos()[0].competencia, '2026-11');
  assert.equal(a.api.candidatos()[0].data, '2026-10-10');
});
test('sincronização atualiza pendentes sem duplicar nem sobrescrever ajustes da Frota', () => {
  const a = ambiente({ combustivel: [Object.assign({ id: 'c1' }, specs.combustivel)] });
  a.api.sincronizar();
  assert.equal(a.db.preLancamentos.length, 1);
  const pre = a.db.preLancamentos[0];
  a.db.combustivel[0].ccompetencia = '2026-12';
  a.api.sincronizar(); assert.equal(pre.competencia, '2026-12');
  a.api.editar(pre.id, 'competencia', '2026-09');
  a.api.editar(pre.id, 'data', '2026-08-10');
  a.api.sincronizar();
  assert.equal(pre.competencia, '2026-09'); assert.equal(pre.data, '2026-08-10');
  a.api.editar(pre.id, 'competencia', '');
  a.api.editar(pre.id, 'data', '2026-07-10');
  assert.equal(pre.competencia, '2026-07'); assert.equal(pre.competenciaManual, false);
  assert.equal(a.db.preLancamentos.length, 1);
});
test('pré-lançamento e custo confirmado seguem competência; caixa mantém a data original', () => {
  const a = ambiente({ combustivel: [Object.assign({ id: 'c1' }, specs.combustivel)] });
  a.api.sincronizar();
  const pre = a.db.preLancamentos[0];
  a.campos.cusFiltroInicio = { value: '2026-11-01' };
  a.campos.cusFiltroFim = { value: '2026-11-30' };
  a.campos.cusFiltroModo = { value: 'competencia' };
  assert.equal(a.api.filtrar().length, 1);
  a.campos.cusFiltroModo.value = 'caixa';
  assert.equal(a.api.filtrar().length, 0);
  assert.equal(a.api.confirmar(pre.id, false).ok, true);
  assert.equal(a.db.custos.length, 1);
  assert.equal(a.db.custos[0].data, '2026-10-10');
  assert.equal(a.db.custos[0].competencia, '2026-11');
  const filtro = { ini: '2026-11-01', fim: '2026-11-30', modo: 'competencia' };
  assert.equal(a.api.filtrados('', filtro, a.db.custos).length, 1);
  assert.equal(a.api.filtrados('', Object.assign({}, filtro, { modo: 'caixa' }), a.db.custos).length, 0);
  a.api.sincronizar();
  a.api.confirmar(pre.id, false);
  assert.equal(a.db.custos.length, 1);
  assert.equal(a.db.preLancamentos.length, 1);
  assert.equal(a.api.periodo().fim, '2026-11-01');
});
test('edição de registro antigo limpa competência residual e valida mês sem restringir passado/futuro', () => {
  const a = ambiente();
  for (const [mod, registro] of Object.entries(specs)) {
    const id = Object.keys(registro).find(k => k.endsWith('competencia'));
    a.campos[id] = { value: '2026-01' };
    const lista = ['outro'];
    assert.equal(a.helper.camposFormulario(mod, lista).includes(id), true);
    assert.equal(lista.length, 1);
    a.helper.preencher(mod, registro);
    assert.equal(a.campos[id].value, '2026-11');
    a.helper.preencher(mod, {});
    assert.equal(a.campos[id].value, '');
    assert.equal(a.helper.validar(mod, { [id]: '2026-13' }), false);
    assert.equal(a.helper.validar(mod, { [id]: '' }), true);
    assert.equal(a.helper.validar(mod, { [id]: '2025-01' }), true);
    assert.equal(a.helper.validar(mod, { [id]: '2027-12' }), true);
  }
  assert.match(a.api.validar({ data: '2026-10-10', competencia: '2026-13', categoria: 'Multas', valor: 100 }), /Competência inválida/);
});
test('pneus, estoque, saídas e fretes preservam a competência opcional', () => {
  const a = ambiente();
  for (const [mod, campo] of Object.entries({ pneus: 'pcompetencia', estoque: 'ecompetencia', estoqueSaida: 'ecompetencia', eventosPneus: 'competencia', fretes: 'frecompetencia' })) {
    for (const comp of ['2026-09', '2026-11']) {
      const registro = { [campo]: comp, data: '2026-10-10' };
      assert.equal(a.helper.competencia(mod, registro, registro.data), comp);
      assert.equal(registro.data, '2026-10-10');
    }
    assert.equal(a.helper.competencia(mod, {}, '2026-10-10'), '2026-10');
  }
});
test('pneus contabilizam valor uma vez no mês manual e mantêm caixa na data do evento', () => {
  const a = ambiente();
  const eventos = [{ veiculo: 'ABC1234', tipo: 'Instalação', data: '2026-10-10', competencia: '2026-11', valor: 100 }];
  Object.assign(a.ctx, { a: () => eventos, placaNormalizada: x => x, n: Number, mes: x => x.slice(0, 7),
    noPeriodo: (d, f) => d >= f.ini && d <= f.fim,
    ciclosPneus: () => [{ eventos, vida: 10000, valor: 100 }], kmCicloPeriodo: () => 1000 });
  const fonte = ler('resultado-frota.js');
  vm.runInContext(fonte.slice(fonte.indexOf('function custoPneusPeriodo('), fonte.indexOf('function aceitaCustoCalculado(')), a.ctx);
  const outubro = { ini: '2026-10-01', fim: '2026-10-31' }, novembro = { ini: '2026-11-01', fim: '2026-11-30' };
  assert.equal(a.ctx.custoPneusPeriodo('ABC1234', outubro, 'competencia'), 0);
  assert.equal(a.ctx.custoPneusPeriodo('ABC1234', novembro, 'competencia'), 100);
  assert.equal(a.ctx.custoPneusPeriodo('ABC1234', outubro, 'caixa'), 100);
  assert.equal(a.ctx.custoPneusPeriodo('ABC1234', novembro, 'caixa'), 0);
  eventos[0].competencia = '';
  assert.equal(a.ctx.custoPneusPeriodo('ABC1234', outubro, 'competencia'), 10);
});
test('comparativo de Terceiros usa competência manual e mantém data no caixa', () => {
  const a = ambiente();
  const fretes = [{ fredata: '2026-10-10', frecompetencia: '2026-11', freexecucao: 'terceiro' }];
  Object.assign(a.ctx, { arr: () => fretes, data: x => x, normalizarPlaca: x => x });
  const inicio = custos.indexOf('function fretesPeriodo(');
  vm.runInContext(custos.slice(inicio, custos.indexOf('function vazioComparativo(', inicio)), a.ctx);
  const f = { ini: '2026-11-01', fim: '2026-11-30', modo: 'competencia' };
  assert.equal(a.ctx.fretesPeriodo(f).length, 1);
  assert.equal(a.ctx.fretesPeriodo(Object.assign({}, f, { modo: 'caixa' })).length, 0);
  assert.equal(fretes[0].fredata, '2026-10-10');
});
test('escritores próprios de tacógrafo e multas preservam competência, IDs e metadados ao editar', () => {
  const a = ambiente({ tacografo: [{ _rid: 't1', extra: 'preservar' }], multas: [{ _rid: 'mu1', extra: 'preservar' }] });
  a.ctx.fmPrepararRegistro = (mod, obj) => obj;
  a.ctx.limparForm = () => {};
  a.ctx.renderModulo = () => {};
  for (const [id, value] of Object.entries({ t_idx: '0', tveiculo: 'ABC1234', tdataafericao: '2026-10-10', tperiodo: '2', tperiodounidade: 'anos', tvencimento: '2028-10-10', tvalor: '100', tcompetencia: '2026-11', muarquivos: '' })) {
    a.campos[id] = { value };
  }
  vm.runInContext(html.slice(html.indexOf('function salvarTacografo()'), html.indexOf('function formatarVencimento(')), a.ctx);
  a.ctx.salvarTacografo();
  assert.equal(a.db.tacografo[0].tcompetencia, '2026-11');
  assert.equal(a.db.tacografo[0].tdataafericao, '2026-10-10');
  assert.equal(a.db.tacografo[0]._rid, 't1');
  assert.equal(a.db.tacografo[0].extra, 'preservar');
  vm.runInContext(html.slice(html.indexOf('function salvarRegistroMulta('), html.indexOf('function salvarTerceirosCustom(')), a.ctx);
  a.ctx.salvarRegistroMulta(Object.assign({}, specs.multas), '0');
  assert.equal(a.db.multas[0].mucompetencia, '2026-11');
  assert.equal(a.db.multas[0].mudata, '2026-10-10');
  assert.equal(a.db.multas[0]._rid, 'mu1');
  assert.equal(a.db.multas[0].extra, 'preservar');
});
