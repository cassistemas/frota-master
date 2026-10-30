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
  const fonte = ler('resultado-frota.js').replace('function eventosDoPneu(pid)', 'window.calculoTeste={kmSegmento:kmSegmento,kmCicloPeriodo:kmCicloPeriodo,kmCicloTotal:kmCicloTotal,ciclos:ciclosPneus};function eventosDoPneu(pid)');
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
