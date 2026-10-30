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
