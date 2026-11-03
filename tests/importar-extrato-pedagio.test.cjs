/* Executar: node --test tests/importar-extrato-pedagio.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fonte = fs.readFileSync(path.join(__dirname, '..', 'importar-extrato-pedagio.js'), 'utf8');
function planilha(outros, passagens = [['ABC-1234', 'tag1', '10/01/2026 10:00', 'R1', 'P1', 100, 'CAMINHAO']]) {
  const resumo = new Map();
  for (const r of passagens) {
    const key = r[0] + '|' + r[6], x = resumo.get(key) || [r[0], r[6], 0, 0];
    x[2]++; x[3] += r[5]; resumo.set(key, x);
  }
  const Sheets = {
    PASSAGENS_PEDAGIO: { rows: [['PLACA', 'TAG', 'DATA', 'RODOVIA', 'PRACA', 'VALOR', 'CATEGORIA'], ...passagens] },
    RESUMO_PASSAGENS_PEDAGIO: { rows: [['PLACA', 'CATEGORIA', 'PASSAGENS', 'VALOR'], ...resumo.values()] }
  };
  if (outros) Sheets.OUTROS_SERVICOS = { rows: outros };
  return { Sheets };
}
const cab = ['PLACA', 'DATA', 'DESCRICAO', 'VALOR'];
function ambiente(ok = true) {
  const campos = {}, salvos = [], avisos = [];
  const ctx = { console, db: { custos: [], veiculos: [{ vplaca: 'ABC-1234' }, { vplaca: 'XYZ9999' }] },
    document: { readyState: 'loading', addEventListener() {}, getElementById(id) {
      return campos[id] ||= { textContent: '', innerHTML: '', hidden: false, closest() { return {}; } };
    } },
    XLSX: { utils: { sheet_to_json: sh => sh.rows.map(r => [...r]), encode_cell: () => 'A1' } },
    fmModuloCarregado: () => true, confirm: () => true,
    alert: msg => avisos.push(msg), salvarNuvem: async mods => { salvos.push(mods); return ok; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const acesso = `window.pedagioTeste = { ler:ler, previa:previa, confirmar:confirmar,
    carregar:function(wb) { var r = ler(wb, 'Extrato_397619.xlsx'); grupos = r.grupos; divergencias = r.divergencias; arquivo = 'Extrato_397619.xlsx'; return r; },
    data:function(p,d) { datasDevolucao[p] = d; }, mes:function(p,m) { competencias[p] = m; }
  };`;
  vm.runInContext(fonte.replace('  function iniciar() {', acesso + '\n  function iniciar() {'), ctx);
  return { ctx, api: ctx.pedagioTeste, salvos, avisos, campos };
}
test('scripts mantêm sintaxe válida', () => {
  new vm.Script(fonte);
  new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'custos-frota.js'), 'utf8'));
});
test('abate devoluções positivas da mesma placa e mantém resumo de passagens separado', () => {
  const { api } = ambiente();
  const r = api.ler(planilha([cab, ['abc1234', '11/01/2026', 'EIXO SUSPENSO', '17,29'], ['XYZ-9999', '12/01/2026', 'DEVOLUCAO', 5]]), 'a.xlsx');
  const a = api.previa(r.grupos.find(g => g.placa === 'ABC1234'));
  const b = api.previa(r.grupos.find(g => g.placa === 'XYZ9999'));
  assert.equal(a.bruto, 10000); assert.equal(a.devolucoes, 1729); assert.equal(a.liquido, 8271);
  assert.equal(b.bruto, 0); assert.equal(b.liquido, -500);
  assert.equal(r.divergencias.length, 0);
  assert.equal(a.detalhes[1].original.DESCRICAO, 'EIXO SUSPENSO');
});
test('extratos sem OUTROS_SERVICOS continuam com valor bruto', () => {
  const { api } = ambiente();
  const x = api.previa(api.ler(planilha(), 'a.xlsx').grupos[0]);
  assert.equal(x.liquido, 10000); assert.equal(x.devolucoes, 0);
});
test('devolução sem data exige data real informada e competência explícita para meses mistos', () => {
  const { api } = ambiente();
  const g = api.carregar(planilha([cab, ['ABC1234', '', 'EIXO SUSPENSO', 10]])).grupos[0];
  assert.equal(api.previa(g).dataOk, false);
  api.data(g.id, '2026-02-30'); assert.equal(api.previa(g).dataOk, false);
  api.data(g.id, '2026-02-10'); assert.equal(api.previa(g).dataOk, true);
  assert.equal(api.previa(g).mes, '');
  api.mes(g.id, '2026-02'); assert.equal(api.previa(g).mes, '2026-02');
});
test('valida placa, valor e duplicatas de devolução antes de qualquer gravação', () => {
  const { api, salvos } = ambiente();
  for (const row of [['', '11/01/2026', 'EIXO SUSPENSO', 10], ['ABC1234', '11/01/2026', 'EIXO SUSPENSO', 'abc']]) {
    assert.throws(() => api.ler(planilha([cab, row]), 'a.xlsx'));
  }
  const row = ['ABC1234', '11/01/2026', 'EIXO SUSPENSO', 10];
  assert.throws(() => api.ler(planilha([cab, row, row]), 'a.xlsx'), /indistinguíveis/);
  assert.equal(salvos.length, 0);
});
test('valores não positivos não viram devoluções e geram aviso', () => {
  const { api } = ambiente();
  const r = api.ler(planilha([cab, ['ABC1234', '11/01/2026', 'SERVICO', -10]]), 'a.xlsx');
  assert.equal(api.previa(r.grupos[0]).liquido, 10000);
  assert.equal(r.avisos.length, 1);
});
test('confirma valor líquido com rastreabilidade e bloqueia reimportação mesmo renomeada', async () => {
  const { api, ctx, salvos } = ambiente();
  const wb = planilha([cab, ['ABC1234', '11/01/2026', 'EIXO SUSPENSO', 17.29]]);
  api.carregar(wb);
  assert.equal(ctx.db.custos.length, 0);
  await api.confirmar(0);
  assert.equal(ctx.db.custos.length, 1);
  const registro = ctx.db.custos[0];
  assert.equal(registro.valor, 82.71);
  assert.equal(registro.valorDevolucoesPedagio, 17.29);
  assert.equal(registro.detalhesPedagio[1].valor, -17.29);
  assert.equal(registro.detalhesPedagio[1].original.DESCRICAO, 'EIXO SUSPENSO');
  assert.equal(salvos.length, 1);
  const g = api.ler(wb, 'renomeado.xlsx').grupos[0];
  assert.equal(api.previa(g).detalhes.length, 0);
  await api.confirmar(0);
  assert.equal(ctx.db.custos.length, 1);
});
test('passagens já importadas recebem somente o crédito pendente sem alterar o custo anterior', async () => {
  const { api, ctx } = ambiente();
  const original = api.ler(planilha(), 'antigo.xlsx').grupos[0].detalhes[0];
  ctx.db.custos.push({ id: 'antigo', origem: 'pedagio_importado', veiculo: 'ABC-1234', valor: 100, detalhesPedagio: [original] });
  api.carregar(planilha([cab, ['ABC1234', '11/01/2026', 'EIXO SUSPENSO', 17.29]]));
  await api.confirmar(0);
  assert.equal(ctx.db.custos.length, 2);
  assert.equal(ctx.db.custos[0].valor, 100);
  assert.equal(ctx.db.custos[1].valor, -17.29);
  assert.equal(ctx.db.custos[1].detalhesPedagio.length, 1);
});
test('créditos iguais ao bruto mantêm lançamento zero e consomem as referências', async () => {
  const { api, ctx } = ambiente();
  const wb = planilha([cab, ['ABC1234', '11/01/2026', 'EIXO SUSPENSO', 100]]);
  api.carregar(wb); await api.confirmar(0);
  assert.equal(ctx.db.custos[0].valor, 0);
  assert.equal(api.previa(api.ler(wb, 'a.xlsx').grupos[0]).detalhes.length, 0);
});
test('falha na gravação remove somente o registro novo e mantém a prévia pendente', async () => {
  const { api, ctx, avisos } = ambiente(false);
  const g = api.carregar(planilha([cab, ['ABC1234', '11/01/2026', 'EIXO SUSPENSO', 10]])).grupos[0];
  await api.confirmar(0);
  assert.equal(ctx.db.custos.length, 0);
  assert.equal(api.previa(g).detalhes.length, 2);
  assert.equal(avisos.length, 1);
});
test('apuração financeira conserva créditos negativos, zero e o filtro de datas', () => {
  const ctx = { console, db: { custos: [
    { id: 'credito', origem: 'pedagio_importado', valor: -10, detalhesPedagio: [{ data: '2026-01-11', valor: -10 }] },
    { id: 'zero', origem: 'pedagio_importado', valor: 0, detalhesPedagio: [{ data: '2026-01-10', valor: 10 }, { data: '2026-01-11', valor: -10 }] },
    { id: 'fora', origem: 'pedagio_importado', valor: 20, detalhesPedagio: [{ data: '2025-12-01', valor: 20 }] }
  ] }, document: { readyState: 'loading', addEventListener() {}, getElementById(id) {
    return { value: id === 'cusFiltroInicio' ? '2026-01-01' : id === 'cusFiltroFim' ? '2026-01-31' : '' };
  } } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'custos-frota.js'), 'utf8'), ctx);
  const itens = ctx.FMCustosAPI.todosBase();
  assert.equal(itens.find(x => x.id === 'credito').valor, -10);
  assert.equal(itens.find(x => x.id === 'zero').valor, 0);
  assert.equal(itens.some(x => x.id === 'fora'), false);
});
