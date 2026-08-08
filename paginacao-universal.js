/* ============================================================
   FROTA MASTER - PAGINACAO UNIVERSAL + CABECALHO DE MODULO
   ------------------------------------------------------------
   - Garante paginacao em TODOS os modulos com tabela, inclusive
     os que nao usavam paginacao.js (Agendamentos, Ferias,
     Seguros, Licenciamento, Tacografo, CIV/CIPP, Revisoes,
     Usuarios, Backups...).
   - A paginacao aqui e feita no DOM: nao altera nenhuma funcao
     de render existente, apenas mostra/esconde as linhas da
     pagina atual e monta a barra de navegacao.
   - Tambem injeta um cabecalho profissional em cada modulo.
   Carregue este arquivo por ultimo, antes de </body>.
============================================================ */
(function () {
  "use strict";

  var POR_PAGINA = 15;

  /* tbody -> rotulo usado na barra */
  var ALVOS = {
    listaAgendamentos: "agendamentos",
    listaFerias: "ferias",
    listaSeguros: "seguros",
    listaLicenciamento: "licenciamento",
    listaTacografo: "tacografo",
    listaLicencas: "licencas",
    listaRevisoes: "revisoes",
    listaUsuarios: "usuarios",
    listaBackups: "backups"
  };

  var pagina = {};
  var interno = false;

  function linhas(tb) {
    var out = [];
    for (var i = 0; i < tb.rows.length; i++) {
      var r = tb.rows[i];
      if (r.getAttribute("data-pro-vazio") === "1") continue;
      out.push(r);
    }
    return out;
  }

  function barraDe(tbodyId) {
    var id = "proPager_" + tbodyId;
    var el = document.getElementById(id);
    if (el) return el;

    var tb = document.getElementById(tbodyId);
    if (!tb) return null;

    var tabela = tb.closest("table");
    var ancora = tabela || tb;
    var wrap = ancora.closest(".table-responsive") || ancora;

    el = document.createElement("div");
    el.id = id;
    el.className = "pro-pager";
    if (wrap.parentNode) wrap.parentNode.insertBefore(el, wrap.nextSibling);
    return el;
  }

  function render(tbodyId) {
    var tb = document.getElementById(tbodyId);
    if (!tb) return;

    var rows = linhas(tb);
    var total = rows.length;
    var totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    var p = Math.min(Math.max(1, pagina[tbodyId] || 1), totalPaginas);
    pagina[tbodyId] = p;

    interno = true;
    for (var i = 0; i < rows.length; i++) {
      var visivel = i >= (p - 1) * POR_PAGINA && i < p * POR_PAGINA;
      rows[i].style.display = visivel ? "" : "none";
    }
    interno = false;

    var barra = barraDe(tbodyId);
    if (!barra) return;

    if (total === 0) {
      barra.innerHTML =
        '<div class="pro-pager-info">Nenhum registro cadastrado</div>';
      return;
    }

    var ini = (p - 1) * POR_PAGINA + 1;
    var fim = Math.min(p * POR_PAGINA, total);

    barra.innerHTML =
      '<div class="pro-pager-info">' +
      ini +
      "&ndash;" +
      fim +
      " de " +
      total +
      " registros</div>" +
      '<div class="pro-pager-nav">' +
      btn(tbodyId, 1, p === 1, "&laquo; Primeira") +
      btn(tbodyId, p - 1, p === 1, "&lsaquo; Anterior") +
      btn(tbodyId, p + 1, p === totalPaginas, "Próxima &rsaquo;") +
      btn(tbodyId, totalPaginas, p === totalPaginas, "Última &raquo;") +
      "</div>" +
      '<div class="pro-pager-info">Página ' +
      p +
      " de " +
      totalPaginas +
      "</div>";
  }

  function btn(tbodyId, destino, desabilitado, rotulo) {
    return (
      '<button type="button" ' +
      (desabilitado ? "disabled " : "") +
      "onclick=\"proPaginar('" +
      tbodyId +
      "'," +
      destino +
      ')">' +
      rotulo +
      "</button>"
    );
  }

  window.proPaginar = function (tbodyId, destino) {
    pagina[tbodyId] = destino;
    render(tbodyId);
  };

  /* ---------- observa cada tabela e repagina sozinho ---------- */
  function observar(tbodyId) {
    var tb = document.getElementById(tbodyId);
    if (!tb || tb.getAttribute("data-pro-obs") === "1") return;
    tb.setAttribute("data-pro-obs", "1");

    var timer = null;
    var obs = new MutationObserver(function () {
      if (interno) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        render(tbodyId);
      }, 40);
    });
    obs.observe(tb, { childList: true });
    render(tbodyId);
  }

  function ativarTodos() {
    for (var id in ALVOS) {
      if (Object.prototype.hasOwnProperty.call(ALVOS, id)) observar(id);
    }
  }

  /* ---------- cabecalho profissional por modulo ---------- */
  var SUB = {
    dashboard: "Visão geral da frota",
    agendamentos: "Programação de veículos",
    saidaVeiculos: "Controle de saídas e retornos",
    veiculos: "Cadastro e situação da frota",
    pneus: "Controle de pneus e rodízio",
    estoque: "Peças e movimentações",
    motoristas: "Equipe e documentação",
    terceiros: "Agregados e parceiros",
    diarias: "Pagamentos de diárias",
    ferias: "Programação de férias",
    multas: "Infrações e indicações",
    seguros: "Apólices e vigências",
    licenciamento: "Licenciamento anual",
    tacografo: "Aferições do tacógrafo",
    licencas: "CIV / CIPP",
    manutencoes: "Ordens e custos de manutenção",
    combustivel: "Abastecimentos e consumo",
    revisoes: "Revisões por quilometragem",
    fornecedores: "Oficinas e prestadores",
    usuarios: "Acessos do sistema",
    backup: "Cópias de segurança"
  };

  function icone() {
    return (
      '<span class="pro-ic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8">' +
      '<path d="M5 16V9l2-3h10l2 3v7"/><path d="M4 16h16M7 9h10"/>' +
      '<circle cx="7" cy="16" r="1.5"/><circle cx="17" cy="16" r="1.5"/></svg></span>'
    );
  }

  function cabecalhos() {
    var links = document.querySelectorAll(".sidebar a[data-module]");
    Array.prototype.forEach.call(links, function (a) {
      var mod = a.getAttribute("data-module");
      var alvo = document.getElementById(mod);
      if (!alvo || alvo.querySelector(":scope > .pro-modhead")) return;

      var titulo = (a.querySelector("span:not(.ic)") || a).textContent.trim();
      var head = document.createElement("div");
      head.className = "pro-modhead";
      head.innerHTML =
        icone() +
        '<div class="pro-tt"><b>' +
        titulo +
        "</b><span>" +
        (SUB[mod] || "Frota Master") +
        '</span></div><em class="pro-badge" data-pro-count="' +
        mod +
        '"></em>';
      alvo.insertBefore(head, alvo.firstChild);
    });
    contadores();
  }

  function contadores() {
    if (typeof db === "undefined" || !db) return;
    var els = document.querySelectorAll("[data-pro-count]");
    Array.prototype.forEach.call(els, function (el) {
      var mod = el.getAttribute("data-pro-count");
      var lista = db[mod];
      el.textContent = Array.isArray(lista)
        ? lista.length + (lista.length === 1 ? " registro" : " registros")
        : "";
    });
  }

  function iniciar() {
    cabecalhos();
    ativarTodos();
    setInterval(function () {
      contadores();
      ativarTodos();
    }, 4000);

    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".sidebar a[data-module]")) {
        setTimeout(function () {
          ativarTodos();
          for (var id in ALVOS) {
            if (Object.prototype.hasOwnProperty.call(ALVOS, id)) render(id);
          }
          contadores();
        }, 80);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
