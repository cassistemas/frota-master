/* Prévia local da planilha de viagens no Cadastro de Fretes: só o formulário salva registros. */
(function () {
  'use strict';
  var itens = [], nomeArquivo = '', linhasLidas = 0;
  function el(id) { return document.getElementById(id); }
  function texto(x) { return String(x == null ? '' : x).trim(); }
  function normalizar(x) { return texto(x).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function escapar(x) { return texto(x).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function dinheiro(x) {
    if (typeof x === 'number') return isFinite(x) ? Math.round(x * 100) : NaN;
    var s = texto(x).replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return isFinite(Number(s)) ? Math.round(Number(s) * 100) : NaN;
  }
  function moeda(c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function numero(x) { return Number(texto(x).replace(/\./g, '').replace(',', '.')) || 0; }
  function celula(row, i) { return i < 0 ? '' : texto((row || [])[i]); }
  function ler(rows) {
    var porCte = new Map(), viagem = '', placa = '', linha = '', colunas = null, contagem = 0;
    rows.forEach(function (row) {
      var primeiro = celula(row, 0), tipo = primeiro.toLowerCase();
      if (tipo === 'viagem') { viagem = celula(row, 1); placa = ''; linha = ''; colunas = null; return; }
      if (tipo === 'veículo' || tipo === 'veiculo') { placa = celula(row, 1); return; }
      if (tipo === 'linha') { linha = celula(row, 1); return; }
      if (tipo === 'cte' || tipo === 'ct-e') {
        var nomes = row.map(function (v) { return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); });
        colunas = { peso: nomes.indexOf('peso'), frete: nomes.indexOf('valor do frete'), origem: nomes.indexOf('cidade origem'), ufOrigem: nomes.indexOf('estado origem'), destino: nomes.indexOf('cidade destino'), ufDestino: nomes.indexOf('estado destino') };
        if (colunas.frete < 0 || colunas.origem < 0 || colunas.ufOrigem < 0 || colunas.destino < 0 || colunas.ufDestino < 0) colunas = null;
        return;
      }
      if (!colunas || !primeiro || !viagem || !placa) return;
      var frete = dinheiro((row || [])[colunas.frete]);
      var origem = celula(row, colunas.origem), ufOrigem = celula(row, colunas.ufOrigem).toUpperCase();
      var destino = celula(row, colunas.destino), ufDestino = celula(row, colunas.ufDestino).toUpperCase();
      var registro = { cte: primeiro, placa: placa, frete: frete, peso: numero((row || [])[colunas.peso]), origem: origem && ufOrigem ? origem + '-' + ufOrigem : '', destino: destino && ufDestino ? destino + '-' + ufDestino : '', viagens: [viagem], linhas: [linha], divergente: false };
      var id = normalizar(primeiro); contagem++;
      if (!porCte.has(id)) { porCte.set(id, registro); return; }
      var anterior = porCte.get(id);
      if (anterior.viagens.indexOf(viagem) < 0) anterior.viagens.push(viagem);
      if (linha && anterior.linhas.indexOf(linha) < 0) anterior.linhas.push(linha);
      if (anterior.frete !== frete || normalizar(anterior.placa) !== normalizar(placa) || anterior.origem !== registro.origem || anterior.destino !== registro.destino || anterior.peso !== registro.peso) anterior.divergente = true;
    });
    return { itens: Array.from(porCte.values()), linhas: contagem };
  }
  function jaExiste(item) {
    if (typeof db === 'undefined' || !Array.isArray(db.fretes)) return false;
    return db.fretes.some(function (f) {
      var obs = texto(f.freobs), encontrados = obs.matchAll(/\bCT[- ]?E\s*[:#]?\s*([A-Z0-9]+(?:[-./][A-Z0-9]+)*)/gi);
      for (var achado of encontrados) if (normalizar(achado[1]) === normalizar(item.cte)) return true;
      return false;
    });
  }
  function motivo(item) {
    if (item.divergente) return 'Divergência: conferir';
    if (jaExiste(item)) return 'Já cadastrado';
    if (!(item.frete > 0)) return 'Frete ausente/zero';
    if (!item.origem || !item.destino || !/.*-[A-Z]{2}$/.test(item.origem) || !/.*-[A-Z]{2}$/.test(item.destino)) return 'Cidade/UF ausente';
    return 'Disponível';
  }
  function desenhar(linhas) {
    var aceitos = itens.filter(function (x) { return motivo(x) === 'Disponível'; });
    var total = aceitos.reduce(function (s, x) { return s + x.frete; }, 0);
    el('frePlanilhaResumo').textContent = nomeArquivo + ' · ' + linhas + ' linhas de CT-e · ' + itens.length + ' CT-e distintos · ' + aceitos.length + ' disponíveis · ' + moeda(total) + ' em Valor do Frete distinto';
    el('frePlanilhaLinhas').innerHTML = itens.map(function (x, i) {
      var situacao = motivo(x);
      return '<tr><td>' + escapar(x.cte) + '</td><td>' + escapar(x.placa) + '</td><td>' + escapar(x.viagens.join(', ')) + '</td><td>' + escapar(x.origem) + ' → ' + escapar(x.destino) + '</td><td>' + (isFinite(x.frete) ? moeda(x.frete) : '—') + '</td><td>' + situacao + '</td><td>' + (situacao === 'Disponível' ? '<button type="button" class="btn btn-sm btn-outline-primary" data-fre-planilha-indice="' + i + '">Preencher formulário</button>' : '—') + '</td></tr>';
    }).join('');
    el('frePlanilhaPrevia').hidden = false;
  }
  window.addEventListener('fm:frete-salvo', function () {
    if (!itens.length) return;
    var restantes = itens.filter(function (x) { return !jaExiste(x); });
    if (restantes.length === itens.length) return;
    itens = restantes;
    desenhar(linhasLidas);
  });
  function setar(id, valor) {
    var campo = el(id);
    if (campo) { campo.value = valor; campo.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  async function preencher(item) {
    if (!item || motivo(item) !== 'Disponível') return;
    if (el('fre_idx') && el('fre_idx').value && !confirm('Há uma edição aberta. Descartar as alterações do formulário?')) return;
    if (typeof window.limparFormFrete === 'function') window.limparFormFrete();
    var cadastro = typeof db !== 'undefined' && Array.isArray(db.veiculos) && db.veiculos.find(function (v) { return normalizar(v.vplaca) === normalizar(item.placa) && texto(v.vstatus).toUpperCase() !== 'VENDIDO'; });
    setar('freexecucao', 'propria');
    setar('frestatus', 'Fechado');
    var hoje = new Date(), ymd = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    var dia = ymd + '-' + String(hoje.getDate()).padStart(2, '0');
    setar('fredata', dia);
    setar('frecarregamento', ymd + '-01T00:00');
    setar('freentrega', dia + 'T' + String(hoje.getHours()).padStart(2, '0') + ':' + String(hoje.getMinutes()).padStart(2, '0'));
    setar('frerastreada', 'Sim');
    if (typeof window.alternarExecucaoFrete === 'function') window.alternarExecucaoFrete();
    var select = el('freveiculo');
    if (cadastro && select && Array.from(select.options).some(function (o) { return o.value === cadastro.vplaca; })) {
      select.value = cadastro.vplaca;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setar('fretipoveiculo', cadastro ? texto(cadastro.vtipo) : '');
    setar('frepeso', item.peso ? (item.peso / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' TONELADAS' : '');
    setar('frevalor', moeda(item.frete));
    setar('freobs', 'CT-e ' + item.cte + ' | Planilha: ' + nomeArquivo + ' | Viagem(ns): ' + item.viagens.join(', ') + (item.linhas.filter(Boolean).length ? ' | Linha(s): ' + item.linhas.filter(Boolean).join('; ') : '') + (cadastro ? '' : ' | Placa da planilha: ' + item.placa + ' (verificar vínculo)'));
    if (typeof window.fmAplicarRotaFrete === 'function') await window.fmAplicarRotaFrete({ freorigem: item.origem, fredestino: item.destino });
    if (!cadastro) el('frePlanilhaAviso').textContent = 'Placa não encontrada nos veículos próprios: escolha o veículo ou o terceiro correto antes de salvar. Confira data, rota, distância, execução e valor pago ao terceiro.';
    else el('frePlanilhaAviso').textContent = 'Confira data, rota, distância e execução antes de salvar. Valor pago ao terceiro não consta na planilha.';
    el('fredata').focus();
    el('fredata').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function iniciar() {
    var painel = el('subTerFretes');
    if (!painel || el('frePlanilhaArquivo')) return;
    var formulario = painel.querySelector('.glass-container');
    if (!formulario) return;
    var box = document.createElement('section'); box.className = 'cus-planilha';
    box.innerHTML = '<h5>Prévia de viagens por CT-e</h5><label for="frePlanilhaArquivo" class="form-label-mini">Planilha de viagens (.xlsx)</label><input id="frePlanilhaArquivo" type="file" accept=".xlsx,.xls" class="form-control" data-nao-limpar="1"><div id="frePlanilhaPrevia" hidden><p id="frePlanilhaResumo" class="cus-note" aria-live="polite"></p><p id="frePlanilhaAviso" class="cus-note">Valor da viagem não entra no frete. CT-e repetido conta uma vez; divergências e documentos já cadastrados ficam bloqueados. A planilha não informa data, valor pago ao terceiro nem KM real: confira cada frete antes de salvar.</p><div class="cus-table-wrap"><table class="table cus-table" data-sem-relatorio="1"><thead><tr><th>CT-e</th><th>Veículo</th><th>Viagens</th><th>Rota do CT-e</th><th>Valor do Frete</th><th>Situação</th><th></th></tr></thead><tbody id="frePlanilhaLinhas"></tbody></table></div></div>';
    painel.insertBefore(box, formulario);
    el('frePlanilhaArquivo').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0]; if (!file) return;
      nomeArquivo = file.name; itens = []; el('frePlanilhaPrevia').hidden = true;
      if (!/\.xlsx?$/i.test(file.name) || file.size > 10 * 1024 * 1024) { alert('Selecione uma planilha Excel de até 10 MB.'); ev.target.value = ''; return; }
      file.arrayBuffer().then(function (buffer) {
        if (!window.XLSX) throw new Error('Leitor de Excel indisponível.');
        var wb = XLSX.read(buffer, { type: 'array' }), sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new Error('A planilha não tem dados.');
        var resultado = ler(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }));
        if (!resultado.itens.length) throw new Error('Nenhum CT-e com a coluna Valor do Frete foi encontrado.');
         itens = resultado.itens; linhasLidas = resultado.linhas; desenhar(linhasLidas);
      }).catch(function (err) { alert('Não foi possível ler a planilha: ' + err.message); }).finally(function () { ev.target.value = ''; });
    });
    box.addEventListener('click', function (ev) {
      var botao = ev.target.closest('[data-fre-planilha-indice]');
      if (botao) preencher(itens[Number(botao.dataset.frePlanilhaIndice)]).catch(function () { alert('Confira as cidades da rota e tente novamente.'); });
    });
  }
  new MutationObserver(iniciar).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();