// Seletor de hora próprio para a Reserva: substitui o relógio do celular (que corta o botão "Definir")
// por uma janela com Hora/Minuto e botões OK e Cancelar sempre visíveis. O valor continua "HH:MM".
(function(){
  var css=document.createElement('style');
  css.textContent=
  '.hp-campo{cursor:pointer;caret-color:transparent}'+
  '.hp-fundo{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px}'+
  '.hp-caixa{background:#fff;color:#0f172a;border-radius:16px;width:100%;max-width:340px;box-shadow:0 10px 40px rgba(0,0,0,.35);overflow:hidden;font-family:inherit}'+
  '.hp-topo{background:#0d6efd;color:#fff;text-align:center;font-size:44px;font-weight:700;padding:14px 8px;letter-spacing:2px}'+
  '.hp-sel{display:flex;gap:12px;padding:18px 16px;align-items:flex-end}'+
  '.hp-sel label{flex:1;display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;text-transform:uppercase;color:#475569}'+
  '.hp-sel select{width:100%;font-size:24px;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;text-align:center}'+
  '.hp-bot{display:flex;gap:10px;padding:0 16px 16px}'+
  '.hp-bot button{flex:1;min-height:48px;border:0;border-radius:10px;font-size:17px;font-weight:700;touch-action:manipulation}'+
  '.hp-cancelar{background:#e2e8f0;color:#0f172a}.hp-ok{background:#0d6efd;color:#fff}.hp-limpar{background:transparent;color:#0d6efd;flex:0 0 auto!important;padding:0 8px}';
  document.head.appendChild(css);

  function dois(n){return (n<10?'0':'')+n;}
  function opcoes(max){var h='';for(var i=0;i<max;i++)h+='<option value="'+dois(i)+'">'+dois(i)+'</option>';return h;}

  function abrir(inp){
    if(document.querySelector('.hp-fundo'))return;
    var agora=new Date();
    var v=/^\d{2}:\d{2}$/.test(inp.value)?inp.value:dois(agora.getHours())+':'+dois(agora.getMinutes());
    var f=document.createElement('div');f.className='hp-fundo';
    f.innerHTML='<div class="hp-caixa" role="dialog" aria-label="Escolher horário"><div class="hp-topo"></div>'+
      '<div class="hp-sel"><label>Hora<select class="hp-h">'+opcoes(24)+'</select></label><label>Minuto<select class="hp-m">'+opcoes(60)+'</select></label></div>'+
      '<div class="hp-bot"><button type="button" class="hp-limpar">Limpar</button><button type="button" class="hp-cancelar">Cancelar</button><button type="button" class="hp-ok">OK</button></div></div>';
    document.body.appendChild(f);
    var sh=f.querySelector('.hp-h'),sm=f.querySelector('.hp-m'),topo=f.querySelector('.hp-topo');
    sh.value=v.slice(0,2);sm.value=v.slice(3,5);
    function mostra(){topo.textContent=sh.value+':'+sm.value;}
    sh.onchange=sm.onchange=mostra;mostra();
    function fechar(){f.remove();}
    function aplicar(val){inp.value=val;inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}));fechar();}
    f.querySelector('.hp-ok').onclick=function(){aplicar(sh.value+':'+sm.value);};
    f.querySelector('.hp-limpar').onclick=function(){aplicar('');};
    f.querySelector('.hp-cancelar').onclick=fechar;
    f.addEventListener('click',function(e){if(e.target===f)fechar();});
  }

  function prep(inp){
    if(inp.dataset.horaOk)return; inp.dataset.horaOk='1';
    var val=inp.value;
    inp.type='text';inp.readOnly=true;inp.setAttribute('inputmode','none');
    if(!inp.placeholder)inp.placeholder='--:--';
    inp.value=val;inp.classList.add('hp-campo');
    inp.addEventListener('click',function(e){e.preventDefault();abrir(inp);});
    inp.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();abrir(inp);}});
  }
  function scan(r){(r.querySelectorAll?r:document).querySelectorAll('input[type="time"]').forEach(prep);}
  function init(){scan(document);new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType!==1)return;if(n.matches&&n.matches('input[type="time"]'))prep(n);else scan(n);});});}).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
