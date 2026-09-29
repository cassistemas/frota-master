/* Prévia local da planilha de viagens: nenhum registro é salvo ao ler o arquivo. */
(function () {
  'use strict';
  var itens = [], nomeArquivo = '';
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
  function numero(x) { return Number(texto(x).replace(/\./g, '').replace(',', '.')) || 0; }
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
  function ler(rows) {
    var porCte = new Map(), viagem = '', placa = '', linha = '', colunas = null, contagem = 0;
    rows.forEach(function (row) {
      var primeiro = celula(row, 0), tipo = primeiro.toLowerCase();
      if (tipo === 'viagem') { viagem = celula(row, 1); placa = ''; linha = ''; colunas = null; return; }
      if (tipo === 'veículo' || tipo === 'veiculo') { placa = celula(row, 1); return; }
      if (tipo === 'linha') { linha = celula(row, 1); return; }
      if (tipo === 'cte' || tipo === 'ct-e') {
        var nomes = row.map(function (v) { return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); });
        colunas = { cte: 0, peso: nomes.indexOf('peso'), frete: nomes.indexOf('valor do frete'), origem: nomes.indexOf('cidade origem'), ufOrigem: nomes.indexOf('estado origem'), destino: nomes.indexOf('cidade destino'), ufDestino: nomes.indexOf('estado destino') };
        if (colunas.frete < 0) colunas = null;
        return;
      }
      if (!colunas || !primeiro || !viagem || !placa) return;
      var frete = dinheiro((row || [])[colunas.frete]);
      var id = chave(primeiro), origem = celula(row, colunas.origem), destino = celula(row, colunas.destino);
      var registro = { cte: primeiro, placa: placa, frete: frete, peso: numero((row || [])[colunas.peso]), origem: origem + (celula(row, colunas.ufOrigem) ? '-' + celula(row, colunas.ufOrigem) : ''), destino: destino + (celula(row, colunas.ufDestino) ? '-' + celula(row, colunas.ufDestino) : ''), viagens: [viagem], linhas: [linha], divergente: false };
      contagem++;
      if (!porCte.has(id)) { porCte.set(id, registro); return; }
      var anterior = porCte.get(id);
      if (anterior.viagens.indexOf(viagem) < 0) anterior.viagens.push(viagem);
      if (linha && anterior.linhas.indexOf(linha) < 0) anterior.linhas.push(linha);
      if (anterior.frete !== frete || normalizar(anterior.placa) !== normalizar(placa) || anterior.origem !== registro.origem || anterior.destino !== registro.destino || anterior.peso !== registro.peso) anterior.divergente = true;
    });
    return { itens: Array.from(porCte.values()), linhas: contagem };
  }
  function jaExiste(item) {
    return typeof db !== 'undefined' && Array.isArray(db.producoes) && db.producoes.some(function (p) {
      return normalizar(p.documento) === normalizar('CT-e ' + item.cte);
    });
  }
  function desenhar(linhas) {
    var container = el('resPlanilhaPrevia'); if (!container) return;
    var aceitos = itens.filter(function (x) { return !x.divergente && !jaExiste(x) && x.frete > 0; });
    var total = aceitos.reduce(function (sum, x) { return sum + x.frete; }, 0);
    el('resPlanilhaResumo').textContent = nomeArquivo + ' · ' + linhas + ' linhas de CT-e · ' + itens.length + ' CT-e distintos · ' + aceitos.length + ' disponíveis · ' + moeda(total) + ' em Valor do Frete distinto';
    el('resPlanilhaAviso').textContent = 'Valor da viagem não entra na receita. CT-e repetido conta uma vez; divergências e documentos já lançados ficam bloqueados. A planilha não informa data, cliente, motorista nem KM: confira e complete antes de salvar cada CT-e.';
    el('resPlanilhaLinhas').innerHTML = itens.map(function (x, i) {
      var motivo = x.divergente ? 'Divergência: conferir' : jaExiste(x) ? 'Já lançado' : !(x.frete > 0) ? 'Frete ausente/zero' : 'Disponível';
      return '<tr><td>' + escapar(x.cte) + '</td><td>' + escapar(x.placa) + '</td><td>' + escapar(x.viagens.join(', ')) + '</td><td>' + escapar(x.origem) + ' → ' + escapar(x.destino) + '</td><td>' + (isFinite(x.frete) ? moeda(x.frete) : '—') + '</td><td>' + motivo + '</td><td>' + (motivo === 'Disponível' ? '<button type="button" class="btn btn-sm btn-outline-primary" data-planilha-indice="' + i + '">Preencher formulário</button>' : '—') + '</td></tr>';
    }).join('');
    container.hidden = false;
  }
  function preencher(item) {
    if (!item || item.divergente || jaExiste(item) || !(item.frete > 0)) return;
    if (el('resProdId') && el('resProdId').value && !confirm('Há uma edição aberta. Descartar as alterações do formulário?')) return;
    if (typeof window.limparProducaoFrota === 'function') window.limparProducaoFrota();
    var cadastro = veiculoCadastrado(item.placa), agora = new Date();
    var competencia = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');
    var valores = {resProdTipo:'viagem',resProdVeiculo:cadastro ? cadastro.vplaca : item.placa,resProdCompetencia:competencia,resProdDocumento:'CT-e ' + item.cte,resProdOrigem:item.origem,resProdDestino:item.destino,resProdTon:item.peso ? String(item.peso / 1000) : '',resProdReceita:moeda(item.frete),resProdObs:'Planilha: ' + nomeArquivo + ' | Viagem(ns): ' + item.viagens.join(', ') + (item.linhas.filter(Boolean).length ? ' | Linha(s): ' + item.linhas.filter(Boolean).join('; ') : '')};
    Object.keys(valores).forEach(function (id) { var campo = el(id); if (campo) { campo.value = valores[id]; campo.dispatchEvent(new Event('input', { bubbles: true })); } });
    preencherVinculoVeiculo(valores.resProdVeiculo, true);
    el('resProdData').focus();
    el('resProdData').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function iniciar() {
    var pane = el('cusPane-producao'); if (!pane || el('resPlanilhaArquivo')) return;
    var formulario = pane.querySelector('.cus-form-wrap'); if (!formulario) return;
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
    box.innerHTML = '<h5>Prévia de viagens por CT-e</h5><label for="resPlanilhaArquivo" class="form-label-mini">Planilha de viagens (.xlsx)</label><input id="resPlanilhaArquivo" type="file" accept=".xlsx,.xls" class="form-control" data-nao-limpar="1"><div id="resPlanilhaPrevia" hidden><p id="resPlanilhaResumo" class="cus-note" aria-live="polite"></p><p id="resPlanilhaAviso" class="cus-note"></p><div class="cus-table-wrap"><table class="table cus-table" data-sem-relatorio="1"><thead><tr><th>CT-e</th><th>Veículo</th><th>Viagens</th><th>Rota do CT-e</th><th>Valor do Frete</th><th>Situação</th><th></th></tr></thead><tbody id="resPlanilhaLinhas"></tbody></table></div></div>';
    pane.insertBefore(box, formulario);
    el('resPlanilhaArquivo').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0]; if (!file) return;
      nomeArquivo = file.name; itens = []; el('resPlanilhaPrevia').hidden = true;
      if (!/\.xlsx?$/i.test(file.name) || file.size > 10 * 1024 * 1024) { alert('Selecione uma planilha Excel de até 10 MB.'); ev.target.value = ''; return; }
      file.arrayBuffer().then(function (buffer) {
        if (!window.XLSX) throw new Error('Leitor de Excel indisponível.');
        var wb = XLSX.read(buffer, { type: 'array' }), sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new Error('A planilha não tem dados.');
        var resultado = ler(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }));
        if (!resultado.itens.length) throw new Error('Nenhum CT-e com a coluna Valor do Frete foi encontrado.');
        itens = resultado.itens; desenhar(resultado.linhas);
      }).catch(function (err) { alert('Não foi possível ler a planilha: ' + err.message); }).finally(function () { ev.target.value = ''; });
    });
    box.addEventListener('click', function (ev) {
      var botao = ev.target.closest('[data-planilha-indice]');
      if (botao) preencher(itens[Number(botao.dataset.planilhaIndice)]);
    });
  }
  new MutationObserver(iniciar).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();