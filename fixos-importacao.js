/* Local preview; the existing recurring form is the only writer. */
(function(){
'use strict';
var D=window.FMFixosDados,itens=[],fontes={},arquivo='',total=NaN,busy=false;
function el(id){return document.getElementById(id)}
function txt(v){return String(v==null?'':v).trim()}
function esc(v){return txt(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function plate(v){return txt(v).toUpperCase().replace(/[^A-Z0-9]/g,'')}
function money(c){return Number.isSafeInteger(c)?(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}
function database(){return typeof db!=='undefined'?db:{}}
function vehicle(p){return (database().veiculos||[]).find(function(v){return plate(v.vplaca)===plate(p)&&D.norm(v.vstatus)!=='VENDIDO'})}
function desc(x){return (txt(el('fixosDescricaoBase').value)+' '+txt(x.descricao)).trim()}
function status(x){
 if(!D.date(x.data))return 'Informe uma data válida';
 if(!Number.isSafeInteger(x.cents)||x.cents<=0)return 'Confira o valor';
 if(!el('fixosCategoria').value)return 'Selecione a categoria';
 if(x.placa&&!vehicle(x.placa))return 'Veículo não disponível';
 if(!x.placa&&!el('fixosGeral').checked)return 'Selecione o veículo ou Frota geral';
 if((database().custosRecorrentes||[]).some(function(r){return r.ativo!==false&&r.categoria===el('fixosCategoria').value&&plate(r.veiculo)===plate(x.placa)&&r.inicio===x.data&&r.fim===D.monthEnd(x.data)&&Math.round(Number(r.valor)*100)===x.cents&&r.descricao===desc(x)}))return 'Já consta nos custos';
 return '';
}
function render(){
 el('fixosPrevia').hidden=!itens.length;
 var sum=itens.reduce(function(s,x){return s+(Number.isSafeInteger(x.cents)?x.cents:0)},0);
 el('fixosResumo').textContent=arquivo+' · '+itens.length+' item(ns) · '+money(sum)+(Number.isFinite(total)?' · Total do documento: '+money(total)+(sum===total?' · Totais conferem':Math.abs(sum-total)<=100?' · Diferença de '+money(Math.abs(sum-total))+' por arredondamento do banco; cada prestação usa o valor impresso':' · Atenção: os totais diferem'):'');
 el('fixosLinhas').innerHTML=itens.map(function(x,i){var s=status(x);return '<tr><td>'+(i+1)+'</td>'+['data','cents','placa','descricao'].map(function(k){var label={data:'Data',cents:'Valor',placa:'Veículo',descricao:'Descrição'}[k]+' do item '+(i+1),value=k==='cents'?(Number.isSafeInteger(x.cents)?(x.cents/100).toFixed(2).replace('.',','):''):x[k],attrs=' class="form-control" aria-label="'+label+'" data-field="'+k+'" data-i="'+i+'"';return '<td>'+(k==='descricao'?'<textarea'+attrs+'>'+esc(value)+'</textarea>':'<input'+attrs+(k==='data'?' type="date"':k==='placa'?' list="cusVeiculosLista"':'')+' value="'+esc(value)+'">')+'</td>'}).join('')+'<td><small data-status="'+i+'">'+esc(s||'Pronto para preencher')+'</small><div class="fixos-actions"><button type="button" class="btn-edit" data-fill="'+i+'" '+(s?'disabled':'')+'>Preencher</button><button type="button" class="btn-del" data-remove="'+i+'">Excluir</button></div></td></tr>'}).join('');
}
function fill(i){
 var x=itens[i];if(!x)return;var s=status(x);if(s){alert(s);return}
 if(el('cusRecIdx').value||txt(el('cusRecValor').value)||txt(el('cusRecTotal').value)||txt(el('cusRecDescricao').value))if(!confirm('Substituir os dados ainda abertos no formulário de custo?'))return;
 if(typeof window.cancelarCustoRecorrente!=='function')return;
 window.cancelarCustoRecorrente();var v=vehicle(x.placa),map={Idx:'',Categoria:el('fixosCategoria').value,Periodicidade:'mensal',Modo:'mensal',Total:'',Meses:'',Valor:money(x.cents),Veiculo:v?v.vplaca:'',Motorista:v?v.vmotorista||'':'',Descricao:desc(x),Inicio:x.data,Fim:D.monthEnd(x.data),Rateio:'nao'};
 Object.keys(map).forEach(function(k){var e=el('cusRec'+k);if(e)e.value=map[k]});window.custoCategoriaChange('cusRec');window.atualizarValorCustoRecorrente();el('cusRecDescricao').scrollIntoView({behavior:'smooth',block:'center'});
}
function script(src,ready){if(ready())return Promise.resolve();return new Promise(function(ok,fail){var s=document.createElement('script');s.src=src;s.onload=function(){ready()?ok():fail(new Error('Leitor indisponível.'))};s.onerror=function(){s.remove();fail(new Error('Não foi possível carregar o leitor local.'))};document.head.appendChild(s)})}
var PDFCDN='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
async function pdfLib(){
 if(!window.pdfjsLib){try{await script('vendor/pdf.min.js',function(){return !!window.pdfjsLib});if(!window.pdfjsLib.GlobalWorkerOptions.workerSrc)window.pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js'}catch(e){try{await script(PDFCDN+'pdf.min.js',function(){return !!window.pdfjsLib});window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFCDN+'pdf.worker.min.js'}catch(e2){throw new Error('Leitor de PDF não encontrado (pasta vendor ausente e sem internet).')}}}
 else if(!window.pdfjsLib.GlobalWorkerOptions.workerSrc)window.pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';
 return window.pdfjsLib;
}
async function openPDF(buffer){
 var lib=await pdfLib(),copy=buffer.slice(0);
 try{return await lib.getDocument({data:new Uint8Array(buffer)}).promise}
 catch(e){try{return await lib.getDocument({data:new Uint8Array(copy),disableWorker:true,isEvalSupported:false}).promise}catch(e2){var m=(e2&&e2.message)||(e&&e.message);throw new Error(m?'PDF não pôde ser aberto ('+m+').':'PDF não pôde ser aberto. Verifique se o arquivo não está protegido por senha ou corrompido.')}}
}
function errMsg(e){return (e&&e.message)||(typeof e==='string'&&e)||'erro desconhecido'}
async function readPDF(buffer){
 var pdf=await openPDF(buffer),lines=[],rows=[],worker,vazias=[];
 try{
  /* 1ª passada: texto digital de todas as páginas. Páginas só com imagem (logotipo, rodapé) não interrompem a leitura. */
  for(var n=1;n<=pdf.numPages;n++){
   el('fixosAviso').textContent='Lendo página '+n+' de '+pdf.numPages+'…';var page=await pdf.getPage(n),content=await page.getTextContent(),grouped=[];
   content.items.filter(function(x){return txt(x.str)}).forEach(function(x){var y=x.transform[5],l=grouped.find(function(g){return Math.abs(g.y-y)<3});if(!l){l={y:y,items:[]};grouped.push(l)}l.items.push(x)});
   if(grouped.length){grouped.sort(function(a,b){return b.y-a.y}).forEach(function(g){var parts=g.items.sort(function(a,b){return a.transform[4]-b.transform[4]});lines.push(parts.map(function(x){return txt(x.str)}).join(' '));var cells=[],last=null;parts.forEach(function(p){if(last&&p.transform[4]-(last.transform[4]+last.width)<18)cells[cells.length-1]+=' '+txt(p.str);else cells.push(txt(p.str));last=p});rows.push(cells)})}
   else vazias.push(n);
  }
  /* 2ª passada: reconhecimento de imagem só quando o PDF inteiro é escaneado. */
  if(!lines.length&&vazias.length){
   try{
    await script('vendor/tesseract.min.js',function(){return !!window.Tesseract});worker=await window.Tesseract.createWorker('por',1,{workerPath:'vendor/tesseract/worker.min.js',corePath:'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',langPath:'vendor/tesseract'});
    for(var k=0;k<vazias.length;k++){var pn=vazias[k],pg=await pdf.getPage(pn);
     el('fixosAviso').textContent='Reconhecendo imagem da página '+pn+' de '+pdf.numPages+'…';var viewport=pg.getViewport({scale:1.8}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await pg.render({canvasContext:canvas.getContext('2d'),viewport:viewport}).promise;var rec=await worker.recognize(canvas);txt(rec.data.text).split(/\r?\n/).filter(Boolean).forEach(function(l){lines.push(l);rows.push(l.split(/\s{2,}|\t/))});canvas.width=canvas.height=0;
    }
   }catch(e){throw new Error('PDF escaneado (imagem) e o reconhecimento de imagem falhou: '+errMsg(e))}
  }
  return {lines:lines,rows:rows,paginasSemTexto:vazias}
 }finally{try{if(worker)await worker.terminate()}catch(e){}try{await pdf.destroy()}catch(e){}}
}
function rawRows(){return fontes[el('fixosAba').value]||[]}
function mapping(){var rows=rawRows(),start=Math.max(0,Number(el('fixosCabecalho').value)-1),header=rows[start]||[],count=rows.reduce(function(s,r){return Math.max(s,r.length)},0);
 ['data','valor','descricao','placa'].forEach(function(k){var e=el('fixosCol-'+k);e.innerHTML='<option value="-1">Não informado</option>'+Array.from({length:count},function(_,i){return '<option value="'+i+'">Coluna '+(i+1)+(header[i]?' — '+esc(header[i]):'')+'</option>'}).join('');var matches=header.map(function(h,i){return {h:D.norm(h),i:i}}).filter(function(o){return k==='data'?/^(DATA|VENCIMENTO|INICIO|VIGENCIA)$/.test(o.h):k==='valor'?/^(VALOR|VALOR MENSAL|VALOR PRESTACAO|PRESTACAO|CUSTO MENSAL)( \(R\$\))?$/.test(o.h):k==='descricao'?/^(DESCRICAO|HISTORICO|CONTRATO)$/.test(o.h):/^(PLACA|VEICULO)$/.test(o.h)});if(matches.length===1)e.value=String(matches[0].i)});
 el('fixosBruto').innerHTML='<table class="table table-sm"><tbody>'+rows.slice(0,25).map(function(r,i){return '<tr><th>'+(i+1)+'</th>'+r.map(function(c){return '<td>'+esc(c)+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table>';
}
async function open(file){
 if(busy)return;if(!/\.(pdf|xlsx|xls|csv)$/i.test(file.name)){alert('Selecione PDF, XLSX, XLS ou CSV.');return}if(itens.length&&!confirm('Substituir a prévia atual?'))return;
 busy=true;el('fixosArquivo').disabled=true;
 try{arquivo=file.name;total=NaN;var buffer=await file.arrayBuffer(),fin=null;
 if(/\.pdf$/i.test(file.name)){var parsed=await readPDF(buffer);fontes={PDF:parsed.rows};fin=D.finame(parsed.lines)}else{if(!window.XLSX)throw new Error('Leitor de Excel indisponível.');var wb=window.XLSX.read(buffer,{type:'array',cellDates:false});fontes={};wb.SheetNames.forEach(function(n){fontes[n]=window.XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:'',raw:true})})}
 el('fixosAba').innerHTML=Object.keys(fontes).map(function(n){return '<option>'+esc(n)+'</option>'}).join('');el('fixosCabecalho').value='1';mapping();el('fixosMap').hidden=false;
 if(fin&&fin.itens.length){itens=fin.itens;total=fin.total;el('fixosCategoria').value='Financiamento / Leasing';el('fixosAviso').textContent='Demonstrativo FINAME reconhecido. Confira as prestações e o veículo.'}else{itens=[];el('fixosAviso').textContent='Selecione as colunas de data e valor para gerar a prévia. A leitura deve ser conferida.'}render();
 }catch(e){el('fixosAviso').textContent='Não foi possível ler: '+errMsg(e)}finally{busy=false;el('fixosArquivo').disabled=false;el('fixosArquivo').value=''}
}
function init(){var pane=el('cusPane-recorrentes');if(!pane||el('cusFixosImport')||!D)return;var box=document.createElement('details');box.id='cusFixosImport';box.open=true;
 box.innerHTML='<summary>Importar PDF ou Excel</summary><input id="fixosArquivo" type="file" accept=".pdf,.xlsx,.xls,.csv" class="form-control" aria-label="Arquivo de custos fixos" data-nao-limpar="1"><p id="fixosAviso" class="cus-note" aria-live="polite"></p><div id="fixosMap" hidden><div class="fixos-controls"><div><label for="fixosAba">Página ou aba</label><select id="fixosAba" class="form-select"></select></div><div><label for="fixosCabecalho">Linha de cabeçalho</label><input id="fixosCabecalho" type="number" min="1" value="1" class="form-control"></div>'+['data','valor','descricao','placa'].map(function(k){return '<div><label for="fixosCol-'+k+'">Coluna de '+({data:'data',valor:'valor',descricao:'descrição',placa:'placa'})[k]+'</label><select id="fixosCol-'+k+'" class="form-select"></select></div>'}).join('')+'</div><details><summary>Dados lidos</summary><div id="fixosBruto" class="fixos-raw"></div></details><button id="fixosGerar" type="button" class="btn btn-outline-primary btn-sm">Gerar prévia pelas colunas</button></div><div class="fixos-controls"><div><label for="fixosCategoria">Categoria</label><select id="fixosCategoria" class="form-select"></select></div><div><label for="fixosVeiculo">Veículo para os itens</label><input id="fixosVeiculo" list="cusVeiculosLista" class="form-control"></div><div><label for="fixosDescricaoBase">Descrição adicional</label><input id="fixosDescricaoBase" class="form-control"></div><div><label><input id="fixosGeral" type="checkbox"> Frota geral</label><button id="fixosAplicar" type="button" class="btn btn-outline-secondary btn-sm">Aplicar veículo</button></div></div><div id="fixosPrevia" hidden><p id="fixosResumo" class="cus-note" aria-live="polite"></p><div class="fixos-actions"><button id="fixosLimpar" type="button" class="btn btn-outline-danger btn-sm">Excluir prévia</button><button id="fixosRever" type="button" class="btn btn-outline-secondary btn-sm">Conferir custos salvos</button></div><div class="cus-table-wrap"><table class="table fixos-table" data-sem-relatorio="1"><thead><tr><th>Item</th><th>Vencimento</th><th>Valor (R$)</th><th>Veículo</th><th>Descrição</th><th>Ações</th></tr></thead><tbody id="fixosLinhas"></tbody></table></div></div>';
 pane.insertBefore(box,pane.firstChild);
 function cats(){var c=el('cusRecCategoria');if(c&&c.options.length>1&&!el('fixosCategoria').options.length)el('fixosCategoria').innerHTML=c.innerHTML}cats();document.addEventListener('DOMContentLoaded',cats,{once:true});
 el('fixosArquivo').addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];if(f)open(f)});el('fixosAba').addEventListener('change',mapping);el('fixosCabecalho').addEventListener('change',mapping);
 el('fixosGerar').addEventListener('click',function(){var map={};['data','valor','descricao','placa'].forEach(function(k){map[k]=Number(el('fixosCol-'+k).value)});if(map.data<0||map.valor<0||map.data===map.valor){alert('Escolha colunas diferentes para data e valor.');return}if(itens.length&&!confirm('Substituir a prévia pelas colunas escolhidas?'))return;itens=D.mapped(rawRows(),Number(el('fixosCabecalho').value),map,arquivo+'|'+el('fixosAba').value);total=NaN;render();if(!itens.length)el('fixosAviso').textContent='Nenhum item encontrado; confira a linha de cabeçalho e as colunas.'});
 el('fixosAplicar').addEventListener('click',function(){var v=vehicle(el('fixosVeiculo').value);if(!el('fixosGeral').checked&&!v){alert('Selecione um veículo cadastrado e não vendido.');return}itens.forEach(function(x){x.placa=el('fixosGeral').checked?'':v.vplaca});render()});
 ['fixosCategoria','fixosDescricaoBase','fixosGeral'].forEach(function(id){el(id).addEventListener('change',render)});
 el('fixosLimpar').addEventListener('click',function(){if(confirm('Excluir apenas a prévia atual?')){itens=[];render()}});el('fixosRever').addEventListener('click',render);
 box.addEventListener('change',function(e){var t=e.target,i=Number(t.dataset.i),k=t.dataset.field;if(!k||!itens[i])return;itens[i][k]=k==='cents'?D.cents(t.value):t.value;render()});
 box.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;if(b.dataset.fill!=null)fill(Number(b.dataset.fill));if(b.dataset.remove!=null){itens.splice(Number(b.dataset.remove),1);render()}});
}
window.FMFixosImportacao={lerPDF:readPDF};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
