/* Prévia local da planilha de viagens: nenhum registro é salvo ao ler o arquivo. */
(function () {
  'use strict';
  var itens = [], visiveis = [], nomeArquivo = '';
  function el(id) { return document.getElementById(id); }
  function texto(x) { return String(x == null ? '' : x).trim(); }
  function chave(x) { return texto(x).toUpperCase().replace(/\s+/g, ''); }
  function dinheiro(x) {
    if (typeof x === 'number') return isFinite(x) ? Math.round(x * 100) : NaN;
    var s = texto(x).replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return isFinite(Number(s)) ? Math.round(Number(s) * 100) : NaN;
  }
  function moeda(centavos) { return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function numero(x) { if (typeof x === 'number') return isFinite(x) ? x : 0; var s = texto(x).replace(/[^\d.,-]/g, ''); if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); return Number(s) || 0; }
  function escapar(x) { return texto(x).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function normalizar(x) { return texto(x).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function veiculoCadastrado(placa) {
    var codigo = normalizar(placa);
    if (!codigo || typeof db === 'undefined' || !Array.isArray(db.veiculos)) return null;
    return db.veiculos.find(function (v) { return normalizar(v.vplaca) === codigo; }) || null;
  }
  function preencherVinculoVeiculo(placa, atualizarMotorista) {
    var cadastro = veiculoCadastrado(placa);
    var tipo = el('resProdTipoVeiculo'), motorista = el('resProdMotorista');
    if (tipo) tipo.value = cadastro ? texto(cadastro.vtipo) : '';
    if (atualizarMotorista && motorista) {
      motorista.value = cadastro ? texto(cadastro.vmotorista) : '';
      motorista.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return cadastro;
  }
  function celula(row, idx) { return texto((row || [])[idx]); }
  function numeroComparacao(x) {
    var s = texto(x);
    if (!s) return '';
    if (typeof x === 'number') return isFinite(x) ? String(x) : s;
    s = s.replace(/R\$\s*/g, '').replace(/\s/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return isFinite(Number(s)) ? String(Number(s)) : texto(x);
  }
  function ler(rows) {
    var porRegistro = new Map(), viagem = '', placa = '', linha = '', colunas = null;
    rows.forEach(function (row) {
      var primeiro = celula(row, 0), tipo = primeiro.toLowerCase();
      if (tipo === 'viagem') { viagem = celula(row, 1); placa = ''; linha = ''; colunas = null; return; }
      if (tipo === 'veículo' || tipo === 'veiculo') { placa = celula(row, 1); return; }
      if (tipo === 'linha') { linha = celula(row, 1); return; }
      if (tipo === 'cte' || tipo === 'ct-e') {
        var nomes = row.map(function (v) { return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); });
        colunas = { cte: 0, volume: nomes.indexOf('volume'), peso: nomes.indexOf('peso'), pesoTaxado: nomes.indexOf('peso taxado'), frete: nomes.indexOf('valor do frete'), origem: nomes.indexOf('cidade origem'), ufOrigem: nomes.indexOf('estado origem'), destino: nomes.indexOf('cidade destino'), ufDestino: nomes.indexOf('estado destino') };
        if (colunas.frete < 0) colunas = null;
        return;
      }
      if (!colunas || !primeiro || !viagem || !placa) return;
      var frete = dinheiro((row || [])[colunas.frete]);
      var origem = celula(row, colunas.origem), destino = celula(row, colunas.destino);
      var registro = { cte: primeiro, placa: placa, frete: frete, peso: numero((row || [])[colunas.peso]), pesoTaxado: numero((row || [])[colunas.pesoTaxado]), origem: origem + (celula(row, colunas.ufOrigem) ? '-' + celula(row, colunas.ufOrigem) : ''), destino: destino + (celula(row, colunas.ufDestino) ? '-' + celula(row, colunas.ufDestino) : ''), viagens: [viagem], linhas: [linha], divergente: false };
       registro.volume = celula(row, colunas.volume);
       // Guardar cada coluna separadamente: cidade/UF concatenadas e pesos arredondados não provam igualdade.
       var campos = ['cte', 'volume', 'peso', 'pesoTaxado', 'frete', 'origem', 'ufOrigem', 'destino', 'ufDestino'];
       registro.camposComparacao = campos.every(function (campo) { return colunas[campo] >= 0; }) ? campos.map(function (campo) {
         var valor = (row || [])[colunas[campo]];
         return ['volume', 'peso', 'pesoTaxado', 'frete'].indexOf(campo) >= 0 ? numeroComparacao(valor) : texto(valor);
       }) : null;
      registro.chave = identidade(registro);
       var chaveRegistro = registro.chave || registro;
       if (!porRegistro.has(chaveRegistro)) porRegistro.set(chaveRegistro, registro);
    });
    return Array.from(porRegistro.values());
  }
  function identidade(item) {
    if (!Array.isArray(item.camposComparacao) || item.camposComparacao.length !== 9) return '';
    return JSON.stringify([item.camposComparacao, normalizar(item.placa), texto((item.viagens || [])[0]), texto((item.linhas || [])[0])]);
  }
   function mesmaProducao(p, item, competencia) {
    var codigo = identidade(item);
     var comp = competencia || item.competencia || (el('resPlanilhaCompetencia') || {}).value || '';
     var existente = p.competencia || texto(p.dataInicio).slice(0,7);
    // Sem as nove colunas guardadas (inclusive Volume), não há prova de repetição idêntica.
     return !!comp && existente === comp && !!codigo && !!p.planilhaImportacao && identidade(p.planilhaImportacao) === codigo;
  }
  function jaExiste(item) {
    return typeof db !== 'undefined' && Array.isArray(db.producoes) && db.producoes.some(function (p) { return mesmaProducao(p, item); });
  }
  window.fmPlanilhaProducaoDuplicada = mesmaProducao;
  function guardarIdentidade(item) {
    var campo = el('resProdPlanilhaDados');
    if (campo) campo.value = JSON.stringify(item);
  }
  var selecionados = new Set();
  function podarSelecao() {
    Array.from(selecionados).forEach(function (x) { if (visiveis.indexOf(x) < 0) selecionados.delete(x); });
  }
  function removerItens(lista) {
    lista = lista.filter(Boolean);
    if (!lista.length) return;
    lista.forEach(function (x) { selecionados.delete(x); });
    itens = itens.filter(function (y) { return lista.indexOf(y) < 0; });
    desenhar();
  }
  function atualizarAcoes() {
    var botao = el('resPlanilhaExcluirSel'), tudo = el('resPlanilhaTudo');
    if (botao) {
      botao.disabled = !selecionados.size;
      botao.textContent = selecionados.size ? 'Excluir selecionadas (' + selecionados.size + ')' : 'Excluir selecionadas';
    }
    if (tudo) tudo.checked = visiveis.length > 0 && selecionados.size === visiveis.length;
  }
  function desenhar() {
    var container = el('resPlanilhaPrevia'); if (!container) return;
    visiveis = itens.filter(function (x) { return !jaExiste(x); });
    podarSelecao();
    var aceitos = visiveis.filter(function (x) { return !x.divergente && x.frete > 0; });
    var total = aceitos.reduce(function (sum, x) { return sum + x.frete; }, 0);
    el('resPlanilhaResumo').textContent = visiveis.length ? nomeArquivo + ' · ' + visiveis.length + ' CT-e na prévia · ' + aceitos.length + ' disponíveis · ' + moeda(total) + ' em Valor do Frete' : 'Nenhuma viagem pendente nesta planilha.';
    el('resPlanilhaAviso').textContent = visiveis.length ? 'Valor da viagem não entra na receita. Só são removidas repetições com CT-e, Volume, Peso, Peso Taxado, Valor do Frete, cidades e estados de origem e destino iguais, no mesmo veículo e contexto da viagem. Sem todas as colunas para comparação, o registro é mantido. Confira os dados antes de salvar.' : '';
    el('resPlanilhaLinhas').innerHTML = visiveis.map(function (x, i) {
      var motivo = x.divergente ? 'Divergência: conferir' : !(x.frete > 0) ? 'Frete ausente/zero' : 'Disponível';
      var marca = selecionados.has(x) ? ' checked' : '';
      return '<tr><td class="cus-td-check"><input type="checkbox" data-planilha-check="' + i + '"' + marca + ' aria-label="Selecionar CT-e ' + escapar(x.cte) + '"></td><td>' + escapar(x.cte) + '</td><td>' + escapar(x.placa) + '</td><td>' + escapar(x.viagens.join(', ')) + '</td><td>' + escapar(x.origem) + ' → ' + escapar(x.destino) + '</td><td>' + escapar(x.volume) + '</td><td>' + x.peso.toLocaleString('pt-BR', {maximumFractionDigits:3}) + '</td><td>' + x.pesoTaxado.toLocaleString('pt-BR', {maximumFractionDigits:3}) + '</td><td>' + (isFinite(x.frete) ? moeda(x.frete) : '—') + '</td><td>' + motivo + '</td><td>' + (motivo === 'Disponível' ? '<button type="button" class="btn btn-sm btn-outline-primary" data-planilha-indice="' + i + '">Preencher formulário</button>' : '—') + '</td><td><button type="button" class="btn btn-sm btn-outline-danger" data-planilha-excluir="' + i + '" aria-label="Excluir CT-e ' + escapar(x.cte) + ' da prévia">Excluir</button></td></tr>';
    }).join('');
    atualizarAcoes();
    container.querySelector('.cus-table-wrap').hidden = !visiveis.length;
    var acoes = el('resPlanilhaAcoes'); if (acoes) acoes.hidden = !visiveis.length;
    container.hidden = false;
  }
   window.addEventListener('fm:producao-salva', function (ev) {
    if (!itens.length) return;
     var salvo = ev.detail && ev.detail.planilhaImportacao;
     var restantes = itens.filter(function (x) { return !(salvo && salvo.previaId && salvo.previaId === x.previaId) && !jaExiste(x); });
    if (restantes.length === itens.length) return;
    itens = restantes;
    desenhar();
  });
  function preencher(item) {
    if (!item || item.divergente || jaExiste(item) || !(item.frete > 0)) return;
    if (el('resProdId') && el('resProdId').value && !confirm('Há uma edição aberta. Descartar as alterações do formulário?')) return;
    if (typeof window.limparProducaoFrota === 'function') window.limparProducaoFrota();
    var cadastro = veiculoCadastrado(item.placa), agora = new Date();
     var competencia = (el('resPlanilhaCompetencia') || {}).value || agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');
    var valores = {resProdTipo:'viagem',resProdVeiculo:cadastro ? cadastro.vplaca : item.placa,resProdCompetencia:competencia,resProdDocumento:'CT-e ' + item.cte,resProdOrigem:item.origem,resProdDestino:item.destino,resProdTon:item.peso ? String(item.peso) : '',resProdReceita:moeda(item.frete),resProdObs:'Planilha: ' + nomeArquivo + ' | Viagem(ns): ' + item.viagens.join(', ') + (item.linhas.filter(Boolean).length ? ' | Linha(s): ' + item.linhas.filter(Boolean).join('; ') : '')};
    Object.keys(valores).forEach(function (id) { var campo = el(id); if (campo) { campo.value = valores[id]; campo.dispatchEvent(new Event('input', { bubbles: true })); } });
    guardarIdentidade(item);
    preencherVinculoVeiculo(valores.resProdVeiculo, true);
    el('resProdData').focus();
    el('resProdData').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* Lançamento em lote: preenche o formulário existente e salva por salvarProducaoFrota, um CT-e por vez. */
  var lancando = false;
  function ultimoDia(comp) { var p = comp.split('-'); return comp + '-' + String(new Date(Number(p[0]), Number(p[1]), 0).getDate()).padStart(2, '0'); }
  function lancarUm(item, comp) {
    if (item.divergente) return Promise.resolve('Divergência na planilha');
    if (!(item.frete > 0)) return Promise.resolve('Valor do frete ausente ou zero');
    if (jaExiste(item)) return Promise.resolve('Viagem idêntica já lançada');
    var cadastro = veiculoCadastrado(item.placa);
    if (!cadastro) return Promise.resolve('Veículo ' + item.placa + ' não está no cadastro');
    if (typeof window.limparProducaoFrota === 'function') window.limparProducaoFrota();
    var valores = {resProdTipo:'viagem',resProdVeiculo:cadastro.vplaca,resProdCompetencia:comp,resProdData:comp + '-01',resProdFim:ultimoDia(comp),resProdDocumento:'CT-e ' + item.cte,resProdOrigem:item.origem,resProdDestino:item.destino,resProdTon:item.peso ? String(item.peso) : '',resProdReceita:moeda(item.frete),resProdObs:'Planilha: ' + nomeArquivo + ' | Viagem(ns): ' + item.viagens.join(', ') + (item.linhas.filter(Boolean).length ? ' | Linha(s): ' + item.linhas.filter(Boolean).join('; ') : '')};
    Object.keys(valores).forEach(function (id) { var campo = el(id); if (campo) { campo.value = valores[id]; campo.dispatchEvent(new Event('input', { bubbles: true })); } });
    guardarIdentidade(item);
    preencherVinculoVeiculo(cadastro.vplaca, true);
    var km = el('resProdKm'); if (km) km.value = '';
    var calc = typeof window.calcularKmProducao === 'function' ? window.calcularKmProducao() : null;
    return Promise.resolve(calc).then(function (ok) {
      if (!ok || !(Number(el('resProdKm') && el('resProdKm').value) > 0)) { if (window.limparProducaoFrota) window.limparProducaoFrota(); return 'KM não calculado pela rota'; }
      var aviso = '', alertaOriginal = window.alert;
      window.alert = function (m) { aviso = String(m || ''); };
       var gravacao;
       try { gravacao = window.salvarProducaoFrota(); } catch (e) { aviso = e.message || 'Erro ao salvar'; }
       return Promise.resolve(gravacao).then(function (ok) {
         if (ok === true) return '';
         if (window.limparProducaoFrota) window.limparProducaoFrota();
         return aviso || 'Não foi salvo';
       }).finally(function () { window.alert = alertaOriginal; });
    });
  }
  function lancarTodos() {
    if (lancando) return;
    var comp = (el('resPlanilhaCompetencia') || {}).value || '';
    if (!/^\d{4}-\d{2}$/.test(comp)) { alert('Escolha o mês de competência.'); return; }
    if (typeof window.salvarProducaoFrota !== 'function') { alert('Formulário de produção indisponível.'); return; }
    if (el('resProdId') && el('resProdId').value && !confirm('Há uma edição aberta. Descartar as alterações do formulário?')) return;
    var fila = visiveis.slice(); if (!fila.length) return;
    if (!confirm('Lançar ' + fila.length + ' CT-e na competência ' + comp.split('-').reverse().join('/') + '? Os que tiverem erro ficam na prévia para lançar manualmente.')) return;
    lancando = true;
    var botao = el('resPlanilhaLancar'), saida = el('resPlanilhaResultado'), ok = [], erros = [];
    if (botao) botao.disabled = true;
    var i = 0;
    function proximo() {
      if (i >= fila.length) return Promise.resolve();
      var item = fila[i++];
      if (saida) saida.textContent = 'Lançando ' + i + ' de ' + fila.length + ' (CT-e ' + item.cte + ')...';
      return lancarUm(item, comp).then(function (erro) { if (erro) erros.push({ item: item, erro: erro }); else ok.push(item); }, function () { erros.push({ item: item, erro: 'Erro inesperado' }); }).then(proximo);
    }
    proximo().then(function () {
      lancando = false; if (botao) botao.disabled = false;
      desenhar();
      var total = ok.reduce(function (s, x) { return s + x.frete; }, 0);
      if (saida) saida.innerHTML = '<strong>' + ok.length + ' lançado(s) com sucesso</strong> (' + moeda(total) + ') · <strong>' + erros.length + ' com erro</strong>' + (erros.length ? ' — ficaram na prévia para lançar manualmente:<ul>' + erros.map(function (e) { return '<li>CT-e ' + escapar(e.item.cte) + ': ' + escapar(e.erro) + '</li>'; }).join('') + '</ul>' : '.');
    });
  }
  function montarLote(box) {
    var previa = box.querySelector('#resPlanilhaPrevia'); if (!previa || el('resPlanilhaLote')) return;
    var agora = new Date(), comp = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');
    var div = document.createElement('div'); div.id = 'resPlanilhaLote'; div.className = 'cus-note';
    div.innerHTML = '<label for="resPlanilhaCompetencia" class="form-label-mini">Mês de competência para todos</label> <input id="resPlanilhaCompetencia" type="month" class="form-control" style="display:inline-block;width:auto" value="' + comp + '" data-nao-limpar="1"> <button type="button" id="resPlanilhaLancar" class="btn btn-sm btn-primary">Calcular KM e lançar todos</button><div id="resPlanilhaResultado" aria-live="polite" style="margin-top:6px"></div>';
    previa.insertBefore(div, previa.firstChild);
    el('resPlanilhaLancar').addEventListener('click', lancarTodos);
     el('resPlanilhaCompetencia').addEventListener('change', desenhar);
  }
  function iniciar() {
    var pane = el('cusPane-producao'); if (!pane || el('resPlanilhaArquivo')) return;
    var formulario = pane.querySelector('.cus-form-wrap'); if (!formulario) return;
    var dados = document.createElement('input'); dados.type = 'hidden'; dados.id = 'resProdPlanilhaDados'; formulario.appendChild(dados);
    var campoVeiculo = el('resProdVeiculo');
    if (campoVeiculo) {
      campoVeiculo.addEventListener('change', function () { preencherVinculoVeiculo(campoVeiculo.value, true); });
      campoVeiculo.addEventListener('input', function () {
        var cadastro = veiculoCadastrado(campoVeiculo.value);
        var tipo = el('resProdTipoVeiculo');
        if (tipo) tipo.value = cadastro ? texto(cadastro.vtipo) : '';
      });
    }
    var box = document.createElement('section'); box.className = 'cus-planilha';
    box.innerHTML = '<h5>Prévia de viagens por CT-e</h5><label for="resPlanilhaArquivo" class="form-label-mini">Planilha de viagens (.xlsx)</label><input id="resPlanilhaArquivo" type="file" accept=".xlsx,.xls" class="form-control" data-nao-limpar="1"><div id="resPlanilhaPrevia" hidden><p id="resPlanilhaResumo" class="cus-note" aria-live="polite"></p><p id="resPlanilhaAviso" class="cus-note"></p><div id="resPlanilhaAcoes" class="cus-planilha-acoes" hidden><button type="button" id="resPlanilhaExcluirSel" class="btn btn-sm btn-outline-danger" disabled>Excluir selecionadas</button></div><div class="cus-table-wrap"><table class="table cus-table" data-sem-relatorio="1"><thead><tr><th class="cus-th-check"><input type="checkbox" id="resPlanilhaTudo" aria-label="Selecionar todas as linhas da prévia"></th><th>CT-e</th><th>Veículo</th><th>Viagens</th><th>Rota do CT-e</th><th>Volume</th><th>Peso (kg)</th><th>Peso taxado (kg)</th><th>Valor do Frete</th><th>Situação</th><th></th><th></th></tr></thead><tbody id="resPlanilhaLinhas"></tbody></table></div></div>';
    pane.insertBefore(box, formulario);
    montarLote(box);
    el('resPlanilhaArquivo').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0]; if (!file) return;
      nomeArquivo = file.name; itens = []; selecionados.clear(); el('resPlanilhaPrevia').hidden = true;
      if (!/\.xlsx?$/i.test(file.name) || file.size > 10 * 1024 * 1024) { alert('Selecione uma planilha Excel de até 10 MB.'); ev.target.value = ''; return; }
      file.arrayBuffer().then(function (buffer) {
        if (!window.XLSX) throw new Error('Leitor de Excel indisponível.');
        var wb = XLSX.read(buffer, { type: 'array' }), sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new Error('A planilha não tem dados.');
        var resultado = ler(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }));
         if (!resultado.length) throw new Error('Nenhum CT-e com a coluna Valor do Frete foi encontrado.');
          itens = resultado; itens.forEach(function(x,i){x.previaId=Date.now().toString(36)+'-'+i+'-'+Math.random().toString(36).slice(2);});desenhar();
      }).catch(function (err) { alert('Não foi possível ler a planilha: ' + err.message); }).finally(function () { ev.target.value = ''; });
    });
    box.addEventListener('click', function (ev) {
      if (ev.target.closest('#resPlanilhaExcluirSel')) { removerItens(Array.from(selecionados)); return; }
      var excluir = ev.target.closest('[data-planilha-excluir]');
      if (excluir) { removerItens([visiveis[Number(excluir.dataset.planilhaExcluir)]]); return; }
      var botao = ev.target.closest('[data-planilha-indice]');
      if (botao) preencher(visiveis[Number(botao.dataset.planilhaIndice)]);
    });
    box.addEventListener('change', function (ev) {
      var alvo = ev.target;
      if (alvo.id === 'resPlanilhaTudo') {
        selecionados.clear();
        if (alvo.checked) visiveis.forEach(function (x) { selecionados.add(x); });
        desenhar();
        return;
      }
      if (alvo.matches && alvo.matches('[data-planilha-check]')) {
        var item = visiveis[Number(alvo.dataset.planilhaCheck)];
        if (item) { if (alvo.checked) selecionados.add(item); else selecionados.delete(item); }
        atualizarAcoes();
      }
    });
  }
  new MutationObserver(iniciar).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();