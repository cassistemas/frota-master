/* Consulta independente: não acessa cadastros nem altera dados do sistema. */
(function () {
  'use strict';
  function iniciar() {
    var root = document.getElementById('manual');
    var guias = window.FMManualConteudo;
    if (!root || !Array.isArray(guias) || !guias.length) return;
    var ativo = guias[0].id;
    function normalizar(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
    root.innerHTML = '<header class="fm-manual-heading"><div><h2 id="fmManualTitulo">Manual do sistema</h2><p>Frota Master · Operações, integrações e cálculos · Revisado em 08/10/2026</p></div><div class="fm-manual-search"><label class="visually-hidden" for="fmManualBusca">Buscar no manual</label><input id="fmManualBusca" type="search" class="form-control" placeholder="Buscar módulo, campo ou cálculo…"><button id="fmManualImprimir" type="button" class="btn btn-outline-secondary" title="Imprimir manual do módulo aberto" aria-label="Imprimir manual do módulo aberto">⎙</button></div></header><p class="fm-manual-count" id="fmManualContagem" aria-live="polite"></p><div class="fm-manual-layout"><nav class="fm-manual-tabs" role="tablist" aria-label="Módulos do manual" aria-orientation="vertical"></nav><article id="fmManualArtigo" class="fm-manual-article" role="tabpanel" tabindex="0"></article></div>';
    var nav = root.querySelector('.fm-manual-tabs'), artigo = document.getElementById('fmManualArtigo');
    var busca = document.getElementById('fmManualBusca');
    var textos = guias.map(function(g) { var d = document.createElement('div'); d.innerHTML = g.html; return normalizar(g.titulo + ' ' + d.textContent); });
    guias.forEach(function(g) {
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-outline-secondary'; btn.id = 'fmManualTab-' + g.id;
      btn.textContent = g.titulo; btn.dataset.manual = g.id; btn.setAttribute('role', 'tab'); btn.setAttribute('aria-controls', 'fmManualArtigo');
      btn.addEventListener('click', function() { ativo = g.id; mostrar(); }); nav.appendChild(btn);
    });
    function mostrar() {
      var termo = normalizar(busca.value).trim(), palavras = termo.split(/\s+/).filter(Boolean);
      var encontrados = guias.filter(function(g,i) { return palavras.every(function(p) { return textos[i].includes(p); }); });
      if (!encontrados.some(function(g) { return g.id === ativo; })) ativo = encontrados[0] ? encontrados[0].id : '';
      nav.querySelectorAll('[role="tab"]').forEach(function(b) { b.hidden = !encontrados.some(function(g) { return g.id === b.dataset.manual; }); b.setAttribute('aria-selected', String(b.dataset.manual === ativo)); b.tabIndex = b.dataset.manual === ativo ? 0 : -1; });
      var guia = guias.find(function(g) { return g.id === ativo; });
      artigo.innerHTML = guia ? '<h3>' + guia.titulo + '</h3>' + guia.html : '<h3>Nenhum resultado</h3><p>Nenhum módulo encontrado para esta busca.</p>';
      if (guia) artigo.setAttribute('aria-labelledby', 'fmManualTab-' + guia.id); else artigo.removeAttribute('aria-labelledby');
      document.getElementById('fmManualContagem').textContent = encontrados.length + ' de ' + guias.length + ' capítulos' + (guia ? ' · ' + guia.titulo : '');
      // Marcação apenas de texto; os dados do sistema não são consultados.
      if (termo && guia) {
        var walker = document.createTreeWalker(artigo, NodeFilter.SHOW_TEXT), nodes = [], node;
        while ((node = walker.nextNode())) nodes.push(node);
        nodes.forEach(function(n) {
          var t = normalizar(n.textContent), pos = t.indexOf(termo);
          if (pos < 0) return;
          var fragment = document.createDocumentFragment(), mark = document.createElement('mark');
          fragment.appendChild(document.createTextNode(n.textContent.slice(0,pos))); mark.textContent = n.textContent.slice(pos,pos+termo.length); fragment.appendChild(mark); fragment.appendChild(document.createTextNode(n.textContent.slice(pos+termo.length))); n.replaceWith(fragment);
        });
      }
    }
    busca.addEventListener('input', mostrar);
    nav.addEventListener('keydown', function(e) {
      if (!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
      var buttons = Array.from(nav.querySelectorAll('[role="tab"]')).filter(function(b) { return !b.hidden; });
      if (!buttons.length) return; e.preventDefault();
      var i = buttons.indexOf(document.activeElement), next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length-1 : (i + (['ArrowDown','ArrowRight'].includes(e.key) ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].click(); buttons[next].focus();
    });
    document.getElementById('fmManualImprimir').addEventListener('click', function() { document.body.classList.add('fm-imprimindo-manual'); try { window.print(); } finally { document.body.classList.remove('fm-imprimindo-manual'); } });
    mostrar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();