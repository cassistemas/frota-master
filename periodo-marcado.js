/* Marca somente o período rápido efetivamente aplicado à consulta. */
(function(){
  'use strict';
  try{sessionStorage.removeItem('fm_periodo_rapido')}catch(e){}
  var intervalo='';
  function botoes(){return document.querySelectorAll('#custos .cus-periods button')}
  function datas(){var i=document.getElementById('cusFiltroInicio'),f=document.getElementById('cusFiltroFim');return (i?i.value:'')+'|'+(f?f.value:'')}
  function marcar(b){
    intervalo=b?datas():'';
    Array.prototype.forEach.call(botoes(),function(x){
      var ativo=x===b;
      if(x.classList.contains('fm-periodo-ativo')!==ativo)x.classList.toggle('fm-periodo-ativo',ativo);
      if(x.getAttribute('aria-pressed')!==(ativo?'true':'false'))x.setAttribute('aria-pressed',ativo?'true':'false');
    });
  }
  function porTipo(tipo){var b=Array.prototype.find.call(botoes(),function(x){return (x.getAttribute('onclick')||'').indexOf("aplicarPeriodoCustos('"+tipo+"')")>=0});marcar(b||null)}
  function mesAtual(){
    var d=new Date(),mes=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    var fim=String(new Date(d.getFullYear(),d.getMonth()+1,0).getDate());
    if(datas()===mes+'-01|'+mes+'-'+fim)porTipo('mes');else marcar(null);
  }
  function conferir(){if(intervalo&&intervalo!==datas())marcar(null)}
  document.addEventListener('frota:filtros-limpos',mesAtual);
  document.addEventListener('frota:periodo-aplicado',function(ev){porTipo(ev.detail.tipo)});
  document.addEventListener('frota:filtros-atualizados',conferir);
  function dataManual(ev){if(ev.target&&(ev.target.id==='cusFiltroInicio'||ev.target.id==='cusFiltroFim'))conferir()}
  document.addEventListener('input',dataManual,true);
  document.addEventListener('change',dataManual,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mesAtual);else mesAtual();
  var st=document.createElement('style');st.textContent='#custos .cus-periods button.fm-periodo-ativo{background:#1d4ed8!important;color:#fff!important;border-color:#1d4ed8!important;box-shadow:0 0 0 2px rgba(29,78,216,.25)!important}';document.head.appendChild(st);
})();
