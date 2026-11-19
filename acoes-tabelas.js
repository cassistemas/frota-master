/* Padronização visual: não troca handlers nem interfere nos registros. */
(function () {
  'use strict';
  function tipoAcao(botao) {
    var texto = String(botao.textContent || '').trim();
    var titulo = botao.getAttribute('aria-label') || botao.getAttribute('title') || '';
    var handler = botao.getAttribute('onclick') || '';
    if (/^editar(?:\s|$)/i.test(titulo) || /^[^\p{L}\p{N}]*editar\s*$/iu.test(texto)) return 'editar';
    if (/^excluir(?:\s|$)/i.test(titulo) || /^[^\p{L}\p{N}]*excluir\s*$/iu.test(texto)) return 'excluir';
    // Classes antigas também são usadas por KM, transferência e preenchimento.
    // Só reconhece o handler quando o botão contém apenas um ícone.
    if (!/[\p{L}\p{N}]/u.test(texto)) {
      if (/^\s*(?:return\s+)?(?:window\.)?editar\w*\s*\(/i.test(handler)) return 'editar';
      if (/^\s*(?:return\s+)?(?:window\.)?(?:excluir|deletar)\w*\s*\(/i.test(handler)) return 'excluir';
    }
    return '';
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { tipoAcao: tipoAcao };
  if (typeof document === 'undefined') return;

  var ns = 'http://www.w3.org/2000/svg';
  function icone(tipo) {
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', tipo === 'editar' ? 'm16 3 5 5-12 12-6 1 1-6Z M14 5l5 5' : 'm6 6 12 12 M18 6 6 18');
    svg.appendChild(path);
    return svg;
  }
  function padronizar(botao) {
    if (!botao.closest('td') || botao.closest('#saidaVeiculos')) return;
    var tipo = tipoAcao(botao);
    if (!tipo || botao.classList.contains('fm-acao-' + tipo)) return;
    var rotulo = tipo === 'editar' ? 'Editar' : 'Excluir';
    var texto = document.createElement('span');
    texto.textContent = rotulo;
    botao.classList.add('fm-acao-tabela', 'fm-acao-' + tipo);
    botao.replaceChildren(icone(tipo), texto);
    if (!botao.hasAttribute('aria-label')) botao.setAttribute('aria-label', rotulo);
    if (!botao.hasAttribute('title')) botao.setAttribute('title', rotulo);
    botao.closest('td').classList.add('fm-acoes-celula');
  }
  function percorrer(no) {
    if (no.nodeType !== 1) return;
    if (no.matches('button')) padronizar(no);
    no.querySelectorAll('td button').forEach(padronizar);
  }
  function iniciar() {
    percorrer(document.body);
    // Renderizações paginadas e módulos carregados depois do login.
    new MutationObserver(function (mudancas) {
      mudancas.forEach(function (mudanca) {
        mudanca.addedNodes.forEach(function (no) {
          if (no.nodeType === 1) {
            var botao = no.closest('button');
            if (botao) padronizar(botao);
            else percorrer(no);
          }
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
