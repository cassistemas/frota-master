/* Pedidos de edição/cancelamento: decisões atômicas na reserva e na saída vinculada. */
(function () {
  "use strict";
  var ocupado = false;
  function regras() { return window.FMReservasRegras; }
  function admin() { return typeof usuarioLogado !== "undefined" && usuarioLogado && usuarioLogado.tipo === "admin"; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  var campos = ["placa", "dataSaida", "horaSaida", "dataChegada", "horaChegada", "destino", "motivo"];
  function html(lista, ehAdmin) {
    if (!ehAdmin) return "";
    var linhas = [];
    lista.forEach(function (s) {
      ["pedidoEdicao", "pedidoCancelamento"].forEach(function (campo) {
        var p = s[campo];
        if (!p || !["Pendente", "Aguardando confirmação"].includes(p.situacao)) return;
        var alteracao = campo === "pedidoEdicao", confirmar = p.situacao === "Aguardando confirmação";
        var dados = confirmar && p.dados ? '<div><b>Proposta:</b> ' + campos.map(function (k) { return esc(k) + ': ' + esc(s[k] || '—') + ' → ' + esc(p.dados[k] || '—'); }).join('<br>') + '</div>' : '';
        linhas.push('<div class="border rounded p-2 mb-2"><b>' + (alteracao ? 'Edição' : 'Cancelamento') + '</b> · ' + esc(s.solicitante) + ' · ' + esc(s.placa) + ' · ' + esc(p.situacao) + '<div>Motivo: ' + esc(p.motivo) + '</div>' + dados +
          '<button type="button" class="btn btn-sm btn-success" data-pedido-id="' + esc(s.id) + '" data-pedido-campo="' + campo + '" data-pedido-etapa="' + esc(p.situacao) + '" data-pedido-decisao="aprovar">' + (alteracao ? (confirmar ? 'Confirmar alterações' : 'Autorizar edição') : 'Aprovar cancelamento') + '</button> ' +
          '<button type="button" class="btn btn-sm btn-outline-danger" data-pedido-id="' + esc(s.id) + '" data-pedido-campo="' + campo + '" data-pedido-etapa="' + esc(p.situacao) + '" data-pedido-decisao="recusar">Recusar</button></div>');
      });
    });
    return linhas.length ? '<h6 class="mt-3">Pedidos de edição e cancelamento (' + linhas.length + ')</h6>' + linhas.join('') : '';
  }
  // Usa o formulário/escritor original sem publicar uma gravação intermediária.
  function prepararSaida(saidas, idx, sol, dados, cancelamento) {
    var anterior = db.saidaVeiculos;
    var ids = ["sv_idx", "svreserva", "svnumeroreserva", "svveiculo", "svmotorista", "svdestino", "svdataSaida", "svhoraSaida", "svdataChegada", "svhoraChegada", "svstatus", "svobs"];
    if (ids.some(function (id) { return !document.getElementById(id); })) throw new Error("Abra Saída de Veículos e tente novamente.");
    var valores = ids.map(function (id) { return document.getElementById(id).value; }), opcoesTemporarias = [];
    function preencher(id, valor) {
      var el = document.getElementById(id); valor = String(valor == null ? "" : valor);
      if (el.tagName === "SELECT" && !Array.from(el.options).some(function (o) { return o.value === valor; })) {
        var opcao = new Option(valor, valor); el.add(opcao); opcoesTemporarias.push(opcao);
      }
      el.value = valor;
    }
    try {
      db.saidaVeiculos = saidas.map(function (s) { return Object.assign({}, s); });
      var reg = db.saidaVeiculos[idx];
      ids.forEach(function (id) { preencher(id, id === "sv_idx" ? String(idx) : (reg[id] || "")); });
      if (cancelamento) preencher("svstatus", "Cancelado");
      else {
        var mapa = {placa:"svveiculo",dataSaida:"svdataSaida",horaSaida:"svhoraSaida",dataChegada:"svdataChegada",horaChegada:"svhoraChegada",destino:"svdestino"};
        Object.keys(mapa).forEach(function (k) { preencher(mapa[k], dados[k]); });
      }
      document.getElementById("svobs").value = (reg.svobs || "") + "\n" + (cancelamento ? "Cancelamento aprovado" : "Edição confirmada — Motivo: " + (dados.motivo || ""));
      var resultado = salvarSaidaVeiculo({reservaTransacao:true});
      if (!resultado) throw new Error("A saída não foi validada. Nenhuma alteração foi gravada.");
      return db.saidaVeiculos.slice();
    } finally {
      db.saidaVeiculos = anterior;
      opcoesTemporarias.forEach(function (opcao) { opcao.remove(); });
      ids.forEach(function (id, i) { document.getElementById(id).value = valores[i]; });
    }
  }
  async function decidir(b) {
    if (ocupado || !admin() || typeof dbCloud === "undefined") return;
    var campo = b.dataset.pedidoCampo, etapa = b.dataset.pedidoEtapa, aprovar = b.dataset.pedidoDecisao === "aprovar";
    if (!["pedidoEdicao", "pedidoCancelamento"].includes(campo)) return;
    var resposta = aprovar ? "" : prompt("Motivo da recusa (visível para o solicitante):", "");
    if (resposta === null) return;
    if (!aprovar && !resposta.trim()) { alert("Informe o motivo da recusa."); return; }
    if (aprovar && !confirm("Confirmar esta decisão? O histórico será preservado.")) return;
    ocupado = true; b.disabled = true;
    try {
      var ref = dbCloud.collection("reservasVeiculos").doc(b.dataset.pedidoId);
      var saidaRef = dbCloud.collection("frota").doc("saidaVeiculos");
      var veiculosRef = dbCloud.collection("frota").doc("veiculos");
      // Lê novamente os pedidos na transação para não confirmar sobre dados desatualizados.
      var snapshot = await dbCloud.collection("reservasVeiculos").get();
      var refs = []; snapshot.forEach(function (d) { if (d.id !== "_config") refs.push(d.ref); });
      await dbCloud.runTransaction(async function (t) {
        var docs = await Promise.all([t.get(ref), t.get(saidaRef), t.get(veiculosRef)].concat(refs.map(function (r) { return t.get(r); })));
        var sol = docs[0].exists ? docs[0].data() : null, p = sol && sol[campo];
        if (!admin() || !sol || !regras().podeCancelar(sol) || !p || p.situacao !== etapa) throw new Error("O pedido mudou ou a viagem já começou. Atualize e confira novamente.");
        if (campo === "pedidoEdicao" && sol.pedidoCancelamento && sol.pedidoCancelamento.situacao === "Pendente") throw new Error("Analise o pedido de cancelamento primeiro.");
        var agora = new Date().toISOString(), quem = typeof nomeUsuarioAtual === "function" ? nomeUsuarioAtual() : "Administrador";
        var up = {atualizadoEm:agora}, novo = Object.assign({}, p, {resposta:resposta.trim(), analisadoEm:agora, analisadoPor:quem});
        var cancelar = campo === "pedidoCancelamento", aplicar = !cancelar && etapa === "Aguardando confirmação";
        novo.situacao = aprovar ? (cancelar ? "Aprovado" : aplicar ? "Aplicada" : "Autorizada") : "Recusado";
        if (aprovar && (cancelar || aplicar)) {
          var saidas = docs[1].exists && Array.isArray(docs[1].data().dados) ? docs[1].data().dados : [];
          if (aplicar) {
            if (!p.dados) throw new Error("Proposta de edição não encontrada.");
            var candidato = Object.assign({}, sol, p.dados, {id:ref.id});
            var solicitacoes = docs.slice(3).filter(function (d) { return d.exists; }).map(function (d) { return Object.assign({}, d.data(), {id:d.id}); });
            var erro = regras().validarSolicitacao(candidato, {veiculos:docs[2].exists ? docs[2].data().dados : [], saidas:saidas, solicitacoes:solicitacoes, reservaOriginal:sol});
            if (erro) throw new Error(erro);
            campos.forEach(function (k) { up[k] = p.dados[k] || ""; });
          }
          if (sol.status === "Aprovada") {
            var idx = saidas.findIndex(function (s) { return sol.numeroReserva && String(s.svnumeroreserva) === String(sol.numeroReserva) && regras().placaNorm(s.svveiculo) === regras().placaNorm(sol.placa); });
            if (idx < 0) throw new Error("Saída vinculada não encontrada. Confira o número da reserva antes de aprovar.");
            if (saidas[idx].svstatus !== "Em Viagem" || saidas[idx].svreserva !== "Reservado") throw new Error("A saída vinculada mudou. Confira antes de aprovar.");
            var resultado = prepararSaida(saidas, idx, sol, p.dados, cancelar);
            t.set(saidaRef, {dados:resultado, atualizadoEm:agora}, {merge:true});
          }
          if (cancelar) {
            up.status = "Cancelada"; up.canceladaApos = sol.status; up.canceladoEm = agora; up.canceladoPor = quem;
            if (sol.pedidoEdicao) up.pedidoEdicao = Object.assign({}, sol.pedidoEdicao, {situacao:"Encerrada", resposta:"Reserva cancelada pelo administrador."});
          }
        }
        up[campo] = novo; t.update(ref, up);
      });
      alert("Decisão salva. O solicitante e a agenda recebem a atualização automaticamente com a página aberta.");
    } catch (e) { alert(e.message || "Não foi possível salvar a decisão. Tente novamente."); }
    finally { ocupado = false; b.disabled = false; }
  }
  function mesmaReserva(s, sol) {
    return !!s.svnumeroreserva && String(s.svnumeroreserva) === String(sol.numeroReserva) &&
      regras().placaNorm(s.svveiculo) === regras().placaNorm(sol.placa);
  }
  function localizarSaida(lista, alvo) {
    var indices = [];
    lista.forEach(function (s, i) {
      var igual = (alvo._rid && (s._rid || s._fid || s.id) === alvo._rid) ||
        (alvo._fid && s._fid === alvo._fid) ||
        (alvo.svnumeroreserva && mesmaReserva(s, {numeroReserva:alvo.svnumeroreserva, placa:alvo.svveiculo}));
      if (!alvo._rid && !alvo._fid && !alvo.svnumeroreserva) igual = JSON.stringify(s) === JSON.stringify(alvo);
      if (igual) indices.push(i);
    });
    if (indices.length !== 1) throw new Error("A saída mudou ou não foi localizada de forma única no banco. Atualize a página e confira novamente.");
    return indices[0];
  }
  async function cancelarSaida(b) {
    if (ocupado) return;
    if (!admin()) { alert("Somente o administrador pode cancelar saídas."); return; }
    if (typeof dbCloud === "undefined" || !dbCloud || typeof auth === "undefined" || !auth.currentUser ||
        (typeof navigator !== "undefined" && navigator.onLine === false)) {
      alert("Entre no sistema e conecte-se à internet para confirmar o cancelamento no banco."); return;
    }
    var alvo = (db.saidaVeiculos || [])[Number(b.dataset.cancelarSaida)];
    if (!alvo || alvo.svstatus !== "Em Viagem" || alvo.svreserva !== "Reservado") {
      alert("Esta saída não está disponível para cancelamento."); return;
    }
    alvo = Object.assign({}, alvo);
    var motivo = prompt("Motivo do cancelamento (visível para o solicitante):", "");
    if (motivo === null) return;
    motivo = motivo.trim();
    if (!motivo) { alert("Informe o motivo do cancelamento."); return; }
    if (!confirm("Cancelar a saída Nº " + (alvo.svnumeroreserva || "—") + " de " + alvo.svveiculo +
        " e a reserva vinculada no aplicativo?\nO histórico será preservado e o período será liberado após a confirmação do banco.")) return;
    ocupado = true;
    var texto = b.textContent; b.disabled = true; b.textContent = "Aguardando banco…";
    try {
      var saidaRef = dbCloud.collection("frota").doc("saidaVeiculos");
      var snap = await dbCloud.collection("reservasVeiculos").get({source:"server"}), refs = [];
      snap.forEach(function (d) { if (d.id !== "_config") refs.push(d.ref); });
      await dbCloud.runTransaction(async function (t) {
        var docs = await Promise.all([t.get(saidaRef)].concat(refs.map(function (r) { return t.get(r); })));
        if (!admin()) throw new Error("Somente o administrador pode cancelar saídas.");
        var saidas = docs[0].exists && Array.isArray(docs[0].data().dados) ? docs[0].data().dados : [];
        var idx = localizarSaida(saidas, alvo), atual = saidas[idx];
        // Cadastros antigos podem receber um _rid apenas ao carregar a tela.
        // Compara os campos, não a ordem das propriedades nem esse ID temporário.
        var chaves = Array.from(new Set(Object.keys(atual).concat(Object.keys(alvo))));
        if (chaves.some(function (k) {
          if (k === "_rid" && !atual._rid) return false;
          return JSON.stringify(atual[k]) !== JSON.stringify(alvo[k]);
        })) throw new Error("A saída foi alterada. Atualize a página antes de cancelar.");
        if (atual.svstatus !== "Em Viagem" || atual.svreserva !== "Reservado" || atual.dataSaidaReal || atual.saidaRealEm) {
          throw new Error("A saída já foi iniciada, encerrada ou cancelada.");
        }
        var vinculadas = docs.slice(1).filter(function (d) { return d.exists && mesmaReserva(atual, d.data()); });
        vinculadas.forEach(function (d) {
          var sol = d.data();
          if (!regras().podeCancelar(sol) && !(sol.status === "Cancelada" && !sol.dataSaidaReal && !sol.saidaRealEm)) {
            throw new Error("A reserva vinculada já foi iniciada ou encerrada. Não é possível cancelar esta saída.");
          }
        });
        var agora = new Date().toISOString(), quem = typeof nomeUsuarioAtual === "function" ? nomeUsuarioAtual() : "Administrador";
        var resultado = prepararSaida(saidas, idx, null, null, true);
        resultado[idx] = Object.assign({}, resultado[idx], {
          svstatus:"Cancelado", svreserva:"Liberado", motivoCancelamento:motivo,
          canceladoEm:agora, canceladoPor:quem,
          svobs:(atual.svobs || "") + "\nCancelado pelo administrador: " + quem + " — Motivo: " + motivo
        });
        t.set(saidaRef, {dados:resultado, atualizadoEm:agora}, {merge:true});
        vinculadas.forEach(function (d) {
          var sol = d.data();
          if (sol.status === "Cancelada") return;
          var up = {status:"Cancelada", canceladaApos:sol.status, motivoCancelamento:motivo,
            canceladoEm:agora, canceladoPor:quem, atualizadoEm:agora,
            pedidoCancelamento:Object.assign({}, sol.pedidoCancelamento || {}, {
              situacao:"Aprovado", motivo:motivo, resposta:"Cancelada pelo administrador: " + motivo,
              analisadoEm:agora, analisadoPor:quem
            })};
          if (sol.pedidoEdicao) up.pedidoEdicao = Object.assign({}, sol.pedidoEdicao, {
            situacao:"Encerrada", resposta:"Reserva cancelada pelo administrador."
          });
          t.update(d.ref, up);
        });
      });
      if (typeof renderModulo === "function") renderModulo("saidaVeiculos");
      alert("Cancelamento confirmado no banco. A saída e a reserva vinculada foram canceladas, e o período foi liberado. O histórico foi preservado.");
    } catch (e) {
      alert("Cancelamento não confirmado. " + (e.message || "Confira a conexão e tente novamente."));
    } finally { ocupado = false; b.disabled = false; b.textContent = texto; }
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("#fmReservasPainel [data-pedido-id]");
    if (b) decidir(b);
    var cancelar = ev.target && ev.target.closest && ev.target.closest("#listaSaidaVeiculos [data-cancelar-saida]");
    if (cancelar) cancelarSaida(cancelar);
  });
  window.FMReservasPedidos = {html:html};
})();
