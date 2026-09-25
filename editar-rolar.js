/* Ao clicar em Editar, leva a tela automaticamente ate o formulario preenchido. */
(function () {
  "use strict";
  function ehEditar(btn) {
    if (!btn) return false;
    var oc = String(btn.getAttribute("onclick") || "");
    var t = String(btn.getAttribute("title") || "") + " " + String(btn.textContent || "");
    if (/ver[A-Z]|visualizar/i.test(oc) && !/editar/i.test(oc)) return false;
    return /editar/i.test(oc) || /editar|✏/i.test(t);
  }
  function campos() {
    return Array.prototype.slice.call(document.querySelectorAll("input, select, textarea")).filter(function (el) {
      return el.type !== "hidden" && el.type !== "file" && !el.closest("table");
    });
  }
  function visivel(el) {
    return el.offsetParent !== null || el.getClientRects().length > 0;
  }
  function alvo(el) {
    return el.closest("form, .glass-container, .card, .cus-card, .cus-form, fieldset, section") || el;
  }
  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest("button, a, [onclick]");
    if (!ehEditar(btn)) return;
    if (btn.closest(".modal, #fmModalVerFrete")) {
      /* botao Editar dentro da janela de detalhes: segue normalmente */
    }
    var antes = new Map();
    campos().forEach(function (el) { antes.set(el, el.value); });
    function rolar(tentativa) {
      var mudou = campos().filter(function (el) {
        return visivel(el) && (!antes.has(el) || antes.get(el) !== el.value) && el.value !== "";
      });
      if (!mudou.length) {
        if (tentativa < 4) setTimeout(function () { rolar(tentativa + 1); }, 120);
        return;
      }
      var el = mudou[0];
      alvo(el).scrollIntoView({ behavior: "smooth", block: "start" });
      try { el.focus({ preventScroll: true }); } catch (e) { void e; }
    }
    setTimeout(function () { rolar(0); }, 80);
  }, true);
})();
