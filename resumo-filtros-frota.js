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
})();/* Ver composição: somente leitura — lista os maiores valores que formam a faixa filtrada. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function moeda(v) { return Number(v || 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'}); }
  function lista(k) { try { return typeof arr === 'function' ? arr(k) || [] : []; } catch (e) { return []; } }
  function origemTexto(x) {
    if (x.projecaoImplemento || x.origem === 'implemento') return 'Depreciação de implemento';
    if (x.projecaoRecorrente) return x.origem === 'pessoal' ? 'Fixos e pessoal (folha)' : 'Fixos e pessoal';
    if (x.parcelaCalculada) return 'Parcela ' + (x.parcelaAtual || '') + '/' + (x.parcelas || '');
    if (x.origem === 'integrado') return 'Pré-lançamento' + (x.origemModulo ? ' (' + x.origemModulo + ')' : '');
    if (x.automatico) return 'Automático' + (x.origem ? ' (' + x.origem + ')' : '');
    return 'Lançamento';
  }
  function acao(x) {
    var id = String(x.id || ''), custos = lista('custos'), rec = lista('custosRecorrentes');
    var c = custos.find(function (y) { return y.id === id; }) || custos.find(function (y) { return y.id && id.indexOf(String(y.id)) >= 0; });
    if (c && !x.projecaoRecorrente) return 'editarCustoFrota(' + JSON.stringify(c.id).replace(/"/g, '&quot;') + ')';
    var r = rec.find(function (y) { return y.id && id.indexOf('rec-' + y.id + '-') === 0; });
    if (r) return 'editarCustoRecorrente(' + JSON.stringify(r.id).replace(/"/g, '&quot;') + ')';
    return '';
  }
  function itens() {
    var C = window.FMCustosAPI; if (!C) return [];
    var f = C.filtros(), base = C.todosBase ? C.todosBase() : undefined;
    return C.filtrados(undefined, f, base).filter(function (x) {
      return f.v || !x.veiculo || !(window.veiculoVendido && window.veiculoVendido(x.veiculo));
    }).slice().sort(function (a, b) { return Math.abs(Number(b.valor) || 0) - Math.abs(Number(a.valor) || 0); }).slice(0, 10);
  }
  function fechar() { var b = document.getElementById('fmComposicaoBackdrop'); if (b) b.remove(); }
  function abrir() {
    fechar();
    var l = itens();
    var linhas = l.map(function (x) {
      var a = acao(x), d = String(x.competencia || x.data || '').slice(0, 10);
      return '<tr><td>' + esc(d.split('-').reverse().join('/')) + '</td><td>' + esc(x.veiculo || 'Geral') + '</td><td>' + esc(x.categoria) + '</td><td>' + esc(x.descricao) + '</td><td>' + esc(origemTexto(x)) + '</td><td style="text-align:right;font-weight:700;white-space:nowrap">' + moeda(x.valor) + '</td><td>' + (a ? '<button type="button" class="btn btn-sm btn-outline-primary" onclick="document.getElementById(\'fmComposicaoBackdrop\').remove();' + a + '">Abrir</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="7" style="text-align:center;padding:16px">Nenhum valor no período.</td></tr>';
    var b = document.createElement('div');
    b.id = 'fmComposicaoBackdrop';
    b.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto';
    b.innerHTML = '<div role="dialog" aria-label="Composição do valor filtrado" style="background:#fff;border-radius:10px;max-width:1000px;width:100%;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.3)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px"><h5 style="margin:0">Os 10 maiores valores do período</h5><button type="button" class="btn btn-sm btn-secondary" data-fechar>Fechar</button></div>' +
      '<p style="font-size:.8rem;color:#475569;margin:0 0 10px">Somente consulta. Se algum valor estiver errado, clique em Abrir para corrigir o registro.</p>' +
      '<div style="overflow:auto"><table class="table table-sm" style="font-size:.8rem"><thead><tr><th>Data</th><th>Veículo</th><th>Categoria</th><th>Descrição</th><th>Origem</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
    b.addEventListener('click', function (ev) { if (ev.target === b || (ev.target.closest && ev.target.closest('[data-fechar]'))) fechar(); });
    document.body.appendChild(b);
  }
  function injetar() {
    var box = document.getElementById('cusFiltroResumo');
    if (!box || document.getElementById('fmVerComposicao')) return;
    var bt = document.createElement('button');
    bt.type = 'button'; bt.id = 'fmVerComposicao'; bt.className = 'btn btn-sm btn-outline-secondary';
    bt.style.cssText = 'margin-left:12px;font-size:.75rem'; bt.textContent = 'Ver composição';
    bt.addEventListener('click', abrir);
    var det = document.getElementById('cusFiltroResumoDetalhe');
    if (det && det.parentNode === box) box.insertBefore(bt, det.nextSibling); else box.appendChild(bt);
  }
  window.fmVerComposicaoCustos = abrir;
  var t = setInterval(function () { injetar(); if (document.getElementById('fmVerComposicao')) clearInterval(t); }, 500);
})();
