/* Executar: node --test tests/pneus-frota.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
const pneu = extra => Object.assign({ pid: 'p1', pnumero: 'PN1', pstatus: 'Em Uso', pveiculo: 'ABC1234', pdatainstalacao: '2026-01-01', pkminstalacao: 200000, pvalor: 2500, pvida: 50000 }, extra);
function ambiente(dados = {}, opcoes = {}) {
  const db = Object.assign({ pneus: [], eventosPneus: [], veiculos: [{ vplaca: 'ABC-1234', vkm: 999999 }], quilometragens: [] }, dados);
  const salvos = [];
  const ctx = { db, console, setTimeout: () => {}, setInterval: () => {},
    document: { readyState: 'loading', getElementById: () => null, addEventListener: () => {} },
    addEventListener: () => {}, fmModuloCarregado: () => opcoes.carregado !== false,
    salvarNuvem: async mods => { salvos.push(Array.from(mods)); return opcoes.salvar !== false; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('pneus-frota.js'), ctx);
  const fonte = ler('resultado-frota.js').replace('function eventosDoPneu(pid)', 'window.calculoTeste={kmSegmento:kmSegmento,kmCicloPeriodo:kmCicloPeriodo,kmCicloTotal:kmCicloTotal,ciclos:ciclosPneus,renderMemoria:renderMemoriaPneus,selecionarPlaca:function(pl){estado.veiculoPneus=pl}};function eventosDoPneu(pid)');
  vm.runInContext(fonte, ctx);
  return { ctx, db, api: ctx.FMPneusFrota, calculo: ctx.calculoTeste, salvos };
}
const instalacao = extra => Object.assign({ id: 'e1', cadastroPneuId: 'p1', pneuId: 'PN1', tipo: 'Instalação', data: '2026-01-01', veiculo: 'ABC1234', odometro: 200000, valor: 2500, vidaUtilKm: 50000 }, extra);
const fechamento = extra => Object.assign({ data: '2026-01-31', veiculo: 'ABC1234', odometroInicial: 204000, odometroFinal: 210000, kmRodado: 6000 }, extra);
const janeiro = { ini: '2026-01-01', fim: '2026-01-31' };

test('arquivos alterados mantêm sintaxe válida', () => {
  for (const nome of ['pneus-frota.js', 'pneus-sync.js', 'resultado-frota.js']) new vm.Script(ler(nome));
});
test('instala cadastro válido uma vez pelo writer compartilhado sem criar despesas', async () => {
  const amb = ambiente({ pneus: [pneu()] });
  const antes = JSON.stringify(amb.db.veiculos);
  const r = await amb.api.sincronizarCadastros();
  assert.equal(r.integrados, 1);
  assert.equal(amb.db.eventosPneus.length, 1);
  assert.equal(amb.db.eventosPneus[0].cadastroPneuId, 'p1');
  assert.equal(amb.db.eventosPneus[0].veiculo, 'ABC-1234');
  assert.deepEqual(amb.salvos, [['pneus', 'eventosPneus']]);
  assert.equal((await amb.api.sincronizarCadastros()).integrados, 0);
  assert.equal(amb.salvos.length, 1);
  assert.equal(JSON.stringify(amb.db.veiculos), antes);
  assert.equal(amb.db.custos, undefined);
  assert.equal(amb.db.quilometragens.length, 0);
});
test('não sobrescreve instalação manual nem transfere ciclo de outra placa', async () => {
  const amb = ambiente({ pneus: [pneu()], eventosPneus: [instalacao({ veiculo: 'XYZ9999' })] });
  const antes = JSON.stringify(amb.db);
  const r = await amb.api.sincronizarCadastros();
  assert.equal(r.integrados, 0);
  assert.match(r.pendencias[0].motivo, /outra placa/);
  assert.equal(JSON.stringify(amb.db), antes);
});
test('cadastros incompletos, datas impossíveis, exclusões e duplicados geram motivos', async () => {
  for (const extra of [{ pvida: 0 }, { pdatainstalacao: '2026-02-30' }, { fmEventosPneusExcluidos: true }, { pveiculo: 'ZZZ0000' }]) {
    const amb = ambiente({ pneus: [pneu(extra)] });
    assert.equal((await amb.api.sincronizarCadastros()).pendencias.length, 1);
    assert.equal(amb.db.eventosPneus.length, 0);
    assert.equal(amb.salvos.length, 0);
  }
  const amb = ambiente({ pneus: [pneu(), pneu({ pid: 'p2' })] });
  assert.equal((await amb.api.sincronizarCadastros()).pendencias.length, 2);
});
test('histórico encerrado admite reinstalação posterior sem apagar evento antigo', async () => {
  const amb = ambiente({ pneus: [pneu({ pdatainstalacao: '2026-02-01', pkminstalacao: 212000 })], eventosPneus: [instalacao(), instalacao({ id: 'e2', tipo: 'Retirada', data: '2026-01-20', odometro: 210000, valor: 0 })] });
  assert.equal((await amb.api.sincronizarCadastros()).integrados, 1);
  assert.equal(amb.db.eventosPneus.length, 3);
  assert.equal(amb.db.eventosPneus[0].id, 'e1');
});
test('aguarda carregamento e remove instalação local se o writer falhar', async () => {
  const carregando = ambiente({ pneus: [pneu()] }, { carregado: false });
  assert.equal((await carregando.api.sincronizarCadastros()).aguardando, true);
  assert.equal(carregando.salvos.length, 0);
  const falha = ambiente({ pneus: [pneu()] }, { salvar: false });
  await assert.rejects(falha.api.sincronizarCadastros());
  assert.equal(falha.db.eventosPneus.length, 0);
});
test('consumo mensal usa 6000 km do fechamento, nunca KM Atual nem todo o ciclo', () => {
  const amb = ambiente({ eventosPneus: [instalacao()], quilometragens: [fechamento()] });
  const c = amb.calculo.ciclos()[0];
  assert.equal(amb.calculo.kmCicloPeriodo(c, janeiro, 'ABC1234'), 6000);
  assert.equal(amb.calculo.kmCicloTotal(c), 6000);
  assert.equal(amb.calculo.kmCicloPeriodo(c, janeiro, 'ABC1234') * c.valor / c.vida, 300);
});
test('retirada no meio do mês limita o consumo ao odômetro da retirada', () => {
  const amb = ambiente({ eventosPneus: [instalacao(), instalacao({ id: 'e2', tipo: 'Retirada', data: '2026-01-15', odometro: 207000, valor: 0 })], quilometragens: [fechamento()] });
  const c = amb.calculo.ciclos()[0];
  assert.equal(amb.calculo.kmCicloPeriodo(c, janeiro, 'ABC1234'), 3000);
  assert.equal(amb.calculo.kmCicloTotal(c), 3000);
});
test('transferência separa odômetros das placas e reparte o limite de vida', () => {
  const amb = ambiente({ eventosPneus: [instalacao({ vidaUtilKm: 5000 }), instalacao({ id: 'e2', tipo: 'Rodízio', data: '2026-01-15', veiculo: 'XYZ9999', odometroOrigem: 207000, odometro: 80000, valor: 0 })], quilometragens: [fechamento(), fechamento({ veiculo: 'XYZ9999', odometroInicial: 80000, odometroFinal: 84000 })] });
  const c = amb.calculo.ciclos()[0];
  assert.equal(amb.calculo.kmCicloPeriodo(c, janeiro, 'ABC1234'), 3000);
  assert.equal(amb.calculo.kmCicloPeriodo(c, janeiro, 'XYZ9999'), 2000);
  assert.equal(amb.calculo.kmCicloTotal(c), 5000);
});
test('não usa KM agregado sem odômetros e não repete faixas sobrepostas', () => {
  const amb = ambiente({ eventosPneus: [instalacao()], quilometragens: [fechamento(), fechamento(), fechamento({ odometroInicial: '', odometroFinal: '', kmRodado: 99999 })] });
  assert.equal(amb.calculo.kmCicloPeriodo(amb.calculo.ciclos()[0], janeiro, 'ABC1234'), 6000);
});
test('primeiro dia do filtro não é contado também no consumo anterior', () => {
  const amb = ambiente({ eventosPneus: [instalacao({ vidaUtilKm: 8000 })], quilometragens: [fechamento({ data: '2026-01-01', odometroInicial: 200000, odometroFinal: 204000 }), fechamento({ odometroInicial: 204000, odometroFinal: 210000 })] });
  assert.equal(amb.calculo.kmCicloPeriodo(amb.calculo.ciclos()[0], janeiro, 'ABC1234'), 8000);
});
test('consulta sem fechamento não usa o KM Atual para inventar consumo', () => {
  const amb = ambiente({ eventosPneus: [instalacao()] });
  assert.equal(amb.calculo.kmCicloPeriodo(amb.calculo.ciclos()[0], janeiro, 'ABC1234'), 0);
  assert.equal(amb.calculo.kmCicloTotal(amb.calculo.ciclos()[0]), 0);
});
test('cliques simultâneos compartilham o mesmo reparo sem duplicar instalação', async () => {
  const amb = ambiente({ pneus: [pneu()] });
  const primeiro = amb.api.sincronizarCadastros();
  const segundo = amb.api.sincronizarCadastros();
  assert.equal(primeiro, segundo);
  await Promise.all([primeiro, segundo]);
  assert.equal(amb.db.eventosPneus.length, 1);
  assert.equal(amb.salvos.length, 1);
});
test('vida consumida em mês anterior reduz somente o saldo disponível no seguinte', () => {
  const amb = ambiente({ eventosPneus: [instalacao({ vidaUtilKm: 8000 })], quilometragens: [fechamento(), fechamento({ data: '2026-02-28', odometroInicial: 210000, odometroFinal: 216000 })] });
  const c = amb.calculo.ciclos()[0];
  assert.equal(amb.calculo.kmCicloPeriodo(c, janeiro, 'ABC1234'), 6000);
  assert.equal(amb.calculo.kmCicloPeriodo(c, { ini: '2026-02-01', fim: '2026-02-28' }, 'ABC1234'), 2000);
});

test('divergência mostra evento exato com número diferente e preserva todo o histórico', async () => {
  const amb = ambiente({ pneus: [pneu({ pnumero: '71' })], eventosPneus: [instalacao({ pneuId: '17' })] });
  const antes = JSON.stringify(amb.db);
  const plano = amb.api.diagnosticar(amb.db.pneus[0]);
  assert.match(plano.erro, /divergente/);
  assert.equal(plano.conflitos.length, 1);
  const c = plano.conflitos[0];
  assert.equal(c.eventoId, 'e1');
  assert.equal(c.pneu, '17');
  assert.equal(c.data, '2026-01-01');
  assert.equal(c.tipo, 'Instalação');
  assert.equal(c.placa, 'ABC1234');
  assert.match(c.motivo, /pneu 17.*cadastro de pneu 71/);
  const resultado = await amb.api.sincronizarCadastros();
  assert.equal(resultado.integrados, 0);
  assert.equal(resultado.pendencias[0].conflitos[0].eventoId, 'e1');
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
test('mesmo número com vínculo em outro cadastro identifica todos os eventos conflitantes', () => {
  const amb = ambiente({ pneus: [pneu({ pnumero: '71' }), pneu({ pid: 'p2', pnumero: '99', pstatus: 'Estoque' })],
    eventosPneus: [instalacao({ pneuId: '71', cadastroPneuId: 'p2' }), instalacao({ id: 'e2', pneuId: '71', cadastroPneuId: 'ausente' }), instalacao({ id: 'e3', pneuId: '71' })] });
  const plano = amb.api.diagnosticar(amb.db.pneus[0]);
  assert.equal(plano.conflitos.length, 2);
  assert.equal(plano.conflitos[0].pneuVinculado, '99');
  assert.match(plano.conflitos[0].motivo, /cadastro do pneu 99/);
  assert.match(plano.conflitos[1].motivo, /cadastro não encontrado/);
});
test('históricos coerentes e legados sem vínculo interno não geram falso conflito', () => {
  for (const cadastroPneuId of ['p1', '']) {
    const amb = ambiente({ pneus: [pneu()], eventosPneus: [instalacao({ cadastroPneuId })] });
    assert.equal(amb.api.diagnosticar(amb.db.pneus[0]).integrado, true);
  }
});
test('painel escapa dados e desabilita abertura de eventos sem ID único', () => {
  const amb = ambiente({ pneus: [pneu()], eventosPneus: [instalacao({ id: 'e"1', pneuId: '<img src=x>' }), instalacao({ id: '', pneuId: 'errado' }), instalacao({ id: 'duplicado', pneuId: 'outro' }), instalacao({ id: 'duplicado', pneuId: 'outro' })] });
  const ouvintes = [];
  const painel = { innerHTML: '', addEventListener: (tipo, fn) => ouvintes.push(fn), contains: () => true };
  amb.ctx.document.getElementById = id => id === 'resPneuIntegracao' ? painel : null;
  const antes = JSON.stringify(amb.db);
  amb.api.renderPainel();
  assert.match(painel.innerHTML, /01\/01\/2026/);
  assert.match(painel.innerHTML, /&lt;img src=x&gt;/);
  assert.doesNotMatch(painel.innerHTML, /<img src=x>/);
  assert.match(painel.innerHTML, /data-fm-pneu-evento="e&quot;1"/);
  assert.equal((painel.innerHTML.match(/data-fm-pneu-evento=/g) || []).length, 1);
  assert.match(painel.innerHTML, /Evento sem ID único/);
  const abertos = [];
  amb.ctx.fmConferirEventoPneuFrota = id => abertos.push(id);
  ouvintes[0]({ target: { closest: () => ({ getAttribute: () => 'e"1' }) } });
  assert.deepEqual(abertos, ['e"1']);
  amb.api.renderPainel();
  assert.equal(ouvintes.length, 1);
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
test('atalho abre a placa do evento e o registro exato, sem salvar nem corrigir vínculos', () => {
  const evento = instalacao({ pneuId: '71', veiculo: 'XYZ9999' });
  const chamadas = [], ajuda = {}, campo = { scrollIntoView: () => {}, focus: () => {} };
  const ctx = { a: mod => mod === 'eventosPneus' ? [evento] : [pneu()],
    abrirVeiculoPneus: pl => chamadas.push(['placa', pl]), editarEventoPneu: id => chamadas.push(['evento', id]), tipoEventoPneu: () => {},
    document: { getElementById: id => id === 'resPneuId' ? campo : ajuda }, alert: msg => chamadas.push(['alerta', msg]) };
  ctx.window = ctx;
  vm.createContext(ctx);
  const fonte = ler('resultado-frota.js').split('function conferirEventoPneu(xid){')[1].split('function excluirEventoPneu(xid)')[0];
  vm.runInContext('function conferirEventoPneu(xid){' + fonte, ctx);
  const antes = JSON.stringify(evento);
  ctx.fmConferirEventoPneuFrota('e1');
  assert.deepEqual(chamadas, [['placa', 'XYZ9999'], ['evento', 'e1']]);
  assert.match(ajuda.textContent, /p1.*cadastro do pneu PN1/);
  assert.equal(JSON.stringify(evento), antes);
  ctx.fmConferirEventoPneuFrota('inexistente');
  assert.equal(chamadas[2][0], 'alerta');
});

function carregarSync(amb) {
  vm.runInContext(ler('pneus-sync.js'), amb.ctx);
  return amb.ctx.fmAtualizarKmPneusVeiculo;
}
function formularioKm(amb, valores = {}) {
  const campos = {};
  for (const id of ['p_idx','pveiculo','pstatus','pkminstalacao','pkmatual','pkmrodado','pneuKmAviso']) {
    campos[id] = { value: valores[id] ?? '', dataset: {}, textContent: '', hidden: true };
  }
  const ouvintes = {};
  amb.ctx.document.getElementById = id => campos[id] || null;
  amb.ctx.document.addEventListener = (tipo, fn) => {
    (ouvintes[tipo] ||= []).push(fn);
  };
  amb.ctx.editar = (mod, i) => {
    const p = amb.db.pneus[i];
    for (const id of ['pveiculo','pstatus','pkminstalacao','pkmatual','pkmrodado']) campos[id].value = p[id] ?? '';
    campos.p_idx.value = String(i);
  };
  carregarSync(amb);
  return { campos, evento: (tipo, id) => {
    for (const fn of ouvintes[tipo] || []) fn({ target: { id } });
  } };
}
test('formulário busca KM de Veículos pela placa e recalcula sem salvar nem alterar registros', () => {
  const amb = ambiente({ veiculos: [{ vplaca: 'ABC-1234', vkm: '150.000' }] });
  const { campos, evento } = formularioKm(amb, { pstatus:'Em Uso', pveiculo:'abc1234', pkminstalacao:'120000' });
  const antes = JSON.stringify(amb.db);
  evento('change', 'pveiculo');
  assert.equal(campos.pkmatual.value, '150000');
  assert.equal(campos.pkmrodado.value, '30000');
  assert.equal(campos.pkmatual.readOnly, true);
  campos.pkminstalacao.value = '125000';
  evento('input', 'pkminstalacao');
  assert.equal(campos.pkmrodado.value, '25000');
  assert.equal(campos.pkminstalacao.value, '125000');
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
test('editar consulta leitura atual sem modificar instalação, custos ou histórico', () => {
  const amb = ambiente({ pneus: [pneu({ pkmatual:'201000', pkmrodado:'1000' })], veiculos: [{ vplaca:'ABC-1234', vkm:'210000' }] });
  const { campos } = formularioKm(amb);
  const antes = JSON.stringify(amb.db);
  amb.ctx.editar('pneus', 0);
  assert.equal(campos.pkmatual.value, '210000');
  assert.equal(campos.pkmrodado.value, '10000');
  assert.equal(campos.pkminstalacao.value, 200000);
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
test('leituras ausentes, instalação inválida e divergências não fabricam KM rodado', () => {
  const amb = ambiente({ veiculos:[{ vplaca:'ABC1234', vkm:'150000' }] });
  const { campos } = formularioKm(amb, { pstatus:'Em Uso', pveiculo:'ABC1234', pkminstalacao:'120000' });
  for (const inicio of ['', 'inválido', '160000']) {
    campos.pkminstalacao.value = inicio;
    amb.ctx.calcularKMPneu();
    assert.equal(campos.pkmatual.value, '150000');
    assert.equal(campos.pkmrodado.value, '');
    assert.equal(campos.pneuKmAviso.hidden, false);
  }
  campos.pkminstalacao.value = '120000';
  for (const km of ['', null, NaN, Infinity, -1, 'inválido']) {
    amb.db.veiculos[0].vkm = km;
    amb.ctx.calcularKMPneu();
    assert.equal(campos.pkmatual.value, '');
    assert.equal(campos.pkmrodado.value, '');
  }
  amb.db.veiculos[0].vkm = 150000;
  amb.ctx.fmModuloCarregado = () => false;
  amb.ctx.calcularKMPneu();
  assert.match(campos.pneuKmAviso.textContent, /Aguarde/);
  assert.equal(campos.pkmatual.value, '');
  amb.ctx.fmModuloCarregado = () => true;
  amb.db.veiculos.push({ vplaca:'ABC-1234', vkm:160000 });
  amb.ctx.calcularKMPneu();
  assert.match(campos.pneuKmAviso.textContent, /cadastro único/);
});
test('transferência usa origem editável, destino independente e nunca subtrai placas', () => {
  const amb = ambiente({ pneus:[pneu({ pkmatual:'201000' })], veiculos:[{ vplaca:'ABC-1234', vkm:210000 }, { vplaca:'XYZ9999', vkm:85000 }], eventosPneus:[instalacao()] });
  const { campos, evento } = formularioKm(amb);
  const antes = JSON.stringify(amb.db);
  amb.ctx.editar('pneus', 0);
  campos.pveiculo.value = 'XYZ9999';
  campos.pkminstalacao.value = '80000';
  evento('change', 'pveiculo');
  assert.equal(campos.pkmatual.value, '210000');
  assert.equal(campos.pkmatual.readOnly, false);
  assert.equal(campos.pkmrodado.value, '');
  campos.pkmatual.value = '207000';
  evento('input', 'pkmatual');
  evento('input', 'pkminstalacao');
  assert.equal(campos.pkmatual.value, '207000');
  const plano = amb.api.preparar(pneu({ pveiculo:'XYZ9999', pdatainstalacao:'2026-01-15', pkminstalacao:campos.pkminstalacao.value, pkmatual:campos.pkmatual.value }), amb.db.pneus[0]);
  assert.equal(plano.erro, undefined);
  assert.equal(plano.eventos[0].odometroOrigem, 207000);
  assert.equal(plano.eventos[0].odometro, 80000);
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
  campos.pveiculo.value = 'ABC1234';
  campos.pkminstalacao.value = '200000';
  evento('change', 'pveiculo');
  assert.equal(campos.pkmatual.value, '210000');
  assert.equal(campos.pkmatual.readOnly, true);
  assert.equal(campos.pkmrodado.value, '10000');
});
test('retirada preserva saída histórica editável e pneus fora de uso não seguem o veículo', () => {
  const amb = ambiente({ pneus:[pneu()], veiculos:[{ vplaca:'ABC1234', vkm:210000 }] });
  const { campos, evento } = formularioKm(amb);
  amb.ctx.editar('pneus', 0);
  campos.pstatus.value = 'Estoque';
  evento('change', 'pstatus');
  assert.equal(campos.pkmatual.value, '210000');
  assert.equal(campos.pkmatual.readOnly, false);
  campos.pkmatual.value = '207000';
  evento('input', 'pkmatual');
  amb.db.veiculos[0].vkm = 220000;
  amb.ctx.calcularKMPneu();
  assert.equal(campos.pkmatual.value, '207000');
  assert.equal(campos.pkmrodado.value, '7000');
  amb.db.pneus[0].pstatus = 'Estoque';
  amb.db.pneus[0].pkmatual = '207000';
  amb.db.pneus[0].pkmrodado = '7000';
  amb.ctx.editar('pneus', 0);
  assert.equal(campos.pkmatual.value, '207000');
  assert.equal(campos.pkmrodado.value, '7000');
});
test('detalhes consultam KM atualizado sem gravar nem gerar eventos', () => {
  const amb = ambiente({ pneus:[pneu({ phist:[], pkmatual:'201000', pkmrodado:'1000' })], veiculos:[{ vplaca:'ABC-1234', vkm:210000 }], estoque:[] });
  const { campos } = formularioKm(amb);
  const tabela = { innerHTML:'' };
  amb.ctx.document.getElementById = id => id === 'listaPneus' ? tabela : campos[id] || null;
  const antes = JSON.stringify(amb.db);
  amb.ctx.renderTabelaPneus();
  assert.match(tabela.innerHTML, /KM atual<\/span><b>210000/);
  assert.match(tabela.innerHTML, /KM rodado<\/span><b>10000 KM/);
  amb.db.veiculos[0].vkm = 215000;
  amb.ctx.renderTabelaPneus();
  assert.match(tabela.innerHTML, /KM rodado<\/span><b>15000 KM/);
  amb.db.veiculos[0].vkm = 210000;
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
test('KM de Veículos atualiza apenas pneus Em Uso da mesma placa sem movimentações', () => {
  const ativo = pneu({ pkmatual: '205000', pkmrodado: '5000', phist: [{ tipo: 'Instalação' }] });
  const outros = ['Estoque', 'Recapado', 'Descartado', 'Veículo Vendido'].map(pstatus => pneu({ pstatus }));
  outros.push(pneu({ pveiculo: 'XYZ9999' }));
  const amb = ambiente({ pneus: [ativo, ...outros], estoque: [{ etipo: 'Saída' }], eventosPneus: [instalacao()], quilometragens: [fechamento()] });
  const preservar = JSON.stringify({ outros, estoque: amb.db.estoque, eventos: amb.db.eventosPneus, km: amb.db.quilometragens, hist: ativo.phist });
  const atualizar = carregarSync(amb);
  assert.equal(atualizar({ vplaca: 'abc-1234', vkm: '210000' }), 1);
  assert.equal(ativo.pkmatual, '210000');
  assert.equal(ativo.pkmrodado, '10000');
  assert.equal(ativo.pkminstalacao, 200000);
  assert.equal(ativo.pvalor, 2500);
  assert.equal(ativo.pvida, 50000);
  assert.equal(JSON.stringify({ outros, estoque: amb.db.estoque, eventos: amb.db.eventosPneus, km: amb.db.quilometragens, hist: ativo.phist }), preservar);
  assert.equal(amb.salvos.length, 0);
  assert.equal(atualizar({ vplaca: 'ABC1234', vkm: 210000 }), 0);
  const ciclo = amb.calculo.ciclos()[0];
  assert.equal(amb.calculo.kmCicloPeriodo(ciclo, janeiro, 'ABC1234'), 6000);
  assert.equal(amb.calculo.kmCicloPeriodo(ciclo, janeiro, 'ABC1234') * ciclo.valor / ciclo.vida, 300);
});
test('sincronização aceita correções sem KM rodado negativo e ignora leituras inválidas', () => {
  const amb = ambiente({ pneus: [pneu({ pkminstalacao: '200.000' })] });
  const atualizar = carregarSync(amb);
  assert.equal(atualizar({ vplaca: 'ABC1234', vkm: '210.000' }), 1);
  assert.equal(amb.db.pneus[0].pkmrodado, '10000');
  assert.equal(atualizar({ vplaca: 'ABC1234', vkm: 190000 }), 1);
  assert.equal(amb.db.pneus[0].pkmrodado, '0');
  for (const vkm of ['', null, NaN, Infinity, -1, 'inválido']) {
    assert.equal(atualizar({ vplaca: 'ABC1234', vkm }), 0);
    assert.equal(amb.db.pneus[0].pkmatual, '190000');
  }
  amb.ctx.fmModuloCarregado = () => false;
  assert.equal(atualizar({ vplaca: 'ABC1234', vkm: 220000 }), 0);
  assert.equal(amb.db.pneus[0].pkmatual, '190000');
});
test('salvar Veículos envia pneus e veículo juntos e aguarda o carregamento', () => {
  const amb = ambiente({ pneus: [pneu()], veiculos: [{ vplaca: 'ABC1234', vkm: 200000 }] });
  carregarSync(amb);
  const campos = { v_idx: { value: '0' }, vplaca: { value: 'ABC1234' }, vkm: { value: '210000' } };
  const avisos = [];
  Object.assign(amb.ctx, {
    document: { getElementById: id => campos[id] || null },
    fmNormalizarPlacaVinculo: s => String(s).replace(/[^a-z0-9]/gi, '').toUpperCase(),
    fmKmTotalVeiculo: v => Number(v.vkm), fmRegistrarHistoricoKm: () => {},
    fmPrepararRegistro: (mod, obj) => obj, limparForm: () => {},
    carregarVeiculosSelect: () => {}, atualizarDashboardVeiculos: () => {},
    dispatchEvent: () => {}, CustomEvent: function () {}, alert: msg => avisos.push(msg)
  });
  const fonte = ler('index.html').split('function salvar(mod, campos, idCampo, contexto){')[1].split('function feriasParaUtc(data){')[0];
  assert.ok(fonte);
  vm.runInContext('function salvar(mod, campos, idCampo, contexto){' + fonte, amb.ctx);
  amb.ctx.salvar('veiculos', ['vplaca', 'vkm'], 'v_idx');
  assert.equal(amb.db.veiculos[0].vkm, '210000');
  assert.equal(amb.db.pneus[0].pkmatual, '210000');
  assert.deepEqual(amb.salvos, [['veiculos', 'historicoKm', 'pneus']]);
  campos.vkm.value = '220000';
  amb.ctx.fmModuloCarregado = mod => mod !== 'pneus';
  assert.equal(amb.ctx.salvar('veiculos', ['vplaca', 'vkm'], 'v_idx'), false);
  assert.equal(amb.db.veiculos[0].vkm, '210000');
  assert.equal(amb.salvos.length, 1);
  assert.match(avisos[0], /carregamento de Pneus/);
});

test('cada pneu usa seu KM de instalação e mantém identidade sem inventar fechamento mensal', () => {
  const primeiro = pneu({ _rid: 'registro-1', pkmatual: '200000', pkmrodado: '0' });
  const segundo = pneu({ pid: 'p2', pnumero: 'PN2', _rid: 'registro-2', pkminstalacao: 205000 });
  const amb = ambiente({ pneus: [primeiro, segundo], eventosPneus: [instalacao()], estoque: [] });
  const preparados = [];
  amb.ctx.fmPrepararRegistro = (mod, atual, anterior) => {
    preparados.push({ mod, id: atual._rid, kmAnterior: anterior.pkmatual });
    atual._alteradoEm = '2026-02-01T12:00:00.000Z';
    return atual;
  };
  const atualizar = carregarSync(amb);
  assert.equal(atualizar({ vplaca: 'ABC-1234', vkm: 210000 }), 2);
  assert.equal(primeiro.pkmrodado, '10000');
  assert.equal(segundo.pkmrodado, '5000');
  assert.deepEqual(preparados, [
    { mod: 'pneus', id: 'registro-1', kmAnterior: '200000' },
    { mod: 'pneus', id: 'registro-2', kmAnterior: undefined }
  ]);
  assert.equal(primeiro._alteradoEm, '2026-02-01T12:00:00.000Z');
  assert.equal(amb.db.eventosPneus.length, 1);
  assert.equal(amb.db.estoque.length, 0);
  assert.equal(amb.db.quilometragens.length, 0);
  assert.equal(amb.calculo.kmCicloPeriodo(amb.calculo.ciclos()[0], janeiro, 'ABC1234'), 0);
  assert.equal(atualizar({ vplaca: 'ABC1234', vkm: 210000 }), 0);
  assert.equal(preparados.length, 2);
});

function memoria(amb, f = janeiro) {
  const box = { innerHTML: '', textContent: '' };
  amb.ctx.document.getElementById = id => id === 'resPneuAviso' ? {} : id === 'resPneuMemoria' ? box : null;
  amb.calculo.renderMemoria('ABC-1234', f, amb.calculo.ciclos());
  return box;
}
test('memória mostra fechamento, taxa precisa e custo mensal sem alterar registros', () => {
  const amb = ambiente({ eventosPneus: [instalacao()], quilometragens: [fechamento()] });
  amb.ctx.FMCustosAPI = { kmPeriodo: () => 6000 };
  const antes = JSON.stringify(amb.db);
  const box = memoria(amb);
  for (const texto of ['999.999 km', '204.000 km', '210.000 km', '6.000 km', '300,00', '0,0500', 'Conferir quilometragem']) assert.ok(box.innerHTML.includes(texto), texto);
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
test('memória distingue KM geral de fechamentos sem odômetros e sinaliza sobreposições', () => {
  const amb = ambiente({ eventosPneus: [instalacao()], quilometragens: [fechamento(), fechamento(), fechamento({ odometroInicial: '', odometroFinal: '', kmRodado: 9000 })] });
  amb.ctx.FMCustosAPI = { kmPeriodo: () => 21000 };
  const html = memoria(amb).innerHTML;
  assert.match(html, /1 fechamento\(s\) sem odômetros válidos/);
  assert.match(html, /faixas de odômetro sobrepostas/);
  assert.match(html, /Há diferença entre o KM geral/);
  assert.equal(amb.calculo.kmCicloPeriodo(amb.calculo.ciclos()[0], janeiro, 'ABC1234'), 6000);
});
test('memória não inventa fechamento e aguarda dados ainda não carregados', () => {
  const vazio = ambiente({ eventosPneus: [instalacao()] });
  const html = memoria(vazio).innerHTML;
  assert.match(html, /nenhum fechamento com odômetros válidos/);
  assert.match(html, /Nenhum fechamento salvo/);
  const carregando = ambiente({}, { carregado: false });
  assert.match(memoria(carregando).textContent, /Aguarde o carregamento/);
});
test('atalho abre Quilometragem com placa e período sem salvar ou preencher fechamento', () => {
  const amb = ambiente();
  amb.calculo.selecionarPlaca('ABC1234');
  const valores = {
    cusFiltroVeiculo: { value: '', options: [{ value: 'ABC-1234' }] },
    cusFiltroInicio: { value: janeiro.ini }, cusFiltroFim: { value: janeiro.fim }
  };
  const eventos = [];
  Object.keys(valores).forEach(id => { valores[id].dispatchEvent = ev => eventos.push([id, ev.type]); });
  amb.ctx.Event = function(type) { this.type = type; };
  amb.ctx.FMCustosAPI = { filtros: () => ({ ...janeiro }) };
  let abriu = false, rolou = false;
  amb.ctx.trocarAbaCustos = () => {};
  amb.ctx.document.querySelector = () => ({ click: () => {
    abriu = true;
    valores.cusFiltroInicio.value = '2025-01-01';
    valores.cusFiltroFim.value = '2025-01-31';
  } });
  amb.ctx.document.getElementById = id => valores[id] || (id === 'cusPane-quilometragem' ? { scrollIntoView: () => { rolou = true; } } : null);
  const antes = JSON.stringify(amb.db);
  amb.ctx.conferirQuilometragemPneus();
  assert.equal(abriu, true);
  assert.equal(rolou, true);
  assert.equal(valores.cusFiltroVeiculo.value, 'ABC-1234');
  assert.equal(valores.cusFiltroInicio.value, janeiro.ini);
  assert.equal(valores.cusFiltroFim.value, janeiro.fim);
  assert.equal(eventos.length, 3);
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
