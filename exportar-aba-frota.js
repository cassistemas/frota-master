/* Saídas da aba ativa: leitura das tabelas já filtradas pelos módulos da Frota. */
(function () {
  'use strict';

  function texto(el) { return String(el && el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function escapar(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function nomeAba() {
    var tab = document.querySelector('#custos .cus-tab.active');
    return tab ? { id: tab.dataset.tab, titulo: texto(tab) } : null;
  }
  function controle(pager) {
    if (!pager) return null;
    var b = Array.prototype.find.call(pager.querySelectorAll('button[onclick]'), function (x) {
      return /mudarPagina(Gestao|Resultado)\('[^']+',1\)/.test(x.getAttribute('onclick') || '');
    });
    var m = b && (b.getAttribute('onclick') || '').match(/mudarPagina(Gestao|Resultado)\('([^']+)',1\)/);
    if (!m) return null;
    var fn = m[1] === 'Gestao' ? window.mudarPaginaGestao : window.mudarPaginaResultado;
    var info = texto(pager.querySelector('.pagina-info')).match(/Página\s+(\d+)\s+de\s+(\d+)/i);
    return typeof fn === 'function' && info ? { fn: fn, chave: m[2], atual: Number(info[1]), total: Number(info[2]) } : null;
  }
  function lerTabela(tabela) {
    var th = Array.prototype.slice.call(tabela.querySelectorAll('thead tr:last-child th'));
    if (!th.length) return null;
    var indices = th.map(function (x, i) { return /^(ações|ação|opções)$/i.test(texto(x)) || !!x.querySelector('input') ? -1 : i; }).filter(function (i) { return i >= 0; });
    var linhas = Array.prototype.slice.call(tabela.querySelectorAll('tbody tr')).filter(function (tr) {
      return tr.cells.length > 1 && tr.getAttribute('data-pro-vazio') !== '1';
    }).map(function (tr) { return indices.map(function (i) {
      var cell = tr.cells[i];
      if (!cell) return '';
      var campos = cell.querySelectorAll('input:not([type="checkbox"]), select');
      if (!campos.length) return texto(cell);
      return Array.prototype.map.call(campos, function (campo) {
        return campo.tagName === 'SELECT' ? texto(campo.selectedOptions[0]) : campo.value;
      }).filter(Boolean).join(' · ') || texto(cell);
    }); });
    return { cabecalho: indices.map(function (i) { return texto(th[i]); }), linhas: linhas };
  }
  function tabelaAtual(g) {
    return g.dinamica ? document.querySelector('#' + g.listaId + ' table') : g.tabela;
  }
  function coletar() {
    var aba = nomeAba(), pane = aba && document.getElementById('cusPane-' + aba.id);
    if (!pane) return null;
    var tabelas = Array.prototype.slice.call(pane.querySelectorAll('table')).filter(function (t) {
      return !t.closest('.hidden') && !t.hasAttribute('data-sem-relatorio') && t.querySelector('thead') && t.querySelector('tbody');
    });
    var grupos = tabelas.map(function (t, i) {
      var secao = t.closest('.cus-panel') || t.parentElement;
      var titulo = secao && secao.querySelector('h4,h5,h3') || pane.querySelector('h4,h5,h3');
      return { tabela: t, dinamica: !!t.closest('#cusRecLista, #cusFolhaLista'), listaId: t.closest('#cusFolhaLista') ? 'cusFolhaLista' : 'cusRecLista', titulo: texto(titulo) || aba.titulo + ' ' + (i + 1), cabecalho: [], linhas: [] };
    });
    // A paginação é lida da própria lista e devolvida à página original após a coleta.
    grupos.forEach(function (g) {
      var wrap = g.tabela.closest('.cus-table-wrap, .table-responsive');
      var pager = g.dinamica ? document.getElementById(g.listaId === 'cusFolhaLista' ? 'cusFolhaPaginacao' : 'cusRecPaginacao') : (wrap && wrap.nextElementSibling);
      if ((!pager || !pager.querySelector('.pagina-info')) && wrap) {
        var panel = wrap.closest('.cus-panel');
        pager = panel && panel.querySelector('.paginacao-global')?.parentElement;
      }
      var ctl = controle(pager);
      if (ctl && ctl.total > 1) {
        try {
          for (var p = 1; p <= ctl.total; p++) {
            ctl.fn(ctl.chave, p);
            var atual = tabelaAtual(g), parte = atual && lerTabela(atual);
            if (parte) { g.cabecalho = parte.cabecalho; g.linhas = g.linhas.concat(parte.linhas); }
          }
        } finally { ctl.fn(ctl.chave, ctl.atual); }
      } else {
        var atual = tabelaAtual(g), dados = atual && lerTabela(atual);
        if (dados) { g.cabecalho = dados.cabecalho; g.linhas = dados.linhas; }
      }
    });
    var resumo = document.getElementById('cusFiltroResumo');
    return { aba: aba, grupos: grupos.filter(function (g) { return g.linhas.length; }),
      valor: texto(document.getElementById('cusFiltroResumoValor')),
      valorTitulo: texto(document.getElementById('cusFiltroResumoTitulo')),
      filtros: texto(document.getElementById('cusFiltroResumoDetalhe')),
      periodo: resumo ? texto(document.getElementById('cusPeriodoLabel')) : '' };
  }
  function arquivo(d) { return 'FrotaMaster_' + d.aba.id + '_' + new Date().toISOString().slice(0, 10); }
  function exportar() {
    if (!window.XLSX) { alert('Biblioteca de Excel não carregada.'); return; }
    var d = coletar(); if (!d) return;
    var wb = XLSX.utils.book_new(), usados = {};
    d.grupos.forEach(function (g, i) {
      var nome = g.titulo.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 25) || 'Dados';
      usados[nome] = (usados[nome] || 0) + 1;
      nome = nome.slice(0, 25) + (usados[nome] > 1 ? ' ' + usados[nome] : '');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Gestão da Frota — ' + d.aba.titulo], [d.filtros], [d.valorTitulo, d.valor], [], g.cabecalho
      ].concat(g.linhas)), nome.slice(0, 31));
    });
    if (!d.grupos.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Gestão da Frota — ' + d.aba.titulo], [d.filtros], [d.valorTitulo, d.valor], ['Nenhum registro com os filtros selecionados.']
      ]), 'Resumo');
    }
    XLSX.writeFile(wb, arquivo(d) + '.xlsx');
  }
  function imprimir() {
    var d = coletar(); if (!d) return;
    var w = window.open('', '_blank');
    if (!w) { alert('Permita janelas pop-up para imprimir.'); return; }
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + escapar('Gestão da Frota — ' + d.aba.titulo) + '</title><style>body{font:12px Arial,sans-serif;color:#17212f;margin:24px}h1{font-size:20px}h2{font-size:15px;margin-top:25px}p{margin:5px 0 12px}table{width:100%;border-collapse:collapse;margin:10px 0 22px}th,td{border:1px solid #9aa5b1;padding:5px;text-align:left;vertical-align:top}th{background:#e8edf2}tr{break-inside:avoid}@page{size:landscape;margin:12mm}</style></head><body><h1>Gestão da Frota — ' + escapar(d.aba.titulo) + '</h1><p>' + escapar(d.filtros) + '</p><p><b>' + escapar(d.valorTitulo) + ':</b> ' + escapar(d.valor) + '</p>';
    d.grupos.forEach(function (g) {
      html += '<h2>' + escapar(g.titulo) + '</h2><table><thead><tr>' + g.cabecalho.map(function (x) { return '<th>' + escapar(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + g.linhas.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + escapar(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    });
    if (!d.grupos.length) html += '<p>Nenhum registro com os filtros selecionados.</p>';
    w.document.write(html + '</body></html>'); w.document.close(); w.focus();
    setTimeout(function () { w.print(); }, 350);
  }
  window.imprimirAbaFrota = imprimir;
  window.exportarAbaFrota = exportar;
  function iniciar() {
    var root = document.getElementById('custos'); if (!root) return;
    var botao = root.querySelector('.cus-actions .btn-success');
    if (botao) { botao.textContent = 'Exportar gestão'; botao.setAttribute('onclick', 'exportarAbaFrota()'); }
    var relatorio = root.querySelector('#cusPane-relatoriomensal .rel-report-head button');
    if (relatorio) relatorio.setAttribute('onclick', 'exportarAbaFrota()');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();