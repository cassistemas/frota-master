/* Organização dos campos por clique e arraste.
   Mantém somente a preferência visual no navegador; não altera cadastros. */
(function () {
  "use strict";

  if (window.fmOrganizacaoCamposAtiva) return;
  window.fmOrganizacaoCamposAtiva = true;

  var CHAVE = "FM_ORDEM_CAMPOS_V1";
  var seletorLinhas = ".glass-container .row, .cus-form-grid";
  var estado = null;

  function lerOrdens() {
    try {
      var valor = JSON.parse(localStorage.getItem(CHAVE) || "{}");
      return valor && typeof valor === "object" ? valor : {};
    } catch (e) {
      return {};
    }
  }

  function salvarOrdens(ordens) {
    try { localStorage.setItem(CHAVE, JSON.stringify(ordens)); } catch (e) {}
  }

  function campoDoItem(item) {
    return item && item.querySelector("input[id], select[id], textarea[id]");
  }

  function itensDaLinha(linha) {
    return Array.prototype.filter.call(linha.children, function (item) {
      return campoDoItem(item) && !item.closest("table");
    });
  }

  function chaveItem(item) {
    var campo = campoDoItem(item);
    return campo ? campo.id : "";
  }

  function chaveLinha(linha) {
    var modulo = linha.closest(".main > div[id], #sistemaMain > div[id], .cus-page");
    var ids = itensDaLinha(linha).map(chaveItem).filter(Boolean).sort();
    if (ids.length < 2) return "";
    return (modulo && modulo.id ? modulo.id : "pagina") + "::" + ids.join("|");
  }

  function restaurar(linha) {
    var chave = chaveLinha(linha);
    if (!chave) return;
    var ordem = lerOrdens()[chave];
    if (!Array.isArray(ordem)) return;
    var porId = {};
    itensDaLinha(linha).forEach(function (item) { porId[chaveItem(item)] = item; });
    ordem.forEach(function (id) {
      if (porId[id] && porId[id].parentNode === linha) linha.appendChild(porId[id]);
    });
  }

  function prepararLinha(linha) {
    if (!linha || linha.dataset.fmOrdenavel === "1") return;
    var itens = itensDaLinha(linha);
    if (itens.length < 2) return;
    linha.dataset.fmOrdenavel = "1";
    itens.forEach(function (item) {
      item.classList.add("fm-campo-arrastavel");
      item.title = item.title || "Clique, segure e arraste para reorganizar";
    });
    restaurar(linha);
  }

  function prepararTudo(raiz) {
    var base = raiz && raiz.querySelectorAll ? raiz : document;
    if (base.matches && base.matches(seletorLinhas)) prepararLinha(base);
    base.querySelectorAll(seletorLinhas).forEach(prepararLinha);
  }

  function iniciarArraste(evento) {
    if (evento.button !== undefined && evento.button !== 0) return;
    var item = evento.target.closest(".fm-campo-arrastavel");
    if (!item || !item.parentElement || item.closest("table")) return;
    estado = {
      item: item,
      linha: item.parentElement,
      x: evento.clientX,
      y: evento.clientY,
      ativo: false,
      pointerId: evento.pointerId
    };
  }

  function mover(evento) {
    if (!estado || evento.pointerId !== estado.pointerId) return;
    if (!estado.ativo) {
      var distancia = Math.hypot(evento.clientX - estado.x, evento.clientY - estado.y);
      if (distancia < 7) return;
      estado.ativo = true;
      estado.item.classList.add("fm-campo-em-arraste");
      document.body.classList.add("fm-reordenando-campos");
      try { estado.item.setPointerCapture(evento.pointerId); } catch (e) {}
    }
    evento.preventDefault();
    var alvo = document.elementFromPoint(evento.clientX, evento.clientY);
    var destino = alvo && alvo.closest ? alvo.closest(".fm-campo-arrastavel") : null;
    if (!destino || destino === estado.item || destino.parentElement !== estado.linha) return;
    var caixa = destino.getBoundingClientRect();
    var antes = evento.clientY < caixa.top + caixa.height / 2;
    estado.linha.insertBefore(estado.item, antes ? destino : destino.nextSibling);
  }

  function finalizar(evento) {
    if (!estado || (evento.pointerId !== undefined && evento.pointerId !== estado.pointerId)) return;
    var atual = estado;
    estado = null;
    if (!atual.ativo) return;
    evento.preventDefault();
    atual.item.classList.remove("fm-campo-em-arraste");
    document.body.classList.remove("fm-reordenando-campos");
    var chave = chaveLinha(atual.linha);
    if (!chave) return;
    var ordens = lerOrdens();
    ordens[chave] = itensDaLinha(atual.linha).map(chaveItem).filter(Boolean);
    salvarOrdens(ordens);
  }

  function iniciar() {
    prepararTudo(document);
    document.addEventListener("pointerdown", iniciarArraste, true);
    document.addEventListener("pointermove", mover, { capture: true, passive: false });
    document.addEventListener("pointerup", finalizar, true);
    document.addEventListener("pointercancel", finalizar, true);
    new MutationObserver(function (mudancas) {
      mudancas.forEach(function (mudanca) {
        mudanca.addedNodes.forEach(function (no) {
          if (no.nodeType === 1) prepararTudo(no);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
