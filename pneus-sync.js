/* =====================================================
   PNEUS PRO — Sincronização com Estoque + Histórico
   -----------------------------------------------------
   . Status "Estoque"      -> gera ENTRADA automática no módulo Estoque
   . Vinculado a veículo   -> gera SAÍDA automática (baixa do estoque)
   . Recapado / Descartado -> gera SAÍDA (baixa definitiva)
   . Todo movimento fica registrado no histórico do pneu
   . Tabela com dados ocultos: só aparecem ao clicar no 👁
   ===================================================== */
(function () {
  "use strict";

  function base() {
    try { if (typeof db !== "undefined" && db) return db; } catch (e) {}
    if (!window.db) window.db = {};
    return window.db;
  }
  function movs() {
    return typeof window.listaEstoque === "function"
      ? window.listaEstoque()
      : (Array.isArray(base().estoque) ? base().estoque : (base().estoque = []));
  }
  function gravar() {
    if (typeof window.persistirEstoque === "function") window.persistirEstoque();
    else if (typeof salvarNuvem === "function") salvarNuvem();
  }
  function n(v) {
    if (typeof v === "number") return v;
    var t = String(v || "").trim();
    if (!t) return 0;
    var x = t.indexOf(",") >= 0 ? t.replace("R$", "").replace(/\./g, "").replace(",", ".") : t.replace("R$", "");
    return parseFloat(x.replace(/[^\d.-]/g, "")) || 0;
  }
  function moeda(v) { return typeof floatParaMoeda === "function" ? floatParaMoeda(n(v)) : "R$ " + n(v).toFixed(2); }
  function dataBRx(v) { return typeof formatarDataBR === "function" ? formatarDataBR(v) : (v || "--"); }
  function hoje() { return new Date().toISOString().slice(0, 10); }
  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function vazio(v) { return (v === undefined || v === null || String(v).trim() === "") ? "--" : String(v); }

  /* ---------- identidade e nome do item no estoque ---------- */
  function garantirId(p) {
    if (!p.pid) p.pid = "PNEU-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
    return p.pid;
  }
  function nomeItem(p) {
    var partes = ["Pneu " + (p.pnumero || "S/N")];
    if (p.pmarca) partes.push(p.pmarca);
    if (p.pmedida) partes.push(p.pmedida);
    return partes.join(" ");
  }

  /* ---------- histórico ---------- */
  function historico(p) {
    if (!Array.isArray(p.phist)) p.phist = [];
    return p.phist;
  }
  function registrar(p, tipo, texto) {
    historico(p).push({ data: new Date().toISOString(), tipo: tipo, texto: texto });
  }
  window.historicoPneu = historico;

  /* ---------- movimentos do pneu ---------- */
  function movsPneu(p) {
    var id = p.pid;
    return movs().filter(function (m) { return m && m.epneuid && m.epneuid === id; });
  }
  function saldoPneu(p) {
    return movsPneu(p).reduce(function (a, m) {
      var q = parseFloat(m.equantidade) || 0;
      return m.etipo === "Saída" ? a - q : a + q;
    }, 0);
  }
  window.saldoEstoquePneu = saldoPneu;

  function entrada(p, obs) {
    var valor = n(p.pvalor);
    movs().push({
      eitem: nomeItem(p),
      ecategoria: "Pneus",
      etipo: "Entrada",
      equantidade: 1,
      evalorunitario: valor,
      edata: p.pdata || hoje(),
      efornecedor: p.pfornecedor || "",
      elote: p.pdot || "",
      eestoqueminimo: 0,
      eobservacoes: obs,
      eplaca: "",
      etotal: valor,
      epneuid: p.pid,
      eorigem: "pneus"
    });
    registrar(p, "Entrada no estoque", obs);
  }

  function saida(p, placa, obs) {
    var valor = n(p.pvalor);
    movs().push({
      eitem: nomeItem(p),
      ecategoria: "Pneus",
      etipo: "Saída",
      equantidade: 1,
      evalorunitario: valor,
      edata: hoje(),
      efornecedor: "",
      elote: p.pdot || "",
      eresponsavel: "",
      eobservacoes: obs,
      eplaca: placa || "",
      etotal: valor,
      epneuid: p.pid,
      eorigem: "pneus"
    });
    registrar(p, "Saída do estoque", obs);
  }

  /* ---------- sincronização (idempotente) ---------- */
  function sincronizar(p) {
    garantirId(p);
    var status = p.pstatus || "";
    var saldo = saldoPneu(p);

    if (status === "Estoque") {
      if (saldo <= 0) entrada(p, "Pneu " + (p.pnumero || "") + " disponível em estoque (módulo Pneus)");
      if (p.pveiculoanterior) p.pveiculoanterior = "";
      return;
    }

    if (status === "Em Uso") {
      if (!p.pveiculo) {
        registrar(p, "Aviso", "Status 'Em Uso' sem veículo vinculado — nenhuma baixa gerada.");
        return;
      }
      if (saldo <= 0) entrada(p, "Entrada automática para vínculo com o veículo " + p.pveiculo);
      saida(p, p.pveiculo, "Instalado no veículo " + p.pveiculo + " • posição " + (p.pposicao || "--"));
      registrar(p, "Instalação", "Vinculado à placa " + p.pveiculo + " (posição " + (p.pposicao || "--") + ")");
      return;
    }

    if (status === "Recapado" || status === "Descartado") {
      if (saldo > 0) saida(p, p.pveiculo || "", "Baixa por status: " + status);
      registrar(p, status, "Pneu marcado como " + status);
    }
  }
  window.sincronizarPneuEstoque = sincronizar;

  /* ---------- salvar pneu (substitui o original) ---------- */
  window.salvarPneu = function () {
    var campos = ["pnumero","pmarca","pmodelo","pmedida","pdot","pvalor","pdata","pvida","psulco",
      "pveiculo","pfornecedor","pposicao","pkminstalacao","pkmatual","pkmrodado","pstatus","pobs"];

    var b = base();
    if (!Array.isArray(b.pneus)) b.pneus = [];

    var obj = {};
    campos.forEach(function (id) {
      var el = document.getElementById(id);
      obj[id] = el ? el.value : "";
    });

    if (!obj.pnumero) { alert("Informe o número do pneu."); return; }

    var idx = document.getElementById("p_idx").value;
    var novo = idx === "";
    var anterior = novo ? null : Object.assign({}, b.pneus[Number(idx)]);

    if (novo) {
      obj.pdatacadastro = new Date().toISOString();
      obj.phist = [];
      garantirId(obj);
      registrar(obj, "Cadastro", "Pneu cadastrado com status " + (obj.pstatus || "--"));
      b.pneus.push(obj);
      if (typeof irParaUltimaPagina === "function") irParaUltimaPagina("pneus");
    } else {
      obj.pdatacadastro = anterior.pdatacadastro || new Date().toISOString();
      obj.pid = anterior.pid;
      obj.phist = Array.isArray(anterior.phist) ? anterior.phist.slice() : [];
      garantirId(obj);
      registrar(obj, "Edição", "Dados do pneu atualizados");
      if (anterior.pstatus !== obj.pstatus) {
        registrar(obj, "Status", "De '" + (anterior.pstatus || "--") + "' para '" + (obj.pstatus || "--") + "'");
      }
      if (anterior.pveiculo !== obj.pveiculo) {
        registrar(obj, "Veículo", "De '" + (anterior.pveiculo || "sem veículo") + "' para '" + (obj.pveiculo || "sem veículo") + "'");
      }
      b.pneus[Number(idx)] = obj;
    }

    // Sincroniza com o estoque somente quando o estado relevante mudou
    var mudouEstado = novo ||
      anterior.pstatus !== obj.pstatus ||
      anterior.pveiculo !== obj.pveiculo;
    if (mudouEstado) sincronizar(obj);

    if (typeof salvarNuvem === "function") salvarNuvem();
    gravar();

    if (typeof limparForm === "function") limparForm("pneus", campos, "p_idx");
    renderModulo("pneus");
    if (typeof renderDashboard === "function") renderDashboard();
  };

  /* ---------- linhas ocultas com 👁 ---------- */
  var abertos = {};
  window.togglePneuDetalhe = function (id) {
    abertos[id] = !abertos[id];
    var linha = document.getElementById("pneuDet_" + id);
    var btn = document.getElementById("pneuOlho_" + id);
    if (linha) linha.classList.toggle("hidden", !abertos[id]);
    if (btn) {
      btn.classList.toggle("ativo", !!abertos[id]);
      btn.title = abertos[id] ? "Ocultar informações" : "Ver informações";
    }
  };

  function linhaDet(rotulo, valor) {
    return '<div class="pneu-info"><span>' + esc(rotulo) + "</span><b>" + esc(vazio(valor)) + "</b></div>";
  }

  function detalhes(p, realIndex) {
    var id = p.pid;
    var hist = historico(p).slice().reverse();
    var mv = movsPneu(p).slice().reverse();
    var saldo = saldoPneu(p);

    var info =
      linhaDet("Número", p.pnumero) +
      linhaDet("Marca", p.pmarca) +
      linhaDet("Modelo", p.pmodelo) +
      linhaDet("Medida", p.pmedida) +
      linhaDet("DOT", p.pdot) +
      linhaDet("Valor de compra", p.pvalor ? moeda(p.pvalor) : "--") +
      linhaDet("Data de compra", p.pdata ? dataBRx(p.pdata) : "--") +
      linhaDet("Vida útil (KM)", p.pvida) +
      linhaDet("Sulco inicial", p.psulco) +
      linhaDet("Veículo / placa", p.pveiculo) +
      linhaDet("Fornecedor", p.pfornecedor) +
      linhaDet("Posição", p.pposicao) +
      linhaDet("KM instalação", p.pkminstalacao) +
      linhaDet("KM atual", p.pkmatual) +
      linhaDet("KM rodado", (p.pkmrodado || 0) + " KM") +
      linhaDet("Status", p.pstatus) +
      linhaDet("Em estoque", saldo > 0 ? "Sim (saldo " + saldo + ")" : "Não") +
      linhaDet("Cadastrado em", p.pdatacadastro ? dataBRx(String(p.pdatacadastro).slice(0, 10)) : "--") +
      linhaDet("Observações", p.pobs);

    var histHtml = hist.length
      ? hist.map(function (h) {
          return '<li><span class="pneu-hist-data">' + esc(dataBRx(String(h.data).slice(0, 10))) + "</span>" +
            '<span class="pneu-hist-tipo">' + esc(h.tipo) + "</span>" +
            '<span class="pneu-hist-txt">' + esc(h.texto || "") + "</span></li>";
        }).join("")
      : '<li class="text-muted">Nenhum histórico registrado.</li>';

    var movHtml = mv.length
      ? mv.map(function (m) {
          return '<li><span class="pneu-hist-data">' + esc(dataBRx(m.edata)) + "</span>" +
            '<span class="pneu-hist-tipo ' + (m.etipo === "Saída" ? "out" : "in") + '">' + esc(m.etipo) + "</span>" +
            '<span class="pneu-hist-txt">' + esc(m.eobservacoes || "") + (m.eplaca ? " • " + esc(m.eplaca) : "") + "</span></li>";
        }).join("")
      : '<li class="text-muted">Nenhuma movimentação de estoque.</li>';

    return '<tr id="pneuDet_' + esc(id) + '" class="pneu-detalhe hidden"><td colspan="5">' +
      '<div class="pneu-painel">' +
        '<div class="pneu-grid">' + info + "</div>" +
        '<div class="pneu-cols">' +
          '<div><h6>🕘 Histórico do pneu</h6><ul class="pneu-hist">' + histHtml + "</ul></div>" +
          '<div><h6>📦 Movimentações no estoque</h6><ul class="pneu-hist">' + movHtml + "</ul></div>" +
        "</div>" +
        '<div class="pneu-acoes">' +
          '<button class="btn btn-sm btn-dark" onclick="editar(\'pneus\',' + realIndex + ')">✎ Editar</button> ' +
          '<button class="btn btn-sm btn-outline-danger" onclick="deletar(\'pneus\',' + realIndex + ')">✕ Excluir</button>' +
        "</div>" +
      "</div></td></tr>";
  }

  function listaFiltrada() {
    var b = base();
    var lista = Array.isArray(b.pneus) ? b.pneus.slice() : [];
    var filtro = (document.getElementById("filtroPneu") || {}).value || "";
    filtro = filtro.toLowerCase();
    var veiculo = (document.getElementById("filtroPVeiculo") || {}).value || "";
    var status = (document.getElementById("filtroPStatus") || {}).value || "";
    return lista.filter(function (p) {
      var txt = (String(p.pnumero || "") + " " + String(p.pmarca || "") + " " + String(p.pmodelo || "") + " " + String(p.pmedida || "")).toLowerCase();
      return (!filtro || txt.indexOf(filtro) >= 0) &&
        (!veiculo || p.pveiculo === veiculo) &&
        (!status || p.pstatus === status);
    });
  }

  function renderTabela() {
    var b = base();
    if (!Array.isArray(b.pneus)) b.pneus = [];
    b.pneus.forEach(garantirId);

    var tbody = document.getElementById("listaPneus");
    if (!tbody) return;

    var lista = listaFiltrada();
    var dados = typeof getDadosPaginadosCustom === "function" ? getDadosPaginadosCustom(lista, "pneus") : lista;

    tbody.innerHTML = dados.length ? dados.map(function (p) {
      var realIndex = b.pneus.indexOf(p);
      var id = p.pid;
      var badge = p.pstatus === "Estoque" ? "bg-success" : (p.pstatus === "Em Uso" ? "bg-primary" : "bg-secondary");
      return '<tr class="pneu-linha">' +
        "<td><b>" + esc(vazio(p.pnumero)) + "</b></td>" +
        "<td>" + esc(vazio(p.pmarca)) + "</td>" +
        "<td>" + esc(p.pveiculo ? p.pveiculo : "Em estoque") + "</td>" +
        '<td><span class="badge ' + badge + '">' + esc(vazio(p.pstatus)) + "</span></td>" +
        '<td class="text-end"><button type="button" id="pneuOlho_' + esc(id) + '" class="btn-olho' + (abertos[id] ? " ativo" : "") + '" title="Ver informações" onclick="togglePneuDetalhe(\'' + esc(id) + '\')">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>' +
        "</button></td>" +
      "</tr>" + detalhes(p, realIndex);
    }).join("") : '<tr><td colspan="5" class="text-center text-muted">Nenhum pneu encontrado</td></tr>';

    // reaplica o estado aberto/fechado
    Object.keys(abertos).forEach(function (id) {
      if (!abertos[id]) return;
      var l = document.getElementById("pneuDet_" + id);
      if (l) l.classList.remove("hidden");
    });

    if (typeof renderPaginacaoCustom === "function") renderPaginacaoCustom(lista, "pneus", "paginacaoPneus");
  }
  window.renderTabelaPneus = renderTabela;

  /* cabeçalho reduzido (as informações ficam no 👁) */
  function ajustarCabecalho() {
    var tbody = document.getElementById("listaPneus");
    if (!tbody) return;
    var thead = tbody.parentElement && tbody.parentElement.querySelector("thead tr");
    if (thead && !thead.dataset.pneuAjustado) {
      thead.innerHTML = "<th>Número</th><th>Marca</th><th>Veículo</th><th>Status</th><th class='text-end'>Ver</th>";
      thead.dataset.pneuAjustado = "1";
    }
  }

  var anteriorRender = window.renderModulo;
  window.renderModulo = function (modulo) {
    if (typeof anteriorRender === "function") anteriorRender(modulo);
    if (modulo === "pneus") {
      ajustarCabecalho();
      renderTabela();
    }
  };

  setTimeout(function () { if (!document.getElementById("pneus").classList.contains("hidden")) renderModulo("pneus"); }, 1200);
})();
