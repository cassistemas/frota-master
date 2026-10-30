/* Executar: node --test tests/reservas-dashboard.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inicio = html.indexOf('const agoraSaida = new Date();');
const fim = html.indexOf("document.getElementById('listaAlertasRapidos').innerHTML = alertas.join('');", inicio);
assert.ok(inicio >= 0 && fim > inicio, 'Bloco dos alertas de saída encontrado');
const fonte = html.slice(inicio, fim);
const reserva = extra => Object.assign({
  svreserva: 'Reservado', svstatus: 'Em Viagem', svnumeroreserva: '12',
  svveiculo: 'ABC-1234', svmotorista: 'João', svdestino: 'Centro',
  svdataSaida: '2026-08-20', svhoraSaida: '08:00',
  svdataChegada: '2026-08-20', svhoraChegada: '18:00'
}, extra);
function render(saidas, data = '2026-06-10T12:00:00') {
  class Relogio extends Date {
    constructor(...args) { super(...(args.length ? args : [data])); }
  }
  const db = { saidaVeiculos: saidas };
  const antes = JSON.stringify(db);
  const contexto = { db, alertas: [], Date: Relogio,
    formatarDataBR: valor => String(valor).split('-').reverse().join('/') };
  vm.runInNewContext(fonte, contexto);
  assert.equal(JSON.stringify(db), antes, 'Alertas não alteram os registros');
  return contexto.alertas;
}
test('reservas aprovadas e manuais aparecem mesmo muito antes da saída', () => {
  const alertas = render([reserva(), reserva({ svnumeroreserva: '13', svveiculo: 'XYZ-9999' })]);
  assert.equal(alertas.length, 2);
  assert.match(alertas[0], /Reserva confirmada/);
  assert.match(alertas[0], /Reserva Nº 12/);
  assert.match(alertas[0], /João/);
  assert.match(alertas[0], /Centro/);
  assert.match(alertas[0], /20\/08\/2026/);
  assert.match(alertas[0], /18:00/);
});
test('saída amanhã ou hoje gera um único alerta por reserva', () => {
  const amanha = render([reserva({ svdataSaida: '2026-06-11' })]);
  assert.equal(amanha.length, 1);
  assert.match(amanha[0], /saída amanhã/);
  const hoje = render([reserva({ svdataSaida: '2026-06-10' })]);
  assert.equal(hoje.length, 1);
  assert.match(hoje[0], /saída hoje/);
});
test('reservas seguem visíveis até finalizar, inclusive com previsão vencida', () => {
  const alertas = render([reserva({ svdataSaida: '2026-06-09', svdataChegada: '2026-06-09' })]);
  assert.equal(alertas.length, 1);
  assert.match(alertas[0], /devolução prevista em atraso/);
  assert.match(alertas[0], /alerta-vencido/);
});
test('finalizadas, canceladas e reservas liberadas com chegada não aparecem', () => {
  assert.equal(render([
    reserva({ svstatus: 'Finalizado' }),
    reserva({ svstatus: 'Cancelado' }),
    reserva({ svstatus: 'Cancelada' }),
    reserva({ svreserva: 'Liberado' })
  ]).length, 0);
});
test('preserva o alerta existente de viagem sem chegada sem duplicar reserva', () => {
  const alertas = render([
    reserva({ svdataChegada: '', svhoraChegada: '' }),
    reserva({ svreserva: 'Liberado', svdataChegada: '', svhoraChegada: '' })
  ]);
  assert.equal(alertas.length, 2);
  assert.match(alertas[0], /Reserva confirmada/);
  assert.match(alertas[1], /Em viagem — sem chegada registrada/);
});
test('escapa os dados dos usuários e tolera lista vazia', () => {
  const alertas = render([reserva({ svmotorista: '<script>alert(1)</script>', svdestino: 'A & B' })]);
  assert.doesNotMatch(alertas[0], /<script>/);
  assert.match(alertas[0], /&lt;script&gt;/);
  assert.match(alertas[0], /A &amp; B/);
  assert.equal(render([]).length, 0);
});
