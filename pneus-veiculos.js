/* Opções de veículos em Pneus por KM; preserva eventos e valores financeiros. */
(function () {
  'use strict';
  var fontes = ['veiculos','eventosPneus','pneus','custos','custosRecorrentes','quilometragens','producoes','gestaoDepreciacoes'];
  function b() { return typeof db !== 'undefined' ? db : null; }
  function n(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function esc(v) { return String(v || '').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]}); }
  function campo(mod) { return mod === 'veiculos' ? 'vplaca' : mod === 'pneus' ? 'pveiculo' : 'veiculo'; }
  function registros(mod) { var base=b();return base && Array.isArray(base[mod]) ? base[mod] : []; }
  function ocultas() { var out={};fontes.forEach(function(mod){registros(mod).forEach(function(x){if(x.pneusKmOculto)out[n(x[campo(mod)])]=x[campo(mod)]})});return out; }
  function cadastro(p) { return registros('pneus').filter(function(x){return n(x.pstatus)==='EMUSO' && n(x.pveiculo) && (!p || n(x.pveiculo)===n(p))}); }
  function resumoCadastro(p,ciclos) {
    var ativos=(ciclos || []).filter(function(c){return c.ativo});
    function corresponde(c,x) {
      var ids=(c.eventos || []).map(function(ev){return ev.cadastroPneuId}).filter(Boolean);
      return ids.length && x.pid ? ids.indexOf(x.pid)>=0 : String(c.pneuId || '').trim().toUpperCase()===String(x.pnumero || '').trim().toUpperCase();
    }
    var emUso=cadastro(p),semIntegracao=emUso.filter(function(x){return !ativos.some(function(c){return corresponde(c,x) && (c.eventos || []).some(function(ev){return ev.tipo==='Instalação' || ev.tipo==='Recapagem'})})});
    return {emUso:emUso,semIntegracao:semIntegracao,total:ativos.length+emUso.filter(function(x){return !ativos.some(function(c){return corresponde(c,x)})}).length};
  }
  function lista(base) {
    var escondidas=ocultas(),unicas={};
    (base || []).concat(registros('veiculos').map(function(x){return x.vplaca}),registros('eventosPneus').map(function(x){return x.veiculo}),cadastro().map(function(x){return x.pveiculo})).forEach(function(p){
      if(!n(p) || escondidas[n(p)])return;
      var cad=registros('veiculos').find(function(x){return n(x.vplaca)===n(p)});
      if(cad && String(cad.vstatus || '').trim().toUpperCase()==='VENDIDO')return;
      var atual=cad ? cad.vplaca : p;
      unicas[n(atual)]=atual;
    });
    var filtro=document.getElementById('cusFiltroVeiculo');
    return Object.keys(unicas).map(function(k){return unicas[k]}).filter(function(p){return !filtro || !filtro.value || n(p)===n(filtro.value)}).sort();
  }
  function acoes(p) { return '<button class="btn-del" title="Excluir veículo desta lista sem apagar histórico" aria-label="Excluir veículo '+esc(p)+' da lista" data-pneu-excluir="'+esc(p)+'">✕</button>'; }
  async function gravar(mods,snapshot) {
    try {
      if(typeof salvarNuvem !== 'function')throw new Error('Sem salvamento');
      var ok=await salvarNuvem(mods);
      if(ok===false)throw new Error('Não salvo');
      if(typeof window.renderResultadoFrota==='function')window.renderResultadoFrota();
      return true;
    } catch(err) {
      var base=b();if(base)Object.keys(snapshot).forEach(function(m){base[m]=snapshot[m]});
      if(typeof window.renderResultadoFrota==='function')window.renderResultadoFrota();
      alert('Não foi possível salvar a alteração. Verifique sua conexão e tente novamente.');return false;
    }
  }
  function snapshot() { var base=b(),out={};if(base)Object.keys(base).forEach(function(k){if(Array.isArray(base[k]))out[k]=JSON.parse(JSON.stringify(base[k]))});return out; }
  function pronto(mods) { return mods.every(function(m){return typeof window.fmModuloCarregado!=='function' || window.fmModuloCarregado(m)}); }
  async function ocultar(p,valor) {
    if(!pronto(fontes.filter(function(m){var base=b();return base && Array.isArray(base[m])}))){alert('Aguarde o carregamento dos cadastros antes de continuar.');return;}
    if(valor && !confirm('Excluir '+p+' da lista de Pneus por KM? Os pneus, eventos, custos e o cadastro serão preservados.'))return;
    var antes=snapshot(),mods=[];
    fontes.forEach(function(mod){var mudou=false;registros(mod).forEach(function(x){if(n(x[campo(mod)])!==n(p))return;x.pneusKmOculto=valor;if(typeof window.fmPrepararRegistro==='function')window.fmPrepararRegistro(mod,x,x);mudou=true});if(mudou)mods.push(mod)});
    if(!mods.length)return;
    if(await gravar(mods,antes)){if(valor && typeof window.fecharVeiculoPneus==='function')window.fecharVeiculoPneus();}
  }
  function renderOcultos() {
    // A restauração fica no cadastro de Pneus, fora da aba financeira Pneus por KM.
    var tabela=document.getElementById('listaPneus'),painel=document.getElementById('pneusKmOcultos');
    if(!tabela)return;
    if(!painel){
      painel=document.createElement('details');painel.id='pneusKmOcultos';painel.className='glass-container mt-3';
      var ancora=tabela.closest('.table-responsive') || tabela.closest('table');
      if(!ancora || !ancora.parentNode)return;
      ancora.parentNode.insertBefore(painel,ancora);
    }
    var escondidas=ocultas(),placas=Object.keys(escondidas).map(function(k){
      var cad=registros('veiculos').find(function(x){return n(x.vplaca)===k});
      return {placa:cad?cad.vplaca:escondidas[k],vendido:!!cad && String(cad.vstatus || '').trim().toUpperCase()==='VENDIDO'};
    }).sort(function(x,y){return String(x.placa).localeCompare(String(y.placa),'pt-BR')});
    painel.innerHTML='<summary>Veículos ocultos em Pneus por KM ('+placas.length+')</summary><p class="mt-2">Restaurar apenas reexibe o veículo na Gestão da Frota, sem recriar pneus, eventos ou custos. Veículos vendidos continuam fora da lista.</p>'+(
      placas.length?placas.map(function(x){return '<div class="d-flex flex-wrap align-items-center gap-2 mb-2"><strong>'+esc(x.placa)+'</strong>'+(x.vendido?'<span>Veículo vendido</span>':'')+'<button type="button" class="btn btn-outline-primary btn-sm" data-pneu-restaurar="'+esc(x.placa)+'">Restaurar na lista</button></div>'}).join(''):'<p>Nenhum veículo oculto.</p>');
  }
  document.addEventListener('click',function(ev){
    var el=ev.target.closest && ev.target.closest('[data-pneu-excluir],[data-pneu-restaurar]');
    if(!el || el.disabled)return;
    var restaurar=el.hasAttribute('data-pneu-restaurar'),placa=restaurar?el.dataset.pneuRestaurar:el.dataset.pneuExcluir;
    el.disabled=true;
    Promise.resolve(ocultar(placa,!restaurar)).finally(function(){el.disabled=false;renderOcultos()});
  });
  var renderAnterior=window.renderModulo;
  window.renderModulo=function(mod){var r=typeof renderAnterior==='function'?renderAnterior.apply(this,arguments):undefined;if(mod==='pneus')renderOcultos();return r};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderOcultos);else renderOcultos();
  window.FMPneusVeiculos={lista:lista,acoes:acoes,resumoCadastro:resumoCadastro};
})();