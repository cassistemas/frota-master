/* =====================================================================
   ENTER UNIVERSAL — Frota Master
   Faz a tecla ENTER agir como um clique:
   - Em modais: aciona o botão principal (Salvar / Confirmar / Buscar).
   - Em campos de busca/filtro: aplica a busca/filtro.
   - Em formulários: aciona o botão de submit / ação principal.
   Não interfere em textarea, selects abertos, editores ou atalhos com
   Ctrl/Alt/Meta e Shift+Enter.
   ===================================================================== */
(function () {
  "use strict";

  var ACAO_RE =
    /(salvar|confirmar|buscar|pesquisar|aplicar|filtrar|consultar|entrar|login|adicionar|incluir|cadastrar|lançar|lancar|gravar|ok|enviar|acessar)/i;
  var CANCELAR_RE = /(cancelar|fechar|voltar|limpar|excluir|remover|deletar|sair)/i;
  /* Campos que já possuem tratamento próprio de Enter no sistema */
  var JA_TRATADOS = ["segDevPass", "dtBuscaPlaca", "dtBuscaRenavam", "fmSolEmail"];

  var FILTRO_RE = /(filtro|filtrar|busca|buscar|pesquis|search|query|termo)/i;

  function visivel(el) {
    if (!el || el.disabled) return false;
    if (el.offsetParent === null && el.getClientRects().length === 0) return false;
    var st = window.getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  }

  function texto(el) {
    return ((el.textContent || "") + " " + (el.getAttribute("title") || "") + " " + (el.getAttribute("aria-label") || "")).trim();
  }

  /* Escolhe o melhor botão dentro de um container */
  function botaoPrincipal(container) {
    if (!container) return null;
    var marcado = container.querySelector("[data-enter]");
    if (marcado && visivel(marcado)) return marcado;

    var cands = [].slice.call(
      container.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, .btn')
    ).filter(visivel);
    if (!cands.length) return null;

    var pontua = function (b) {
      var t = texto(b);
      var p = 0;
      if (b.type === "submit") p += 4;
      if (/btn-primary|btn-success|btn-pro|btn-salvar/i.test(b.className)) p += 4;
      if (ACAO_RE.test(t)) p += 3;
      if (b.classList.contains("btn-close")) p -= 10;
      if (CANCELAR_RE.test(t)) p -= 6;
      if (/btn-secondary|btn-danger|btn-outline|btn-light/i.test(b.className)) p -= 2;
      if (!t) p -= 1;
      return p;
    };

    cands.sort(function (a, b) {
      return pontua(b) - pontua(a);
    });
    return pontua(cands[0]) > 0 ? cands[0] : null;
  }

  /* Container do campo: modal > form > bloco de filtros > seção */
  function containers(el) {
    var lista = [];
    var modal = el.closest(".modal.show, .modal[style*='block'], .modal");
    if (modal) lista.push(modal.querySelector(".modal-footer") || modal);
    var form = el.closest("form");
    if (form) lista.push(form);
    /* Sobe a árvore até o body: cobre blocos genéricos (ex.: tela de login,
       caixas de filtro em <div> simples, painéis sem classe conhecida) */
    var no = el.parentElement;
    while (no && no !== document.body) {
      lista.push(no);
      no = no.parentElement;
    }
    lista.push(document.body);
    return lista;
  }

  function ehCampo(el) {
    if (!el) return false;
    var tag = el.tagName;
    if (tag === "TEXTAREA") return false;
    if (el.isContentEditable) return false;
    if (tag === "SELECT") return true;
    if (tag !== "INPUT") return false;
    return ["submit", "button", "reset", "checkbox", "radio", "file", "range"].indexOf(el.type) === -1;
  }

  function acionar(btn) {
    if (!btn) return false;
    btn.click();
    return true;
  }

  document.addEventListener(
    "keydown",
    function (ev) {
      if (ev.key !== "Enter" || ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return;
      if (ev.isComposing) return;

      var el = ev.target;
      if (!ehCampo(el)) return;

      /* Deixa passar quem já trata Enter explicitamente */
      if (el.hasAttribute("data-enter-ignore")) return;
      if (JA_TRATADOS.indexOf(el.id) !== -1) return;

      var lista = containers(el);

      /* 1) Ação declarada no próprio campo */
      var alvoId = el.getAttribute("data-enter-target");
      if (alvoId) {
        var alvo = document.getElementById(alvoId);
        if (alvo && visivel(alvo)) {
          ev.preventDefault();
          acionar(alvo);
          return;
        }
      }

      /* 2) Campo de busca/filtro: garante que o valor foi propagado */
      var nome = (el.id || "") + " " + (el.name || "") + " " + (el.className || "") + " " + (el.placeholder || "");
      var ehFiltro = FILTRO_RE.test(nome) || el.type === "search";
      if (ehFiltro) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }

      /* 3) Botão principal no container mais próximo */
      for (var i = 0; i < lista.length; i++) {
        var btn = botaoPrincipal(lista[i]);
        if (btn) {
          ev.preventDefault();
          acionar(btn);
          return;
        }
      }

      /* 4) Fallback: submit do form */
      var form = el.closest("form");
      if (form) {
        ev.preventDefault();
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.submit();
      }
    },
    false
  );
})();
