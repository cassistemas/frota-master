/* Conferência local de viagens: toda confirmação passa pelo formulário e por salvarFrete. */
(function () {
  'use strict';
  var itens = [], nomeArquivo = '', ocupado = false, pagina = 1, porPagina = 25;
  var resumo = { receita: 0, prontos: 0 }, quantidadeSelecionada = 0;
  function indices() {
    var veiculos = new Map(), terceiros = new Map(), rotulos = new Set(), ctes = new Set();
    lista('veiculos').forEach(function (v) { var p = normalizar(v.vplaca); if (p && !veiculos.has(p)) veiculos.set(p, v); });
    lista('terceiros').forEach(function (t) { var p = normalizar(t.terplaca); rotulos.add(rotulo(t)); if (p) { if (!terceiros.has(p)) terceiros.set(p, []); terceiros.get(p).push(t); } });
    lista('fretes').forEach(function (f) {
      if (f.freplanilha) ctes.add(normalizar(f.freplanilha.cte));
      var encontrados = texto(f.freobs).matchAll(/\bCT[- ]?E\s*[:#]?\s*([A-Z0-9]+(?:[-./][A-Z0-9]+)*)/gi);
      for (var a of encontrados) ctes.add(normalizar(a[1]));
    });
    return { veiculos: veiculos, terceiros: terceiros, rotulos: rotulos, ctes: ctes };
  }
  function el(id) { return document.getElementById(id); }
  function texto(x) { return String(x == null ? '' : x).trim(); }
  function normalizar(x) { return texto(x).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function chave(x) { return texto(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }
  function escapar(x) { return texto(x).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function dinheiro(x) {
    if (typeof x === 'number') return isFinite(x) ? Math.round(x * 100) : NaN;
    var s = texto(x).replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return isFinite(Number(s)) ? Math.round(Number(s) * 100) : NaN;
  }
  function moeda(c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function valor(c) { return isFinite(c) ? (c / 100).toFixed(2).replace('.', ',') : ''; }
  function numero(x) { return typeof x === 'number' ? x : Number(texto(x).replace(/\./g, '').replace(',', '.')) || 0; }
  function lista(k) { return typeof db !== 'undefined' && Array.isArray(db[k]) ? db[k] : []; }
  function celula(row, i) { return i < 0 ? '' : texto((row || [])[i]); }
  function rotulo(t) { return (t.terempresa || t.ternome || t.terproprietario || 'Terceiro') + (t.terplaca ? ' — ' + t.terplaca : ''); }
  function identificar(item, base) {
    base = base || indices();
    var p = normalizar(item.placa), v = base.veiculos.get(p), ts = base.terceiros.get(p) || [];
    return { veiculo: v, terceiro: ts.length === 1 ? ts[0] : null, propria: !!v, ambiguo: ts.length > 1 };
  }
  function periodo(item, comp) {
    item.competencia = comp;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) { item.inicio = ''; item.fim = ''; item.data = ''; return; }
    var partes = comp.split('-'), ultimo = new Date(Number(partes[0]), Number(partes[1]), 0).getDate();
    item.inicio = comp + '-01'; item.fim = comp + '-' + ultimo; item.data = item.inicio;
  }
  function ler(rows) {
    var porCte = new Map(), grupos = new Map(), viagem = '', placa = '', linha = '', colunas = null;
    function grupo() {
      var id = normalizar(viagem) + '|' + normalizar(placa);
      if (!grupos.has(id)) grupos.set(id, { id: id, valores: [], itens: [] });
      return grupos.get(id);
    }
    function registrarValor(g, v) { var c = dinheiro(v); if (isFinite(c) && c >= 0 && g.valores.indexOf(c) < 0) g.valores.push(c); }
    rows.forEach(function (row) {
      var primeiro = celula(row, 0), tipo = chave(primeiro);
      if (tipo === 'viagem') { viagem = celula(row, 1); placa = ''; linha = ''; colunas = null; }
      if (tipo === 'veiculo') placa = celula(row, 1);
      if (tipo === 'linha') linha = celula(row, 1);
      // Valor da Viagem é um total da viagem, nunca uma receita adicional por CT-e.
      row.forEach(function (v, j) { if (chave(v).replace(/:$/, '') === 'valor da viagem' && viagem && placa) registrarValor(grupo(), row[j + 1]); });
      if (tipo === 'viagem' || tipo === 'veiculo' || tipo === 'linha') return;
      if (tipo === 'cte' || tipo === 'ct-e') {
        var nomes = row.map(chave);
        colunas = { peso: nomes.indexOf('peso'), frete: nomes.indexOf('valor do frete'), custo: nomes.indexOf('valor da viagem'), origem: nomes.indexOf('cidade origem'), ufOrigem: nomes.indexOf('estado origem'), destino: nomes.indexOf('cidade destino'), ufDestino: nomes.indexOf('estado destino') };
        if (colunas.frete < 0 || colunas.origem < 0 || colunas.ufOrigem < 0 || colunas.destino < 0 || colunas.ufDestino < 0) colunas = null;
        return;
      }
      if (!colunas || !primeiro || !viagem || !placa || /^(total|subtotal|valor da viagem)/.test(tipo)) return;
      // Rodapés e rótulos não são documentos: CT-e precisa de referência com dígitos.
      if (!/\d/.test(primeiro) || !/^[A-Z0-9\s./-]+$/i.test(primeiro)) return;
      var frete = dinheiro(row[colunas.frete]);
      if (!normalizar(primeiro)) return;
      var g = grupo(); if (colunas.custo >= 0) registrarValor(g, row[colunas.custo]);
      var origem = celula(row, colunas.origem), ufo = celula(row, colunas.ufOrigem).toUpperCase();
      var destino = celula(row, colunas.destino), ufd = celula(row, colunas.ufDestino).toUpperCase();
      var registro = { cte: primeiro, placa: placa, frete: frete, peso: numero(row[colunas.peso]), origem: origem && ufo ? origem + '-' + ufo : '', destino: destino && ufd ? destino + '-' + ufd : '', viagens: [viagem], linhas: [linha], grupos: [g.id], divergente: false, selecionado: false, competencia: '', data: '', inicio: '', fim: '', custo: NaN, custoManual: false, aceitarRateio: false, terceiro: '' };
      var id = normalizar(primeiro), anterior = porCte.get(id);
      if (!anterior) { porCte.set(id, registro); g.itens.push(registro); return; }
      if (anterior.viagens.indexOf(viagem) < 0) anterior.viagens.push(viagem);
      if (linha && anterior.linhas.indexOf(linha) < 0) anterior.linhas.push(linha);
      if (anterior.grupos.indexOf(g.id) < 0) { anterior.grupos.push(g.id); g.itens.push(anterior); }
      if (anterior.frete !== frete || normalizar(anterior.placa) !== normalizar(placa) || anterior.origem !== registro.origem || anterior.destino !== registro.destino || anterior.peso !== registro.peso) anterior.divergente = true;
    });
    grupos.forEach(function (g) {
      if (g.valores.length !== 1 || !g.itens.length || g.itens.some(function (x) { return x.divergente || x.grupos.length !== 1 || !(x.frete > 0); })) return;
      var total = g.itens.reduce(function (s, x) { return s + x.frete; }, 0), sobra = g.valores[0];
      g.itens.forEach(function (x, i) { x.custo = i === g.itens.length - 1 ? sobra : Math.floor(g.valores[0] * x.frete / total); sobra -= x.custo; x.totalViagem = g.valores[0]; x.rateioQuantidade = g.itens.length; });
    });
    return Array.from(porCte.values());
  }
  function jaExiste(item, base) { return (base || indices()).ctes.has(normalizar(item.cte)); }
  function terceiroItem(item, cadastro) { return item.terceiro || (cadastro.terceiro ? rotulo(cadastro.terceiro) : ''); }
  function dataValida(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v; }
  function motivo(item, base) {
    base = base || indices();
    if (jaExiste(item, base)) return 'Duplicado: já cadastrado';
    if (item.divergente) return 'Divergência entre CT-e repetidos';
    if (!(item.frete > 0)) return 'Informe a receita';
    if (!normalizar(item.placa)) return 'Informe a placa';
    if (!/^.+-[A-Z]{2}$/.test(item.origem) || !/^.+-[A-Z]{2}$/.test(item.destino)) return 'Confira cidade/UF';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(item.competencia)) return 'Informe a competência';
    if (!dataValida(item.data) || !dataValida(item.inicio) || !dataValida(item.fim) || item.inicio > item.fim) return 'Confira data e período';
    var c = identificar(item, base);
    if (c.propria && texto(c.veiculo.vstatus).toUpperCase() === 'VENDIDO') return 'Veículo vendido: conferir cadastro';
    if (!c.propria) {
      if (item.terceiro && !base.rotulos.has(item.terceiro)) return 'Terceiro selecionado indisponível';
      if (!item.terceiro && c.ambiguo) return 'Mais de um terceiro nesta placa: escolha em Editar';
      if (!isFinite(item.custo) || item.custo < 0) return 'Informe o valor pago ao terceiro';
      if (!item.custoManual && !item.aceitarRateio) return 'Confirme Valor da Viagem como pagamento';
    }
    return 'Pronto';
  }
  function campo(id, v) { var e = el(id); if (e) { e.value = v == null ? '' : v; e.dispatchEvent(new Event('change', { bubbles: true })); } }
  function mensagem(s) { if (el('frePlanilhaMensagem')) el('frePlanilhaMensagem').textContent = s; }
  function atualizarSelecao() {
    el('frePlanilhaResumo').textContent = nomeArquivo + ' — ' + itens.length + ' CT-e únicos · Receita: ' + moeda(resumo.receita) + ' · ' + quantidadeSelecionada + ' selecionado(s) · ' + resumo.prontos + ' pronto(s).';
    el('frePlanilhaTodos').checked = !!itens.length && quantidadeSelecionada === itens.length;
    el('frePlanilhaTodos').indeterminate = quantidadeSelecionada > 0 && quantidadeSelecionada < itens.length;
    el('frePlanilhaLista').querySelectorAll('[data-selecao]').forEach(function (e) { e.checked = !!itens[Number(e.dataset.selecao)].selecionado; });
  }
  function render() {
    if (!el('frePlanilhaLista')) return;
    var base = indices(), situacoes = new Map();
    resumo = { receita: 0, prontos: 0 }; quantidadeSelecionada = 0;
    itens.forEach(function (x) {
      var m = motivo(x, base); situacoes.set(x, m);
      resumo.receita += isFinite(x.frete) ? x.frete : 0;
      if (x.selecionado) quantidadeSelecionada++; if (m === 'Pronto') resumo.prontos++;
    });
    var paginas = Math.max(1, Math.ceil(itens.length / porPagina)); pagina = Math.min(Math.max(1, pagina), paginas);
    var inicio = (pagina - 1) * porPagina;
    el('frePlanilhaLista').innerHTML = itens.slice(inicio, inicio + porPagina).map(function (x, pos) {
      var i = inicio + pos, c = identificar(x, base), m = situacoes.get(x);
      return '<tr><td><input type="checkbox" data-selecao="' + i + '" aria-label="Selecionar CT-e ' + escapar(x.cte) + '" ' + (x.selecionado ? 'checked ' : '') + (ocupado ? 'disabled' : '') + '></td><td>' + escapar(x.viagens.join(', ')) + '<br><b>CT-e ' + escapar(x.cte) + '</b></td><td>' + escapar(x.placa) + '<br>' + (c.propria ? 'Frota própria' : 'Terceiro') + '<br><small>' + escapar(c.propria ? c.veiculo.vmodelo || '' : terceiroItem(x, c) || 'Pré-cadastro pela placa ao confirmar') + '</small></td><td>' + escapar(x.origem) + '<br>→ ' + escapar(x.destino) + '</td><td>' + (isFinite(x.frete) ? moeda(x.frete) : 'Pendente') + '</td><td>' + (c.propria ? 'Não se aplica' : isFinite(x.custo) ? moeda(x.custo) : 'Pendente') + (x.rateioQuantidade > 1 && !x.custoManual && !c.propria ? '<br><small>Rateio sugerido (' + x.rateioQuantidade + ' CT-e)</small>' : '') + '</td><td>' + (c.propria || !isFinite(x.custo) ? '—' : moeda(x.frete - x.custo)) + '</td><td>' + escapar(x.competencia || 'Pendente') + '<br><small>' + escapar(x.inicio) + ' → ' + escapar(x.fim) + '</small></td><td>' + escapar(m) + '</td><td><button type="button" class="btn btn-sm btn-success" data-confirmar="' + i + '" ' + (ocupado ? 'disabled' : '') + '>Confirmar</button> <button type="button" class="btn btn-sm btn-outline-primary" data-editar="' + i + '" ' + (ocupado ? 'disabled' : '') + '>Editar</button> <button type="button" class="btn btn-sm btn-outline-danger" data-remover="' + i + '" ' + (ocupado ? 'disabled' : '') + '>Remover</button></td></tr>';
    }).join('') || '<tr><td colspan="10">Escolha a planilha para iniciar a conferência.</td></tr>';
    atualizarSelecao();
    if (el('frePlanilhaPagina')) el('frePlanilhaPagina').textContent = 'Página ' + pagina + ' de ' + paginas + ' · até ' + porPagina + ' CT-e por página. Selecionar todos inclui todas as páginas.';
    if (el('frePlanilhaAnterior')) el('frePlanilhaAnterior').disabled = ocupado || pagina === 1;
    if (el('frePlanilhaProxima')) el('frePlanilhaProxima').disabled = ocupado || pagina === paginas;
    el('frePlanilhaBox').querySelectorAll('[data-lote], #frePlanilhaArquivo, #frePlanilhaTodos, #frePlanilhaCompetencia').forEach(function (e) { e.disabled = ocupado; });
  }
  function editar(i) {
    var x = itens[i]; if (!x || ocupado) return;
    var c = identificar(x), host = el('frePlanilhaEditor'); host.hidden = false; host.dataset.indice = i;
    function input(id, label, tipo, v) { return '<div class="col-md-3"><label for="' + id + '" class="form-label-mini">' + label + '</label><input id="' + id + '" class="form-control" type="' + tipo + '" value="' + escapar(v) + '"></div>'; }
    host.innerHTML = '<h6>Conferir CT-e ' + escapar(x.cte) + '</h6><div class="row g-2">' + input('frePEPlaca', 'Placa (classificação automática)', 'text', x.placa) + input('frePEOrigem', 'Cidade-UF de origem', 'text', x.origem) + input('frePEDestino', 'Cidade-UF de destino', 'text', x.destino) + input('frePEReceita', 'Receita do frete (R$)', 'text', valor(x.frete)) + input('frePECusto', 'Pago ao terceiro (R$)', 'text', valor(x.custo)) + input('frePECompetencia', 'Competência', 'month', x.competencia) + input('frePEData', 'Data do lançamento', 'date', x.data) + input('frePEInicio', 'Início do período de referência', 'date', x.inicio) + input('frePEFim', 'Fim do período de referência', 'date', x.fim) + '<div class="col-md-6"><label for="frePETerceiro" class="form-label-mini">Terceiro contratado (somente para placa não cadastrada na frota)</label><select id="frePETerceiro" class="form-select"><option value="">Automático pela placa (pré-cadastro se necessário)</option>' + lista('terceiros').map(function (t) { var r = rotulo(t); return '<option value="' + escapar(r) + '"' + (r === terceiroItem(x, c) ? ' selected' : '') + '>' + escapar(r) + '</option>'; }).join('') + '</select></div></div><p class="cus-note">Valor da Viagem é tratado apenas como sugestão de pagamento. Quando há vários CT-e, o total é distribuído proporcionalmente à receita, em centavos, sem repetir o custo. Confira o total contratado; se estiver ambíguo, informe o pagamento real de cada CT-e.</p><label><input type="checkbox" id="frePEAceitar" ' + (x.custoManual || x.aceitarRateio ? 'checked' : '') + '> Confirmo o valor pago ao terceiro deste CT-e</label><br>' + (x.divergente ? '<label><input type="checkbox" id="frePEResolver"> Revisei as divergências entre as linhas repetidas e confirmo estes dados</label><br>' : '') + '<button type="button" class="btn btn-primary mt-2" id="frePESalvar">Aplicar à prévia</button> <button type="button" class="btn btn-outline-secondary mt-2" id="frePECancelar">Cancelar edição</button>';
    el('frePECompetencia').onchange = function () { var temp = {}; periodo(temp, this.value); campo('frePEData', temp.data); campo('frePEInicio', temp.inicio); campo('frePEFim', temp.fim); };
    el('frePECancelar').onclick = function () { host.hidden = true; host.innerHTML = ''; };
    el('frePESalvar').onclick = function () {
      if (ocupado) return;
      var custoNovo = dinheiro(el('frePECusto').value);
      x.placa = texto(el('frePEPlaca').value); x.origem = texto(el('frePEOrigem').value).replace(/\s*[-/]\s*([a-z]{2})$/i, function (_, uf) { return '-' + uf.toUpperCase(); });
      x.destino = texto(el('frePEDestino').value).replace(/\s*[-/]\s*([a-z]{2})$/i, function (_, uf) { return '-' + uf.toUpperCase(); });
      x.frete = dinheiro(el('frePEReceita').value); x.custoManual = x.custoManual || custoNovo !== x.custo; x.custo = custoNovo;
      x.aceitarRateio = el('frePEAceitar').checked; x.custoManual = x.custoManual && x.aceitarRateio;
      x.competencia = el('frePECompetencia').value; x.data = el('frePEData').value; x.inicio = el('frePEInicio').value; x.fim = el('frePEFim').value; x.terceiro = el('frePETerceiro').value;
      if (el('frePEResolver') && el('frePEResolver').checked) x.divergente = false;
      host.hidden = true; host.innerHTML = ''; render();
    };
    host.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function preencher(item) {
    if (window.FMCompetenciaDespesas) window.FMCompetenciaDespesas.montar();
    var c = identificar(item);
    if (!c.propria && !item.terceiro) {
      if (typeof window.fmPrepararTerceiroPlanilha !== 'function') throw new Error('Pré-cadastro de terceiros indisponível. Recarregue a página.');
      await window.fmPrepararTerceiroPlanilha(item.placa);
      c = identificar(item);
    }
    campo('fre_idx', ''); campo('freexecucao', c.propria ? 'propria' : 'terceiro');
    if (typeof window.alternarExecucaoFrete === 'function') window.alternarExecucaoFrete();
    campo('freveiculo', c.propria ? c.veiculo.vplaca : '');
    campo('freterceiro', c.propria ? '' : terceiroItem(item, c));
    if (c.propria && (!el('freveiculo') || el('freveiculo').value !== c.veiculo.vplaca)) throw new Error('Veículo indisponível no formulário. Reabra Cadastro de Fretes.');
    if (!c.propria && (!el('freterceiro') || el('freterceiro').value !== terceiroItem(item, c))) throw new Error('Terceiro indisponível no formulário. Reabra Cadastro de Fretes.');
    campo('fredata', item.data); campo('frecompetencia', item.competencia);
    if (!el('frecompetencia') || el('frecompetencia').value !== item.competencia) throw new Error('Campo de competência indisponível. Reabra a aba.');
    campo('frevalor', moeda(item.frete)); campo('frecustoterceiro', c.propria ? '' : moeda(item.custo));
    campo('frestatus', 'Fechado'); campo('frerastreada', 'Não');
    campo('frepeso', item.peso ? item.peso.toLocaleString('pt-BR') + ' KG' : '');
    campo('fretipoveiculo', c.propria ? c.veiculo.vtipo || '' : (c.terceiro && c.terceiro.tertipoveiculo) || '');
    ['frecarregamento', 'freentrega', 'frevolume', 'fretipocarga', 'fredistancia'].forEach(function (id) { campo(id, ''); });
    campo('freobs', 'CT-e: ' + item.cte + ' | Viagem: ' + item.viagens.join(', ') + ' | Placa: ' + item.placa + ' | Linha: ' + item.linhas.join(', ') + ' | Planilha: ' + nomeArquivo.replace(/[\r\n]/g, ' ') + ' | Período de referência: ' + item.inicio + ' a ' + item.fim + (item.totalViagem !== undefined ? ' | Valor da Viagem (fonte): ' + moeda(item.totalViagem) + (item.rateioQuantidade > 1 ? ' | Pagamento distribuído entre ' + item.rateioQuantidade + ' CT-e; conferir contrato' : '') : '') + ' | Datas de carregamento e entrega não informadas pela planilha.');
    if (typeof window.fmAplicarRotaFrete !== 'function') throw new Error('Seleção de cidades indisponível.');
    await window.fmAplicarRotaFrete({ freorigem: item.origem, fredestino: item.destino });
    if (!el('freorigem') || !el('fredestino') || chave(el('freorigem').value) !== chave(item.origem) || chave(el('fredestino').value) !== chave(item.destino)) throw new Error('Confira a cidade/UF de origem e destino antes de salvar.');
    if (typeof window.fmSincronizarValoresBuscasCadastro === 'function') window.fmSincronizarValoresBuscasCadastro();
  }
  function retirarSalvos() {
    // O lote já reconcilia ao terminar; não redesenha nem percorre toda a prévia a cada frete.
    if (ocupado) return;
    var base = indices(); itens = itens.filter(function (x) { return !jaExiste(x, base); }); render();
  }
  async function confirmar(indice) {
    if (ocupado) return;
    if (!el('frePlanilhaEditor').hidden) { mensagem('Aplique ou cancele a edição antes de confirmar.'); return; }
    var individual = typeof indice === 'number', base = indices();
    var escolhidos = individual ? (itens[indice] ? [itens[indice]] : []) : itens.filter(function (x) { return x.selecionado; });
    if (!escolhidos.length) { mensagem('Selecione pelo menos um CT-e.'); return; }
    var bloqueados = escolhidos.filter(function (x) { return motivo(x, base) !== 'Pronto'; });
    if (bloqueados.length) { mensagem('Nenhum registro confirmado. ' + (individual ? 'CT-e ' + escolhidos[0].cte + ': ' + motivo(escolhidos[0], base) + '. Use Editar para conferir.' : 'Revise os ' + bloqueados.length + ' selecionados com pendência ou duplicidade.')); return; }
    if (typeof window.salvarFrete !== 'function') { mensagem('O cadastro de fretes não está disponível.'); return; }
    if (['fre_idx', 'fredata', 'frevalor', 'freobs', 'freorigem', 'fredestino', 'frepeso', 'fretipocarga', 'frecarregamento', 'freentrega', 'frevolume', 'freveiculo', 'freterceiro', 'frecustoterceiro'].some(function (id) { return el(id) && texto(el(id).value); })) { mensagem('Salve ou cancele o formulário de frete que está aberto antes de confirmar a planilha.'); return; }
    if (!window.confirm('Confirmar ' + (individual ? 'somente o CT-e ' + escolhidos[0].cte : escolhidos.length + ' CT-e selecionado(s)') + '? Cada CT-e será salvo uma única vez como frete fechado, com a receita, competência e pagamento conferidos. Placas de terceiros ainda não cadastradas terão um pré-cadastro identificado pela placa; complete os dados depois em Terceiros.')) return;
    ocupado = true; render(); var salvos = 0, aviso = '';
    // Entrega o controle ao navegador para pintar o progresso e responder durante o lote.
    await new Promise(function (resolve) { setTimeout(resolve, 0); });
    var formulario = el('fre_idx') && el('fre_idx').closest('.glass-container');
    var controles = formulario ? Array.from(formulario.querySelectorAll('input, select, textarea, button')).map(function (e) { return { el: e, disabled: e.disabled }; }) : [];
    controles.forEach(function (c) { c.el.disabled = true; });
    try {
      for (var item of escolhidos) {
        mensagem('Confirmando ' + (salvos + 1) + ' de ' + escolhidos.length + ' · CT-e ' + item.cte + '… Aguarde a confirmação no banco.');
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
        if (motivo(item) !== 'Pronto') throw new Error('Os dados de CT-e ' + item.cte + ' mudaram. Confira novamente.');
        await preencher(item);
        // Reconfere após a seleção assíncrona das cidades, antes do escritor compartilhado.
        if (jaExiste(item)) throw new Error('CT-e ' + item.cte + ' já cadastrado.');
        var resultado = await window.salvarFrete({ planilha: true, referencia: { arquivo: nomeArquivo, cte: item.cte, viagens: item.viagens.slice(), placa: item.placa, competencia: item.competencia, inicio: item.inicio, fim: item.fim, receitaCentavos: item.frete, pagamentoCentavos: identificar(item).propria ? null : item.custo, valorViagemCentavos: item.totalViagem === undefined ? null : item.totalViagem } });
        if (!resultado || !resultado.registrado || !jaExiste(item)) throw new Error('O formulário não confirmou o CT-e ' + item.cte + '. Revise os campos antes de tentar novamente.');
        salvos++;
        if (!resultado.nuvem) { aviso = ' A sequência foi interrompida: o último frete está na fila de sincronização, ainda sem confirmação no banco. Não o importe novamente; confira o indicador de sincronização.'; break; }
      }
    } catch (e) { aviso = ' Sequência interrompida: ' + (e && e.message || 'não foi possível confirmar'); }
    finally {
      controles.forEach(function (c) { c.el.disabled = c.disabled; });
      ocupado = false; retirarSalvos();
      mensagem(salvos + ' CT-e registrado(s).' + aviso + ' Os demais continuam na prévia.');
    }
  }
  function montar() {
    var painel = el('subTerFretes'); if (!painel || el('frePlanilhaBox')) return;
    var box = document.createElement('section'); box.id = 'frePlanilhaBox'; box.className = 'glass-container';
    box.innerHTML = '<h5>Importar planilha de viagens</h5><p class="cus-note">Confira antes de confirmar: placas cadastradas na frota são próprias. Para as demais, o sistema reutiliza o terceiro da placa ou cria um pré-cadastro pela placa somente ao confirmar, sem exigir cadastro ou vínculo manual. Complete os dados do contratado depois em Terceiros. A receita é o Valor do Frete de cada CT-e, contado apenas uma vez.</p><div class="row g-2 align-items-end"><div class="col-md-5"><label for="frePlanilhaArquivo" class="form-label-mini">Planilha Excel</label><input type="file" id="frePlanilhaArquivo" class="form-control" accept=".xlsx,.xls,.csv"></div><div class="col-md-3"><label for="frePlanilhaCompetencia" class="form-label-mini">Competência dos selecionados</label><input type="month" id="frePlanilhaCompetencia" class="form-control"></div><div class="col-md-4"><button type="button" class="btn btn-outline-primary" id="frePlanilhaAplicar" data-lote>Aplicar competência</button></div></div><p class="cus-note mt-2">A competência preenche o primeiro e o último dia do mês e sugere o primeiro dia como data do lançamento; você pode editar cada item. O período é uma referência, não são datas reais de carregamento e entrega. Valor da Viagem não vira receita extra e só pode ser usado como pagamento ao terceiro após sua conferência.</p><p id="frePlanilhaResumo" class="cus-note"></p><div class="d-flex gap-2 flex-wrap mb-2"><button type="button" class="btn btn-primary" id="frePlanilhaConfirmar" data-lote>Confirmar selecionados</button><button type="button" class="btn btn-outline-secondary" id="frePlanilhaAceitar" data-lote>Conferir pagamentos sugeridos</button><button type="button" class="btn btn-outline-danger" id="frePlanilhaExcluir" data-lote>Remover selecionados da prévia</button><button type="button" class="btn btn-outline-secondary" id="frePlanilhaLimpar" data-lote>Limpar prévia</button></div><p id="frePlanilhaMensagem" role="status" aria-live="polite"></p><div id="frePlanilhaEditor" class="border rounded p-3 mb-3" hidden></div><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th><input type="checkbox" id="frePlanilhaTodos" aria-label="Selecionar todos os CT-e da prévia"></th><th>Viagem / CT-e</th><th>Placa / execução</th><th>Cidade/UF origem → destino</th><th>Receita</th><th>Pago ao terceiro</th><th>Saldo da contratação</th><th>Competência / período</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="frePlanilhaLista"></tbody></table></div><small>Remover e editar afetam somente esta prévia. Os registros só entram no sistema ao confirmar; o saldo da contratação não representa lucro líquido.</small>';
    painel.insertBefore(box, painel.firstChild);
    var navegacao = document.createElement('div');
    navegacao.className = 'd-flex gap-2 align-items-center flex-wrap my-2';
    navegacao.innerHTML = '<button type="button" id="frePlanilhaAnterior" class="btn btn-sm btn-outline-secondary">Anterior</button><span id="frePlanilhaPagina" class="cus-note"></span><button type="button" id="frePlanilhaProxima" class="btn btn-sm btn-outline-secondary">Próxima</button>';
    el('frePlanilhaLista').closest('.table-responsive').insertAdjacentElement('afterend', navegacao);
    el('frePlanilhaAnterior').onclick = function () { if (!ocupado && pagina > 1) { pagina--; render(); } };
    el('frePlanilhaProxima').onclick = function () { if (!ocupado && pagina * porPagina < itens.length) { pagina++; render(); } };
    el('frePlanilhaArquivo').onchange = async function () {
      var input = this, arquivo = input.files && input.files[0]; if (!arquivo || ocupado) return;
      if (itens.length && !window.confirm('Substituir a prévia atual? Os fretes já salvos não serão alterados.')) { input.value = ''; return; }
      if (typeof XLSX === 'undefined') { mensagem('O leitor Excel não está disponível. Recarregue a página.'); return; }
      ocupado = true; render(); mensagem('Lendo a planilha…');
      try {
        var buffer = await arquivo.arrayBuffer(), wb = XLSX.read(buffer, { type: 'array' }), rows = [];
        wb.SheetNames.forEach(function (nome) { rows = rows.concat(XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', raw: true })); });
        var novos = ler(rows);
        if (!novos.length) throw new Error('Formato não reconhecido. São esperados blocos Viagem, Veículo, Linha e cabeçalhos CT-e, Valor do Frete, Cidade/Estado Origem e Cidade/Estado Destino.');
        itens = novos; pagina = 1; nomeArquivo = arquivo.name; el('frePlanilhaEditor').hidden = true; el('frePlanilhaEditor').innerHTML = '';
        mensagem('Planilha lida. Selecione os CT-e, aplique a competência e confira as pendências. Nenhum frete foi salvo.');
      } catch (e) { mensagem('Não foi possível ler: ' + (e.message || 'arquivo inválido')); }
      finally { ocupado = false; input.value = ''; render(); }
    };
    el('frePlanilhaTodos').onchange = function () {
      if (ocupado) return;
      var checked = this.checked; itens.forEach(function (x) { x.selecionado = checked; });
      quantidadeSelecionada = checked ? itens.length : 0; atualizarSelecao();
    };
    el('frePlanilhaLista').onchange = function (e) {
      var t = e.target, x = itens[Number(t.dataset.selecao)];
      if (!ocupado && t.dataset.selecao !== undefined && x) {
        if (x.selecionado !== t.checked) quantidadeSelecionada += t.checked ? 1 : -1;
        x.selecionado = t.checked; atualizarSelecao();
      }
    };
    el('frePlanilhaLista').onclick = function (e) {
      if (ocupado) return; var t = e.target;
      if (t.dataset.confirmar !== undefined) confirmar(Number(t.dataset.confirmar));
      if (t.dataset.editar !== undefined) editar(Number(t.dataset.editar));
      if (t.dataset.remover !== undefined && window.confirm('Remover apenas este CT-e da prévia?')) { itens.splice(Number(t.dataset.remover), 1); el('frePlanilhaEditor').hidden = true; render(); }
    };
    el('frePlanilhaAplicar').onclick = function () {
      if (ocupado) return; var comp = el('frePlanilhaCompetencia').value, selecionados = itens.filter(function (x) { return x.selecionado; });
      if (!selecionados.length || !/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) { mensagem('Selecione os CT-e e informe uma competência válida.'); return; }
      selecionados.forEach(function (x) { periodo(x, comp); }); el('frePlanilhaEditor').hidden = true; render(); mensagem('Competência e período aplicados aos ' + selecionados.length + ' selecionados. Confira a data do lançamento.');
    };
    el('frePlanilhaAceitar').onclick = function () {
      if (ocupado) return;
      var base = indices();
      var escolhidos = itens.filter(function (x) { return x.selecionado && !identificar(x, base).propria; });
      if (!escolhidos.length || escolhidos.some(function (x) { return !isFinite(x.custo); })) { mensagem('Selecione terceiros com pagamentos sugeridos. Para valores ausentes ou ambíguos, use Editar.'); return; }
      var total = escolhidos.reduce(function (s, x) { return s + x.custo; }, 0);
      if (window.confirm('Confirmar ' + moeda(total) + ' como pagamento dos ' + escolhidos.length + ' CT-e selecionados de terceiros? Confira o contrato: o Valor da Viagem foi distribuído entre os CT-e da viagem, sem repetir o total.')) { escolhidos.forEach(function (x) { x.aceitarRateio = true; }); render(); mensagem('Pagamentos conferidos apenas na prévia. Ainda é necessário Confirmar selecionados.'); }
    };
    el('frePlanilhaConfirmar').onclick = confirmar;
    el('frePlanilhaExcluir').onclick = function () { if (!ocupado && itens.some(function (x) { return x.selecionado; }) && window.confirm('Remover os selecionados somente da prévia?')) { itens = itens.filter(function (x) { return !x.selecionado; }); el('frePlanilhaEditor').hidden = true; render(); } };
    el('frePlanilhaLimpar').onclick = function () { if (!ocupado && window.confirm('Limpar a prévia? Nenhum registro salvo será excluído.')) { itens = []; nomeArquivo = ''; el('frePlanilhaEditor').hidden = true; render(); mensagem('Prévia limpa.'); } };
    render();
  }
  window.FMPlanilhaFretes = { ler: ler, identificar: identificar, periodo: periodo, motivo: motivo, jaExiste: jaExiste };
  window.addEventListener('fm:frete-salvo', retirarSalvos);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
  new MutationObserver(montar).observe(document.documentElement, { childList: true, subtree: true });
})();
