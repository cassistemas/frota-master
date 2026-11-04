/* Marca o período rápido atual, sem restaurar seleções de outras abas. */
(function(){
  'use strict';
  try{sessionStorage.removeItem('fm_periodo_rapido')}catch(e){}
  function botoes(){return document.querySelectorAll('#custos .cus-periods button')}
  function marcar(b){Array.prototype.forEach.call(botoes(),function(x){x.classList.toggle('fm-periodo-ativo',x===b);x.setAttribute('aria-pressed',x===b?'true':'false')})}
  function mesAtual(){var b=Array.prototype.find.call(botoes(),function(x){return /aplicarPeriodoCustos\('mes'\)/.test(x.getAttribute('onclick')||'')});marcar(b||null)}
  document.addEventListener('frota:filtros-limpos',mesAtual);
  document.addEventListener('click',function(ev){var b=ev.target&&ev.target.closest&&ev.target.closest('#custos .cus-periods button');if(b)marcar(b)});
  function dataManual(ev){if(ev.target&&(ev.target.id==='cusFiltroInicio'||ev.target.id==='cusFiltroFim')&&ev.isTrusted)marcar(null)}
  document.addEventListener('input',dataManual,true);
  document.addEventListener('change',dataManual,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mesAtual);else mesAtual();
  var st=document.createElement('style');st.textContent='#custos .cus-periods button.fm-periodo-ativo{background:#1d4ed8!important;color:#fff!important;border-color:#1d4ed8!important;box-shadow:0 0 0 2px rgba(29,78,216,.25)!important}';document.head.appendChild(st);
})();
