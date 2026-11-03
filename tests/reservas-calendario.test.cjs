/* Executar: node --test tests/reservas-calendario.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { montarEventos, eventosDoDia } = require('../reservas-calendario.js');
const sol = extra => Object.assign({ id: 's1', placa: 'ABC-1234', status: 'Pendente',
  dataSaida: '2026-08-20', horaSaida: '08:00', dataChegada: '2026-08-22', horaChegada: '18:00' }, extra);
const saida = extra => Object.assign({ svveiculo: 'ABC1234', svreserva: 'Reservado', svstatus: 'Em Viagem',
  svnumeroreserva: '12', svdataSaida: '2026-08-20', svhoraSaida: '08:00',
  svdataChegada: '2026-08-22', svhoraChegada: '18:00' }, extra);
test('inclui pedidos de todos os usuários e classifica as situações sem expor dados pessoais', () => {
  const { eventos } = montarEventos({ solicitacoes: [
    sol({ uid: 'outro', solicitante: 'Nome privado', destino: 'Destino privado' }),
    sol({ status: 'Em aprovação' }), sol({ status: 'Aprovada' }), sol({ status: 'Em uso' }),
    sol({ status: 'Cancelada' }), sol({ status: 'Recusada' }), sol({ status: 'Concluída' }),
    sol({ status: 'Devolução informada' }), sol({ status: 'Excluída' })
  ] });
  assert.deepEqual(eventos.map(e => e.cor), ['pendente', 'pendente', 'aprovada', 'uso']);
  assert.doesNotMatch(JSON.stringify(eventos), /Nome privado|Destino privado|"uid"/);
});
test('reservas com vários dias aparecem em todos os dias atravessados e respeitam o filtro', () => {
  const { eventos } = montarEventos({ solicitacoes: [sol()] });
  for (const dia of ['2026-08-20', '2026-08-21', '2026-08-22']) {
    assert.equal(eventosDoDia(eventos, dia, 'abc1234').length, 1);
  }
  assert.equal(eventosDoDia(eventos, '2026-08-19', '').length, 0);
  assert.equal(eventosDoDia(eventos, '2026-08-23', '').length, 0);
  assert.equal(eventosDoDia(eventos, '2026-08-21', 'XYZ9999').length, 0);
});
test('retorno à meia-noite não ocupa o dia seguinte', () => {
  const { eventos } = montarEventos({ solicitacoes: [sol({ horaChegada: '00:00' })] });
  assert.equal(eventosDoDia(eventos, '2026-08-21', '').length, 1);
  assert.equal(eventosDoDia(eventos, '2026-08-22', '').length, 0);
});
test('deduplica aprovação pela placa e número sem esconder outra placa com o mesmo número', () => {
  const { eventos } = montarEventos({ solicitacoes: [sol({ status: 'Em uso', numeroReserva: '12' })],
    saidas: [saida(), saida({ svveiculo: 'XYZ9999' })] });
  assert.equal(eventos.length, 2);
  assert.equal(eventos.filter(e => e.cor === 'uso').length, 1);
  assert.equal(eventos.filter(e => e.origem === 'Saída de Veículos').length, 1);
});
test('período idêntico permite deduplicar registros antigos sem número', () => {
  const { eventos } = montarEventos({ solicitacoes: [sol({ status: 'Aprovada' })],
    saidas: [saida({ svnumeroreserva: '' })] });
  assert.equal(eventos.length, 1);
});
test('canceladas, recusadas e devolvidas não reaparecem pela saída vinculada', () => {
  for (const status of ['Cancelada', 'Recusada', 'Concluída', 'Devolução informada', 'Excluída']) {
    assert.equal(montarEventos({ solicitacoes: [sol({ status, numeroReserva: '12' })], saidas: [saida()] }).eventos.length, 0);
  }
});
test('reservas manuais ativas aparecem e finalizadas, liberadas e canceladas não', () => {
  const { eventos } = montarEventos({ saidas: [saida(), saida({ svstatus: 'Finalizado' }),
    saida({ svstatus: 'Cancelada' }), saida({ svreserva: 'Liberado' })] });
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].situacao, 'Aprovada');
});
test('registros inválidos geram aviso e a consulta não modifica suas fontes', () => {
  const ctx = { solicitacoes: [sol(), sol({ horaSaida: '' }), sol({ dataSaida: '2026-02-30' }),
    sol({ horaSaida: '29:00' }), sol({ dataChegada: '2026-08-19' })], saidas: [saida()] };
  const antes = JSON.stringify(ctx), resultado = montarEventos(ctx);
  assert.equal(resultado.ignorados, 4);
  assert.equal(JSON.stringify(ctx), antes);
  assert.deepEqual(montarEventos(), { eventos: [], ignorados: 0 });
});
test('página inclui a agenda e mantém os scripts inline sintaticamente válidos', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'reserva.html'), 'utf8');
  assert.match(html, /reservas-calendario\.css\?v=1/);
  assert.match(html, /reservas-calendario\.js\?v=1/);
  assert.match(html, /data-aba="calendario">Calendário/);
  assert.match(html, /irAba\(u\?"calendario":"reservar"\)/);
  for (const bloco of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(bloco[1]);
});
