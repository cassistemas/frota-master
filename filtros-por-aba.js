/* Gestão da Frota: filtros temporários, sem memória entre abas ou módulos.
   A navegação das abas usa a mesma rotina do botão Limpar. */
(function(){
  'use strict';
  try{sessionStorage.removeItem('fm_filtros_por_aba')}catch(e){}
  // Não reescreva o mesmo texto: observadores globais de organização reagem
  // ao DOM e atualizam classes das abas, que também são observadas aqui.
  function rotulo(){var a=document.querySelector('#custos .cus-tab.active'),r=document.querySelector('#custos .cus-filter');if(!a||!r)return;var el=document.getElementById('fmFiltroAbaRotulo');if(!el){el=document.createElement('div');el.id='fmFiltroAbaRotulo';el.style.cssText='font-size:12px;font-weight:600;opacity:.75;margin-bottom:6px';r.insertBefore(el,r.firstChild)}var texto='Filtros da aba: '+a.textContent.trim();if(el.textContent!==texto)el.textContent=texto}
  function iniciar(){
    var root=document.getElementById('custos');if(!root)return;
    var tabs=root.querySelector('.cus-tabs');
    if(tabs)new MutationObserver(rotulo).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class']});
    // Limpa somente na saída real. Entrar novamente não disputa com a consulta.
    // oldValue também detecta sair e voltar antes da entrega do observador.
    new MutationObserver(function(registros){
      var oculta=root.classList.contains('hidden');
      var saiu=registros.some(function(r,i){
        var antes=/(^|\s)hidden(\s|$)/.test(r.oldValue||'');
        var depois=i+1<registros.length?/(^|\s)hidden(\s|$)/.test(registros[i+1].oldValue||''):oculta;
        return !antes&&depois;
      });
      if(saiu&&typeof window.limparFiltrosCustos==='function')window.limparFiltrosCustos();
    }).observe(root,{attributes:true,attributeFilter:['class'],attributeOldValue:true});
    rotulo();
  }
  document.addEventListener('frota:filtros-limpos',rotulo);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
/* Cartão "Custo da frota": obedece aos filtros de categoria/tipo/origem/situação.
   Nas abas Relatório mensal e Resultado o cartão sempre mostra o total geral. */
(function(){
  'use strict';
  var GERAIS=['relatoriomensal','resultado'];
  function aba(){var a=document.querySelector('#custos .cus-tab.active');return a&&a.dataset.tab||''}
  function txt(id){var e=document.getElementById(id);return e?e.options?(e.options[e.selectedIndex]||{}).text||'':e.value:''}
  function brl(v){return 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
  function ajustar(){var C=window.FMCustosAPI;if(!C||!C.filtros||!C.filtrados)return;var f=C.filtros();var card=document.getElementById('cusIndicadorCustoFrota'),lab=document.getElementById('cusPeriodoLabel');if(!card)return;var titulo=card.parentNode&&card.parentNode.querySelector('span');
    if(GERAIS.indexOf(aba())>=0||!(f.cat||f.tipo||f.origem||f.status)){if(titulo)titulo.textContent='Custo da frota';return}
    var l=C.filtrados(undefined,f).filter(function(x){return f.v||!x.veiculo||!(window.veiculoVendido&&window.veiculoVendido(x.veiculo))});
    var total=l.reduce(function(s,x){return s+(Number(x.valor)||0)},0);
    var partes=[f.cat&&txt('cusFiltroCategoria'),f.tipo&&txt('cusFiltroTipo'),f.origem&&txt('cusFiltroOrigem'),f.status&&txt('cusFiltroStatus')].filter(Boolean);
    card.textContent=brl(total);if(titulo)titulo.textContent='Custo filtrado';if(lab)lab.textContent='Somente: '+partes.join(' · ')}
  var t=setInterval(function(){var R=window.FMResultadoAPI;if(!R||!R.atualizarIndicadores||R.__fpa)return;var orig=R.atualizarIndicadores;R.atualizarIndicadores=function(){var r=orig.apply(this,arguments);try{ajustar()}catch(e){}return r};R.__fpa=true;clearInterval(t)},300);
  document.addEventListener('click',function(ev){if(ev.target&&ev.target.closest&&ev.target.closest('#custos .cus-tab, #custos .cus-filter button'))setTimeout(function(){try{ajustar()}catch(e){}},150)});
  document.addEventListener('change',function(ev){if(ev.target&&ev.target.closest&&ev.target.closest('#custos .cus-filter'))setTimeout(function(){try{ajustar()}catch(e){}},150)});
  document.addEventListener('frota:filtros-limpos',function(){try{ajustar()}catch(e){}});
  document.addEventListener('frota:filtros-atualizados',function(){try{ajustar()}catch(e){}});
})();
/* A marcação dos períodos é controlada somente por periodo-marcado.js. */
