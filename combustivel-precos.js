/* Indicadores somente de leitura: não altera lançamentos nem médias de consumo. */
(function (root) {
  'use strict';
  function numero(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
    var texto = String(valor == null ? '' : valor).replace(/R\$|\s/g, '');
    if (!texto) return NaN;
    if (texto.indexOf(',') >= 0) texto = texto.replace(/\./g, '').replace(',', '.');
    var n = Number(texto);
    return Number.isFinite(n) ? n : NaN;
  }
  function produto(valor) {
    var nome = String(valor || '').trim().replace(/\s+/g, ' ');
    var chave = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    var nomes = { gasolina: 'Gasolina', diesels500: 'Diesel S500', diesels10: 'Diesel S10', arla: 'ARLA 32', arla32: 'ARLA 32' };
    return { chave: chave || 'sem-tipo', nome: nomes[chave] || nome || 'Tipo não informado' };
  }
  function calcular(registros) {
    var grupos = new Map();
    (registros || []).forEach(function (r) {
      if (!r) return;
      var p = produto(r.ctipo);
      // ARLA escrito com ou sem espaço/32 é o mesmo aditivo, separado dos combustíveis.
      if (p.chave === 'arla') p.chave = 'arla32';
      if (!grupos.has(p.chave)) grupos.set(p.chave, {
        tipo: p.nome, litros: 0, totalCentavos: 0, quantidade: 0, ignorados: 0,
        menor: null, maior: null
      });
      var g = grupos.get(p.chave), litros = numero(r.clitros), preco = numero(r.cvalorlitro);
      var total = numero(r.ctotal);
      var temTotal = r.ctotal != null && String(r.ctotal).trim() !== '';
      // Valores incompletos/estornos não viram preços zero nem distorcem a média.
      if (!(litros > 0) || !(preco > 0) || (temTotal && !(total > 0))) { g.ignorados++; return; }
      var centavos = Math.round((temTotal ? total : litros * preco) * 100);
      if (!Number.isSafeInteger(centavos) || centavos <= 0) { g.ignorados++; return; }
      var posto = String(r.cposto || '').trim() || 'Posto não informado';
      g.litros += litros;
      g.totalCentavos += centavos;
      g.quantidade++;
      if (!g.menor || preco < g.menor.preco) g.menor = { preco: preco, postos: [posto] };
      else if (preco === g.menor.preco && g.menor.postos.indexOf(posto) < 0) g.menor.postos.push(posto);
      if (!g.maior || preco > g.maior.preco) g.maior = { preco: preco, postos: [posto] };
      else if (preco === g.maior.preco && g.maior.postos.indexOf(posto) < 0) g.maior.postos.push(posto);
    });
    var ordem = ['Gasolina', 'Diesel S500', 'Diesel S10', 'ARLA 32'];
    return Array.from(grupos.values()).map(function (g) {
      g.media = g.litros > 0 ? g.totalCentavos / 100 / g.litros : null;
      return g;
    }).sort(function (a, b) {
      var ai = ordem.indexOf(a.tipo), bi = ordem.indexOf(b.tipo);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.tipo.localeCompare(b.tipo, 'pt-BR');
    });
  }
  function escapar(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function moeda(n) {
    return n == null ? '—' : n.toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4
    }) + '/L';
  }
  function extremo(titulo, valor, classe) {
    return '<div class="comb-preco-item ' + classe + '"><dt>' + titulo + '</dt><dd><strong>' +
      moeda(valor && valor.preco) + '</strong><span>' +
      (valor ? escapar(valor.postos.join(' · ')) : 'Sem preço válido') + '</span></dd></div>';
  }
  var ultimaVista = '';
  function atualizar() {
    var alvo = document.getElementById('combPrecosConteudo');
    if (!alvo || typeof root.obterCombustiveisFiltrados !== 'function') return;
    var grupos = calcular(root.obterCombustiveisFiltrados());
    var html = grupos.map(function (g) {
      var detalhe = g.quantidade + ' abastecimento(s) válido(s) · ' +
        g.litros.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' L';
      if (g.ignorados) detalhe += ' · ' + g.ignorados + ' registro(s) sem valores positivos válidos, desconsiderado(s)';
      return '<article class="comb-preco-card"><h5>' + escapar(g.tipo) + '</h5>' +
        '<dl><div class="comb-preco-item comb-preco-media"><dt>Preço médio por litro</dt><dd><strong>' +
        moeda(g.media) + '</strong><span>Total gasto ÷ litros</span></dd></div>' +
        extremo('Maior preço por litro', g.maior, 'comb-preco-maior') +
        extremo('Menor preço por litro', g.menor, 'comb-preco-menor') +
        '</dl><p class="comb-preco-detalhe">' + escapar(detalhe) + '</p></article>';
    }).join('') || '<p class="comb-precos-vazio">Nenhum abastecimento no filtro atual.</p>';
    // Evita reanúncios e recriação do DOM quando apenas muda a página da lista.
    if (html !== ultimaVista || !alvo.firstElementChild) { alvo.innerHTML = html; ultimaVista = html; }
  }
  root.FMCombustivelPrecos = { calcular: calcular, atualizar: atualizar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', atualizar);
  else atualizar();
})(window);
