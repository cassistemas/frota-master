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
  function lista(base) {
    var escondidas=ocultas(),unicas={};
    (base || []).concat(registros('eventosPneus').map(function(x){return x.veiculo})).forEach(function(p){
      if(!p || escondidas[n(p)])return;
      var cad=registros('veiculos').find(function(x){return n(x.vplaca)===n(p)});
      if(cad && String(cad.vstatus).toUpperCase()==='VENDIDO')return;
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
  document.addEventListener('click',function(ev){var el=ev.target.closest && ev.target.closest('[data-pneu-excluir]');if(el)ocultar(el.dataset.pneuExcluir,true)});
  window.FMPneusVeiculos={lista:lista,acoes:acoes};
})();