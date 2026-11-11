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
  return { api: ctx.FMPlanilhaFretes, db: ctx.db, ctx };
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
test('cidades equivalentes não geram divergência falsa', () => {
  const { api } = ambiente();
  const rows = planilha([['101', '1.000', '100,00', '  CURITIBA ', ' pr ', 'sao   paulo', 'sp', 150]]);
  const item = api.ler(rows)[0];
  assert.equal(item.divergente, false);
  assert.equal(item.ocorrencias.length, 2);
  assert.deepEqual(Array.from(item.camposDivergentes), []);
  assert.equal(item.ocorrencias[1].destino, 'sao   paulo-SP');
  assert.equal(item.custo, 5000, 'a repetição equivalente não duplica o pagamento');
});
test('comparação retém valores originais, aba, linha real e viagem de cada ocorrência', () => {
  const { api } = ambiente();
  const rows = planilha().concat([
    ['Viagem', 'V002'], ['Veículo', 'XYZ-9A99'], ['Linha', 'Norte'],
    planilha()[3], ['101', 1234.5, 350, 'Maringá', 'PR', 'Santos', 'SP', 150]
  ]);
  const fontes = rows.map((_, i) => ({ aba: i < 6 ? 'Sul' : 'Norte', linha: i < 6 ? i + 1 : i - 5 }));
  const itens = api.ler(rows, fontes), item = itens[0];
  assert.equal(itens.length, 2, 'cada CT-e continua único');
  assert.deepEqual(Array.from(item.camposDivergentes).sort(), ['destino', 'frete', 'origem', 'peso', 'placa']);
  assert.equal(item.frete, 10000, 'a primeira ocorrência não é substituída automaticamente');
  assert.equal(item.ocorrencias[0].aba, 'Sul');
  assert.equal(item.ocorrencias[0].linhaPlanilha, 5);
  assert.equal(item.ocorrencias[1].aba, 'Norte');
  assert.equal(item.ocorrencias[1].linhaPlanilha, 5);
  assert.equal(item.ocorrencias[1].viagem, 'V002');
  assert.equal(item.ocorrencias[1].linhaViagem, 'Norte');
  assert.equal(item.ocorrencias[1].frete, 35000);
  assert.equal(item.ocorrencias[1].peso, 1234.5);
  assert.ok(Number.isNaN(item.custo), 'não se inventa rateio para CT-e divergente');
});
test('novas abas não herdam contexto e comparações acumulam apenas diferenças reais', () => {
  const { api } = ambiente();
  const rows = planilha([
    ['101', 1000, 999, 'Curitiba', 'PR', 'São Paulo', 'SP', 150],
    ['101', 1100, 100, 'Curitiba', 'PR', 'São Paulo', 'SP', 150]
  ]);
  const item = api.ler(rows)[0];
  assert.deepEqual(Array.from(item.camposDivergentes).sort(), ['frete', 'peso']);
  assert.equal(item.ocorrencias.length, 3);
  assert.equal(item.ocorrencias[2].linhaPlanilha, 8);
  const semContexto = rows.concat([['999', 1000, 100, 'Curitiba', 'PR', 'São Paulo', 'SP', 150]]);
  const fontes = semContexto.map((_, i) => ({ aba: i < rows.length ? 'A' : 'B', linha: i + 1 }));
  assert.equal(api.ler(semContexto, fontes).length, 2);
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
function editorPlanilha(item) {
  const { ctx } = ambiente();
  const campos = { frePlanilhaMensagem: { textContent: '' } };
  let html = '', botoes = [];
  const host = {
    hidden: true, dataset: {}, scrollIntoView() {},
    get innerHTML() { return html; },
    set innerHTML(v) {
      html = v;
      for (const id of Object.keys(campos)) if (id.startsWith('frePE')) delete campos[id];
      for (const m of v.matchAll(/<input\b([^>]+)>/g)) {
        const id = /id="([^"]+)"/.exec(m[1]); if (!id) continue;
        const value = /value="([^"]*)"/.exec(m[1]);
        campos[id[1]] = { value: value ? value[1] : '', checked: /\bchecked\b/.test(m[1]), dispatchEvent() {} };
      }
      if (v) for (const id of ['frePETerceiro', 'frePEEscolha', 'frePESalvar', 'frePECancelar']) campos[id] = { value: '', textContent: '', dispatchEvent() {} };
      botoes = Array.from(v.matchAll(/data-ocorrencia="(\d+)"/g), m => ({ dataset: { ocorrencia: m[1] } }));
    },
    querySelectorAll() { return botoes; }
  };
  campos.frePlanilhaEditor = host;
  ctx.document.getElementById = id => campos[id] || null;
  ctx.itemTeste = item;
  vm.runInContext(ler('importar-planilha-fretes.js').replace('window.FMPlanilhaFretes = {', 'itens = [window.itemTeste]; window.editarTeste = editar; window.FMPlanilhaFretes = {'), ctx);
  ctx.editarTeste(0);
  return { ctx, campos, host, botoes };
}
test('editor compara valores, escolhe ocorrência e só altera a prévia após revisão explícita', () => {
  const { api } = ambiente();
  const item = api.ler(planilha([['101', 1234.5, 999, 'Maringá', 'PR', 'Santos', 'SP', 150]]))[0];
  api.periodo(item, '2026-11');
  const { campos, host, botoes } = editorPlanilha(item);
  assert.match(host.innerHTML, /Campos diferentes:/);
  assert.match(host.innerHTML, /table-warning/);
  assert.match(host.innerHTML, /linha 7/);
  assert.match(host.innerHTML, /Receita — diferente/);
  assert.doesNotMatch(host.innerHTML, /Placa — diferente/);
  botoes[1].onclick();
  assert.equal(campos.frePEReceita.value, '999,00');
  assert.equal(campos.frePEPeso.value, '1.234,5');
  assert.equal(item.frete, 10000, 'escolher não altera a prévia ainda');
  campos.frePESalvar.onclick();
  assert.equal(host.hidden, false, 'sem revisão a edição permanece aberta');
  assert.equal(item.divergente, true);
  campos.frePEResolver.checked = true;
  campos.frePEPeso.value = '1.300,25';
  campos.frePESalvar.onclick();
  assert.equal(host.hidden, true);
  assert.equal(item.frete, 99900);
  assert.equal(item.peso, 1300.25);
  assert.equal(item.origem, 'Maringá-PR');
  assert.equal(item.divergente, false);
  assert.equal(item.competencia, '2026-11');
  assert.equal(item.ocorrencias[0].frete, 10000, 'fonte original é preservada');
  assert.equal(item.ocorrencias[1].peso, 1234.5);
});
test('peso inválido não aplica e escolher de novo exige nova revisão', () => {
  const { api } = ambiente();
  const item = api.ler(planilha([['101', 1234.5, 999, 'Maringá', 'PR', 'Santos', 'SP', 150]]))[0];
  const { ctx, campos, host, botoes } = editorPlanilha(item);
  botoes[1].onclick(); campos.frePEResolver.checked = true;
  campos.frePEPeso.value = '-50'; campos.frePESalvar.onclick();
  assert.equal(item.frete, 10000);
  assert.equal(host.hidden, false);
  campos.frePEPeso.value = '1234.5'; campos.frePESalvar.onclick();
  assert.equal(host.hidden, false, 'decimal deve ser explícito no padrão brasileiro');
  campos.frePEPeso.value = '1.234,5'; campos.frePESalvar.onclick();
  assert.equal(item.divergente, false);
  ctx.editarTeste(0);
  assert.equal(campos.frePEResolver.checked, true);
  host.querySelectorAll()[0].onclick();
  assert.equal(campos.frePEResolver.checked, false);
  campos.frePESalvar.onclick();
  assert.equal(item.frete, 99900, 'nova escolha não altera item sem revisão');
  assert.equal(host.hidden, false);
});
test('placas equivalentes não divergem e outra placa não herda pagamento na escolha', () => {
  const { api } = ambiente();
  const rows = planilha().concat([
    ['Viagem', 'V002'], ['Veículo', 'abc1234'], ['Linha', 'Sul'], planilha()[3],
    ['101', 1000, 100, 'Curitiba', 'PR', 'São Paulo', 'SP', 150]
  ]);
  assert.equal(api.ler(rows)[0].divergente, false);
  rows[7][1] = 'XYZ-9A99';
  const item = api.ler(rows)[0];
  assert.equal(item.divergente, true);
  const { campos, botoes } = editorPlanilha(item);
  campos.frePECusto.value = '150,00'; campos.frePEAceitar.checked = true;
  botoes[1].onclick();
  assert.equal(campos.frePEPlaca.value, 'XYZ-9A99');
  assert.equal(campos.frePECusto.value, '');
  assert.equal(campos.frePEAceitar.checked, false);
});
test('cancelar comparação não muda item e texto da planilha é escapado', () => {
  const { api } = ambiente();
  const item = api.ler(planilha([['101', 999, 100, '<img src=x>', 'PR', 'Santos', 'SP', 150]]))[0];
  const antes = JSON.stringify(item);
  const { campos, host, botoes } = editorPlanilha(item);
  assert.doesNotMatch(host.innerHTML, /<img src=x>/);
  assert.match(host.innerHTML, /&lt;img src=x&gt;/);
  botoes[1].onclick(); campos.frePECancelar.onclick();
  assert.equal(JSON.stringify(item), antes);
  assert.equal(host.hidden, true);
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
