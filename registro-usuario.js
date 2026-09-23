/* ==========================================================
   FROTA MASTER - REGISTRO DE AUTORIA
   Grava automaticamente QUEM registrou (e quem alterou)
   cada lançamento, em todos os módulos, sem precisar
   alterar cada formulário.
   ========================================================== */
(function () {
  "use strict";

  var jaCarregados = new WeakSet();

  // "db" e "usuarioLogado" são declarados com let no index.html:
  // existem no escopo global léxico, mas não em window.
  function getDb() {
    try { return typeof db !== "undefined" ? db : null; } catch (e) { return null; }
  }
  function getUsuario() {
    try { return typeof usuarioLogado !== "undefined" ? usuarioLogado : null; } catch (e) { return null; }
  }

  function nomeUsuarioAtual() {
    try {
      var u = getUsuario();
      if (u && (u.nome || u.email)) {
        return u.nome || u.email;
      }
      if (window.auth && auth.currentUser) {
        return auth.currentUser.displayName || auth.currentUser.email || "Usuário";
      }
    } catch (e) {}
    return "Usuário";
  }
  window.nomeUsuarioAtual = nomeUsuarioAtual;

  // Marca os registros que vieram da nuvem para não sobrescrever a autoria original
  window.marcarRegistrosCarregados = function (lista) {
    if (!Array.isArray(lista)) return;
    lista.forEach(function (o) {
      if (o && typeof o === "object") jaCarregados.add(o);
    });
  };

  // Carimba todo registro novo/alterado antes de subir para a nuvem
  window.carimbarRegistros = function (modulos) {
    var base = getDb();
    if (!base) return;
    var nome = nomeUsuarioAtual();
    var agora = new Date().toISOString();
    var alvos = Array.isArray(modulos) && modulos.length ? modulos : Object.keys(base);

    alvos.forEach(function (mod) {
      var lista = base[mod];
      if (!Array.isArray(lista)) return;

      lista.forEach(function (obj) {
        if (!obj || typeof obj !== "object") return;
        if (jaCarregados.has(obj)) return;

        if (!obj._registradoPor) {
          obj._registradoPor = nome;
          obj._registradoEm = agora;
        }
        obj._alteradoPor = nome;
        obj._alteradoEm = agora;

        jaCarregados.add(obj);
      });
    });
  };

  function dataBRCurta(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR").slice(0, 5);
  }

  // Descobre módulo + índice/identificador a partir de qualquer botão de ação.
  // Alguns módulos usam editar('modulo', indice); outros possuem funções próprias.
  var RE_EDITAR = /(?:editar|excluir|remover|ver|detalhe\w*)\s*\(\s*\\?['"]([A-Za-z0-9_]+)\\?['"]\s*,\s*(\d+)\s*\)/i;
  var ACOES_POR_MODULO = {
    editarRevisao: "revisoes", excluirRevisao: "revisoes",
    editarDetran: "detran", excluirDetran: "detran", verDetran: "detran",
    editarFrete: "fretes", excluirFrete: "fretes", preverCardFrete: "fretes", enviarFreteWhats: "fretes",
    editarEstoque: "estoque", excluirEstoque: "estoque",
    editarCustoFrota: "custos", excluirCustoFrota: "custos",
    editarCustoRecorrente: "custosRecorrentes", excluirCustoRecorrente: "custosRecorrentes",
    editarQuilometragem: "quilometragens", excluirQuilometragem: "quilometragens",
    editarProducaoFrota: "producoes", excluirProducaoFrota: "producoes",
    editarDepreciacaoFrota: "gestaoDepreciacoes", excluirDepreciacaoFrota: "gestaoDepreciacoes",
    editarImplementoFrota: "implementos", excluirImplementoFrota: "implementos", transferirImplementoFrota: "implementos",
    editarEventoPneuFrota: "eventosPneus", excluirEventoPneu: "eventosPneus"
  };

  function porIdentificador(lista, valor) {
    if (!Array.isArray(lista)) return null;
    if (/^\d+$/.test(String(valor))) {
      var porIndice = lista[Number(valor)];
      if (porIndice) return porIndice;
    }
    var alvo = String(valor);
    return lista.find(function (reg) {
      if (!reg || typeof reg !== "object") return false;
      return [reg.id, reg.lancamentoId, reg._id, reg.uid].some(function (id) {
        return id !== undefined && id !== null && String(id) === alvo;
      });
    }) || null;
  }

  function localizarRegistro(linha) {
    var base = getDb();
    if (!base) return null;

    var mod = linha.getAttribute("data-modulo") || linha.getAttribute("data-mod");
    var idx = linha.getAttribute("data-index") || linha.getAttribute("data-idx") || linha.getAttribute("data-registro-id");
    if (mod && idx !== null && idx !== "" && Array.isArray(base[mod])) {
      return porIdentificador(base[mod], idx);
    }

    var nodes = linha.querySelectorAll("[onclick]");
    for (var i = 0; i < nodes.length; i++) {
      var codigo = nodes[i].getAttribute("onclick") || "";
      var m = codigo.match(RE_EDITAR);
      if (m && Array.isArray(base[m[1]])) {
        var reg = base[m[1]][Number(m[2])];
        if (reg) return reg;
      }
      var nomes = Object.keys(ACOES_POR_MODULO);
      for (var n = 0; n < nomes.length; n++) {
        var nomeAcao = nomes[n];
        var reAcao = new RegExp(nomeAcao + "\\s*\\(\\s*['\"]?([^'\"\\),]+)['\"]?\\s*\\)", "i");
        var achado = codigo.match(reAcao);
        if (!achado) continue;
        var modulo = ACOES_POR_MODULO[nomeAcao];
        var encontrado = porIdentificador(base[modulo], achado[1]);
        if (encontrado) return encontrado;
      }
    }
    return null;
  }

  // Mostra a autoria como dica (tooltip) em cada linha das tabelas
  function aplicarAutoriaNasTabelas() {
    document.querySelectorAll("table tbody tr, [data-modulo][data-registro-id], .cus-rec-row").forEach(function (linha) {
      var reg = localizarRegistro(linha);
      if (!reg) return;

      var partes = [];
      var autor = reg._registradoPor || reg._alteradoPor;
      var quando = reg._registradoEm || reg._alteradoEm;
      if (autor) {
        partes.push("Registrado por: " + autor + (quando ? " em " + dataBRCurta(quando) : ""));
      }
      if (reg._alteradoPor && reg._alteradoPor !== reg._registradoPor) {
        partes.push("Última alteração: " + reg._alteradoPor + (reg._alteradoEm ? " em " + dataBRCurta(reg._alteradoEm) : ""));
      }
      if (!partes.length) return;

      linha.title = partes.join("\n");
      linha.setAttribute("data-autoria", autor || "");
      linha.style.cursor = linha.style.cursor || "help";
    });
  }
  window.aplicarAutoriaNasTabelas = aplicarAutoriaNasTabelas;

  // Reaplica após cada renderização de módulo
  function instalarHook() {
    if (typeof window.renderModulo !== "function" || window.renderModulo.__autoria) return false;
    var original = window.renderModulo;
    var wrapper = function () {
      var r = original.apply(this, arguments);
      setTimeout(aplicarAutoriaNasTabelas, 0);
      return r;
    };
    wrapper.__autoria = true;
    window.renderModulo = wrapper;
    return true;
  }

  if (!instalarHook()) {
    var tentativas = 0;
    var t = setInterval(function () {
      if (instalarHook() || ++tentativas > 40) clearInterval(t);
    }, 250);
  }

  // Qualquer módulo que redesenhe sua tabela por conta própria também recebe a dica
  var agendado = null;
  function agendarAplicacao() {
    if (agendado) return;
    agendado = setTimeout(function () {
      agendado = null;
      try { aplicarAutoriaNasTabelas(); } catch (e) {}
    }, 120);
  }

  function observar() {
    if (!document.body) return setTimeout(observar, 200);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var alvo = muts[i].target;
        if (alvo && alvo.closest && (alvo.closest("table") || alvo.closest(".cus-rec-row") || muts[i].addedNodes.length)) {
          agendarAplicacao();
          return;
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    agendarAplicacao();
  }
  observar();
})();

