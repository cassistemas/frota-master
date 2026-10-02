/* Marca visualmente o botão de período rápido selecionado (somente visual). */
(function(){
  'use strict';
  var CH='fm_periodo_rapido';
  function botoes(){return document.querySelectorAll('#custos .cus-periods button');}
  function marcar(b){Array.prototype.forEach.call(botoes(),function(x){x.classList.toggle('fm-periodo-ativo',x===b);x.setAttribute('aria-pressed',x===b?'true':'false');});try{sessionStorage.setItem(CH,b?b.getAttribute('onclick')||'':'')}catch(e){}}
  document.addEventListener('click',function(ev){var b=ev.target&&ev.target.closest&&ev.target.closest('#custos .cus-periods button');if(b){marcar(b);return;}
    if(ev.target.closest&&ev.target.closest('#custos .cus-filter')&&/limpar/i.test(ev.target.textContent||''))marcar(null);});
  document.addEventListener('input',function(ev){if(ev.target&&(ev.target.id==='cusFiltroInicio'||ev.target.id==='cusFiltroFim')&&ev.isTrusted)marcar(null);},true);
  var t=setInterval(function(){var l=botoes();if(!l.length)return;clearInterval(t);var s='';try{s=sessionStorage.getItem(CH)||''}catch(e){}if(s)Array.prototype.forEach.call(l,function(x){if(x.getAttribute('onclick')===s)marcar(x);});},500);
  var st=document.createElement('style');st.textContent='#custos .cus-periods button.fm-periodo-ativo{background:#1d4ed8!important;color:#fff!important;border-color:#1d4ed8!important;box-shadow:0 0 0 2px rgba(29,78,216,.25)!important}';document.head.appendChild(st);
})();
