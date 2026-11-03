/* Agenda somente de consulta. Não grava dados nem altera as regras de reserva. */
(function (raiz) {
  "use strict";
  function placa(p) { return String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function instante(data, hora) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora || "")) return null;
    var d = new Date(data + "T" + hora);
    return isNaN(d.getTime()) || iso(d) !== data ? null : d.getTime();
  }
  function chave(p, n) { return n ? placa(p) + ":" + String(n).trim() : ""; }
  function montarEventos(ctx) {
    ctx = ctx || {};
    var eventos = [], ignorados = 0, vinculados = new Set(), periodos = new Set();
    var ativos = { "Pendente": "pendente", "Em aprovação": "pendente", "Aprovada": "aprovada", "Em uso": "uso" };
    function adicionar(e) {
      e.inicio = instante(e.dataSaida, e.horaSaida); e.fim = instante(e.dataChegada, e.horaChegada);
      if (!e.placa || e.inicio === null || e.fim === null || e.fim <= e.inicio) { ignorados++; return; }
      eventos.push(e);
    }
    (ctx.solicitacoes || []).forEach(function (s) {
      if (!s) return;
      // A aprovação vincula a Saída por placa e número, não por motorista ou destino.
      var k = chave(s.placa, s.numeroReserva);
      if (k) vinculados.add(k);
      if (!ativos[s.status]) return;
      if (!k && s.status !== "Pendente") periodos.add([placa(s.placa), s.dataSaida, s.horaSaida, s.dataChegada, s.horaChegada].join("|"));
      adicionar({ placa: s.placa, dataSaida: s.dataSaida, horaSaida: s.horaSaida,
        dataChegada: s.dataChegada, horaChegada: s.horaChegada, situacao: s.status,
        cor: ativos[s.status], origem: "Solicitação", numero: s.numeroReserva || "" });
    });
    (ctx.saidas || []).forEach(function (s) {
      if (!s || s.svreserva !== "Reservado" || /cancelad|finalizad|conclu/i.test(s.svstatus || "")) return;
      var k = chave(s.svveiculo, s.svnumeroreserva);
      var periodo = [placa(s.svveiculo), s.svdataSaida, s.svhoraSaida, s.svdataChegada, s.svhoraChegada].join("|");
      if ((k && vinculados.has(k)) || (!k && periodos.has(periodo))) return;
      adicionar({ placa: s.svveiculo, dataSaida: s.svdataSaida, horaSaida: s.svhoraSaida,
        dataChegada: s.svdataChegada, horaChegada: s.svhoraChegada,
        situacao: "Aprovada", cor: "aprovada", origem: "Saída de Veículos", numero: s.svnumeroreserva || "" });
    });
    eventos.sort(function (a, b) { return a.inicio - b.inicio || String(a.placa).localeCompare(String(b.placa)); });
    return { eventos: eventos, ignorados: ignorados };
  }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function eventosDoDia(eventos, dia, filtro) {
    var de = new Date(dia + "T00:00:00"), ate = new Date(de); ate.setDate(ate.getDate() + 1);
    return eventos.filter(function (e) { return (!filtro || placa(e.placa) === placa(filtro)) && e.inicio < ate.getTime() && e.fim > de.getTime(); });
  }
  function criar(opcoes) {
    var $ = function (id) { return document.getElementById(id); };
    var hoje = iso(new Date()), dia = hoje, mes = new Date(hoje + "T12:00:00"); mes.setDate(1);
    var ctx = {}, modelo = { eventos: [], ignorados: 0 }, pronto = false;
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function dataBR(s) { return String(s).split("-").reverse().join("/"); }
    function atualizar(dados) {
      ctx = dados || {}; modelo = montarEventos(ctx);
      var sel = $("calVeiculo"), atual = sel.value, veiculos = new Map();
      (ctx.veiculos || []).forEach(function (v) { if (v && v.vplaca) veiculos.set(placa(v.vplaca), { valor: v.vplaca, texto: v.vplaca + (v.vmodelo ? " — " + v.vmodelo : "") }); });
      modelo.eventos.forEach(function (e) { if (!veiculos.has(placa(e.placa))) veiculos.set(placa(e.placa), { valor: e.placa, texto: e.placa }); });
      sel.innerHTML = '<option value="">Todos os veículos</option>' + Array.from(veiculos.values()).sort(function (a, b) { return a.texto.localeCompare(b.texto); }).map(function (v) { return '<option value="' + esc(v.valor) + '">' + esc(v.texto) + '</option>'; }).join("");
      sel.value = atual; render();
    }
    function render() {
      var cargas = ctx.agendaCarga || {}, fontes = ["veiculos", "saidas", "solicitacoes"];
      var falhas = fontes.filter(function (k) { return cargas[k] === "erro"; });
      pronto = fontes.every(function (k) { return cargas[k] === "ok"; });
      var nomes = { veiculos: "cadastro de veículos", saidas: "Saída de Veículos", solicitacoes: "solicitações" };
      $("calCarga").textContent = falhas.length ? "Agenda incompleta: não foi possível ler " + falhas.map(function (k) { return nomes[k]; }).join(", ") + ". Verifique a conexão e as permissões com o administrador; a ausência de registros não garante disponibilidade."
        : !pronto ? "Carregando a agenda... Aguarde antes de consultar a disponibilidade." : "Agenda carregada. As alterações recebidas são atualizadas automaticamente.";
      if (modelo.ignorados) $("calCarga").textContent += " Há " + modelo.ignorados + " registro(s) sem período válido que não puderam ser exibidos.";
      $("calCarga").classList.toggle("cal-alerta", !!falhas.length || !!modelo.ignorados);
      $("calMes").textContent = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      var html = "", ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      for (var vazio = 0; vazio < mes.getDay(); vazio++) html += '<span class="cal-vazio" aria-hidden="true"></span>';
      for (var n = 1; n <= ultimo; n++) {
        var data = iso(new Date(mes.getFullYear(), mes.getMonth(), n)), itens = eventosDoDia(modelo.eventos, data, $("calVeiculo").value);
        var cores = ["pendente", "aprovada", "uso"].filter(function (c) { return itens.some(function (e) { return e.cor === c; }); });
        html += '<button type="button" class="cal-dia' + (data === dia ? ' selecionado' : '') + (data === hoje ? ' hoje' : '') + '" data-cal-dia="' + data + '" aria-pressed="' + (data === dia) + '" aria-label="' + dataBR(data) + ', ' + itens.length + ' agendamento(s)' + (data === hoje ? ', hoje' : '') + '"><b>' + n + '</b><span class="cal-pontos">' + cores.map(function (c) { return '<i class="cal-' + c + '"></i>'; }).join("") + '</span><small>' + (itens.length ? itens.length : '—') + '</small></button>';
      }
      $("calDias").innerHTML = html; renderDia();
    }
    function renderDia() {
      var itens = eventosDoDia(modelo.eventos, dia, $("calVeiculo").value);
      $("calDiaTitulo").textContent = new Date(dia + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
      $("calLista").innerHTML = itens.length ? itens.map(function (e) {
        return '<article class="cal-evento cal-' + e.cor + '"><div><b>' + esc(e.placa) + '</b><span>' + esc(e.situacao) + '</span></div><p>Saída: ' + dataBR(e.dataSaida) + ' às ' + esc(e.horaSaida) + '<br>Retorno previsto: ' + dataBR(e.dataChegada) + ' às ' + esc(e.horaChegada) + '</p><small>' + esc(e.origem) + (e.numero ? ' · Reserva nº ' + esc(e.numero) : '') + '</small></article>';
      }).join("") : '<p class="cal-aviso">' + (pronto ? 'Nenhum agendamento encontrado para este dia e filtro.' : 'Nenhum agendamento exibido até o momento. A agenda ainda não foi carregada por completo.') + '</p>';
      $("calSolicitar").disabled = !pronto || dia < iso(new Date());
    }
    function mudarMes(delta) {
      mes.setMonth(mes.getMonth() + delta);
      dia = iso(mes); render();
    }
    $("calAnterior").onclick = function () { mudarMes(-1); };
    $("calProximo").onclick = function () { mudarMes(1); };
    $("calHoje").onclick = function () { dia = iso(new Date()); mes = new Date(dia + "T12:00:00"); mes.setDate(1); render(); };
    $("calVeiculo").onchange = render;
    $("calDias").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-cal-dia]"); if (!b) return;
      dia = b.getAttribute("data-cal-dia"); render();
      var selecionado = $("calDias").querySelector('[data-cal-dia="' + dia + '"]'); if (selecionado) selecionado.focus();
    });
    $("calSolicitar").onclick = function () {
      if (!pronto || dia < iso(new Date())) return;
      var filtro = $("calVeiculo").value;
      var v = (ctx.veiculos || []).find(function (v) { return placa(v.vplaca) === placa(filtro); });
      if (filtro && (!v || String(v.vstatus || "Ativo") !== "Ativo")) { alert("Este veículo não está ativo no cadastro. Escolha outro veículo para solicitar."); return; }
      opcoes.solicitar({ dia: dia, placa: v ? v.vplaca : "" });
    };
    render();
    return { atualizar: atualizar, render: render };
  }
  var api = { montarEventos: montarEventos, eventosDoDia: eventosDoDia, criar: criar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (raiz) raiz.FMReservasCalendario = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
