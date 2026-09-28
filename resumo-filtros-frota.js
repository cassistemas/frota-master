/* Resumo visual: somente leitura dos filtros e dos resultados já calculados. */
(function () {
  'use strict';
  var timer;
  function texto(id, valor) { var el = document.getElementById(id); if (el) el.textContent = valor; }
  function rotulo(id) { var el = document.getElementById(id); return el && el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : ''; }
  function moeda(valor) { return Number(valor || 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'}); }
  function somar(lista) { return lista.reduce(function (total, x) { return total + Number(x.valor || 0); }, 0); }
  function atualizar() {
    var custos = window.FMCustosAPI, resultado = window.FMResultadoAPI;
    if (!custos || !document.getElementById('cusFiltroResumo')) return;
    var tab = document.querySelector('#custos .cus-tab.active');
    var aba = tab && tab.dataset.tab || 'lancamentos', f = custos.filtros(), valor = 0;
    var titulo = 'Custo filtrado', unidade = 'moeda';
    var base = custos.todosBase();
    var lista = custos.filtrados(undefined, f, base).filter(function (x) {
      return f.v || !x.veiculo || !(window.veiculoVendido && window.veiculoVendido(x.veiculo));
    });
    if (aba === 'quilometragem') {
      titulo = 'Quilometragem filtrada'; unidade = 'km';
      valor = custos.kmPeriodo(f.v, f.ini, f.fim);
    } else if (aba === 'recorrentes' || aba === 'pessoal') {
      titulo = 'Custo de fixos e pessoal no período';
      valor = somar(lista.filter(function (x) { return x.projecaoRecorrente || x.origem === 'recorrente' || x.origem === 'pessoal'; }));
    } else if (aba === 'implementos' || aba === 'depreciacao') {
      titulo = 'Depreciação filtrada';
      valor = aba === 'depreciacao' && resultado ? resultado.totalGeral(f, f.modo, base).depreciacao : somar(lista.filter(function (x) { return x.categoria === 'Depreciação'; }));
    } else if (aba === 'pneusresultado') {
      titulo = 'Custo de pneus filtrado';
      valor = resultado ? resultado.totalGeral(f, f.modo, base).pneus : somar(lista.filter(function (x) { return x.categoria === 'Pneus / Recapagem'; }));
    } else if (aba === 'producao') {
      titulo = 'Faturamento filtrado';
      valor = resultado ? resultado.totalGeral(f, f.modo, base).faturamento : 0;
    } else if (aba === 'resultado' || aba === 'caixa') {
      titulo = 'Resultado filtrado';
      var modoAtivo = document.querySelector('#cusPane-resultado [data-res-modo].active');
      valor = resultado ? resultado.totalGeral(f, aba === 'caixa' || modoAtivo && modoAtivo.dataset.resModo === 'caixa' ? 'caixa' : 'competencia', base).lucro : 0;
    } else if (aba === 'terceirizacao') {
      titulo = 'Comparação filtrada'; unidade = 'texto';
    } else {
      titulo = aba === 'relatoriomensal' ? 'Custo do relatório filtrado' : aba === 'analise' ? 'Custo da análise filtrada' : 'Custo dos lançamentos filtrados';
      valor = aba === 'relatoriomensal' && resultado ? resultado.totalGeral(f, 'competencia', base).custo : somar(lista);
    }
    var partes = [];
    if (f.v) partes.push(rotulo('cusFiltroVeiculo') || f.v);
    if (f.ini && f.fim) partes.push(f.ini.split('-').reverse().join('/') + ' a ' + f.fim.split('-').reverse().join('/'));
    if (aba !== 'quilometragem' && aba !== 'terceirizacao' && aba !== 'producao') {
      if (f.tipo) partes.push(rotulo('cusFiltroTipo'));
      if (f.cat) partes.push(rotulo('cusFiltroCategoria'));
      if (f.origem) partes.push(rotulo('cusFiltroOrigem'));
      if (f.status) partes.push(rotulo('cusFiltroStatus'));
    }
    texto('cusFiltroResumoTitulo', titulo);
    texto('cusFiltroResumoValor', unidade === 'km' ? Number(valor).toLocaleString('pt-BR') + ' km' : unidade === 'texto' ? 'Valores por rota na tabela' : moeda(valor));
    texto('cusFiltroResumoDetalhe', partes.join(' · ') || 'Todos os registros');
  }
  function agendar() { clearTimeout(timer); timer = setTimeout(function () { try { atualizar(); } catch (e) { console.warn('Resumo de filtros indisponível', e); } }, 120); }
  function iniciar() {
    var root = document.getElementById('custos'); if (!root) return;
    root.addEventListener('click', agendar);
    root.addEventListener('change', agendar);
    var abas = root.querySelector('.cus-tabs');
    if (abas) new MutationObserver(agendar).observe(abas, {subtree:true, attributes:true, attributeFilter:['class']});
    var paineis = root.querySelectorAll('.cus-pane');
    paineis.forEach(function (pane) { new MutationObserver(agendar).observe(pane, {childList:true, subtree:true, characterData:true}); });
    agendar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();