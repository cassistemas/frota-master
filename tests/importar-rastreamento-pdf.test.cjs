/* Executar: node --test tests/importar-rastreamento-pdf.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fonte = fs.readFileSync(path.join(__dirname, '..', 'importar-rastreamento-pdf.js'), 'utf8');
function ambiente() {
  const campos = {}, salvos = [], avisos = [];
  const ctx = {
    document: { readyState: 'loading', addEventListener() {}, getElementById(id) {
      return campos[id] ||= { hidden: false, textContent: '', innerHTML: '' };
    } },
    db: { custos: [], custosRecorrentes: [], veiculos: [{ vplaca: 'ABC-1234' }, { vplaca: 'DEF-5G67' }] },
    setTimeout() {}, alert: msg => avisos.push(msg), confirm: () => true,
    fmModuloCarregado: () => true,
    salvarNuvem: async mods => { salvos.push(mods); return true; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const acesso = `window.rastTeste = { interpretar:interpretar, lancar:lancar, desenhar:desenhar, bloqueio:bloqueioConferencia,
    carregar:function(linhas) { var r = interpretar(linhas); conferencia = r; totalPdf = r.total;
      grupos = r.grupos.slice(); arquivo = 'teste.pdf'; competenciaPdf = r.competencia;
      grupos.forEach(function(g) { g.data = r.competencia + '-01'; }); return r; },
    grupos:function() { return grupos; }, excluir:function() { grupos.shift(); },
    editar:function(c) { grupos[0].cents = c; }
  };`;
  vm.runInContext(fonte.replace('  function iniciar() {', acesso + '\n  function iniciar() {'), ctx);
  return { ctx, api: ctx.rastTeste, campos, salvos, avisos };
}
const cab = 'COMPETÊNCIA: 10/2026';
const item = (valor = '4.482,43', contrato = 'G123-1') =>
  `${contrato} 01/10/2026 123 123456789012 ABC-1234 1 Plano mensal 01/10/2026 31/10/2026 0,00 ${valor}`;
const resumo = valor => ['RESUMO', 'ABC-1234 1 4.482,43', `TOTAIS 2 ${valor}`];

test('sintaxe do importador permanece válida', () => { new vm.Script(fonte); });
test('completa leitura parcial sem repetir os itens já reconhecidos ou o resumo', () => {
  const { api, ctx } = ambiente();
  const r = api.interpretar([cab, item(), 'DEF 5G67 Serviço adicional 103,45', ...resumo('4.585,88')]);
  assert.equal(r.grupos.length, 2);
  assert.equal(r.soma, 458588);
  assert.equal(r.total, 458588);
  assert.equal(r.diferenca, 0);
  assert.equal(r.alternativas, 1);
  assert.equal(r.pendencias.length, 0);
  assert.equal(r.grupos[0].itens.length, 1);
  assert.match(r.grupos[1].itens[0].linhaOriginal, /103,45/);
  assert.equal(ctx.db.custos.length, 0);
});
test('reconhece as duas licenças com uma casa decimal e confere R$ 4.585,88', () => {
  const { api, ctx } = ambiente();
  const r = api.carregar([cab, item('4.536,68'),
    item('1,5', 'G123-2').replace('Plano mensal', 'Licença Acesso Gestor'),
    item('47,7', 'G123-3').replace('Plano mensal', 'Licença de Uso Omnisafe'),
    ...resumo('4.585,88')]);
  assert.equal(r.grupos.length, 1);
  assert.equal(r.grupos[0].itens.length, 3);
  assert.equal(r.grupos[0].itens[1].valor, 1.5);
  assert.equal(r.grupos[0].itens[2].valor, 47.7);
  assert.equal(r.soma, 458588);
  assert.equal(r.total, 458588);
  assert.equal(r.diferenca, 0);
  assert.equal(r.pendencias.length, 0);
  assert.equal(api.bloqueio(), '');
  assert.equal(ctx.db.custos.length, 0);
});
test('aceita uma casa decimal na leitura alternativa e ignora subtotal e resumo', () => {
  const { api } = ambiente();
  const r = api.interpretar([cab, 'ABC-1234 Licença Acesso Gestor 1,5',
    'DEF-5G67 Licença de Uso Omnisafe 47,7', 'SUBTOTAL ABC-1234 1,5',
    'RESUMO', 'ABC-1234 1 1,5', 'DEF-5G67 1 47,7', 'TOTAIS 2 49,2']);
  assert.equal(r.soma, 4920);
  assert.equal(r.total, 4920);
  assert.equal(r.diferenca, 0);
  assert.equal(r.alternativas, 2);
  assert.equal(r.pendencias.length, 0);
  assert.equal(r.grupos[0].itens.length, 1);
  assert.equal(r.grupos[1].itens.length, 1);
});
test('lê contrato quebrado com uma casa decimal sem duplicar a continuação', () => {
  const { api } = ambiente();
  const r = api.interpretar([cab, 'G123-1 01/10/2026 123 123456789012 ABC-1234 1 Licença Acesso Gestor',
    '01/10/2026 31/10/2026 0,00 1,5', 'RESUMO', 'TOTAIS 1 1,50']);
  assert.equal(r.soma, 150);
  assert.equal(r.pendencias.length, 0);
  assert.equal(r.grupos[0].itens.length, 1);
});
test('uma casa decimal não libera contratos incompletos nem valores com três casas', () => {
  const { api } = ambiente();
  for (const linha of [
    'G123-1 01/10/2026 123 ABC-1234 1 Licença Acesso Gestor 1,5',
    item('1,555')
  ]) {
    const r = api.carregar([cab, linha, 'RESUMO', 'TOTAIS 1 1,50']);
    assert.equal(r.soma, 0);
    assert.equal(r.pendencias.length, 1);
    assert.notEqual(api.bloqueio(), '');
  }
});
test('não duplica a mesma licença quando o zero final reaparece', () => {
  const { api } = ambiente();
  const r = api.interpretar([cab, item('1,5'), item('1,50'), 'RESUMO', 'TOTAIS 2 3,00']);
  assert.equal(r.soma, 150);
  assert.equal(r.grupos[0].itens.length, 1);
  assert.equal(r.pendencias.length, 1);
  assert.match(r.pendencias[0].motivo, /repetido/);
});
test('lê um contrato quebrado em duas linhas sem somar duas vezes', () => {
  const { api } = ambiente();
  const r = api.interpretar([cab, 'G123-1 01/10/2026 123 123456789012 ABC-1234 1 Plano mensal',
    '01/10/2026 31/10/2026 0,00 103,45', 'RESUMO', 'TOTAIS 1 103,45']);
  assert.equal(r.soma, 10345);
  assert.equal(r.pendencias.length, 0);
  assert.equal(r.grupos[0].itens.length, 1);
});
test('não soma subtotais e mantém leitura alternativa fora do resumo', () => {
  const { api } = ambiente();
  const r = api.interpretar([cab, 'ABC1234 Mensalidade 1234,56', 'SUBTOTAL ABC1234 1234,56',
    'TOTAL GERAL 1.234,56']);
  assert.equal(r.soma, 123456);
  assert.equal(r.total, 123456);
  assert.equal(r.pendencias.length, 0);
});
test('diferença de R$ 103,45 aparece e bloqueia qualquer gravação', async () => {
  const { api, ctx, salvos, campos } = ambiente();
  const r = api.carregar([cab, item(), ...resumo('4.585,88')]);
  assert.equal(r.diferenca, 10345);
  api.desenhar();
  assert.match(campos.cusRastResumo.textContent, /103,45/);
  assert.equal(campos.cusRastLancarTodos.disabled, true);
  assert.match(campos.cusRastLinhas.innerHTML, /data-rast-lancar="0" disabled/);
  await api.lancar(api.grupos());
  assert.equal(ctx.db.custos.length, 0);
  assert.equal(salvos.length, 0);
});
test('item ilegível não desaparece: mostra texto escapado e bloqueia mesmo com totais iguais', async () => {
  const { api, campos, salvos } = ambiente();
  const r = api.carregar([cab, item(), 'DEF-5G67 <script> cobrança ilegível', ...resumo('4.482,43')]);
  assert.equal(r.pendencias.length, 1);
  api.desenhar();
  assert.match(campos.cusRastPendencias.innerHTML, /&lt;script&gt;/);
  assert.match(campos.cusRastPendencias.innerHTML, /Linha extraída 3/);
  await api.lancar(api.grupos());
  assert.equal(salvos.length, 0);
});
test('total ausente e totais conflitantes impedem a confirmação', async () => {
  const { api, salvos } = ambiente();
  api.carregar([cab, item()]);
  assert.match(api.bloqueio(), /não identificado/);
  await api.lancar(api.grupos());
  const r = api.carregar([cab, item(), 'RESUMO', 'TOTAIS 1 4.585,88', 'TOTAIS 1 4.482,43']);
  assert.equal(r.pendencias.length, 1);
  await api.lancar(api.grupos());
  assert.equal(salvos.length, 0);
});
test('não duplica o mesmo contrato repetido e exige conferência', () => {
  const { api } = ambiente();
  const r = api.interpretar([cab, item('103,45'), item('103,45'), 'RESUMO', 'TOTAIS 2 206,90']);
  assert.equal(r.soma, 10345);
  assert.equal(r.grupos[0].itens.length, 1);
  assert.equal(r.pendencias.length, 1);
  assert.match(r.pendencias[0].motivo, /repetido/);
});
test('edição manual para fechar a diferença não libera uma leitura divergente', async () => {
  const { api, salvos } = ambiente();
  api.carregar([cab, item(), ...resumo('4.585,88')]);
  api.editar(458588);
  await api.lancar(api.grupos());
  assert.equal(salvos.length, 0);
});
test('leitura conferida também bloqueia valores editados até restaurar o original', async () => {
  const { api, salvos } = ambiente();
  api.carregar([cab, item(), ...resumo('4.482,43')]);
  api.editar(1);
  assert.match(api.bloqueio(), /Valor editado/);
  await api.lancar(api.grupos());
  assert.equal(salvos.length, 0);
  api.editar(448243);
  assert.equal(api.bloqueio(), '');
});
test('lançamentos parciais mantêm conferência original e proteção contra repetição', async () => {
  const { api, ctx, salvos } = ambiente();
  api.carregar([cab, item(), 'DEF-5G67 Serviço adicional 103,45', ...resumo('4.585,88')]);
  await api.lancar([api.grupos()[0]]);
  assert.equal(salvos.length, 1);
  assert.equal(ctx.db.custos.length, 1);
  assert.equal(ctx.db.custos[0].valor, 4482.43);
  assert.equal(api.grupos().length, 1);
  assert.equal(api.bloqueio(), '');
  await api.lancar(api.grupos());
  assert.equal(salvos.length, 2);
  assert.equal(ctx.db.custos.length, 2);
  api.carregar([cab, item(), 'DEF-5G67 Serviço adicional 103,45', ...resumo('4.585,88')]);
  await api.lancar(api.grupos());
  assert.equal(salvos.length, 2);
  assert.equal(ctx.db.custos.length, 2);
});
test('excluir da prévia não altera o total reconhecido nem custos existentes', () => {
  const { api, ctx, campos } = ambiente();
  api.carregar([cab, item(), 'DEF-5G67 Serviço adicional 103,45', ...resumo('4.585,88')]);
  api.excluir(); api.desenhar();
  assert.equal(api.bloqueio(), '');
  assert.match(campos.cusRastResumo.textContent, /4\.585,88/);
  assert.equal(api.grupos().length, 1);
  assert.equal(ctx.db.custos.length, 0);
});
