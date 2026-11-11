/* Executar: node --test tests/importar-planilha-fretes.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
function ambiente(dados = {}) {
  const ctx = {
    db: Object.assign({ veiculos: [], terceiros: [], fretes: [] }, dados),
    console, Date, Event: function () {},
    document: { readyState: 'loading', documentElement: {}, addEventListener() {}, getElementById() { return null; } },
    MutationObserver: function () { this.observe = function () {}; },
    addEventListener() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('importar-planilha-fretes.js'), ctx);
  return { api: ctx.FMPlanilhaFretes, db: ctx.db };
}
function planilha(extra = []) {
  return [['Viagem', 'V001'], ['Veículo', 'ABC-1234'], ['Linha', 'Sul'],
    ['CT-e', 'Peso', 'Valor do Frete', 'Cidade Origem', 'Estado Origem', 'Cidade Destino', 'Estado Destino', 'Valor da Viagem'],
    ['101', 1000, 100, 'Curitiba', 'PR', 'São Paulo', 'SP', 150],
    ['102', 2000, 200, 'Curitiba', 'PR', 'São Paulo', 'SP', 150], ...extra];
}
test('scripts modificados continuam com sintaxe válida', () => {
  for (const nome of ['importar-planilha-fretes.js', 'fretes-terceiros.js', 'custos-frota.js']) new vm.Script(ler(nome));
});
test('cada CT-e entra uma vez e Valor da Viagem não aumenta a receita', () => {
  const { api } = ambiente();
  const itens = api.ler(planilha([['101', 1000, 100, 'Curitiba', 'PR', 'São Paulo', 'SP', 150], ['Total', '', 300]]));
  assert.equal(itens.length, 2);
  assert.equal(itens.reduce((s, x) => s + x.frete, 0), 30000);
  assert.equal(itens.reduce((s, x) => s + x.custo, 0), 15000);
  assert.equal(itens[0].custo, 5000);
  assert.equal(itens[1].custo, 10000);
  assert.equal(itens[0].divergente, false);
  assert.equal(itens[0].origem, 'Curitiba-PR');
  assert.equal(itens[0].destino, 'São Paulo-SP');
});
test('rateio mantém o total em centavos e contratos divergentes ficam pendentes', () => {
  const { api } = ambiente();
  const rows = planilha(); rows[4][2] = 1; rows[5][2] = 2;
  rows[4][7] = 1; rows[5][7] = 1;
  const itens = api.ler(rows);
  assert.equal(itens[0].custo + itens[1].custo, 100);
  rows[5][7] = 2;
  assert.ok(api.ler(rows).every(x => Number.isNaN(x.custo)));
});
test('placas próprias ignoram pontuação e desconhecidas não criam cadastros', () => {
  const { api, db } = ambiente({ veiculos: [{ vplaca: 'abc1234', vtipo: 'Truck' }] });
  const item = api.ler(planilha())[0];
  assert.equal(api.identificar(item).propria, true);
  item.placa = 'XYZ-9A99';
  assert.equal(api.identificar(item).propria, false);
  assert.equal(db.terceiros.length, 0);
  assert.equal(db.fretes.length, 0);
});
test('competência preenche período mensal e não inventa horários reais', () => {
  const { api } = ambiente(); const item = {};
  api.periodo(item, '2028-02');
  assert.equal(item.inicio, '2028-02-01');
  assert.equal(item.fim, '2028-02-29');
  assert.equal(item.data, '2028-02-01');
  assert.equal(item.carregamento, undefined);
  api.periodo(item, '2026-13'); assert.equal(item.inicio, '');
});
test('bloqueia duplicados, divergências e pagamentos não conferidos', () => {
  const { api, db } = ambiente({ terceiros: [{ terempresa: 'Transportes', terplaca: 'ABC1234' }] });
  const item = api.ler(planilha())[0]; api.periodo(item, '2026-11');
  assert.equal(api.motivo(item), 'Confirme Valor da Viagem como pagamento');
  item.aceitarRateio = true; assert.equal(api.motivo(item), 'Pronto');
  db.fretes.push({ freobs: 'CT-e: 101 | Viagem: V001' });
  assert.equal(api.jaExiste(item), true);
  assert.equal(api.motivo(item), 'Duplicado: já cadastrado');
  db.fretes.length = 0;
  db.fretes.push({ freplanilha: { cte: '101' } }); assert.equal(api.jaExiste(item), true);
  db.fretes.length = 0;
  const conflitantes = api.ler(planilha([['101', 1000, 999, 'Curitiba', 'PR', 'São Paulo', 'SP', 150]]));
  assert.equal(conflitantes[0].divergente, true);
  assert.equal(api.motivo(conflitantes[0]), 'Divergência entre CT-e repetidos');
});
test('pagamento ausente nunca é assumido como zero', () => {
  const { api } = ambiente({ terceiros: [{ terempresa: 'Transportes', terplaca: 'ABC1234' }] });
  const rows = planilha(); rows[4][7] = ''; rows[5][7] = '';
  const item = api.ler(rows)[0]; api.periodo(item, '2026-11');
  assert.ok(Number.isNaN(item.custo));
  assert.equal(api.motivo(item), 'Informe o valor pago ao terceiro');
});
test('placa desconhecida pode ser confirmada sem cadastro ou vínculo manual', () => {
  const { api, db } = ambiente();
  const item = api.ler(planilha())[0]; api.periodo(item, '2026-11');
  assert.equal(api.motivo(item), 'Confirme Valor da Viagem como pagamento');
  item.aceitarRateio = true;
  assert.equal(api.motivo(item), 'Pronto');
  assert.equal(db.terceiros.length, 0, 'a prévia não cria cadastros');
});
test('placa ambígua ainda exige escolha explícita e veículo vendido fica bloqueado', () => {
  const { api, db } = ambiente({ terceiros: [
    { terempresa: 'A', terplaca: 'ABC1234' }, { terempresa: 'B', terplaca: 'ABC-1234' }
  ] });
  const item = api.ler(planilha())[0]; api.periodo(item, '2026-11'); item.aceitarRateio = true;
  assert.match(api.motivo(item), /Mais de um terceiro/);
  item.terceiro = 'A — ABC1234'; assert.equal(api.motivo(item), 'Pronto');
  db.veiculos.push({ vplaca: 'abc1234', vstatus: 'VENDIDO' });
  assert.equal(api.motivo(item), 'Veículo vendido: conferir cadastro');
});
test('seleção não reconstrói tabela nem repete consultas e prévia limita linhas no DOM', () => {
  const fonte = ler('importar-planilha-fretes.js');
  const selecao = fonte.slice(fonte.indexOf("el('frePlanilhaTodos').onchange"), fonte.indexOf("el('frePlanilhaLista').onclick"));
  assert.doesNotMatch(selecao, /render\(|identificar\(|motivo\(|indices\(/);
  assert.match(selecao, /atualizarSelecao\(\)/);
  assert.match(fonte, /itens\.slice\(inicio, inicio \+ porPagina\)/);
  assert.match(fonte, /data-confirmar=/);
  assert.match(fonte, /individual \? \(itens\[indice\] \? \[itens\[indice\]\]/);
  assert.match(fonte, /if \(ocupado\) return;\s*var base = indices\(\); itens = itens\.filter/);
});
function ambientePreCadastro(ok = true, terceiros = []) {
  const fonte = ler('fretes-terceiros.js');
  const trecho = fonte.slice(fonte.indexOf('  var preCadastrosConfirmados'), fonte.indexOf('  window.alternarExecucaoFrete ='));
  const chamadas = [];
  const ctx = { db: { terceiros, veiculos: [] }, Date, console,
    listaArr(k) { return ctx.db[k] || []; },
    salvarNuvem: async mods => { chamadas.push(Array.from(mods)); return ok; },
    preencherSelectsFrete() {},
    rotuloTerceiro(t) { return (t.terempresa || 'Terceiro') + ' — ' + t.terplaca; },
    fmModuloCarregado() { return true; }
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(trecho, ctx);
  return { ctx, chamadas };
}
test('pré-cadastro normaliza placa e reutiliza o mesmo terceiro entre CT-e', async () => {
  const { ctx, chamadas } = ambientePreCadastro();
  const primeiro = await ctx.fmPrepararTerceiroPlanilha('abc-1234');
  const segundo = await ctx.fmPrepararTerceiroPlanilha('ABC1234');
  assert.equal(primeiro, segundo);
  assert.equal(ctx.db.terceiros.length, 1);
  assert.equal(ctx.db.terceiros[0].terplaca, 'ABC1234');
  assert.equal(ctx.db.terceiros[0].terpreCadastroPlanilha, true);
  assert.deepEqual(chamadas, [['terceiros']]);
});
test('falha de sincronização não permite prosseguir nem duplica pré-cadastro', async () => {
  const { ctx, chamadas } = ambientePreCadastro(false);
  await assert.rejects(ctx.fmPrepararTerceiroPlanilha('ABC1234'), /pendente de sincronização/);
  await assert.rejects(ctx.fmPrepararTerceiroPlanilha('ABC-1234'), /pendente de sincronização/);
  assert.equal(ctx.db.terceiros.length, 1);
  assert.equal(chamadas.length, 2);
});
test('terceiro já cadastrado não é recriado e placa própria é recusada pelo pré-cadastro', async () => {
  const { ctx, chamadas } = ambientePreCadastro(true, [{ terempresa: 'Transportes', terplaca: 'ABC-1234' }]);
  assert.equal(await ctx.fmPrepararTerceiroPlanilha('ABC1234'), 'Transportes — ABC-1234');
  assert.equal(chamadas.length, 0);
  ctx.db.veiculos.push({ vplaca: 'XYZ-9999' });
  await assert.rejects(ctx.fmPrepararTerceiroPlanilha('xyz9999'), /frota própria/);
  assert.equal(ctx.db.terceiros.length, 1);
});
