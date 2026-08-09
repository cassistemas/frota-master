/* ============================================================
   FROTA MASTER - PADRONIZACAO DOS CONTROLES DE FILTRO
   Aplica cores e estilo unicos para os botoes de
   Buscar / Pesquisar / Filtrar / Aplicar, Limpar / Cancelar /
   Resetar e para os campos de busca em TODOS os modulos.
============================================================ */
(function () {
  "use strict";

  function slug(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  var BUSCAR = /(^|\s)(buscar|pesquisar|filtrar|aplicar filtro|aplicar|consultar|procurar)(\s|$)/;
  var LIMPAR = /(^|\s)(limpar|limpar filtros|cancelar|resetar|remover filtro|restaurar)(\s|$)/;

  function classificarBotoes(raiz) {
    var bts = (raiz || document).querySelectorAll(
      "button, input[type=button], input[type=submit], a.btn"
    );
    Array.prototype.forEach.call(bts, function (b) {
      if (b.closest(".rel-bar") || b.closest(".pro-pager")) return;

      b.classList.remove("fm-fbtn-buscar", "fm-fbtn-limpar");

      var t = slug(b.textContent || b.value || b.getAttribute("aria-label"));
      if (!t) return;
      /* nao mexe em acoes de formulario */
      if (/^(salvar|excluir|novo|adicionar|editar|entrar|sair|imprimir)/.test(t)) return;

      if (BUSCAR.test(t)) {
        b.classList.add("fm-fbtn", "fm-fbtn-buscar");
      } else if (LIMPAR.test(t)) {
        b.classList.add("fm-fbtn", "fm-fbtn-limpar");
      } else {
        return;
      }
      b.setAttribute("data-fm-filtro", "1");
    });
  }

  function classificarCampos(raiz) {
    var campos = (raiz || document).querySelectorAll("input, select");
    Array.prototype.forEach.call(campos, function (el) {
      if (el.getAttribute("data-fm-campo") === "1") return;
      var tipo = (el.getAttribute("type") || "text").toLowerCase();
      if (["button", "submit", "checkbox", "radio", "hidden", "file"].indexOf(tipo) > -1) return;

      var ref = slug(
        (el.id || "") + " " + (el.name || "") + " " + (el.getAttribute("placeholder") || "")
      );
      if (!/(filtro|filtrar|busca|buscar|pesquis|search|localizar|consulta)/.test(ref)) return;

      el.classList.add("fm-fcampo");
      el.setAttribute("data-fm-campo", "1");
    });
  }

  function aplicar() {
    classificarBotoes(document);
    classificarCampos(document);
  }

  function iniciar() {
    aplicar();
    var timer = null;
    new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(aplicar, 60);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
