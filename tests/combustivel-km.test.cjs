/* Executar com: node --test tests/combustivel-km.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function trecho(inicio, fim) {
  const a = html.indexOf(inicio), b = html.indexOf(fim, a + inicio.length);
  assert.ok(a >= 0 && b > a, 'Funções reais do módulo disponíveis');
  return html.slice(a, b);
}
function ambiente(registros = [], aceitar = true) {
  const avisos = [], alertas = [];
  const ctx = {
    db: { combustivel: registros },
    document: { getElementById: () => null },
    confirm: msg => { avisos.push(msg); return aceitar; },
    alert: msg => alertas.push(msg),
    formatarDataBR: s => s.split('-').reverse().join('/')
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    trecho('function fmNormalizarPlacaVinculo(', 'window.fmNormalizarPlacaVinculo ='),
    trecho('function confirmarKmCombustivel(', 'function salvarCombustivelCustom('),
    trecho('function obterCombustiveisFiltrados(', '// Ordena cópias:'),
    trecho('function compararDataCombustivel(', 'function atualizarResumoCombustivel('),
    trecho('function mediaPorVeiculo(', 'function iniciarSistema(')
  ].join('\n'), ctx);
  return { ctx, avisos, alertas };
}
function registro(dia, km, litros = 50, placa = 'ABC1234', tipo = 'Diesel S10') {
  return { cdata: '2026-01-' + String(dia).padStart(2, '0'), ckm: km,
    clitros: litros, cveiculo: placa, ctipo: tipo };
}

test('lista por data, sem mudar índices ou referências de edição no banco', () => {
  const registros = [registro(3, 1200), registro(1, 1000), registro(2, 1100)];
  const original = registros.slice(), { ctx } = ambiente(registros);
  const ordenados = ctx.obterCombustiveisFiltrados();
  assert.deepEqual(Array.from(ordenados, c => c.ckm), [1000, 1100, 1200]);
  assert.deepEqual(registros, original);
  assert.equal(ordenados[0], registros[1]);
  assert.equal(ctx.calcularMediaCombustivel(registros), '2.00 km/L');
  assert.equal(ctx.mediaPorVeiculo('ABC-1234'), '2.00 km/L');
});

test('regressão não é reordenada por KM para criar distância artificial', () => {
  const dados = [registro(1, 1000), registro(2, 900), registro(3, 1200), registro(4, 1300)];
  const { ctx } = ambiente(dados);
  assert.equal(ctx.calcularMediaCombustivel(dados), '2.00 km/L');
  assert.equal(ctx.calcularMediaCombustivel(dados.slice(0, 3)), '--');
});

test('zero interrompe o intervalo e ARLA não entra no consumo de combustível', () => {
  const dados = [registro(1, 1000), registro(2, 0), registro(3, 1200), registro(4, 1300),
    registro(4, 1300, 15, 'ABC1234', 'Arla32')];
  const { ctx } = ambiente(dados);
  assert.equal(ctx.calcularMediaCombustivel(dados), '2.00 km/L');
  assert.equal(ctx.calcularMediaCombustivel([registro(1, 0), registro(2, 1000)]), '--');
});

test('produtos no mesmo dia e KM somam litros; veículos não misturam odômetros', () => {
  const dados = [registro(1, 1000), registro(2, 1100, 25), registro(2, 1100, 25),
    registro(1, 9000, 50, 'DEF5678'), registro(2, 9200, 50, 'DEF5678')];
  const { ctx } = ambiente(dados);
  assert.equal(ctx.calcularMediaCombustivel(dados), '3.00 km/L');
  assert.equal(ctx.mediaPorVeiculo('ABC1234'), '2.00 km/L');
});

test('lançamento histórico usa vizinhos por data, não último item inserido', () => {
  const { ctx, avisos } = ambiente([registro(3, 1200), registro(1, 1000)]);
  assert.equal(ctx.confirmarKmCombustivel(registro(2, 1100), ''), true);
  assert.equal(avisos.length, 0);
});

test('Cancelar em KM inferior ou zerado preserva todos os registros', () => {
  const dados = [registro(1, 1000)], antes = JSON.stringify(dados);
  const { ctx, avisos } = ambiente(dados, false);
  assert.equal(ctx.confirmarKmCombustivel(registro(2, 900), ''), false);
  assert.match(avisos[0], /inferior.*anterior por data/);
  assert.equal(ctx.confirmarKmCombustivel(registro(2, 0), ''), false);
  assert.match(avisos[1], /zerado ou vazio/);
  assert.equal(JSON.stringify(dados), antes);
});

test('confirmação aceita exceção, ignora o próprio registro na edição e avisa sobre posterior', () => {
  const { ctx, avisos } = ambiente([registro(1, 1000), registro(3, 1200)]);
  assert.equal(ctx.confirmarKmCombustivel(registro(1, 950), '0'), true);
  assert.equal(avisos.length, 0);
  assert.equal(ctx.confirmarKmCombustivel(registro(2, 1300), ''), true);
  assert.match(avisos[0], /posterior/);
  assert.equal(ctx.confirmarKmCombustivel(registro(4, 900), ''), true);
  assert.match(avisos[1], /inferior/);
});

test('data anterior com KM superior ao posterior permite cancelar sem alterar dados', () => {
  const dados = [registro(15, 50000)], antes = JSON.stringify(dados);
  const { ctx, avisos } = ambiente(dados, false);
  assert.equal(ctx.confirmarKmCombustivel(registro(10, 51000), ''), false);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /superior ao abastecimento posterior/);
  assert.match(avisos[0], /10\/01\/2026/);
  assert.match(avisos[0], /15\/01\/2026/);
  assert.equal(JSON.stringify(dados), antes);
});

test('exceções existentes não escondem conflitos de KM em nenhuma direção', () => {
  const { ctx, avisos } = ambiente([
    registro(1, 50000), registro(5, 48000), registro(15, 52000), registro(20, 49000)
  ], false);
  assert.equal(ctx.confirmarKmCombustivel(registro(10, 49500), ''), false);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /inferior ao abastecimento anterior por data/);
  assert.match(avisos[0], /superior ao abastecimento posterior/);
  assert.match(avisos[0], /01\/01\/2026/);
  assert.match(avisos[0], /20\/01\/2026/);
});

test('ARLA participa da conferência do odômetro, sem misturar placas', () => {
  const { ctx, avisos } = ambiente([
    registro(1, 50000, 15, 'ABC-1234', 'Arla32'),
    registro(20, 1000, 50, 'DEF5678')
  ], false);
  assert.equal(ctx.confirmarKmCombustivel(registro(10, 49000), ''), false);
  assert.equal(ctx.confirmarKmCombustivel(registro(10, 51000), ''), true);
  assert.equal(avisos.length, 1);
});

test('KM igual é permitido e edição não compara o registro consigo mesmo', () => {
  const { ctx, avisos } = ambiente([registro(1, 50000), registro(15, 51000)]);
  assert.equal(ctx.confirmarKmCombustivel(registro(10, 50000), ''), true);
  assert.equal(ctx.confirmarKmCombustivel(registro(10, 51000), ''), true);
  assert.equal(ctx.confirmarKmCombustivel(registro(5, 50500), '1'), true);
  assert.equal(avisos.length, 0);
});

test('cupom antigo inserido depois recalcula sua média e a do abastecimento seguinte', () => {
  const primeiro = { ...registro(1, 121000, 200), cdata: '2026-11-01', _registradoEm: '2026-11-02' };
  const seguinte = { ...registro(3, 122000, 100), cdata: '2026-11-03', _registradoEm: '2026-11-04' };
  const antigo = { ...registro(2, 121400, 80), cdata: '2026-11-02', _registradoEm: '2026-11-06' };
  const dados = [seguinte, primeiro];
  const { ctx } = ambiente(dados);
  assert.equal(ctx.mediaPorAbastecimento(seguinte), '10.00 km/L');
  dados.push(antigo);
  const antes = JSON.stringify(dados);
  const intervalos = ctx.intervalosCombustivel(dados);
  assert.equal(ctx.mediaPorAbastecimento(primeiro, intervalos), '--');
  assert.equal(ctx.mediaPorAbastecimento(antigo, intervalos), '5.00 km/L');
  assert.equal(ctx.mediaPorAbastecimento(seguinte, intervalos), '6.00 km/L');
  assert.equal(ctx.calcularMediaCombustivel(dados), '5.56 km/L');
  assert.equal(JSON.stringify(dados), antes);
});

test('média do período usa referência anterior fora do filtro sem somar seus litros', () => {
  const dados = [registro(1, 1000, 70), registro(2, 1100, 50), registro(3, 1300, 100)];
  const { ctx } = ambiente(dados);
  assert.equal(ctx.calcularMediaCombustivel([dados[1]], dados), '2.00 km/L');
  assert.equal(ctx.calcularMediaCombustivel([dados[2]], dados), '2.00 km/L');
  assert.equal(ctx.calcularMediaCombustivel([dados[0]], dados), '--');
  assert.equal(ctx.calcularMediaCombustivel([], dados), '--');
});

test('produtos do mesmo cupom compartilham um intervalo sem duplicar distância ou litros', () => {
  const dados = [registro(1, 1000), registro(2, 1100, 25), registro(2, 1100, 25),
    registro(2, 1100, 10, 'ABC1234', 'Arla32')];
  const { ctx } = ambiente(dados);
  const intervalos = ctx.intervalosCombustivel(dados);
  assert.equal(intervalos.get(dados[1]), intervalos.get(dados[2]));
  assert.equal(ctx.mediaPorAbastecimento(dados[1], intervalos), '2.00 km/L');
  assert.equal(ctx.mediaPorAbastecimento(dados[2], intervalos), '2.00 km/L');
  assert.equal(ctx.mediaPorAbastecimento(dados[3], intervalos), '--');
  assert.equal(ctx.calcularMediaCombustivel(dados.slice(1), dados), '2.00 km/L');
});

test('média por cupom não atravessa KM zerado ou regressivo', () => {
  const dados = [registro(1, 1000), registro(2, 900), registro(3, 1200), registro(4, 1300)];
  const { ctx } = ambiente(dados);
  const intervalos = ctx.intervalosCombustivel(dados);
  assert.equal(ctx.mediaPorAbastecimento(dados[1], intervalos), '--');
  assert.equal(ctx.mediaPorAbastecimento(dados[2], intervalos), '--');
  assert.equal(ctx.mediaPorAbastecimento(dados[3], intervalos), '2.00 km/L');
});

test('escritor compartilhado cancela antes de persistir ou limpar o formulário', () => {
  const dados = [registro(1, 1000)], antes = JSON.stringify(dados);
  const { ctx, avisos } = ambiente(dados, false);
  const candidato = registro(2, 900);
  const campos = Object.keys(candidato);
  ctx.document.getElementById = id => ({ value: id === 'c_idx' ? '' : candidato[id] });
  ctx.salvarNuvem = () => assert.fail('Não deve gravar após Cancelar');
  ctx.renderModulo = () => assert.fail('Não deve renderizar após Cancelar');
  ctx.limparForm = () => assert.fail('Não deve limpar após Cancelar');
  vm.runInContext(trecho('function salvar(mod, campos, idCampo, contexto)', 'function feriasParaUtc('), ctx);
  assert.equal(ctx.salvar('combustivel', campos, 'c_idx'), false);
  assert.equal(avisos.length, 1);
  assert.equal(JSON.stringify(dados), antes);
});

test('planilha histórica usa o escritor compartilhado sem reduzir o odômetro do cadastro', () => {
  const seguinte = registro(3, 122000, 100);
  const dados = [registro(1, 121000, 200), seguinte];
  const { ctx, avisos } = ambiente(dados);
  ctx.db.veiculos = [{ vplaca: 'ABC1234', vkm: 123000 }];
  ctx.db.historicoKm = [{ placa: 'ABC1234', km: 123000 }];
  const cadastroAntes = JSON.stringify([ctx.db.veiculos, ctx.db.historicoKm]);
  const candidato = registro(2, 121400, 80);
  candidato.cvalorlitro = 6;
  ctx.document.getElementById = id => ({ value: id === 'c_idx' ? '' : candidato[id] });
  ctx.FMCombustivelPlanilhaDados = { erro: () => '', igual: () => false };
  ctx.fmPrepararRegistro = (_mod, obj) => obj;
  ctx.salvarNuvem = () => assert.fail('O lote deve sincronizar somente após a confirmação de seus itens');
  vm.runInContext(trecho('function salvar(mod, campos, idCampo, contexto)', 'function feriasParaUtc('), ctx);
  const salvo = ctx.salvar('combustivel', Object.keys(candidato), 'c_idx', {
    combustivelPlanilha: true,
    dados: { ctotal: 480, ccompetencia: '2026-01', cimportacaoReferencia: 'cupom-historico' }
  });
  assert.equal(dados.length, 3);
  assert.equal(dados[2], salvo);
  assert.equal(salvo.cimportacaoReferencia, 'cupom-historico');
  assert.equal(ctx.mediaPorAbastecimento(salvo), '5.00 km/L');
  assert.equal(ctx.mediaPorAbastecimento(seguinte), '6.00 km/L');
  assert.equal(avisos.length, 0);
  assert.equal(JSON.stringify([ctx.db.veiculos, ctx.db.historicoKm]), cadastroAntes);
});

test('entrada legada delega ao formulário validado, sem gravar média pelo KM total do veículo', () => {
  const { ctx } = ambiente();
  let chamadas = 0;
  ctx.salvarCombustivelCustom = () => { chamadas++; return false; };
  vm.runInContext(trecho('function salvarCombustivel(){', 'function estoqueNumero('), ctx);
  assert.equal(ctx.salvarCombustivel(), false);
  assert.equal(chamadas, 1);
});
