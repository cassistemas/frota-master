/* Organização por clique e arraste.
   - módulos do menu: ordem vertical;
   - colunas dos formulários: ordem horizontal.
   A preferência é somente visual e fica salva neste navegador. */
(function () {
  "use strict";

  if (window.fmOrganizacaoCamposAtiva) return;
  window.fmOrganizacaoCamposAtiva = true;

  var CHAVE_CAMPOS = "FM_ORDEM_CAMPOS_V2";
  var CHAVE_MODULOS = "FM_ORDEM_MODULOS_V1";
  var seletorLinhas = ".glass-container .row, .cus-form-grid";
  var estado = null;
  var bloquearCliqueAte = 0;

  function ler(chave) {
    try {
      var valor = JSON.parse(localStorage.getItem(chave) || "{}");
      return valor && typeof valor === "object" ? valor : {};
    } catch (e) {
      return {};
    }
  }

  function salvar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) {}
  }

  function campoDoItem(item) {
    if (!item || !item.querySelector) return null;
    return item.querySelector("input[id]:not([type='hidden']), select[id], textarea[id]");
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
    var modulo = linha.closest("#sistemaMain > div[id], .cus-page");
    var ids = itensDaLinha(linha).map(chaveItem).filter(Boolean).sort();
    if (ids.length < 2) return "";
    return (modulo && modulo.id ? modulo.id : "pagina") + "::" + ids.join("|");
  }

  function restaurarLinha(linha) {
    var chave = chaveLinha(linha);
    if (!chave) return;
    var ordem = ler(CHAVE_CAMPOS)[chave];
    if (!Array.isArray(ordem)) return;
    var porId = {};
    itensDaLinha(linha).forEach(function (item) { porId[chaveItem(item)] = item; });
    ordem.forEach(function (id) {
      if (porId[id] && porId[id].parentNode === linha) linha.appendChild(porId[id]);
    });
  }

  function prepararLinha(linha) {
    if (!linha) return;
    var itens = itensDaLinha(linha);
    if (itens.length < 2) return;
    var primeiraVez = linha.dataset.fmOrdenavel !== "1";
    linha.dataset.fmOrdenavel = "1";
    itens.forEach(function (item) {
      item.classList.add("fm-coluna-arrastavel");
      if (!item.title) item.title = "Segure e arraste para os lados";
    });
    if (primeiraVez) restaurarLinha(linha);
  }

  function modulos() {
    return Array.prototype.slice.call(document.querySelectorAll("#sistema .sb-nav > a[data-module]"));
  }

  function restaurarModulos() {
    var nav = document.querySelector("#sistema .sb-nav");
    if (!nav) return;
    var ordem = ler(CHAVE_MODULOS).ordem;
    if (!Array.isArray(ordem)) return;
    var atuais = modulos();
    var porId = {};
    atuais.forEach(function (item) { porId[item.dataset.module] = item; });
    var ordenados = ordem.map(function (id) { return porId[id]; }).filter(Boolean);
    atuais.forEach(function (item) {
      if (ordenados.indexOf(item) < 0) ordenados.push(item);
    });
    var marcadores = atuais.map(function (item) {
      var marcador = document.createComment("fm-modulo");
      nav.insertBefore(marcador, item);
      return marcador;
    });
    atuais.forEach(function (item) { nav.removeChild(item); });
    marcadores.forEach(function (marcador, indice) {
      if (ordenados[indice]) nav.insertBefore(ordenados[indice], marcador);
      nav.removeChild(marcador);
    });
  }

  function prepararModulos() {
    modulos().forEach(function (item) {
      item.classList.add("fm-modulo-arrastavel");
      if (!item.title) item.title = "Segure e arraste para cima ou para baixo";
    });
  }

  function prepararTudo(raiz) {
    var base = raiz && raiz.querySelectorAll ? raiz : document;
    if (base.matches && base.matches(seletorLinhas)) prepararLinha(base);
    base.querySelectorAll(seletorLinhas).forEach(prepararLinha);
    prepararModulos();
  }

  function tipoDoItem(item) {
    return item.classList.contains("fm-modulo-arrastavel") ? "modulo" : "coluna";
  }

  function iniciarArraste(evento) {
    if (evento.button !== undefined && evento.button !== 0) return;
    var item = evento.target.closest(".fm-modulo-arrastavel, .fm-coluna-arrastavel");
    if (!item || !item.parentElement || item.closest("table")) return;
    estado = {
      item: item,
      recipiente: item.parentElement,
      tipo: tipoDoItem(item),
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
    try { estado.item.setPointerCapture(evento.pointerId); } catch (e) {}
  }

  function moverModulo(destino, evento) {
    if (!destino || destino === estado.item || destino.parentElement !== estado.recipiente) return;
    var caixa = destino.getBoundingClientRect();
    var antes = evento.clientY < caixa.top + caixa.height / 2;
    estado.recipiente.insertBefore(estado.item, antes ? destino : destino.nextSibling);
  }

  function moverColuna(destino, evento) {
    if (!destino || destino === estado.item || destino.parentElement !== estado.recipiente) return;
    var caixa = destino.getBoundingClientRect();
    var mesmaFaixa = evento.clientY >= caixa.top && evento.clientY <= caixa.bottom;
    var antes = mesmaFaixa
      ? evento.clientX < caixa.left + caixa.width / 2
      : evento.clientY < caixa.top + caixa.height / 2;
    estado.recipiente.insertBefore(estado.item, antes ? destino : destino.nextSibling);
  }

  function mover(evento) {
    if (!estado || evento.pointerId !== estado.pointerId) return;
    if (!estado.ativo) {
      var distancia = Math.hypot(evento.clientX - estado.x, evento.clientY - estado.y);
      if (distancia < 7) return;
      iniciarMovimento(evento);
    }
    evento.preventDefault();
    var seletor = estado.tipo === "modulo" ? ".fm-modulo-arrastavel" : ".fm-coluna-arrastavel";
    var alvo = document.elementFromPoint(evento.clientX, evento.clientY);
    var destino = alvo && alvo.closest ? alvo.closest(seletor) : null;
    if (estado.tipo === "modulo") moverModulo(destino, evento);
    else moverColuna(destino, evento);
  }

  function gravarOrdem(atual) {
    if (atual.tipo === "modulo") {
      salvar(CHAVE_MODULOS, { ordem: modulos().map(function (item) { return item.dataset.module; }) });
      return;
    }
    var chave = chaveLinha(atual.recipiente);
    if (!chave) return;
    var ordens = ler(CHAVE_CAMPOS);
    ordens[chave] = itensDaLinha(atual.recipiente).map(chaveItem).filter(Boolean);
    salvar(CHAVE_CAMPOS, ordens);
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
    prepararTudo(document);
    restaurarModulos();
    document.addEventListener("pointerdown", iniciarArraste, true);
    document.addEventListener("pointermove", mover, { capture: true, passive: false });
    document.addEventListener("pointerup", finalizar, true);
    document.addEventListener("pointercancel", finalizar, true);
    document.addEventListener("click", impedirCliqueDepoisDoArraste, true);
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