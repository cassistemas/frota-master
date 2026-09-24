/*
 * Limpeza universal pós-salvamento.
 *
 * Garante que, em TODO o sistema, ao criar e salvar ou editar e salvar,
 * o formulário usado volte vazio (sem dados preenchidos e fora do modo edição).
 *
 * Como funciona:
 * - Guarda qual botão foi clicado.
 * - Envolve todas as funções globais de gravação (salvar*, cadastrar*, registrar*).
 * - Se a gravação terminar sem alerta de validação e sem erro, limpa os campos
 *   do bloco (card/form) onde está o botão clicado.
 * - Campos de filtro/busca e campos marcados com data-nao-limpar são preservados.
 */
(function () {
  "use strict";

  var NAO_ENVOLVER = {
    salvarNuvem: 1,
    salvarLocal: 1,
    salvarConfiguracaoFerias: 1,
    salvarDados: 1,
    salvarTema: 1,
  };

  var PREFIXOS_IGNORADOS = /^(f[A-Z]|filtro|filtros|busca|buscar|pesquisa|pesquisar|search|dash|rel|cusFiltro)/;
  var SELETOR_IGNORADO = ".filtros, .filtro, .barra-filtros, .filters, .busca, .search, [data-cus-filter], [data-nao-limpar]";

  var ultimoGatilho = null;

  document.addEventListener(
    "click",
    function (ev) {
      var alvo = ev.target;
      if (!alvo || !alvo.closest) return;
      ultimoGatilho = alvo.closest("button, a, input[type=button], input[type=submit]") || alvo;
    },
    true
  );

  var SELETOR_BLOCO =
    "form, .cus-form-wrap, .cus-panel, .glass-container, .card-body, .card, .box, .panel, .painel, .modal-content, .modal-body, fieldset";

  function blocoComCampos(base) {
    var el = base;
    while (el && el !== document.body) {
      if (el.matches && el.matches(SELETOR_BLOCO) &&
          el.querySelector("input, select, textarea")) return el;
      el = el.parentElement;
    }
    // Falha segura: nunca sobe até um painel inteiro, pois ele pode conter
    // filtros e vários formulários independentes.
    return null;
  }

  function containerDoGatilho() {
    var base = ultimoGatilho;
    if (!base || !base.closest || !document.body.contains(base)) return null;
    return blocoComCampos(base);
  }


  function deveIgnorar(el) {
    if (!el) return true;
    if (el.type === "file") return false; // arquivos também devem ser limpos
    if (el.hasAttribute("data-nao-limpar")) return true;
    if (el.closest && el.closest(SELETOR_IGNORADO)) return true;
    var id = el.id || el.name || "";
    if (id && PREFIXOS_IGNORADOS.test(id)) return true;
    return false;
  }

  function limparElemento(el) {
      if (deveIgnorar(el)) return;
      var tipo = (el.type || "").toLowerCase();
      try {
        var buscaCadastro = el.classList && el.classList.contains("fm-busca-cadastro");
        if (tipo === "checkbox" || tipo === "radio") {
          el.checked = false;
        } else if (el.tagName === "SELECT") {
          el.value = "";
          if (el.value) el.selectedIndex = 0;
          if (el.selectedIndex < 0) el.selectedIndex = 0;
        } else if (el._flatpickr) {

          el._flatpickr.clear();
        } else {
          el.value = "";
        }
        // Os campos visuais de veículo, motorista e fornecedor abrem a lista
        // ao receber um evento de digitação. Na limpeza programática, apenas
        // esvazia e fecha a lista, sem simular um clique/digitação do usuário.
        if (buscaCadastro) {
          var lista = document.getElementById(el.getAttribute("aria-controls") || "");
          if (lista) {
            lista.innerHTML = "";
            lista.hidden = true;
          }
        } else {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } catch (e) {
        /* campo protegido: segue adiante */
      }
  }

  function limparContainer(container) {
    if (!container) return;
    var campos = container.querySelectorAll("input, select, textarea");
    Array.prototype.forEach.call(campos, limparElemento);
  }

  function idsDoContainer(container) {
    if (!container) return [];
    return Array.prototype.map.call(
      container.querySelectorAll("input[id], select[id], textarea[id]"),
      function (el) { return el.id; }
    ).filter(function (id, i, lista) {
      return id && lista.indexOf(id) === i;
    });
  }

  function idsDaChamada(nome, args, container) {
    // A função genérica já recebe a lista exata dos campos e o identificador
    // de edição. Não é necessário adivinhar seu formulário pelo layout.
    if (nome === "salvar" && Array.isArray(args[1])) {
      return args[1].concat(args[2] ? [args[2]] : []);
    }
    return idsDoContainer(container);
  }

  /* A tela costuma ser redesenhada logo após salvar (listas, selects, etc.),
     o que pode reescrever os campos. Por isso repetimos a limpeza. */
  function limparDepois(ids) {
    [0, 60, 200, 600, 1200].forEach(function (t) {
      setTimeout(function () {
        try {
          ids.forEach(function (id) {
            // Resolve novamente pelo id: renderizações podem substituir todo
            // o formulário depois que o botão Salvar é acionado.
            limparElemento(document.getElementById(id));
          });
        } catch (e) {}
      }, t);
    });
  }



  function envolver(nome) {
    var original = window[nome];
    if (typeof original !== "function" || original.__limpezaPosSalvar) return;

    var wrapper = function () {
      var container = containerDoGatilho();
      var ids = idsDaChamada(nome, arguments, container);
      var alertaOriginal = window.alert;
      var confirmOriginal = window.confirm;
      var houveAviso = false;

      window.alert = function () {
        houveAviso = true;
        return alertaOriginal.apply(window, arguments);
      };
      window.confirm = function () {
        var r = confirmOriginal.apply(window, arguments);
        if (!r) houveAviso = true;
        return r;
      };

      var retorno;
      try {
        retorno = original.apply(this, arguments);
      } finally {
        window.alert = alertaOriginal;
        window.confirm = confirmOriginal;
      }

      var ok = !houveAviso && retorno !== false;

      if (ok && retorno && typeof retorno.then === "function") {
        return retorno.then(function (v) {
          if (v !== false) limparDepois(ids);
          return v;
        });
      }

      if (ok) limparDepois(ids);
      return retorno;
    };


    wrapper.__limpezaPosSalvar = true;
    try {
      window[nome] = wrapper;
    } catch (e) {
      /* propriedade somente leitura */
    }
  }

  function varrer() {
    var nomes;
    try {
      nomes = Object.getOwnPropertyNames(window);
    } catch (e) {
      return;
    }
    nomes.forEach(function (nome) {
      if (NAO_ENVOLVER[nome]) return;
      if (!/^(salvar|cadastrar|registrar)/.test(nome)) return;
      envolver(nome);
    });
  }

  varrer();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", varrer);
  }
  window.addEventListener("load", varrer);
  setTimeout(varrer, 1500);
  setTimeout(varrer, 4000);

  /* Cancelar / fechar edição também deve esvaziar o formulário. */
  function ehBotaoCancelar(btn) {
    if (!btn) return false;
    if (btn.classList && btn.classList.contains("btn-cancelar")) return true;
    var texto = (btn.textContent || "").trim().toLowerCase();
    if (texto === "cancelar" || texto === "cancelar edição" || texto === "cancelar edicao") return true;
    var acao = btn.getAttribute && (btn.getAttribute("onclick") || "");
    if (acao && /^\s*(cancelar|limparForm|limparFormEstoque|limparCusto)/.test(acao)) return true;
    return false;
  }

  document.addEventListener(
    "click",
    function (ev) {
      var alvo = ev.target;
      if (!alvo || !alvo.closest) return;
      var btn = alvo.closest("button, a, input[type=button]");
      if (!ehBotaoCancelar(btn)) return;
      var ids = idsDoContainer(blocoComCampos(btn));
      if (ids.length) limparDepois(ids);
    },
    true
  );

  window.limparCamposDoBloco = limparContainer;
})();
