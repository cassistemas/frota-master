/* Leitura local; nenhum custo é criado antes da confirmação. */
(function () {
  'use strict';
  var itens = [], arquivo = '', ocupado = false, editando = -1;
  var campos = ['Folha salarial','Remuneração variável','Diárias / adicionais','Hora extra','Encargos patronais do mês','FGTS mês','INSS','RAT/FAP','Benefícios','Provisão mensal de 13º','Provisão mensal de férias + 1/3','Encargos provisões'];
  function el(id) { return document.getElementById(id); }
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function norm(v) { return texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' '); }
  function esc(v) { return texto(v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function moeda(v) { return (v / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'}); }
  function cents(v) { var s = texto(v).replace(/R\$\s*/g, '').replace(/\s/g, ''); if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); return s !== '' && Number.isFinite(Number(s)) ? Math.round(Number(s) * 100) : NaN; }
  function ler(wb) {
    var nome = wb.SheetNames.find(function (n) { return norm(n) === 'CUSTO POR FUNCIONARIO'; });
    if (!nome) throw new Error('Aba Custo por Funcionário não encontrada.');
    var ws = wb.Sheets[nome], range = XLSX.utils.decode_range(ws['!ref'] || 'A1'), cab = -1, mapa = {};
    for (var r = 0; r <= Math.min(range.e.r, 20); r++) {
      var tmp = {};
      for (var c = 0; c <= range.e.c; c++) { var ce = ws[XLSX.utils.encode_cell({r:r,c:c})]; if (ce) tmp[norm(ce.v)] = c; }
      if (tmp.FUNCIONARIO !== undefined && tmp['SALARIO MENSAL'] !== undefined) { cab = r; mapa = tmp; break; }
    }
    if (cab < 0) throw new Error('Cabeçalhos de funcionário e salário não encontrados.');
    var obrig = ['Salário mensal','HE 50% R$','HE 100% R$','HE noturna 50% R$','HE noturna 100% R$','DSR variáveis','Diárias de viagem','Outras verbas tributáveis (Encar. prov)','Outras verbas não tributáveis','CPP patronal','RAT × FAP','Terceiros','FGTS mês','Total benefícios','Prov. 13º','Prov. férias','Prov. 1/3 férias','Encargos sobre provisões','Prov. multa FGTS (VARIÁVEL)','Outras provisões','Custo mensal total','Custo anual'];
    obrig.forEach(function (n) { if (mapa[norm(n)] === undefined) throw new Error('Coluna ausente: ' + n); });
    function cel(r, n) { return ws[XLSX.utils.encode_cell({r:r,c:mapa[norm(n)]})]; }
    function valor(r, n) { var ce = cel(r,n); if (!ce || ce.v == null || ce.v === '') { if ((ce && ce.f) || ['Custo mensal total','Custo anual','Total benefícios','CPP patronal','FGTS mês','Prov. 13º','Prov. férias'].indexOf(n)>=0) throw new Error(n + ': resultado ausente. Recalcule e salve no Excel.'); return 0; } if (ce.t === 'e' || typeof ce.v !== 'number' || !Number.isFinite(ce.v) || ce.v < 0) throw new Error(n + ': valor inválido.'); return ce.v; }
    function soma(r, nomes) { return Math.round(nomes.reduce(function (s,n) { return s + valor(r,n); },0)*100); }
    var saida = [];
    for (r = cab + 1; r <= range.e.r; r++) {
      var ce = cel(r,'Funcionário'), motorista = ce ? texto(ce.v) : ''; if (!motorista) continue;
      var matricula = mapa.MATRICULA !== undefined && cel(r,'Matrícula') ? texto(cel(r,'Matrícula').v) : '';
      var item = {linha:r+1,motorista:motorista,motoristaOrigem:motorista,matricula:matricula,veiculo:'',valores:[0,0,0,0,0],erro:'',selecionado:true,revisado:false};
      try {
        item.valores = [soma(r,['Salário mensal']), soma(r,obrig.slice(1,9)), soma(r,obrig.slice(9,13)), soma(r,['Total benefícios']), soma(r,obrig.slice(14,20))];
        item.totalOrigem = soma(r,['Custo mensal total']); item.anualOrigem = soma(r,['Custo anual']); item.diarias = soma(r,['Diárias de viagem']);
        item.componentes = {}; obrig.forEach(function(n){item.componentes[n]=valor(r,n);});
        var dif = item.totalOrigem - item.valores.reduce(function(s,v){return s+v;},0);
        if (Math.abs(dif) > 2 || item.valores[4]+dif < 0) throw new Error('Componentes não conferem com o total mensal.');
        item.originais = item.valores.slice(); item.valores[4] += dif; item.ajuste = dif;
        item.detalhados = [soma(r,['Salário mensal']),soma(r,['DSR variáveis','Outras verbas tributáveis (Encar. prov)','Outras verbas não tributáveis']),soma(r,['Diárias de viagem']),soma(r,['HE 50% R$','HE 100% R$','HE noturna 50% R$','HE noturna 100% R$']),soma(r,['CPP patronal','Terceiros']),soma(r,['FGTS mês']),0,soma(r,['RAT × FAP']),soma(r,['Total benefícios']),soma(r,['Prov. 13º']),soma(r,['Prov. férias','Prov. 1/3 férias']),soma(r,['Encargos sobre provisões','Prov. multa FGTS (VARIÁVEL)','Outras provisões'])];
        [[0],[1,2,3],[4,5,6,7],[8],[9,10,11]].forEach(function(indices,k){var delta=item.valores[k]-indices.reduce(function(s,i){return s+item.detalhados[i];},0),i=indices.slice().reverse().find(function(i){return item.detalhados[i]+delta>=0;});if(i===undefined)throw new Error('Valores detalhados não conferem.');item.detalhados[i]+=delta;});
        var placa = mapa.PLACA !== undefined && cel(r,'Placa') ? texto(cel(r,'Placa').v) : '';
        var veiculos = typeof db !== 'undefined' && Array.isArray(db.veiculos) ? db.veiculos : [];
        var vinculos = veiculos.filter(function(v){return norm(v.vmotorista)===norm(motorista)&&norm(v.vstatus)!=='VENDIDO';});
        item.veiculo = placa || (vinculos.length===1 ? vinculos[0].vplaca : '');
      } catch (e) { item.erro = e.message; item.selecionado = false; }
      saida.push(item);
    }
    if (!saida.length) throw new Error('Nenhum funcionário preenchido encontrado.');
    return saida;
  }
  function dados(item) { return {motorista:item.motorista,motoristaOrigem:item.motoristaOrigem,matricula:item.matricula,veiculo:item.veiculo,competencia:el('folhaImportMes').value,valores:item.valores,detalhados:item.detalhados,arquivo:arquivo,linha:item.linha,originais:item.originais,componentes:item.componentes,totalOrigem:item.totalOrigem,anualOrigem:item.anualOrigem,ajuste:item.ajuste||0,revisado:item.revisado}; }
  function situacao(item) {
    if (item.erro) return item.erro;
    if (!window.FMFolhaImportacao) return 'Folha indisponível.';
    return window.FMFolhaImportacao.validar(dados(item));
  }
  function opcoesVeiculos(atual) {
    var vs=typeof db!=='undefined'&&Array.isArray(db.veiculos)?db.veiculos:[];
    return '<option value="">Selecione o veículo</option>'+vs.filter(function(v){return norm(v.vstatus)!=='VENDIDO';}).map(function(v){return '<option value="'+esc(v.vplaca)+'" '+(v.vplaca===atual?'selected':'')+'>'+esc(v.vplaca+(v.vmotorista?' — '+v.vmotorista:''))+'</option>';}).join('');
  }
  function atualizarLinha(i) {
    var x=itens[i],row=el('folhaImportLinhas').querySelector('[data-folha-linha="'+i+'"]');if(!x||!row)return;
    var status=situacao(x),aviso=window.FMFolhaImportacao?.avisos(dados(x));
    row.querySelector('[data-folha-status]').textContent=x.confirmado?'Confirmado':(status||'Pronto para confirmar')+(aviso?' '+aviso:'');
    row.querySelector('[data-folha-total]').textContent=moeda(x.valores.reduce(function(s,v){return s+v;},0));
    var revisao=row.querySelector('[data-folha-revisao]');if(revisao)revisao.checked=x.revisado;
    var total=itens.filter(function(x){return x.selecionado&&!x.erro&&!x.confirmado;}).reduce(function(s,x){return s+x.valores.reduce(function(s,v){return s+v;},0);},0);
    el('folhaImportTotal').textContent=itens.length+' funcionário(s) · Total mensal selecionado: '+moeda(total)+' · Projeção anual: '+moeda(total*12);
  }
  function desenhar() {
    if(!el('folhaImportLinhas'))return;
    itens=itens.filter(function(x){return !x.confirmado;});
    itens.forEach(function(x){x.duplicada=Boolean(window.FMFolhaImportacao?.duplicada(dados(x)));if(x.duplicada)x.selecionado=false;});
    el('folhaImportLinhas').innerHTML=itens.map(function(x,i){var bloqueado=ocupado||x.confirmado||x.duplicada,disabled=bloqueado?'disabled':'';
      return '<tr data-folha-linha="'+i+'"><td><input type="checkbox" aria-label="Selecionar '+esc(x.motorista)+'" data-folha-selecao="'+i+'" '+(x.selecionado?'checked':'')+' '+(bloqueado||x.erro?'disabled':'')+'></td><td><input class="form-control" list="cusMotoristasLista" aria-label="Motorista da linha '+x.linha+'" data-folha-motorista="'+i+'" value="'+esc(x.motorista)+'" '+disabled+'><div class="cus-mini">Linha '+x.linha+'</div></td><td><select class="form-select" aria-label="Veículo da linha '+x.linha+'" data-folha-veiculo="'+i+'" '+disabled+'>'+opcoesVeiculos(x.veiculo)+'</select></td><td data-folha-total></td><td data-folha-status></td><td><input type="checkbox" aria-label="Conferência de '+esc(x.motorista)+'" data-folha-revisao="'+i+'" '+(x.revisado?'checked':'')+' '+(bloqueado||x.erro?'disabled':'')+'></td><td><div class="cus-history-actions"><button type="button" class="btn-edit" data-folha-editar="'+i+'" '+(bloqueado||x.erro?'disabled':'')+'>✎ Editar</button><button type="button" class="btn-del" data-folha-excluir="'+i+'" '+disabled+'>✕ Excluir</button></div></td></tr>';
    }).join('');
    itens.forEach(function(x,i){atualizarLinha(i);});
    if(!itens.length)el('folhaImportTotal').textContent='Nenhum funcionário na prévia.';
    el('folhaImportPrevia').hidden=!itens.length;
    el('folhaImportConfirmar').disabled=ocupado||!itens.some(function(x){return x.selecionado&&!x.confirmado&&!x.erro;});
    var validos=itens.filter(function(x){return !x.confirmado&&!x.erro&&!x.duplicada;});
    var todos=el('folhaImportTodos');todos.checked=validos.length>0&&validos.every(function(x){return x.selecionado;});todos.indeterminate=!todos.checked&&validos.some(function(x){return x.selecionado;});todos.disabled=ocupado||!validos.length;
  }
  function abrirEdicao(i) {
    var x=itens[i];if(!x||x.confirmado||x.erro||ocupado)return;editando=i;
    el('folhaEditorMotorista').value=x.motorista;
    el('folhaEditorVeiculo').innerHTML=opcoesVeiculos(x.veiculo);
    el('folhaEditorValores').innerHTML=campos.map(function(c,k){return '<div><label for="folhaEditorValor'+k+'">'+esc(c)+' (R$)</label><input id="folhaEditorValor'+k+'" class="form-control" inputmode="decimal" value="'+esc(moeda(x.detalhados[k]))+'"></div>';}).join('');
    el('folhaEditorMensagem').textContent='';el('folhaImportEditor').showModal();
  }
  function salvarEdicao() {
    var x=itens[editando];if(!x||ocupado)return;
    var valores=campos.map(function(c,k){return cents(el('folhaEditorValor'+k).value);});
    if(!texto(el('folhaEditorMotorista').value)||valores.some(function(v){return !Number.isSafeInteger(v)||v<0;})){el('folhaEditorMensagem').textContent='Informe o motorista e valores válidos, não negativos.';return;}
    x.motorista=texto(el('folhaEditorMotorista').value);x.veiculo=el('folhaEditorVeiculo').value;x.detalhados=valores;
    x.valores=[[0],[1,2,3],[4,5,6,7],[8],[9,10,11]].map(function(indices){return indices.reduce(function(s,i){return s+valores[i];},0);});
    x.revisado=false;el('folhaImportEditor').close();editando=-1;desenhar();
  }
  async function confirmar() {
    if (ocupado) return;
    var lista = itens.filter(function(x){return x.selecionado&&!x.confirmado;}); if (!lista.length) return;
    var erros = lista.map(function(x){return situacao(x);}).filter(Boolean);
    if (erros.length) { el('folhaImportMensagem').textContent = 'Confira as linhas: '+Array.from(new Set(erros)).join(' '); desenhar(); return; }
    if (!window.confirm('Confirmar '+lista.length+' folha(s) apenas para '+el('folhaImportMes').value+'? Os valores entrarão nos custos dos veículos.')) return;
    ocupado = true; el('folhaImportMes').disabled=true; el('folhaImportArquivo').disabled=true; desenhar();
    var ok = 0;
    try {
      for (var x of lista) { var resultado = await window.FMFolhaImportacao.salvar(dados(x)); if (resultado !== true) throw new Error(typeof resultado==='string'?resultado:'Salvamento não confirmado; tente novamente sem reimportar.'); x.confirmado=true;x.selecionado=false;ok++;desenhar(); }
      el('folhaImportMensagem').textContent=ok+' folha(s) confirmada(s).';
    } catch(e) { el('folhaImportMensagem').textContent=ok+' confirmada(s). '+e.message; }
    finally { ocupado=false;el('folhaImportMes').disabled=false;el('folhaImportArquivo').disabled=false;desenhar(); }
  }
  function iniciar() {
    var pane=el('cusPane-folha'); if (!pane || el('folhaImportArquivo')) return;
    var box=document.createElement('details');box.className='cus-planilha';
    box.innerHTML='<summary>Importar folha de funcionários</summary><div class="cus-form-grid"><div class="span-2"><label for="folhaImportArquivo">Planilha Excel</label><input type="file" id="folhaImportArquivo" class="form-control" accept=".xlsx,.xls" data-nao-limpar="1"></div><div class="span-2"><label for="folhaImportMes">Mês de referência</label><input id="folhaImportMes" type="month" class="form-control" data-nao-limpar="1"></div></div><div id="folhaImportMensagem" class="cus-note" role="status"></div><div id="folhaImportPrevia" hidden><p id="folhaImportTotal" class="cus-note"></p><div class="cus-table-wrap"><table class="table cus-table folha-import-table" data-sem-relatorio="1"><thead><tr><th><input id="folhaImportTodos" type="checkbox" aria-label="Selecionar todos"> Selecionar todos</th><th>Motorista</th><th>Veículo</th><th>Total mensal</th><th>Situação</th><th>Valores e diárias conferidos</th><th>Ações</th></tr></thead><tbody id="folhaImportLinhas"></tbody></table></div><div class="cus-form-actions"><button type="button" id="folhaImportConfirmar" class="btn btn-primary">Confirmar selecionadas</button><button type="button" id="folhaImportLimpar" class="btn btn-outline-secondary">Limpar prévia</button></div></div>';
    var editor=document.createElement('dialog');editor.id='folhaImportEditor';editor.className='folha-import-editor';
    editor.innerHTML='<h5>Editar prévia da folha</h5><div class="cus-form-grid cus-payroll-grid"><div><label for="folhaEditorMotorista">Motorista</label><input id="folhaEditorMotorista" list="cusMotoristasLista" class="form-control"></div><div><label for="folhaEditorVeiculo">Veículo</label><select id="folhaEditorVeiculo" class="form-select"></select></div></div><div id="folhaEditorValores" class="cus-form-grid cus-payroll-grid"></div><p id="folhaEditorMensagem" class="cus-note" role="status"></p><div class="cus-form-actions"><button type="button" id="folhaEditorCancelar" class="btn btn-outline-secondary">Cancelar</button><button type="button" id="folhaEditorSalvar" class="btn btn-primary">Aplicar na prévia</button></div>';
    box.appendChild(editor);
    var lista=pane.querySelector('#cusFolhaLista');if(lista&&lista.parentElement)pane.insertBefore(box,lista.parentElement);else pane.appendChild(box);
    el('folhaImportArquivo').addEventListener('change',async function(ev){var file=ev.target.files&&ev.target.files[0];if(!file||ocupado)return;itens=[];desenhar();try{if(!/\.xlsx?$/i.test(file.name)||file.size>20*1024*1024)throw new Error('Selecione uma planilha Excel de até 20 MB.');if(!window.XLSX)throw new Error('Leitor Excel indisponível.');arquivo=file.name;itens=ler(XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:true}));el('folhaImportMensagem').textContent=arquivo;}catch(e){el('folhaImportMensagem').textContent=e.message;}finally{ev.target.value='';desenhar();}});
    el('folhaImportMes').value=new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
    el('folhaImportMes').addEventListener('change',function(){itens.forEach(function(x){x.revisado=false;});desenhar();});
    box.addEventListener('input',function(ev){if(ocupado)return;var t=ev.target;if(!t.hasAttribute('data-folha-motorista'))return;var i=Number(t.dataset.folhaMotorista),x=itens[i];if(!x||x.confirmado)return;x.motorista=t.value;x.revisado=false;atualizarLinha(i);});
    box.addEventListener('change',function(ev){if(ocupado)return;var t=ev.target;
      if(t.id==='folhaImportTodos'){itens.forEach(function(x){if(!x.confirmado&&!x.erro&&!x.duplicada)x.selecionado=t.checked;});desenhar();return;}
      var attr=t.hasAttribute('data-folha-veiculo')?'folhaVeiculo':t.hasAttribute('data-folha-selecao')?'folhaSelecao':t.hasAttribute('data-folha-revisao')?'folhaRevisao':'';if(!attr)return;
      var i=Number(t.dataset[attr]),x=itens[i];if(!x||x.confirmado)return;
      if(attr==='folhaVeiculo'){x.veiculo=t.value;x.revisado=false;atualizarLinha(i);}
      if(attr==='folhaSelecao'){x.selecionado=t.checked;desenhar();}
      if(attr==='folhaRevisao'){x.revisado=t.checked;atualizarLinha(i);}
    });
    box.addEventListener('click',function(ev){if(ocupado)return;var t=ev.target.closest('[data-folha-editar],[data-folha-excluir]');if(!t)return;
      if(t.hasAttribute('data-folha-editar')){abrirEdicao(Number(t.dataset.folhaEditar));return;}
      var i=Number(t.dataset.folhaExcluir),x=itens[i];if(!x||x.confirmado)return;
      if(window.confirm('Excluir '+x.motorista+' somente desta prévia? Nenhum lançamento salvo será excluído.')){itens.splice(i,1);desenhar();}
    });
    el('folhaEditorCancelar').addEventListener('click',function(){el('folhaImportEditor').close();editando=-1;});
    el('folhaEditorSalvar').addEventListener('click',salvarEdicao);
    el('folhaImportConfirmar').addEventListener('click',confirmar);
    el('folhaImportLimpar').addEventListener('click',function(){if(ocupado)return;itens=[];el('folhaImportMensagem').textContent='';desenhar();});
  }
  window.FMPlanilhaFolha={ler:ler};
  new MutationObserver(iniciar).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();