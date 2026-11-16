/* Camada visual: mantém placas inteiras sem modificar dados, formulários ou cálculos. */
(function (root) {
  'use strict';
  function localizarPlacas(texto) {
    var re = /(^|[^A-Za-z0-9])([A-Za-z]{3}[-\u2010\u2011\u2013\u2014 ]?\d[A-Za-z0-9]\d{2})(?=$|[^A-Za-z0-9])/g;
    var partes = [], match;
    while ((match = re.exec(texto))) {
      partes.push({inicio: match.index + match[1].length, texto: match[2]});
    }
    return partes;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {localizarPlacas: localizarPlacas};
  if (typeof document === 'undefined') return;
  var pendentes = new Set(), agendado = false, observador;
  var ignorar = 'script, style, input, textarea, select, button, [contenteditable], .fm-placa-inteira';
  function protegerTexto(celula) {
    var walker = document.createTreeWalker(celula, NodeFilter.SHOW_TEXT), nos = [], no;
    while ((no = walker.nextNode())) {
      if (!no.parentElement.closest(ignorar) && localizarPlacas(no.nodeValue).length) nos.push(no);
    }
    nos.forEach(function (texto) {
      var conteudo = texto.nodeValue, partes = localizarPlacas(conteudo);
      var fragmento = document.createDocumentFragment(), inicio = 0;
      partes.forEach(function (parte) {
        fragmento.appendChild(document.createTextNode(conteudo.slice(inicio, parte.inicio)));
        var placa = document.createElement('span');
        placa.className = 'fm-placa-inteira';
        placa.textContent = parte.texto;
        fragmento.appendChild(placa);
        inicio = parte.inicio + parte.texto.length;
      });
      fragmento.appendChild(document.createTextNode(conteudo.slice(inicio)));
      texto.parentNode.replaceChild(fragmento, texto);
    });
  }
  function normalizar(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function ajustar(tabela) {
    var temPlaca = false;
    tabela.querySelectorAll('tbody td').forEach(function (celula) {
      if (celula.closest('table') !== tabela) return;
      protegerTexto(celula);
      var texto = celula.textContent.trim(), partes = localizarPlacas(texto);
      var somentePlaca = partes.length === 1 && partes[0].texto === texto;
      celula.classList.toggle('fm-celula-placa', somentePlaca);
      if (partes.length) temPlaca = true;
    });
    if (!temPlaca) return;
    tabela.classList.add('fm-tabela-placas');
    // A descrição cede espaço; valores, datas, status e ações mantêm suas regras.
    tabela.querySelectorAll('thead th').forEach(function (th) {
      if (!/^(observac(ao|oes)|descric(ao|oes)|destino)$/.test(normalizar(th.textContent))) return;
      var indice = th.cellIndex;
      Array.from(tabela.tBodies).forEach(function (corpo) {
        Array.from(corpo.rows).forEach(function (linha) {
          if (linha.cells.length !== th.parentElement.cells.length || Array.from(linha.cells).some(function (c) { return c.colSpan !== 1; })) return;
          var celula = linha.cells[indice];
          if (celula && !celula.classList.contains('fm-celula-placa')) celula.classList.add('fm-texto-flexivel');
        });
      });
    });
    var container = tabela.closest('.table-responsive, .pro-tablewrap, .saida-veiculos-tablewrap');
    if (container) container.classList.add('fm-placas-rolagem');
  }
  function observar() {
    observador.observe(document.body, {childList: true, characterData: true, subtree: true});
  }
  function processar() {
    agendado = false;
    observador.disconnect();
    try {
      pendentes.forEach(function (tabela) { if (tabela.isConnected) ajustar(tabela); });
    } finally {
      pendentes.clear();
      observar();
    }
  }
  function incluir(no, descendentes) {
    var elemento = no.nodeType === 1 ? no : no.parentElement;
    if (!elemento || elemento.closest(ignorar)) return;
    var tabela = elemento.closest('table');
    if (tabela) pendentes.add(tabela);
    if (descendentes) elemento.querySelectorAll('table').forEach(function (t) { pendentes.add(t); });
  }
  function iniciar() {
    observador = new MutationObserver(function (mudancas) {
      mudancas.forEach(function (m) {
        incluir(m.target, false);
        m.addedNodes.forEach(function (no) { incluir(no, true); });
      });
      if (pendentes.size && !agendado) {
        agendado = true;
        root.requestAnimationFrame(processar);
      }
    });
    document.querySelectorAll('table').forEach(function (t) { pendentes.add(t); });
    processar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
