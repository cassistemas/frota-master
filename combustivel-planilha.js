/* Prévia isolada: somente a confirmação explícita usa o formulário/escritor existente. */
(function () {
  'use strict';
  var D = window.FMCombustivelPlanilhaDados, itens = [], arquivo = '', ocupado = false, pendente = false;
  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function moeda(c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function salvo(x) { return db.combustivel.some(function (r) { return D.igual(x, r); }); }
  function status(x) {
    if (salvo(x)) return 'Já lançado';
    var erro = D.erro(x, db.veiculos);
    if (erro) return erro;
    return itens.some(function (y) { return y !== x && y.id < x.id && D.igual(x, { cveiculo: y.placa, cdata: y.data, ctipo: y.tipo, clitros: y.litros, cvalorlitro: y.valorLitro, ckm: y.km, cposto: y.posto }); }) ? 'Repetido na prévia' : 'Disponível';
  }
  function campo(x, k, type) { return '<input type="' + (type || 'text') + '" class="form-control" data-campo="' + k + '" aria-label="' + ({posto:'Posto',cnpj:'CNPJ do posto',data:'Data',placa:'Placa',km:'KM',litros:'Litros',valorLitro:'Valor por litro'}[k] || k) + '" value="' + esc(x[k]) + '"' + (type === 'number' ? ' step="any" min="0"' : '') + '>'; }
  function iniciarEdicao(grupo) {
    grupo.forEach(function(x) {
      if (x.editando) return;
      x.antesEdicao = Object.assign({}, x);
      x.editando = true;
    });
  }
  function finalizarEdicao(grupo, cancelar) {
    grupo.forEach(function(x) {
      var anterior = x.antesEdicao;
      if (cancelar && anterior) {
        Object.keys(x).forEach(function(k) { delete x[k]; });
        Object.assign(x, anterior);
      }
      delete x.antesEdicao;
      x.editando = false;
    });
  }
  function ajustarTexto(campo) {
    campo.style.height = 'auto';
    campo.style.height = campo.scrollHeight + 'px';
  }
  function rolagemLateral(area) {
    var direcao = 0, quadro = 0, anterior = 0;
    function parar() {
      direcao = 0; anterior = 0;
      if (quadro) cancelAnimationFrame(quadro);
      quadro = 0;
    }
    function passo(tempo) {
      quadro = 0;
      if (!direcao || !area.isConnected || !area.getClientRects().length) { parar(); return; }
      var limite = Math.max(0, area.scrollWidth - area.clientWidth);
      var delta = anterior ? Math.min(tempo - anterior, 40) : 16;
      anterior = tempo;
      var destino = Math.max(0, Math.min(limite, area.scrollLeft + direcao * delta * 0.45));
      if (Math.abs(destino - area.scrollLeft) < 0.1) { parar(); return; }
      area.scrollLeft = destino;
      quadro = requestAnimationFrame(passo);
    }
    area.addEventListener('pointermove', function(ev) {
      if (ev.pointerType !== 'mouse' || ev.buttons) { parar(); return; }
      var r = area.getBoundingClientRect();
      var esquerda = Math.max(0, r.left), direita = Math.min(window.innerWidth, r.right);
      var borda = Math.min(48, (direita - esquerda) / 5);
      direcao = ev.clientX < esquerda + borda ? -1 : ev.clientX > direita - borda ? 1 : 0;
      if (!direcao) { parar(); return; }
      if (!quadro) quadro = requestAnimationFrame(passo);
    });
    area.addEventListener('pointerleave', parar);
    area.addEventListener('pointerdown', parar);
    window.addEventListener('blur', parar);
    document.addEventListener('visibilitychange', function() { if (document.hidden) parar(); });
  }
  function selecionaveis() { return itens.filter(function(x) { return !salvo(x); }); }
  function selecionarTodos(valor) {
    itens.forEach(function(x) { x.selecionado = valor && !salvo(x); });
    desenhar();
  }
  function excluirSelecionados() {
    if (ocupado || pendente) return;
    var selecionados = selecionaveis().filter(function(x) { return x.selecionado; });
    if (!selecionados.length || !confirm('Excluir ' + selecionados.length + ' item(ns) selecionado(s) apenas da prévia?')) return;
    itens = itens.filter(function(x) { return selecionados.indexOf(x) < 0; });
    el('combPlanAviso').textContent = 'Itens selecionados excluídos da prévia. Os lançamentos salvos não foram alterados.';
    desenhar();
  }
  function atualizarResumo() {
    var disponiveis = itens.filter(function (x) { return status(x) === 'Disponível'; });
    var selecionados = itens.filter(function (x) { return x.selecionado && status(x) === 'Disponível'; });
    var diesel = itens.filter(function (x) { return /Diesel/.test(x.tipo); }).reduce(function (s, x) { return s + (x.totalCentavos || 0); }, 0);
    var arla = itens.filter(function (x) { return x.tipo === 'Arla32'; }).reduce(function (s, x) { return s + (x.totalCentavos || 0); }, 0);
    el('combPlanResumo').innerHTML = '<span>Itens na prévia<strong>' + itens.length + '</strong></span><span>Disponíveis<strong>' + disponiveis.length + '</strong></span><span>Selecionados<strong>' + selecionados.length + ' · ' + moeda(selecionados.reduce(function (s,x) { return s + x.totalCentavos; },0)) + '</strong></span><span>Diesel<strong>' + moeda(diesel) + '</strong></span><span>ARLA<strong>' + moeda(arla) + '</strong></span>';
    var elegiveis = selecionaveis(), marcados = elegiveis.filter(function(x) { return x.selecionado; });
    el('combPlanTodos').checked = elegiveis.length > 0 && marcados.length === elegiveis.length;
    el('combPlanTodos').indeterminate = marcados.length > 0 && marcados.length < elegiveis.length;
    el('combPlanTodos').disabled = ocupado || pendente;
    el('combPlanExcluir').disabled = ocupado || pendente || !marcados.length;
    el('combPlanExcluir').textContent = 'Excluir selecionados' + (marcados.length ? ' (' + marcados.length + ')' : '');
    el('combPlanConfirmar').disabled = ocupado || !selecionados.length;
    el('combPlanSincronizar').hidden = !pendente;
  }
  function desenhar() {
    if (!el('combPlanLinhas')) return;
    el('combPlanPrevia').hidden = !itens.length;
    el('combPlanVeiculos').innerHTML = db.veiculos.filter(function(v) { return v.vplaca && D.normal(v.vstatus) !== 'VENDIDO'; }).map(function(v) { return '<option value="' + esc(v.vplaca) + '"></option>'; }).join('');
    var grupos = D.agrupar(itens);
    el('combPlanLinhas').innerHTML = grupos.map(function (grupo) {
      var base = grupo[0], edit = grupo.some(function(x) { return x.editando; });
      function comum(k) {
        var value = k === 'data' ? D.dataBr(base.data) : base[k];
        if (k === 'posto' && edit) return '<textarea class="form-control comb-texto" data-comum="posto" aria-label="Posto" rows="1">' + esc(value) + '</textarea>';
        return edit || (k === 'placa' && !base.placa) ? '<input class="form-control" data-comum="' + k + '" aria-label="' + ({posto:'Posto',cnpj:'CNPJ do posto',data:'Data',placa:'Placa',km:'KM'}[k]) + '" size="' + Math.max(8,Math.min(28,String(value || '').length + 1)) + '" value="' + esc(value) + '"' + (k === 'data' ? ' placeholder="dd/mm/aaaa" inputmode="numeric"' : '') + (k === 'placa' ? ' list="combPlanVeiculos" placeholder="Buscar placa" autocomplete="off"' : '') + '>' : esc(value);
      }
      function produto(x) {
        if (!x) return '<td>—</td><td>—</td><td>—</td><td>—</td>';
        var s = status(x), tipos = ['Gasolina','Diesel S500','Diesel S10','Arla32'];
        var tipo = edit ? '<select class="form-select" data-campo="tipo" aria-label="Tipo de combustível"><option value="">Conferir produto</option>' + tipos.map(function(t) { return '<option' + (x.tipo === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' : esc(x.tipo || x.produto);
        function td(v, textual) { return '<td' + (textual ? ' class="comb-produto"' : '') + ' data-item="' + x.id + '">' + v + '</td>'; }
        return td('<input type="checkbox" data-selecionar aria-label="Selecionar item ' + x.id + '" title="' + esc(s) + '" ' + (x.selecionado && !salvo(x) ? 'checked ' : '') + (salvo(x) || ocupado || pendente ? 'disabled' : '') + '> ' + tipo + (s !== 'Disponível' ? '<small>' + esc(s) + '</small>' : ''), true) + td(edit ? campo(x,'litros','number') : esc(x.litros)) + td(edit ? campo(x,'valorLitro','number') : moeda(Math.round(x.valorLitro * 100))) + td(moeda(x.totalCentavos || 0));
      }
      var principal = grupo.find(function(x) { return x.colunaProduto === 'combustivel'; });
      var arla = grupo.find(function(x) { return x.colunaProduto === 'arla'; });
      var total = grupo.reduce(function(s,x) { return s + (x.totalCentavos || 0); },0);
       var podeConfirmar = grupo.every(function(x) { return status(x) === 'Disponível'; });
       return '<tr data-grupo="' + base.id + '"><td class="comb-posto"><div class="comb-posto-texto">' + comum('posto') + '<small>' + comum('cnpj') + '</small></div></td><td>' + comum('data') + '</td><td>' + esc(D.competenciaBr(base.data)) + '</td><td>' + comum('placa') + '</td><td>' + comum('km') + '</td>' + produto(principal) + produto(arla) + '<td>' + moeda(total) + '<small>Original: ' + moeda(Math.round((base.totalConjuntoOriginal || 0)*100)) + '</small></td><td><div class="comb-acoes"><button type="button" class="btn btn-sm btn-outline-primary" data-editar ' + (ocupado ? 'disabled' : '') + '>' + (edit ? 'Concluir' : 'Editar') + '</button>' + (edit ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-cancelar ' + (ocupado ? 'disabled' : '') + '>Cancelar</button>' : '') + '<button type="button" class="btn btn-sm btn-outline-danger" data-excluir ' + (ocupado || pendente ? 'disabled' : '') + '>Excluir</button><button type="button" class="btn btn-sm btn-primary" data-confirmar ' + (ocupado || pendente || !podeConfirmar ? 'disabled' : '') + '>Confirmar</button></div></td></tr>';
    }).join('');
    el('combPlanLinhas').querySelectorAll('textarea.comb-texto').forEach(ajustarTexto);
    atualizarResumo();
  }
  function prontos() {
    return ['combustivel','veiculos','historicoKm'].every(function (m) { return typeof fmModuloCarregado !== 'function' || fmModuloCarregado(m); });
  }
  async function sincronizar() {
    if (ocupado) return;
    ocupado = true; desenhar();
    try {
      var ok = await salvarNuvem(['combustivel','veiculos','historicoKm']);
      if (ok === false) throw new Error('Sem confirmação da gravação. Os itens continuam pendentes de sincronização; não importe novamente.');
      pendente = false;
      itens = itens.filter(function (x) { return !salvo(x); });
      el('combPlanAviso').textContent = 'Gravação confirmada. Os itens lançados foram retirados da prévia.';
    } catch (e) { el('combPlanAviso').textContent = e.message; }
    finally { ocupado = false; desenhar(); }
  }
  async function confirmar(grupo) {
    if (ocupado || !prontos()) { el('combPlanAviso').textContent = 'Aguarde o carregamento de combustível, veículos e histórico de KM.'; return; }
    if (el('c_idx').value || Array.from(document.querySelectorAll('#combustivel > .glass-container:first-of-type input:not([type=hidden])')).some(function (c) { return c.value; })) {
      el('combPlanAviso').textContent = 'Salve ou cancele o formulário de combustível aberto antes de confirmar a planilha.'; return;
    }
    var selecionados = Array.isArray(grupo) ? grupo.filter(function(x) { return status(x) === 'Disponível'; }) : itens.filter(function(x) { return x.selecionado && status(x) === 'Disponível'; });
    if (Array.isArray(grupo) && selecionados.length !== grupo.length) { el('combPlanAviso').textContent = 'Confira os dados de todos os produtos deste abastecimento antes de confirmar.'; return; }
    if (!selecionados.length) return;
    if (!confirm('Confirmar ' + selecionados.length + ' item(ns), total ' + moeda(selecionados.reduce(function(s,x) {return s+x.totalCentavos;},0)) + '?')) return;
    ocupado = true; desenhar();
    var quantidade = 0;
    try {
      selecionados.sort(function(a,b) { return a.data.localeCompare(b.data) || Number(a.km)-Number(b.km); });
      for (var x of selecionados) {
        if (salvo(x) || D.erro(x,db.veiculos)) continue;
        var v = D.veiculo(x,db.veiculos);
        if (!v) continue;
        carregarVeiculosSelect('cveiculo');
        var dados = { cveiculo:v.vplaca, cdata:x.data, ctipo:x.tipo, clitros:String(x.litros), cvalorlitro:String(x.valorLitro), ckm:String(x.km), cposto:x.posto };
        Object.keys(dados).forEach(function(k) { el(k).value = dados[k]; });
        el('c_idx').value = '';
        var registro = salvar('combustivel',Object.keys(dados),'c_idx',{combustivelPlanilha:true,dados:{ ccnpjPosto:x.cnpj, ctotal:x.totalCentavos/100, cimportacaoReferencia:x.referencia, cimportacaoArquivo:arquivo, cimportacaoAba:x.aba, cimportacaoLinha:x.linha, ccompetencia:D.competencia(x.data), cprodutoOriginal:x.produto, cimportacaoOriginal:x.original, ctotalConjuntoOriginal:x.totalConjuntoOriginal || 0 }});
        if (!registro) throw new Error('Um item não passou pela validação. Confira a prévia.');
        quantidade++;
      }
      if (quantidade) {
        pendente = true;
        if (typeof sincronizarRevisoes === 'function') sincronizarRevisoes();
        if (typeof fmSincronizarKmVeiculo === 'function') fmSincronizarKmVeiculo();
        renderModulo('combustivel');
        if (typeof atualizarResumoCombustivel === 'function') atualizarResumoCombustivel();
      }
    } catch(e) { el('combPlanAviso').textContent = e.message; if (quantidade) pendente = true; }
    finally { ocupado = false; limparForm('combustivel',['cveiculo','cdata','ctipo','clitros','cvalorlitro','ckm','cposto'],'c_idx'); desenhar(); }
    if (pendente) await sincronizar();
  }
  function iniciar() {
    var painel = el('combustivel');
    if (!painel || el('combPlanArquivo')) return;
    var box = document.createElement('section'); box.className = 'comb-planilha'; box.dataset.naoLimpar = '1';
    box.innerHTML = '<h5>Importar planilha de combustível</h5><input id="combPlanArquivo" class="form-control comb-upload" type="file" accept=".xlsx,.xls" aria-label="Planilha de combustível"><datalist id="combPlanVeiculos"></datalist><p id="combPlanAviso" role="status" class="mt-2">Nenhum item é salvo antes da confirmação.</p><div id="combPlanPrevia" hidden><div id="combPlanResumo" class="comb-summary"></div><div class="comb-toolbar"><label><input id="combPlanTodos" type="checkbox"> Selecionar todos</label><button id="combPlanConfirmar" type="button" class="btn btn-primary">Confirmar selecionados</button><button id="combPlanExcluir" type="button" class="btn btn-outline-danger">Excluir selecionados</button><button id="combPlanSincronizar" type="button" class="btn btn-outline-primary" hidden>Sincronizar pendentes</button></div><div class="cus-table-wrap"><table class="table" data-sem-relatorio="1"><thead><tr><th>Posto / CNPJ</th><th>Data</th><th>Competência</th><th>Placa</th><th>KM</th><th>Combustível</th><th>Litros</th><th>Valor/L</th><th>Total</th><th>ARLA / Produto</th><th>Litros ARLA</th><th>Valor/L ARLA</th><th>Total ARLA</th><th>Total combinado</th><th>Ações</th></tr></thead><tbody id="combPlanLinhas"></tbody></table></div></div>';
    painel.insertBefore(box,painel.querySelector('.fuel-overview'));
    rolagemLateral(box.querySelector('.cus-table-wrap'));
    box.addEventListener('input', function(ev) { if (ev.target.matches('textarea.comb-texto')) ajustarTexto(ev.target); });
    el('combPlanArquivo').addEventListener('change',async function(ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      if (ocupado || pendente) { alert('Sincronize os itens pendentes antes de abrir outra planilha.'); ev.target.value=''; return; }
      if (itens.length && !confirm('Substituir a prévia atual? Itens não confirmados serão descartados.')) { ev.target.value='';return; }
      try {
        if (!/\.xlsx?$/i.test(f.name) || f.size > 20*1024*1024) throw new Error('Selecione uma planilha Excel de até 20 MB.');
        if (!window.XLSX) throw new Error('Leitor de Excel indisponível.');
        var wb = XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true}), l = [];
        wb.SheetNames.forEach(function(n) { l=l.concat(D.ler(XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:'',raw:true}),n)); });
        if (!l.length) throw new Error('Nenhum abastecimento encontrado no formato Posto, CNPJ, Data, Placa, KM, Combustível e ARLA.');
        var vistos = new Set(); arquivo=f.name;
        itens=l.filter(function(x) { if(vistos.has(x.referencia))return false;vistos.add(x.referencia);return true; }).map(function(x,i) {return Object.assign(x,{placa:(D.veiculo(x,db.veiculos)||{}).vplaca || x.placa,id:i+1,selecionado:false,editando:false});});
        el('combPlanAviso').textContent = arquivo + ' — diesel e ARLA separados; linhas totais ignoradas. Confira os produtos e os dados pendentes.';
        desenhar();
      } catch(e) { el('combPlanAviso').textContent=e.message; } finally { ev.target.value=''; }
    });
    el('combPlanTodos').addEventListener('change',function(ev) { selecionarTodos(ev.target.checked); });
    el('combPlanExcluir').addEventListener('click',excluirSelecionados);
    el('combPlanConfirmar').addEventListener('click',confirmar);
    el('combPlanSincronizar').addEventListener('click',sincronizar);
    function grupoDaTela(target) {
      var tr=target.closest('[data-grupo]');
      if (!tr) return [];
      var base=itens.find(function(x) { return x.id===Number(tr.dataset.grupo); });
      return base ? itens.filter(function(x) { return x.aba===base.aba && x.linha===base.linha; }) : [];
    }
    box.addEventListener('click',function(ev) {
      if(ocupado)return;
      var grupo=grupoDaTela(ev.target);if(!grupo.length)return;
      if(ev.target.closest('[data-confirmar]')) { confirmar(grupo);return; }
      if(ev.target.closest('[data-cancelar]')) { finalizarEdicao(grupo, true);desenhar();return; }
      if(ev.target.closest('[data-editar]')) { if(grupo[0].editando) finalizarEdicao(grupo, false);else iniciarEdicao(grupo);desenhar(); }
      if(!pendente && ev.target.closest('[data-excluir]') && confirm('Excluir este abastecimento da prévia, incluindo seus produtos?')) {itens=itens.filter(function(x){return grupo.indexOf(x)<0;});desenhar();}
    });
    box.addEventListener('change',function(ev) {
      if(ocupado)return;
      var grupo=grupoDaTela(ev.target);if(!grupo.length)return;
      var comum=ev.target.dataset.comum;
      if(comum) {
        grupo.forEach(function(x) {
          var value=ev.target.value;
          if(comum==='data') value=D.data(value) || value;
          if(comum==='km') value=D.numero(value);
          if(comum==='placa') value=(D.veiculo({placa:value},db.veiculos)||{}).vplaca || value;
          x[comum]=value;x.selecionado=false;
        });desenhar();return;
      }
      var cell=ev.target.closest('[data-item]');if(!cell)return;
      var x=itens.find(function(i){return i.id===Number(cell.dataset.item);});if(!x)return;
      if(ev.target.matches('[data-selecionar]')){x.selecionado=ev.target.checked;atualizarResumo();return;}
      var k=ev.target.dataset.campo;if(!k)return;
      x[k]=['litros','valorLitro'].indexOf(k)>=0 ? D.numero(ev.target.value):ev.target.value;
      if(k==='litros'||k==='valorLitro') x.totalCentavos=Math.round(x.litros*x.valorLitro*100);
      x.selecionado=false;desenhar();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',iniciar); else iniciar();
})();