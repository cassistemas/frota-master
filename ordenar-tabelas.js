/* Ordenação por clique no cabeçalho das tabelas (somente visual; não altera dados). */
(function () {
  'use strict';
  function chave(t) {
    t = String(t || '').trim();
    var m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (m) return { n: Number(m[3] + m[2] + m[1] + (m[4] || '00') + (m[5] || '00')) };
    m = t.match(/^(\d{2})\/(\d{4})$/);
    if (m) return { n: Number(m[2] + m[1]) };
    m = t.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (m) return { n: Number(m[1] + m[2] + (m[3] || '00')) };
    var s = t.replace(/R\$|\s|%|km|kg|t\b|x$/gi, '');
    if (/^-?[\d.]+(,\d+)?$/.test(s) && /\d/.test(s)) return { n: Number(s.replace(/\./g, '').replace(',', '.')) };
    if (/^-?\d+(\.\d+)?$/.test(s)) return { n: Number(s) };
    return { s: t.toLowerCase() };
  }
  function comparar(a, b) {
    if (a.n !== undefined && b.n !== undefined) return a.n - b.n;
    if (a.n !== undefined) return -1;
    if (b.n !== undefined) return 1;
    return a.s.localeCompare(b.s, 'pt-BR', { numeric: true });
  }
  document.addEventListener('click', function (ev) {
    var th = ev.target.closest && ev.target.closest('table thead th');
    if (!th || ev.target.closest('input,select,button,a')) return;
    var rotulo = th.textContent.trim().toLowerCase();
    if (!rotulo || rotulo === 'ações' || rotulo === 'acoes') return;
    var tabela = th.closest('table'), corpo = tabela.tBodies[0];
    if (!corpo) return;
    var col = Array.prototype.indexOf.call(th.parentNode.children, th);
    var linhas = Array.prototype.slice.call(corpo.rows).filter(function (r) { return r.cells.length > col && !r.querySelector('td[colspan]'); });
    if (linhas.length < 2) return;
    var asc = th.dataset.fmOrdem !== 'asc';
    th.parentNode.querySelectorAll('th').forEach(function (x) { delete x.dataset.fmOrdem; x.removeAttribute('aria-sort'); });
    th.dataset.fmOrdem = asc ? 'asc' : 'desc';
    th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
    linhas.sort(function (a, b) {
      var r = comparar(chave(a.cells[col].innerText), chave(b.cells[col].innerText));
      return asc ? r : -r;
    }).forEach(function (r) { corpo.appendChild(r); });
  });
  var css = document.createElement('style');
  css.textContent = 'table thead th{cursor:pointer;user-select:none}table thead th[data-fm-ordem="asc"]::after{content:" \\25B2";font-size:.7em}table thead th[data-fm-ordem="desc"]::after{content:" \\25BC";font-size:.7em}';
  document.head.appendChild(css);
})();
