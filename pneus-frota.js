/* Ponte de cadastro -> eventos existentes; não cria lançamentos financeiros. */
(function () {
  'use strict';
  function numero(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).replace(/R\$\s*/g, '').trim();
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return Number(s) || 0;
  }
  function placa(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function chave(v) { return String(v || '').trim().toUpperCase(); }
  function banco() { return typeof db !== 'undefined' ? db : window.db; }
  function preparar(p, anterior) {
    var b = banco(), uso = p.pstatus === 'Em Uso';
    if (!b) return {erro:'Os cadastros ainda não estão disponíveis.'};
    if (typeof window.fmModuloCarregado === 'function' &&
        (!window.fmModuloCarregado('pneus') || !window.fmModuloCarregado('eventosPneus'))) {
      return {erro:'Aguarde o carregamento de Pneus e Pneus por KM antes de salvar.'};
    }
    var lista = Array.isArray(b.eventosPneus) ? b.eventosPneus : [];
    var eventos = lista.filter(function (e) {
      return e && ((anterior && anterior.pid && e.cadastroPneuId === anterior.pid) || chave(e.pneuId) === chave(anterior ? anterior.pnumero : p.pnumero));
    }).sort(function (a, c) { return String(a.data).localeCompare(String(c.data)) || numero(a.odometro)-numero(c.odometro); });
    var ultimo = eventos[eventos.length-1];
    var ativo = ultimo && ultimo.tipo !== 'Retirada' && ultimo.tipo !== 'Descarte';
    if (anterior && chave(anterior.pnumero) !== chave(p.pnumero) && eventos.length) {
      return {erro:'Este pneu já tem histórico em Pneus por KM. Mantenha seu número para preservar os vínculos.'};
    }
    var mudou = anterior && (anterior.pstatus !== p.pstatus || placa(anterior.pveiculo) !== placa(p.pveiculo) || anterior.pposicao !== p.pposicao);
    if (!uso && !ativo) return {eventos:[]};
    var dt = p.pdatainstalacao, odo = numero(uso ? p.pkminstalacao : p.pkmatual);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dt || '') || !Number.isFinite(Date.parse(dt+'T12:00:00'))) {
      return {erro:'Informe a data da instalação ou movimentação do pneu.'};
    }
    if (uso) {
      var v = (b.veiculos || []).find(function (x) { return placa(x.vplaca) === placa(p.pveiculo); });
      if (!v || String(v.vstatus || '').toUpperCase() === 'VENDIDO') return {erro:'Selecione um veículo ativo cadastrado para o pneu Em Uso.'};
      p.pveiculo = v.vplaca;
      if (numero(p.pvalor) <= 0 || numero(p.pvida) <= 0 || odo <= 0) return {erro:'Para o pneu Em Uso, informe valor de compra, vida útil e KM da instalação maiores que zero.'};
    } else if (odo <= 0) return {erro:'Informe o KM Atual para registrar a retirada do pneu.'};
    var instalacao = eventos.slice().reverse().find(function (e) { return e.tipo === 'Instalação' || e.tipo === 'Recapagem'; });
    var mesma = ativo && uso && !mudou && placa(ultimo.veiculo) === placa(p.pveiculo);
    if (mesma && instalacao && instalacao.origem !== 'cadastro_pneus') {
      if (numero(instalacao.valor) !== numero(p.pvalor) || numero(instalacao.vidaUtilKm) !== numero(p.pvida) || numero(instalacao.odometro) !== odo || instalacao.data !== dt) {
        return {erro:'Este pneu já possui uma instalação manual. Confira os dados em Pneus por KM antes de alterar seu ciclo.'};
      }
      return {eventos:[]};
    }
    if (ultimo && !mesma && dt < ultimo.data) return {erro:'A data da movimentação não pode ser anterior ao último evento em Pneus por KM.'};
    if (ultimo && !mesma && dt === ultimo.data) return {erro:'Informe uma data posterior ao último evento para preservar a ordem das movimentações.'};
    if (ativo && uso && (!anterior || anterior.pstatus !== 'Em Uso') && !mesma) return {erro:'Este pneu já possui um ciclo ativo em Pneus por KM. Registre a retirada antes de reinstalar.'};
    var tipo = uso ? (ativo && mudou ? 'Rodízio' : 'Instalação') : (p.pstatus === 'Descartado' ? 'Descarte' : 'Retirada');
    var anteriorEvento = mesma ? (ultimo.tipo === 'Rodízio' ? ultimo : instalacao) : null;
    if (anteriorEvento && anteriorEvento.origem !== 'cadastro_pneus') return {erro:'Altere esta movimentação manual na aba Pneus por KM para preservar seu histórico.'};
    var e = Object.assign({}, anteriorEvento || {}, {
      id:anteriorEvento ? anteriorEvento.id : 'pneu-auto-'+p.pid+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),
      pneuId:chave(p.pnumero), cadastroPneuId:p.pid, origem:'cadastro_pneus', tipo:anteriorEvento ? anteriorEvento.tipo : tipo,
      data:dt, veiculo:uso ? p.pveiculo : ultimo.veiculo, posicao:p.pposicao || '', odometro:odo,
      valor:tipo === 'Instalação' ? Math.round(numero(p.pvalor)*100)/100 : 0,
      vidaUtilKm:numero(p.pvida), kmRodado:0, observacao:p.pobs || '', atualizadoEm:new Date().toISOString()
    });
    if (e.tipo === 'Rodízio') {
      // O odômetro de origem e o de destino são independentes numa transferência.
      e.odometroOrigem = mesma ? numero(anteriorEvento.odometroOrigem) : numero(p.pkmatual);
      if (placa(ultimo.veiculo) !== placa(p.pveiculo) && e.odometroOrigem <= 0) return {erro:'Informe o KM Atual do veículo de origem e o KM Instalação do destino antes de transferir o pneu.'};
      e.valor = 0;
    }
    if (mesma && instalacao && instalacao.id !== e.id && (numero(instalacao.valor) !== numero(p.pvalor) || numero(instalacao.vidaUtilKm) !== numero(p.pvida))) {
      return {erro:'Após um rodízio, altere valor e vida útil no evento original de Pneus por KM.'};
    }
    if (mesma && eventos.some(function (x) { return x.id !== e.id && ((x.data > anteriorEvento.data && x.data <= dt) || (x.data < anteriorEvento.data && x.data >= dt)); })) return {erro:'A data da instalação deve preservar a ordem dos eventos do pneu.'};
    if (!mesma && placa(e.veiculo) === placa(ultimo && ultimo.veiculo) && ultimo && odo < numero(ultimo.odometro)) return {erro:'O odômetro da movimentação não pode ser menor que o último odômetro registrado.'};
    return {eventos:[e]};
  }
  function aplicar(plano) {
    var b = banco();
    if (!b || !plano || plano.erro || !plano.eventos.length) return false;
    if (!Array.isArray(b.eventosPneus)) b.eventosPneus = [];
    plano.eventos.forEach(function (e) {
      var i = b.eventosPneus.findIndex(function (x) { return x.id === e.id; });
      if (typeof window.fmPrepararRegistro === 'function') window.fmPrepararRegistro('eventosPneus', e, i >= 0 ? b.eventosPneus[i] : null);
      if (i < 0) b.eventosPneus.push(e); else b.eventosPneus[i] = e;
    });
    return true;
  }
  window.FMPneusFrota = {preparar:preparar, aplicar:aplicar};
})();