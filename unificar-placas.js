/* Unifica a escrita da placa nos lançamentos: TRI2G29, tri-2g29 e TRI-2G29 viram a placa do cadastro. */
(function(){'use strict';
var CAMPOS={manutencoes:['mveiculo'],revisoes:['rveiculo'],combustivel:['cveiculo'],multas:['muveiculo'],saidaVeiculos:['svveiculo'],seguros:['sveiculo'],licenciamento:['lveiculo'],tacografo:['tveiculo'],licencas:['leveiculo'],agendamentos:['agveiculo'],estoque:['eplaca'],pneus:['pveiculo'],detran:['dtPlaca'],custos:['veiculo'],custosRecorrentes:['veiculo'],quilometragens:['veiculo'],producoes:['veiculo'],metasVeiculos:['veiculo'],gestaoDepreciacoes:['veiculo'],implementos:['veiculo'],eventosPneus:['veiculo'],importacoesPedagio:['veiculo','placa']};
function N(v){return String(v==null?'':v).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function carregado(m){return typeof window.fmModuloCarregado!=='function'||window.fmModuloCarregado(m)}
function mapa(){var m={};(db.veiculos||[]).forEach(function(v){if(v&&v.vplaca)m[N(v.vplaca)]=String(v.vplaca).trim().toUpperCase()});(db.veiculos||[]).forEach(function(v){if(!v||!v.vplaca)return;(Array.isArray(v.historicoPlacas)?v.historicoPlacas:[]).forEach(function(h){var k=N(h&&(h.placa||h.placaAnterior||h));if(k&&!m[k])m[k]=String(v.vplaca).trim().toUpperCase()})});return m}
function ajustar(obj,campo,m){var val=obj&&obj[campo];if(!val||typeof val!=='string')return false;var c=m[N(val)];if(c&&c!==val){obj[campo]=c;return true}return false}
function executar(){if(typeof db==='undefined'||!Array.isArray(db.veiculos)||!db.veiculos.length||!carregado('veiculos'))return;var m=mapa(),alterados=[];
Object.keys(CAMPOS).forEach(function(mod){if(!Array.isArray(db[mod])||!carregado(mod))return;var mudou=false;db[mod].forEach(function(r){CAMPOS[mod].forEach(function(c){if(ajustar(r,c,m))mudou=true});if(r&&Array.isArray(r.vinculos))r.vinculos.forEach(function(v){if(ajustar(v,'veiculo',m))mudou=true})});if(mudou)alterados.push(mod)});
if(alterados.length&&typeof salvarNuvem==='function'){try{salvarNuvem(alterados)}catch(e){console.warn('Unificar placas',e)}if(typeof window.renderCustosFrota==='function')try{window.renderCustosFrota()}catch(e){}}}
function veic(p){var k=N(p);if(!k||typeof db==='undefined')return null;var m=mapa(),c=m[k];return c?(db.veiculos||[]).find(function(v){return N(v.vplaca)===N(c)}):null}
window.fmPlacaCadastro=function(p){var v=veic(p);return v?String(v.vplaca).trim().toUpperCase():String(p||'').trim().toUpperCase()};
window.fmTipoDaPlaca=function(p){var v=veic(p);return v?String(v.vtipo||'').trim():''};
function tipos(){if(typeof db==='undefined'||!carregado('veiculos'))return;var alt=[];
if(Array.isArray(db.producoes)&&carregado('producoes')){var m1=false;db.producoes.forEach(function(r){var t=window.fmTipoDaPlaca(r.veiculo);if(t&&r.tipoVeiculo!==t){r.tipoVeiculo=t;m1=true}});if(m1)alt.push('producoes')}
if(Array.isArray(db.fretes)&&carregado('fretes')){var m2=false;db.fretes.forEach(function(f){if(f.freexecucao==='terceiro'||!f.freveiculo)return;var c=window.fmPlacaCadastro(f.freveiculo),t=window.fmTipoDaPlaca(c);if(veic(c)&&c!==f.freveiculo){f.freveiculo=c;m2=true}if(t&&f.fretipoveiculo!==t){f.fretipoveiculo=t;m2=true}});if(m2)alt.push('fretes')}
if(alt.length&&typeof salvarNuvem==='function')try{salvarNuvem(alt)}catch(e){}}
document.addEventListener('change',function(e){var el=e.target;if(!el||['resProdVeiculo','freveiculo'].indexOf(el.id)<0||el.tagName!=='INPUT')return;var c=window.fmPlacaCadastro(el.value);if(veic(c)&&c!==el.value){el.value=c;el.dispatchEvent(new Event('input',{bubbles:true}))}},true);
window.fmUnificarPlacas=executar;setInterval(function(){try{tipos()}catch(e){console.warn('Tipos',e)}},5000);setInterval(function(){try{executar()}catch(e){console.warn('Unificar placas',e)}},5000);
})();
