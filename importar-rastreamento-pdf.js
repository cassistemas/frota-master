/* Demonstrativo de rastreamento/telemetria (PDF): leitura local, total por placa, prévia e confirmação explícita. */
(function () {
  'use strict';
  var CATEGORIA = 'Rastreamento / Telemetria';
  var grupos = [], arquivo = '', competenciaPdf = '', totalPdf = NaN, salvando = false;
  function el(id) { return document.getElementById(id); }
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function placa(v) { return texto(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function esc(v) { return texto(v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function reais(c) { return (c / 100).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
  function centavos(v) { var s = texto(v).replace(/[^\d,.-]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return s && Number.isFinite(Number(s)) ? Math.round(Number(s) * 100) : NaN; }
  function mesBr(m) { return m ? m.slice(5) + '/' + m.slice(0, 4) : '—'; }
  function veiculo(p) { return (typeof db !== 'undefined' && Array.isArray(db.veiculos)) ? db.veiculos.find(function (v) { return placa(v.vplaca) === p; }) || null : null; }
  function chave(g) { return 'rast|' + g.placa + '|' + g.competencia; }
  function jaLancado(g) {
    return typeof db !== 'undefined' && Array.isArray(db.custos) && db.custos.some(function (c) { return c.origemChave === chave(g); });
  }

  function carregarPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    return new Promise(function (ok, erro) {
      var s = document.createElement('script'); s.src = 'vendor/pdf.min.js';
      s.onload = function () { window.pdfjsLib ? ok() : erro(new Error('Leitor de PDF indisponível.')); };
      s.onerror = function () { erro(new Error('Leitor de PDF indisponível.')); };
      document.head.appendChild(s);
    }).then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; });
  }
  async function linhasPdf(buffer) {
    var pdf = await window.pdfjsLib.getDocument({ data:buffer }).promise, out = [];
    for (var n = 1; n <= pdf.numPages; n++) {
      var itens = (await (await pdf.getPage(n)).getTextContent()).items.filter(function (i) { return texto(i.str); });
      var linhas = [];
      itens.forEach(function (i) {
        var y = i.transform[5], x = i.transform[4];
        var l = linhas.find(function (k) { return Math.abs(k.y - y) <= 3; });
        if (!l) { l = { y:y, partes:[] }; linhas.push(l); }
        l.partes.push({ x:x, s:texto(i.str) });
      });
      linhas.sort(function (a, b) { return b.y - a.y; }).forEach(function (l) {
        out.push(l.partes.sort(function (a, b) { return a.x - b.x; }).map(function (p) { return p.s; }).join(' ').replace(/\s+/g, ' '));
      });
    }
    return out;
  }
  var RE = /^(G\d+-\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(?:(\d{10,})\s+)?([A-Z]{3}-?\d[A-Z0-9]\d{2})\s+(\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/;
  function interpretar(linhas) {
    var comp = '', total = NaN, mapa = {}, equipamento = '', resumo = false;
    linhas.forEach(function (l) {
      var m = l.match(/COMPET[ÊE]NCIA:?\s*(\d{2})\/(\d{4})/i); if (m && !comp) comp = m[2] + '-' + m[1];
      var e = l.match(/EQUIPAMENTOS\s*\|\s*\d+\s+(.+)$/i); if (e) equipamento = texto(e[1]);
      if (/^RESUMO\b/i.test(l)) resumo = true;
      if (resumo) { var t = l.match(/^TOTAIS\s+\d+\s+([\d.,]+)$/); if (t) total = centavos(t[1]); return; }
      var r = l.match(RE); if (!r) return;
      var nums = r[10].split(' ').filter(function (x) { return /^[\d.,]+$/.test(x); });
      var valor = centavos(nums[nums.length - 1]); if (!Number.isFinite(valor)) return;
      var p = placa(r[5]);
      if (!mapa[p]) mapa[p] = { placa:p, itens:[], cents:0 };
      mapa[p].itens.push({ contrato:r[1], serie:r[3], antena:r[4] || '', equipamento:equipamento, plano:texto(r[7]), inicio:r[8], fim:r[9], valor:valor / 100 });
      mapa[p].cents += valor;
    });
    if (!comp) throw new Error('Competência não encontrada no demonstrativo.');
    var lista = Object.keys(mapa).sort().map(function (p) {
      var g = mapa[p], v = veiculo(p);
      g.competencia = comp; g.cents = g.cents; g.selecionado = false;
      g.veiculo = v ? v.vplaca : ''; g.motorista = v ? (v.vmotorista || '') : '';
      g.descricao = 'Rastreamento/telemetria ' + mesBr(comp) + ' · ' + g.itens.length + ' item(ns)';
      g.id = 'g' + Math.random().toString(36).slice(2, 9);
      return g;
    });
    return { grupos:lista, competencia:comp, total:total };
  }

  function situacao(g) {
    if (!g.veiculo) return { t:'Veículo não cadastrado', ok:false };
    if (jaLancado(g)) return { t:'Já lançado', ok:false };
    return { t:'Pronto para lançar', ok:true };
  }
  function desenhar() {
    var prev = el('cusRastPrevia'); if (!prev) return;
    prev.hidden = !grupos.length;
    var soma = grupos.reduce(function (s, g) { return s + g.cents; }, 0);
    var aviso = Number.isFinite(totalPdf) && totalPdf !== soma ? ' · Atenção: total do PDF ' + reais(totalPdf) + ' difere da soma lida.' : (Number.isFinite(totalPdf) ? ' · Confere com o total do PDF.' : '');
    el('cusRastResumo').textContent = arquivo + ' · Competência ' + mesBr(competenciaPdf) + ' · ' + grupos.length + ' veículo(s) · ' + reais(soma) + aviso;
    el('cusRastLinhas').innerHTML = grupos.map(function (g, i) {
      var s = situacao(g);
      return '<tr><td><input type="checkbox" data-rast-sel="' + i + '"' + (g.selecionado ? ' checked' : '') + (s.ok ? '' : ' disabled') + ' aria-label="Selecionar ' + esc(g.placa) + '"></td>' +
        '<td>' + esc(g.veiculo || g.placa) + '</td><td>' + esc(g.motorista || '—') + '</td><td>' + mesBr(g.competencia) + '</td>' +
        '<td title="' + esc(g.itens.map(function (d) { return d.plano + ' ' + reais(Math.round(d.valor * 100)); }).join('\n')) + '">' + g.itens.length + '</td>' +
        '<td>' + reais(g.cents) + '</td><td>' + esc(s.t) + '</td><td class="text-nowrap">' +
        '<button type="button" class="btn btn-sm btn-primary" data-rast-lancar="' + i + '"' + (s.ok ? '' : ' disabled') + '>Lançar</button> ' +
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-rast-editar="' + i + '">Editar</button> ' +
        '<button type="button" class="btn btn-sm btn-outline-danger" data-rast-excluir="' + i + '">Excluir</button></td></tr>';
    }).join('') + '<tr class="fw-semibold"><td></td><td colspan="4">Total</td><td>' + reais(soma) + '</td><td colspan="2"></td></tr>';
    var todos = el('cusRastTodos'); if (todos) { var aptos = grupos.filter(function (g) { return situacao(g).ok; }); todos.checked = aptos.length > 0 && aptos.every(function (g) { return g.selecionado; }); }
  }
  function registro(g) {
    return { id:'cus-rast-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9), data:g.data || (g.competencia + '-01'), competencia:g.competencia,
      veiculo:g.veiculo, motorista:g.motorista || '', categoria:CATEGORIA, tipo:'fixo', descricao:g.descricao, valor:g.cents / 100, parcelas:1,
      status:'Realizado', rateio:'nao', observacao:'Demonstrativo ' + arquivo, origem:'rastreamento_importado', origemChave:chave(g),
      detalhesRastreamento:g.itens };
  }
  async function lancar(lista) {
    if (salvando || typeof db === 'undefined' || !Array.isArray(db.custos)) return;
    lista = lista.filter(function (g) { return situacao(g).ok; });
    if (!lista.length) { alert('Nenhum veículo apto para lançar.'); return; }
    var soma = lista.reduce(function (s, g) { return s + g.cents; }, 0);
    if (!confirm('Lançar ' + lista.length + ' custo(s) de ' + CATEGORIA + ' na competência ' + mesBr(lista[0].competencia) + ', total ' + reais(soma) + '?')) return;
    salvando = true;
    var novos = lista.map(registro);
    novos.forEach(function (r) { db.custos.push(r); });
    try {
      if (typeof salvarNuvem !== 'function') throw new Error('Gravação indisponível.');
      var ok = await salvarNuvem(['custos']);
      if (ok === false) throw new Error('Falha ao salvar.');
      grupos = grupos.filter(function (g) { return lista.indexOf(g) < 0; });
      desenhar(); if (typeof window.renderCustosFrota === 'function') window.renderCustosFrota();
    } catch (err) {
      novos.forEach(function (r) { var ix = db.custos.indexOf(r); if (ix >= 0) db.custos.splice(ix, 1); });
      alert('Não foi possível lançar: ' + err.message);
    } finally { salvando = false; }
  }
  function editar(g) {
    var v = prompt('Valor total de ' + g.placa + ' (R$):', (g.cents / 100).toFixed(2).replace('.', ','));
    if (v === null) return;
    var c = centavos(v); if (!Number.isFinite(c) || c <= 0) { alert('Valor inválido.'); return; }
    var d = prompt('Descrição:', g.descricao); if (d === null) return;
    var mot = prompt('Motorista:', g.motorista); if (mot === null) return;
    g.cents = c; g.descricao = texto(d) || g.descricao; g.motorista = texto(mot); desenhar();
  }
  function iniciar() {
    var pane = el('cusPane-lancamentos'); if (!pane || el('cusRastArquivo')) return;
    var box = document.createElement('section'); box.className = 'cus-panel';
    box.innerHTML = '<h5>Importar demonstrativo de rastreamento / telemetria</h5><label for="cusRastArquivo">Demonstrativo em PDF</label>' +
      '<input id="cusRastArquivo" type="file" accept=".pdf,application/pdf" class="form-control" data-nao-limpar="1">' +
      '<div id="cusRastPrevia" hidden><p id="cusRastResumo" class="cus-note" aria-live="polite"></p>' +
      '<div class="d-flex flex-wrap gap-3 mb-2 align-items-end"><div><label for="cusRastComp">Competência</label><input id="cusRastComp" type="month" class="form-control form-control-sm"></div>' +
      '<div><label for="cusRastData">Data do lançamento</label><input id="cusRastData" type="date" class="form-control form-control-sm"></div></div>' +
      '<div class="d-flex flex-wrap gap-2 mb-2"><button id="cusRastLancarSel" type="button" class="btn btn-primary btn-sm">Lançar selecionados</button>' +
      '<button id="cusRastLancarTodos" type="button" class="btn btn-outline-primary btn-sm">Lançar todos</button>' +
      '<button id="cusRastExcluirSel" type="button" class="btn btn-outline-danger btn-sm">Excluir selecionados</button>' +
      '<button id="cusRastExcluirTodos" type="button" class="btn btn-outline-secondary btn-sm">Excluir todos</button></div>' +
      '<div class="cus-table-wrap"><table class="table cus-table" data-sem-relatorio="1"><thead><tr><th><input id="cusRastTodos" type="checkbox" aria-label="Selecionar todos"></th><th>Placa</th><th>Motorista</th><th>Competência</th><th>Itens</th><th>Total</th><th>Situação</th><th>Ação</th></tr></thead><tbody id="cusRastLinhas"></tbody></table></div></div>';
    pane.insertBefore(box, pane.firstChild);
    el('cusRastArquivo').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0]; if (!file) return;
      grupos = []; desenhar();
      if (!/\.pdf$/i.test(file.name) || file.size > 15 * 1024 * 1024) { alert('Selecione um PDF de até 15 MB.'); ev.target.value = ''; return; }
      Promise.all([carregarPdfJs(), file.arrayBuffer()]).then(function (r) { return linhasPdf(r[1]); }).then(function (linhas) {
        var res = interpretar(linhas);
        if (!res.grupos.length) throw new Error('Nenhuma linha de equipamento encontrada.');
        arquivo = file.name; competenciaPdf = res.competencia; totalPdf = res.total; grupos = res.grupos; grupos.forEach(function (g) { g.data = res.competencia + '-01'; }); el('cusRastComp').value = res.competencia; el('cusRastData').value = res.competencia + '-01'; desenhar();
      }).catch(function (err) { alert('Não foi possível ler o demonstrativo: ' + err.message); }).finally(function () { ev.target.value = ''; });
    });
    box.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.id === 'cusRastComp' && /^\d{4}-\d{2}$/.test(t.value)) { competenciaPdf = t.value; el('cusRastData').value = t.value + '-01'; grupos.forEach(function (g) { g.competencia = t.value; g.data = t.value + '-01'; g.descricao = 'Rastreamento/telemetria ' + mesBr(t.value) + ' · ' + g.itens.length + ' item(ns)'; }); desenhar(); return; }
      if (t.id === 'cusRastData' && t.value) { grupos.forEach(function (g) { g.data = t.value; }); return; }
      if (t.id === 'cusRastTodos') { grupos.forEach(function (g) { if (situacao(g).ok) g.selecionado = t.checked; }); desenhar(); }
      else if (t.dataset.rastSel != null) { grupos[Number(t.dataset.rastSel)].selecionado = t.checked; desenhar(); }
    });
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var d = b.dataset;
      if (d.rastLancar != null) lancar([grupos[Number(d.rastLancar)]]);
      else if (d.rastEditar != null) editar(grupos[Number(d.rastEditar)]);
      else if (d.rastExcluir != null) { if (confirm('Remover ' + grupos[Number(d.rastExcluir)].placa + ' da prévia?')) { grupos.splice(Number(d.rastExcluir), 1); desenhar(); } }
      else if (b.id === 'cusRastLancarSel') lancar(grupos.filter(function (g) { return g.selecionado; }));
      else if (b.id === 'cusRastLancarTodos') lancar(grupos.slice());
      else if (b.id === 'cusRastExcluirSel') { var s = grupos.filter(function (g) { return g.selecionado; }); if (!s.length) { alert('Nenhum veículo selecionado.'); return; } if (confirm('Remover ' + s.length + ' veículo(s) da prévia?')) { grupos = grupos.filter(function (g) { return !g.selecionado; }); desenhar(); } }
      else if (b.id === 'cusRastExcluirTodos') { if (confirm('Limpar toda a prévia?')) { grupos = []; desenhar(); } }
    });
  }
  window.fmRastreamentoInterpretar = interpretar;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  setTimeout(iniciar, 1500);
})();
