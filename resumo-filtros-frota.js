/* Resumo visual: somente leitura dos filtros e dos resultados já calculados. */
(function () {
  'use strict';
  var timer;
  function texto(id, valor) { var el = document.getElementById(id); if (el) el.textContent = valor; }
  function rotulo(id) { var el = document.getElementById(id); return el && el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : ''; }
  function moeda(valor) { return Number(valor || 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'}); }
  function somar(lista) { return lista.reduce(function (total, x) { return total + Number(x.valor || 0); }, 0); }

  var DICAS = {
    'cusIndicadorCustoKm': ['Custo por KM', 'Custo total da frota ÷ quilômetros rodados no período.'],
    'cusIndicadorFaturamentoMedio': ['Faturamento médio', 'Faturamento do período ÷ número de meses do filtro.'],
    'cusIndicadorCustoFrota': ['Custo total da frota', 'Soma dos lançamentos, trocando a depreciação e os pneus lançados à mão pelos valores calculados nas abas Depreciação e Pneus.'],
    'cusIndicadorMargem': ['Margem', '(Receita líquida − custo da frota) ÷ receita líquida.']
  };
  function periodoTexto(f) {
    if (!f.ini || !f.fim) return 'Todo o período';
    var a = f.ini.slice(0, 7).split('-').reverse().join('/'), b = f.fim.slice(0, 7).split('-').reverse().join('/');
    return a === b ? 'Competência ' + a : a + ' a ' + b;
  }
  function clarezaCartoes(f) {
    Object.keys(DICAS).forEach(function (id) {
      var el = document.getElementById(id), card = el && el.parentElement; if (!card) return;
      var span = card.querySelector('span');
      if (span && !span.dataset.fmClaro) { span.dataset.fmClaro = '1'; span.textContent = DICAS[id][0] + ' '; var q = document.createElement('b'); q.textContent = '?'; q.className = 'fm-dica'; q.title = DICAS[id][1]; q.style.cssText = 'display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;border:1px solid currentColor;font-size:11px;cursor:help;opacity:.7'; span.appendChild(q); }
      card.title = DICAS[id][1];
      var per = card.querySelector('.fm-periodo-card');
      if (!per) { per = document.createElement('small'); per.className = 'fm-periodo-card'; per.style.cssText = 'display:block;opacity:.7'; card.appendChild(per); }
      per.textContent = 'Período: ' + periodoTexto(f);
    });
  }
  function diferenca(aba, f, lista, base, resultado) {
    var box = document.getElementById('fmDiferencaCustos'), ref = document.getElementById('cusFiltroResumo');
    if (!ref) return;
    if (!box) { box = document.createElement('div'); box.id = 'fmDiferencaCustos'; box.style.cssText = 'margin:8px 0;padding:10px 12px;border:1px dashed rgba(127,127,127,.5);border-radius:8px;font-size:13px'; ref.parentNode.insertBefore(box, ref.nextSibling); }
    if (aba !== 'lancamentos' || !resultado) { box.style.display = 'none'; return; }
    var tot = resultado.totalGeral(f, 'competencia', base), soma = somar(lista);
    var depMan = somar(lista.filter(function (x) { return x.categoria === 'Depreciação'; }));
    var pnMan = somar(lista.filter(function (x) { return x.categoria === 'Pneus / Recapagem'; }));
    var dep = Number(tot.depreciacao || 0) - depMan, pn = Number(tot.pneus || 0) - pnMan;
    var outros = Number(tot.custo || 0) - soma - dep - pn;
    function linha(t, v, forte) { return '<div style="display:flex;justify-content:space-between;gap:12px' + (forte ? ';font-weight:700;border-top:1px solid rgba(127,127,127,.4);padding-top:4px;margin-top:4px' : '') + '"><span>' + t + '</span><span>' + (v > 0 && !forte && t.charAt(0) !== 'S' ? '+ ' : '') + moeda(v) + '</span></div>'; }
    box.style.display = '';
    box.innerHTML = '<div style="font-weight:700;margin-bottom:4px">De onde vem a diferença (' + periodoTexto(f) + ')</div>' +
      linha('Soma dos lançamentos (lista)', soma) +
      linha('Depreciação: troca do lançado à mão (' + moeda(depMan) + ') pela calculada (' + moeda(tot.depreciacao || 0) + ')', dep) +
      linha('Pneus: troca do lançado à mão (' + moeda(pnMan) + ') pelo calculado por km (' + moeda(tot.pneus || 0) + ')', pn) +
      (Math.abs(outros) >= 0.01 ? linha('Outros ajustes (rateios e custos sem veículo)', outros) : '') +
      linha('Custo total da frota', Number(tot.custo || 0), true);
  }
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
    } else if (aba === 'folha') {
      titulo = 'Custo da folha no período';
      valor = somar(lista.filter(function (x) { return x.origem === 'pessoal'; }));
    } else if (aba === 'recorrentes' || aba === 'pessoal') {
      titulo = 'Custo de fixos e pessoal no período';
      valor = somar(lista.filter(function (x) { return x.origem !== 'pessoal' && (x.projecaoRecorrente || x.origem === 'recorrente'); }));
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
      titulo = aba === 'relatoriomensal' ? 'Custo do relatório filtrado' : aba === 'analise' ? 'Custo da análise filtrada' : 'Soma dos lançamentos (lista)';
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
    try { clarezaCartoes(f); diferenca(aba, f, lista, base, resultado); } catch (erro) { console.warn('Clareza indisponível', erro); }
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