/* Organização por clique e arraste.
   - módulos do menu: ordem vertical;
   - abas da Gestão da Frota: ordem horizontal.
   A preferência é somente visual e fica salva neste navegador. */
(function () {
  "use strict";
  if (window.fmOrganizacaoCamposAtiva) return;
  window.fmOrganizacaoCamposAtiva = true;
  var CHAVE_MODULOS = "FM_ORDEM_MODULOS_V1";
  var CHAVE_ABAS = "FM_ORDEM_ABAS_FROTA_V1";
  var estado = null;
  var bloquearCliqueAte = 0;
  function ler(chave) {
    try {
      var valor = JSON.parse(localStorage.getItem(chave) || "{}");
      return valor && typeof valor === "object" ? valor : {};
    } catch (e) { return {}; }
  }
  function salvar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) {}
  }
  function modulos() {
    return Array.prototype.slice.call(document.querySelectorAll("#sistema .sb-nav > a[data-module]"));
  }
  function abas() {
    return Array.prototype.slice.call(document.querySelectorAll("#custos .cus-tabs > .cus-tab[data-tab]"));
  }
  function restaurar(container, itens, chave, atributo) {
    if (!container || itens.length < 2) return;
    var ordem = ler(chave).ordem;
    if (!Array.isArray(ordem)) return;
    var porId = {};
    itens.forEach(function (item) { porId[item.dataset[atributo]] = item; });
    var ordenados = ordem.map(function (id) { return porId[id]; }).filter(Boolean);
    itens.forEach(function (item) {
      if (ordenados.indexOf(item) < 0) ordenados.push(item);
    });
    if (itens.every(function (item, i) { return item === ordenados[i]; })) return;
    var vagas = itens.map(function (item) {
      var marca = document.createComment("posição da aba");
      container.insertBefore(marca, item);
      return marca;
    });
    vagas.forEach(function (marca, i) { container.replaceChild(ordenados[i], marca); });
  }
  function restaurarModulos(nav, itens) {
    if (!nav || itens.length < 2) return;
    var ordem = ler(CHAVE_MODULOS).ordem;
    if (!Array.isArray(ordem)) return;
    var porId = {};
    itens.forEach(function (item) { porId[item.dataset.module] = item; });
    var ordenados = ordem.map(function (id) { return porId[id]; }).filter(Boolean);
    itens.forEach(function (item) { if (ordenados.indexOf(item) < 0) ordenados.push(item); });
    // Os títulos continuam nas posições originais; cada vaga de módulo recebe
    // o módulo correspondente à ordem salva, inclusive entre seções diferentes.
    if (itens.every(function (item, i) { return item === ordenados[i]; })) return;
    var vagas = itens.map(function (item) {
      var marca = document.createComment("posição do módulo");
      nav.insertBefore(marca, item);
      return marca;
    });
    vagas.forEach(function (marca, i) { nav.replaceChild(ordenados[i], marca); });
  }
  function prepararModulos() {
    var itens = modulos();
    itens.forEach(function (item) {
      item.classList.add("fm-modulo-arrastavel");
      if (!item.title) item.title = "Segure e arraste para cima ou para baixo";
    });
    restaurarModulos(document.querySelector("#sistema .sb-nav"), itens);
  }
  function prepararAbas() {
    var itens = abas();
    itens.forEach(function (item) {
      item.classList.add("fm-aba-arrastavel");
      if (!item.title) item.title = "Segure e arraste para a esquerda ou para a direita";
    });
    restaurar(document.querySelector("#custos .cus-tabs"), itens, CHAVE_ABAS, "tab");
  }
  function prepararTudo() {
    prepararModulos();
    prepararAbas();
  }
  function iniciarArraste(evento) {
    if (evento.button !== undefined && evento.button !== 0) return;
    var item = evento.target.closest(".fm-modulo-arrastavel, .fm-aba-arrastavel");
    if (!item || !item.parentElement) return;
    estado = {
      item: item,
      recipiente: item.parentElement,
      tipo: item.classList.contains("fm-modulo-arrastavel") ? "modulo" : "aba",
      x: evento.clientX,
      y: evento.clientY,
      ativo: false,
      pointerId: evento.pointerId
    };
  }
  function iniciarMovimento(evento) {
    estado.ativo = true;
    estado.item.classList.add("fm-item-em-arraste");
    document.body.classList.add("fm-reordenando-campos");
    // O recipiente não muda de lugar durante o arraste; capturar no item
    // perderia o pointerup quando ele é movido no DOM.
    try { estado.recipiente.setPointerCapture(evento.pointerId); } catch (e) {}
  }
  function moverItem(destino, evento) {
    if (!destino || destino === estado.item || destino.parentElement !== estado.recipiente) return;
    var caixa = destino.getBoundingClientRect();
    var antes = estado.tipo === "modulo"
      ? evento.clientY < caixa.top + caixa.height / 2
      : evento.clientX < caixa.left + caixa.width / 2;
    estado.recipiente.insertBefore(estado.item, antes ? destino : destino.nextSibling);
  }
  function mover(evento) {
    if (!estado || evento.pointerId !== estado.pointerId) return;
    if (!estado.ativo) {
      var deslocamento = estado.tipo === "modulo"
        ? Math.abs(evento.clientY - estado.y)
        : Math.abs(evento.clientX - estado.x);
      if (deslocamento < 7) return;
      iniciarMovimento(evento);
    }
    evento.preventDefault();
    var seletor = estado.tipo === "modulo" ? ".fm-modulo-arrastavel" : ".fm-aba-arrastavel";
    var alvo = document.elementFromPoint(evento.clientX, evento.clientY);
    var destino = alvo && alvo.closest ? alvo.closest(seletor) : null;
    moverItem(destino, evento);
  }
  function gravarOrdem(atual) {
    if (atual.tipo === "modulo") {
      salvar(CHAVE_MODULOS, { ordem: modulos().map(function (item) { return item.dataset.module; }) });
      return;
    }
    salvar(CHAVE_ABAS, { ordem: abas().map(function (item) { return item.dataset.tab; }) });
  }
  function finalizar(evento) {
    if (!estado || (evento.pointerId !== undefined && evento.pointerId !== estado.pointerId)) return;
    var atual = estado;
    estado = null;
    if (!atual.ativo) return;
    evento.preventDefault();
    bloquearCliqueAte = Date.now() + 350;
    atual.item.classList.remove("fm-item-em-arraste");
    document.body.classList.remove("fm-reordenando-campos");
    gravarOrdem(atual);
  }
  function impedirCliqueDepoisDoArraste(evento) {
    if (Date.now() < bloquearCliqueAte) {
      evento.preventDefault();
      evento.stopImmediatePropagation();
    }
  }
  function iniciar() {
    prepararTudo();
    document.addEventListener("pointerdown", iniciarArraste, true);
    document.addEventListener("pointermove", mover, { capture: true, passive: false });
    document.addEventListener("pointerup", finalizar, true);
    document.addEventListener("pointercancel", finalizar, true);
    document.addEventListener("click", impedirCliqueDepoisDoArraste, true);
    new MutationObserver(function () {
      if (!estado || !estado.ativo) prepararTudo();
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
