/* ==========================================================
   FROTA MASTER - APROVAÇÃO DE RESERVAS (Saída de Veículos)
   Painel separado. Aprovar preenche o formulário existente e
   salva pelo salvarSaidaVeiculo(), com as regras atuais.
   ========================================================== */
(function () {
  "use strict";
  var COL = "reservasVeiculos";
  var lista = [], zap = "", escuta = null, editandoDev = "";
  function R() { return window.FMReservasRegras; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function getDb() { try { return typeof db !== "undefined" ? db : null; } catch (e) { return null; } }
  function cloud() { try { return typeof dbCloud !== "undefined" ? dbCloud : null; } catch (e) { return null; } }
  function logado() { try { return !!(typeof auth !== "undefined" && auth.currentUser); } catch (e) { return false; } }
  function ehAdmin() { try { return !!(usuarioLogado && usuarioLogado.tipo === "admin"); } catch (e) { return false; } }

  function painel() {
    var mod = document.getElementById("saidaVeiculos");
    if (!mod) return null;
    var p = document.getElementById("fmReservasPainel");
    if (p) return p;
    p = document.createElement("div");
    p.id = "fmReservasPainel";
    p.className = "glass-container";
    p.style.marginBottom = "14px";
    var titulo = mod.querySelector("h3");
    if (titulo && titulo.nextSibling) mod.insertBefore(p, titulo.nextSibling); else mod.insertBefore(p, mod.firstChild);
    return p;
  }

  function render() {
    var p = painel(); if (!p) return;
    var pend = lista.filter(function (s) { return s.status === "Pendente"; }).sort(function (a, b) { return String(a.dataSaida + a.horaSaida).localeCompare(String(b.dataSaida + b.horaSaida)); });
    var devs = lista.filter(function (s) { return s.status === "Devolução informada"; });
    var link = location.href.replace(/[^/]*([?#].*)?$/, "") + "reserva.html";
    var r = R();
    p.innerHTML =
      '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">' +
      '<h5 style="margin:0">📋 Solicitações de reserva pendentes <span class="badge bg-warning text-dark">' + pend.length + '</span></h5>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
      '<button type="button" class="btn btn-sm btn-outline-primary" data-acao="copiar">Copiar link da página de reserva</button>' +
      (ehAdmin() ? '<input id="fmReservaZap" class="form-control form-control-sm" style="width:190px" placeholder="WhatsApp do aviso" value="' + esc(zap) + '"><button type="button" class="btn btn-sm btn-outline-success" data-acao="zap">Salvar WhatsApp</button>' : '') +
      '</div></div>' +
      '<div style="font-size:12px;color:#6c757d;margin:4px 0 8px">Página de reserva: <a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + '</a></div>' +
      (pend.length ? '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Solicitante</th><th>Veículo</th><th>Saída</th><th>Chegada</th><th>Destino / motivo</th><th></th></tr></thead><tbody>' +
        pend.map(function (s) {
          return '<tr data-reserva-pendente="' + esc(s.id) + '"><td>' + esc(s.solicitante) + '</td><td><b>' + esc(s.placa) + '</b></td><td>' + r.dataBR(s.dataSaida) + ' ' + esc(s.horaSaida) + '</td><td>' + r.dataBR(s.dataChegada) + ' ' + esc(s.horaChegada) + '</td><td>' + esc(s.destino) + (s.motivo ? '<br><small class="text-muted">' + esc(s.motivo) + '</small>' : '') + '</td>' +
            '<td style="white-space:nowrap"><button type="button" class="btn btn-sm btn-success" data-acao="aprovar" data-id="' + esc(s.id) + '">Aprovar</button> <button type="button" class="btn btn-sm btn-outline-danger" data-acao="recusar" data-id="' + esc(s.id) + '">Recusar</button></td></tr>';
        }).join("") + '</tbody></table></div>' : '<div class="text-muted" style="font-size:13px">Nenhuma solicitação pendente.</div>') +
      (devs.length ? '<h6 style="margin:12px 0 6px">🔁 Devoluções a confirmar <span class="badge bg-info text-dark">' + devs.length + '</span></h6><div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Nº</th><th>Motorista</th><th>Veículo</th><th>Saída real</th><th>Devolução</th><th>KM final</th><th>Endereço da devolução</th><th></th></tr></thead><tbody>' +
        devs.map(function (s) {
          return '<tr><td>' + esc(s.numeroReserva) + '</td><td>' + esc(s.solicitante) + '</td><td><b>' + esc(s.placa) + '</b></td><td>' + r.dataBR(s.dataSaidaReal) + ' ' + esc(s.horaSaidaReal) + '</td><td>' + r.dataBR(s.dataDevolucao) + ' ' + esc(s.horaDevolucao) + '</td><td>' + esc(s.kmFinal || '--') + '</td><td>' + esc(s.enderecoDevolucao || '--') + (s.latitude ? ' <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + esc(s.latitude) + ',' + esc(s.longitude) + '">mapa</a>' : '') + '</td>' +
            '<td style="white-space:nowrap"><button type="button" class="btn btn-sm btn-primary" data-acao="devolucao" data-id="' + esc(s.id) + '">Confirmar devolução</button>' +
            (ehAdmin() ? ' <button type="button" class="btn btn-sm btn-outline-secondary" data-acao="editar-dev" data-id="' + esc(s.id) + '">Editar</button> <button type="button" class="btn btn-sm btn-outline-danger" data-acao="excluir-dev" data-id="' + esc(s.id) + '">Excluir</button>' : '') + '</td></tr>' +
            (editandoDev === s.id ? linhaEdicao(s) : '');
        }).join("") + '</tbody></table></div>' : '') +
      (ehAdmin() && !zap ? '<div class="alert alert-warning py-1 px-2 mt-2 mb-0" style="font-size:13px">Cadastre o seu WhatsApp acima para os motoristas poderem avisar você.</div>' : '');
  }

  var CAMPOS_DEV = [["numeroReserva", "Nº da reserva", "text"], ["dataSaidaReal", "Data saída real", "date"], ["horaSaidaReal", "Hora saída", "time"], ["dataDevolucao", "Data devolução", "date"], ["horaDevolucao", "Hora devolução", "time"], ["kmFinal", "KM final", "number"], ["enderecoDevolucao", "Endereço da devolução", "text"]];
  function linhaEdicao(s) {
    return '<tr class="fm-dev-edicao"><td colspan="8"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">' +
      CAMPOS_DEV.map(function (c) { return '<label style="font-size:12px;display:flex;flex-direction:column;gap:2px' + (c[0] === "enderecoDevolucao" ? ';flex:1 1 260px' : '') + '">' + c[1] + '<input class="form-control form-control-sm" data-dev-campo="' + c[0] + '" type="' + c[2] + '" value="' + esc(s[c[0]] || "") + '"></label>'; }).join("") +
      '<button type="button" class="btn btn-sm btn-success" data-acao="salvar-dev" data-id="' + esc(s.id) + '">Salvar</button><button type="button" class="btn btn-sm btn-outline-secondary" data-acao="cancelar-dev">Cancelar</button></div></td></tr>';
  }
  function acaoAdmin(id, acao, dados) {
    var fs = cloud(), s = lista.find(function (x) { return x.id === id; });
    var erro = R().validarAcaoAdmin(s, ehAdmin(), acao);
    if (erro) { alert(erro); return; }
    if (acao === "excluir" && !confirm("Excluir a devolução Nº " + (s.numeroReserva || "") + " de " + s.placa + "?\nA saída já registrada em Saída de Veículos não será apagada.")) return;
    var ref = fs.collection(COL).doc(id), quem = window.nomeUsuarioAtual ? nomeUsuarioAtual() : "", agora = new Date().toISOString();
    fs.runTransaction(function (t) {
      return t.get(ref).then(function (d) {
        var e = R().validarAcaoAdmin(d.exists ? d.data() : null, ehAdmin(), acao); if (e) throw new Error(e);
        t.update(ref, acao === "excluir" ? { status: "Excluída", excluidoPor: quem, excluidoEm: agora, atualizadoEm: agora } : Object.assign({}, dados, { editadoPor: quem, editadoEm: agora, atualizadoEm: agora }));
      });
    }).then(function () { editandoDev = ""; render(); }).catch(function (e) { alert(e && e.message ? e.message : "Não foi possível concluir agora."); });
  }

  function definir(id, v) { var el = document.getElementById(id); if (el) el.value = v; }

  function aprovar(id) {
    var s = lista.find(function (x) { return x.id === id; });
    var base = getDb(), fs = cloud();
    if (!s || !base || !fs) return;
    var outras = lista.filter(function (x) { return x.id !== id; });
    var erro = R().validarSolicitacao(s, { veiculos: base.veiculos, saidas: base.saidaVeiculos, solicitacoes: outras, ignorarPassado: true });
    if (erro) { alert("Não é possível aprovar: " + erro); return; }
    if (!confirm("Aprovar a reserva de " + s.placa + " para " + s.solicitante + "?")) return;
    var antes = (base.saidaVeiculos || []).length;
    var ref = fs.collection(COL).doc(id);
    // Trava a solicitação antes de gravar a saída, para não aprovar duas vezes.
    fs.runTransaction(function (t) {
      return t.get(ref).then(function (d) {
        if (!d.exists || d.data().status !== "Pendente") throw new Error("Esta solicitação já foi analisada ou cancelada.");
        t.update(ref, { status: "Em aprovação", atualizadoEm: new Date().toISOString() });
      });
    }).then(function () {
      definir("sv_idx", "");
      if (typeof carregarVeiculosSelect === "function") carregarVeiculosSelect("svveiculo");
      definir("svreserva", "Reservado"); definir("svnumeroreserva", ""); definir("svveiculo", s.placa);
      definir("svmotorista", s.solicitante); definir("svdestino", s.destino);
      definir("svdataSaida", s.dataSaida); definir("svhoraSaida", s.horaSaida);
      definir("svdataChegada", s.dataChegada); definir("svhoraChegada", s.horaChegada);
      definir("svstatus", "Em Viagem");
      definir("svobs", "Reserva solicitada por " + s.solicitante + (s.motivo ? " — Motivo: " + s.motivo : ""));
      var numero = document.getElementById("svnumeroreserva");
      salvarSaidaVeiculo();
      var depois = (base.saidaVeiculos || []).length;
      var ok = depois > antes;
      var num = ok ? (base.saidaVeiculos[depois - 1] || {}).svnumeroreserva || "" : "";
      return ref.update(ok
        ? { status: "Aprovada", numeroReserva: String(num), aprovadoPor: (window.nomeUsuarioAtual ? nomeUsuarioAtual() : ""), atualizadoEm: new Date().toISOString() }
        : { status: "Pendente", atualizadoEm: new Date().toISOString() });
    }).catch(function (e) { alert(e && e.message ? e.message : "Não foi possível aprovar agora."); });
  }

  function confirmarDevolucao(id) {
    var s = lista.find(function (x) { return x.id === id; });
    var base = getDb(), fs = cloud();
    if (!s || !base || !fs) return;
    var regs = base.saidaVeiculos || [];
    var idx = regs.findIndex(function (x) { return x && String(x.svnumeroreserva) === String(s.numeroReserva) && R().placaNorm(x.svveiculo) === R().placaNorm(s.placa); });
    if (idx < 0) { alert("Não encontrei a saída Nº " + s.numeroReserva + " de " + s.placa + " em Saída de Veículos."); return; }
    var vei = (base.veiculos || []).find(function (v) { return R().placaNorm(v.vplaca) === R().placaNorm(s.placa); }) || {};
    var erro = R().validarDevolucao(s, { kmAtual: Number(vei.vkm) || 0, agora: Date.now() + 864e5, exigirEndereco: !!s.devolucaoEm });
    if (erro) { alert("Não é possível confirmar: " + erro); return; }
    if (!confirm("Confirmar a devolução de " + s.placa + "?\nSaída real: " + R().dataBR(s.dataSaidaReal) + " " + s.horaSaidaReal + "\nDevolução: " + R().dataBR(s.dataDevolucao) + " " + s.horaDevolucao + (s.kmFinal ? "\nKM final: " + s.kmFinal : ""))) return;
    var reg = regs[idx], kmAnterior = reg.svkmretorno;
    if (s.kmFinal) reg.svkmretorno = String(s.kmFinal);
    editar("saidaVeiculos", idx);
    definir("svdataSaida", s.dataSaidaReal); definir("svhoraSaida", s.horaSaidaReal);
    definir("svdataChegada", s.dataDevolucao); definir("svhoraChegada", s.horaDevolucao);
    definir("svstatus", "Finalizado");
    if (typeof fmSincronizarReservaPorStatus === "function") fmSincronizarReservaPorStatus("Finalizado");
    var obs = document.getElementById("svobs");
    if (obs) obs.value = (obs.value ? obs.value + "\n" : "") + "Veículo devolvido" + (s.kmFinal ? " com KM " + s.kmFinal : "") + (s.enderecoDevolucao ? " — Endereço da devolução: " + s.enderecoDevolucao : "") + (s.latitude ? " (" + s.latitude + ", " + s.longitude + ")" : "");
    salvarSaidaVeiculo();
    var atual = (base.saidaVeiculos || [])[idx];
    if (!atual || atual.svstatus !== "Finalizado") { if (atual) atual.svkmretorno = kmAnterior; return; }
    fs.collection(COL).doc(id).update({ status: "Concluída", confirmadoPor: (window.nomeUsuarioAtual ? nomeUsuarioAtual() : ""), atualizadoEm: new Date().toISOString() })
      .catch(function () { alert("A saída foi finalizada, mas não consegui marcar a solicitação como concluída."); });
  }

  function recusar(id) {
    var fs = cloud(); if (!fs) return;
    var motivo = prompt("Motivo da recusa (aparece para o solicitante):", "");
    if (motivo === null) return;
    var ref = fs.collection(COL).doc(id);
    fs.runTransaction(function (t) {
      return t.get(ref).then(function (d) {
        if (!d.exists || d.data().status !== "Pendente") throw new Error("Esta solicitação já foi analisada ou cancelada.");
        t.update(ref, { status: "Recusada", motivoRecusa: motivo.trim(), recusadoPor: (window.nomeUsuarioAtual ? nomeUsuarioAtual() : ""), atualizadoEm: new Date().toISOString() });
      });
    }).catch(function (e) { alert(e && e.message ? e.message : "Não foi possível recusar agora."); });
  }

  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("#fmReservasPainel [data-acao]");
    if (!b) return;
    var a = b.getAttribute("data-acao");
    if (a === "aprovar") aprovar(b.getAttribute("data-id"));
    else if (a === "devolucao") confirmarDevolucao(b.getAttribute("data-id"));
    else if (a === "recusar") recusar(b.getAttribute("data-id"));
    else if (a === "editar-dev") { var e0 = R().validarAcaoAdmin(lista.find(function (x) { return x.id === b.getAttribute("data-id"); }), ehAdmin(), "editar"); if (e0) { alert(e0); return; } editandoDev = b.getAttribute("data-id"); render(); }
    else if (a === "cancelar-dev") { editandoDev = ""; render(); }
    else if (a === "excluir-dev") acaoAdmin(b.getAttribute("data-id"), "excluir");
    else if (a === "salvar-dev") {
      var dados = {}, linha = b.closest("tr");
      linha.querySelectorAll("[data-dev-campo]").forEach(function (i) { dados[i.getAttribute("data-dev-campo")] = i.value.trim(); });
      if (!dados.dataSaidaReal || !dados.horaSaidaReal || !dados.dataDevolucao || !dados.horaDevolucao) { alert("Informe as datas e horas de saída e devolução."); return; }
      if ((dados.dataDevolucao + dados.horaDevolucao) < (dados.dataSaidaReal + dados.horaSaidaReal)) { alert("A devolução não pode ser antes da saída."); return; }
      acaoAdmin(b.getAttribute("data-id"), "editar", dados);
    }
    else if (a === "copiar") {
      var link = location.href.replace(/[^/]*([?#].*)?$/, "") + "reserva.html";
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { alert("Link copiado: " + link); }, function () { prompt("Copie o link:", link); });
    } else if (a === "zap") {
      var v = (document.getElementById("fmReservaZap") || {}).value || "";
      if (v && String(v).replace(/\D/g, "").length < 10) { alert("Informe o WhatsApp com DDD, ex.: 54 99999-9999."); return; }
      cloud().collection(COL).doc("_config").set({ whatsapp: v.trim(), atualizadoEm: new Date().toISOString() }, { merge: true })
        .then(function () { alert("WhatsApp do aviso salvo."); }, function () { alert("Não foi possível salvar o WhatsApp agora."); });
    }
  });

  function iniciar() {
    var fs = cloud();
    if (!fs || !logado() || !document.getElementById("saidaVeiculos") || !R()) return false;
    if (escuta) return true;
    escuta = fs.collection(COL).onSnapshot(function (snap) {
      var l = []; snap.forEach(function (d) { if (d.id === "_config") { zap = (d.data() || {}).whatsapp || ""; return; } l.push(Object.assign({ id: d.id }, d.data())); });
      lista = l; render(); if (window.FMAvisos && ehAdmin()) window.FMAvisos.admin(l);
    }, function () { var p = painel(); if (p) p.innerHTML = '<div class="text-muted" style="font-size:13px">Não foi possível carregar as solicitações de reserva.</div>'; });
    render();
    return true;
  }
  setInterval(function () {
    if (!logado() && escuta) { try { escuta(); } catch (e) {} escuta = null; lista = []; var p = document.getElementById("fmReservasPainel"); if (p) p.remove(); }
    else iniciar();
  }, 1500);
})();
