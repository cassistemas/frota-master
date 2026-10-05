/* Gestão da Frota: cada aba guarda os seus próprios filtros.
   Não altera cálculos nem sincronizações: apenas troca os valores dos campos
   de filtro antes de a aba ser aberta. */
(function(){
  'use strict';
  var CHAVE='fm_filtros_por_aba', mapa={};
  try{mapa=JSON.parse(sessionStorage.getItem(CHAVE)||'{}')||{}}catch(e){mapa={}}
  function campos(){var r=document.getElementById('custos');return r?Array.prototype.slice.call(r.querySelectorAll('[data-cus-filter], #cusFiltroModo')):[]}
  function abaAtual(){var a=document.querySelector('#custos .cus-tab.active');return a&&a.dataset.tab||''}
  function guardar(aba){if(!aba)return;var v={};campos().forEach(function(c){if(c.id)v[c.id]=c.value});mapa[aba]=v;try{sessionStorage.setItem(CHAVE,JSON.stringify(mapa))}catch(e){}}
  function aplicar(aba,anterior){var salvo=Object.prototype.hasOwnProperty.call(mapa,aba),v=salvo?mapa[aba]:(mapa[anterior]||{}),ant=mapa[anterior]||{};campos().forEach(function(c){if(!c.id)return;var nv=v[c.id]!==undefined?v[c.id]:c.value;if(aba==='relatoriomensal'&&(c.id==='cusFiltroInicio'||c.id==='cusFiltroFim')&&!nv)nv=ant[c.id]||c.value;if(c.tagName==='SELECT'&&nv&&!Array.prototype.some.call(c.options,function(o){return o.value===nv}))nv='';c.value=nv});guardar(aba)}
  function rotulo(aba){var r=document.querySelector('#custos .cus-filter');if(!r)return;var el=document.getElementById('fmFiltroAbaRotulo');if(!el){el=document.createElement('div');el.id='fmFiltroAbaRotulo';el.style.cssText='font-size:12px;font-weight:600;opacity:.75;margin-bottom:6px';r.insertBefore(el,r.firstChild)}var b=document.querySelector('#custos .cus-tab[data-tab="'+aba+'"]');el.textContent='Filtros da aba: '+(b?b.textContent.trim():aba)}
  document.addEventListener('click',function(ev){var b=ev.target&&ev.target.closest&&ev.target.closest('#custos .cus-tab');if(!b)return;var nova=b.dataset.tab,velha=abaAtual();if(!nova||nova===velha)return;guardar(velha);aplicar(nova,velha);rotulo(nova)},true);
  document.addEventListener('input',function(ev){if(ev.target&&ev.target.closest&&ev.target.closest('#custos .cus-filter'))guardar(abaAtual())},true);
  document.addEventListener('change',function(ev){if(ev.target&&ev.target.closest&&ev.target.closest('#custos .cus-filter'))guardar(abaAtual())},true);
  document.addEventListener('click',function(ev){if(ev.target&&ev.target.closest&&ev.target.closest('#custos .cus-filter button'))setTimeout(function(){guardar(abaAtual())},0)});
  var t=setInterval(function(){var a=abaAtual();if(a){rotulo(a);clearInterval(t)}},500);
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
})();
/* Botões de período (Mês atual, Mês anterior, Últimos 3 meses, Ano atual): marca o escolhido, por aba. */
(function(){
  'use strict';
  var marcado={};
  var st=document.createElement('style');st.textContent='#custos .cus-periods button.fm-periodo-ativo{background:#2563eb!important;color:#fff!important;border-color:#2563eb!important;box-shadow:0 0 0 2px rgba(37,99,235,.25)}';document.head.appendChild(st);
  function aba(){var a=document.querySelector('#custos .cus-tab.active');return a&&a.dataset.tab||''}
  function pintar(){var k=marcado[aba()]||'';document.querySelectorAll('#custos .cus-periods button').forEach(function(b){var m=(b.getAttribute('onclick')||'').match(/aplicarPeriodoCustos\('([^']+)'\)/);b.classList.toggle('fm-periodo-ativo',!!m&&m[1]===k)})}
  document.addEventListener('click',function(ev){var t=ev.target&&ev.target.closest&&ev.target.closest('#custos button');if(!t)return;var m=(t.getAttribute('onclick')||'').match(/aplicarPeriodoCustos\('([^']+)'\)/);
    if(m){marcado[aba()]=m[1];setTimeout(pintar,0);return}
    if(t.closest('.cus-tab')){setTimeout(pintar,50);return}
    if(t.closest('.cus-filter')&&/limpar/i.test(t.textContent||'')){delete marcado[aba()];setTimeout(pintar,0)}});
  document.addEventListener('change',function(ev){if(ev.isTrusted&&ev.target&&(ev.target.id==='cusFiltroInicio'||ev.target.id==='cusFiltroFim')){delete marcado[aba()];pintar()}});
})();
