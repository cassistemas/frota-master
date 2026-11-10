/* Demonstrativo de rastreamento/telemetria (PDF): leitura local, total por placa, prévia e confirmação explícita. */
(function () {
  'use strict';
  var CATEGORIA = 'Rastreamento / Telemetria';
  var grupos = [], arquivo = '', competenciaPdf = '', totalPdf = NaN, salvando = false, conferencia = null, leitura = 0;
  function bloqueioConferencia() {
    if (!conferencia) return 'Importe um demonstrativo para conferir os valores.';
    if (!Number.isSafeInteger(totalPdf)) return 'Total geral do PDF não identificado. Confira o documento e importe novamente.';
    if (conferencia.pendencias.length) return 'Há linhas pendentes de conferência. Confira os detalhes e importe o PDF corrigido/original.';
    if (conferencia.soma !== totalPdf) return 'O total reconhecido não confere com o PDF. Nenhum lançamento será feito até uma nova leitura conferir.';
    if (grupos.some(function (g) { return g.cents !== g.centsOriginais; })) return 'Valor editado difere dos itens do PDF. Restaure o valor original; não ajuste uma placa para fechar a diferença.';
    return '';
  }
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

  var CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
  function script(src) {
    return new Promise(function (ok, erro) {
      var s = document.createElement('script'); s.src = src;
      s.onload = function () { window.pdfjsLib ? ok() : erro(new Error('x')); };
      s.onerror = function () { s.remove(); erro(new Error('x')); };
      document.head.appendChild(s);
    });
  }
  function carregarPdfJs() {
    if (window.pdfjsLib) { if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; return Promise.resolve(); }
    return script('vendor/pdf.min.js').then(function () { return 'vendor/pdf.worker.min.js'; }, function () {
      return script(CDN + 'pdf.min.js').then(function () { return CDN + 'pdf.worker.min.js'; });
    }).then(function (w) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = w; },
      function () { throw new Error('Leitor de PDF não encontrado (pasta vendor ausente no site e sem internet).'); });
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
  var RE = /^(G\d+-\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(?:(\d{10,})\s+)?([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2})\s+(\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/i;
  var RE_PLACA = /\b([A-Z]{3})[\s-]?(\d[A-Z0-9]\d{2})\b/i;
  var RE_DINHEIRO = /(?:^|\s)(?:R\$\s*)?(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*$/i;
  function subtotal(l) { return /\b(SUB[ -]?TOTAL|TOTAL|TOTAIS|SOMA)\b/i.test(l); }
  function itemLinha(l, equipamento) {
    var valorFinal = l.match(RE_DINHEIRO), p = l.match(RE_PLACA);
    if (subtotal(l) || !valorFinal || !p) return null;
    var valor = centavos(valorFinal[1]); if (!Number.isSafeInteger(valor) || valor <= 0) return null;
    var r = l.match(RE), datas = l.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
    // Uma linha de contrato incompleta não pode usar uma data ou preço intermediário como total.
    if (/^G\S+/i.test(l) && (datas.length < 3 || !/\d{2}\/\d{2}\/\d{4}\s+.*\d,\d{2}\s*$/.test(l))) return null;
    return { placa:placa(p[0]), alternativo:!r, detalhe:{
      contrato:r ? r[1] : (/^(G\S+)/i.exec(l) || [,''])[1], serie:r ? r[3] : '', antena:r ? (r[4] || '') : '',
      equipamento:equipamento, plano:r ? texto(r[7]) : l, inicio:r ? r[8] : (datas[1] || ''), fim:r ? r[9] : (datas[2] || ''),
      valor:valor / 100, linhaOriginal:l }, cents:valor };
  }
  function interpretar(linhas) {
    var comp = '', total = NaN, mapa = {}, equipamento = '', resumo = false;
    var pendencias = [], alternativas = 0, vistos = Object.create(null);
    for (var i = 0; i < linhas.length; i++) {
      var l = texto(linhas[i]).replace(/\s+/g, ' '), numero = i + 1;
      var m = l.match(/COMPET[ÊE]NCIA:?\s*(\d{2})\/(\d{4})/i); if (m && !comp) comp = m[2] + '-' + m[1];
      var e = l.match(/EQUIPAMENTOS\s*\|\s*\d+\s+(.+)$/i); if (e) equipamento = texto(e[1]);
      if (/^RESUMO\b/i.test(l)) resumo = true;
      var t = l.match(/^(?:TOTAL\s+GERAL|TOTAIS)(?:\s+\d+)?\s+(?:R\$\s*)?([\d.,]+)\s*$/i);
      if (t && (resumo || /^TOTAL\s+GERAL/i.test(l))) {
        var declarado = centavos(t[1]);
        if (Number.isFinite(total) && total !== declarado) pendencias.push({ linha:numero, texto:l, motivo:'Totais conflitantes no documento' });
        total = declarado; continue;
      }
      if (resumo || subtotal(l)) continue;
      var item = itemLinha(l, equipamento);
      // Linhas quebradas: reúna somente a continuação do mesmo contrato, nunca outra cobrança ou resumo.
      if (!item && /^G\S+\s+\d{2}\/\d{2}\/\d{4}/i.test(l) && !RE_DINHEIRO.test(l)) {
        var passos = 0;
        while (!item && i + 1 < linhas.length && passos++ < 3) {
          var proxima = texto(linhas[i + 1]);
          if (!proxima || /^(G\S+|RESUMO|COMPET[ÊE]NCIA|EQUIPAMENTOS|CONTRATO|P[ÁA]GINA)\b/i.test(proxima) || subtotal(proxima)) break;
          var outraPlaca = proxima.match(RE_PLACA), atualPlaca = l.match(RE_PLACA);
          if (outraPlaca && atualPlaca) break;
          l += ' ' + proxima; i++; item = itemLinha(l, equipamento);
        }
      }
      if (!item) {
        if (RE_PLACA.test(l) || /^G\S+\s+\d{2}\/\d{2}\/\d{4}/i.test(l) || RE_DINHEIRO.test(l)) {
          pendencias.push({ linha:numero, texto:l, motivo:'Possível cobrança não reconhecida' });
        }
        continue;
      }
      var d = item.detalhe;
      var identidade = d.contrato ? JSON.stringify([d.contrato.toUpperCase(), d.serie, d.antena, item.placa, d.inicio, d.fim, d.plano, item.cents]) : l.toUpperCase();
      if (identidade && vistos[identidade]) {
        pendencias.push({ linha:numero, texto:l, motivo:'Item repetido; confira o documento original' }); continue;
      }
      if (identidade) vistos[identidade] = true;
      if (item.alternativo) alternativas++;
      if (!mapa[item.placa]) mapa[item.placa] = { placa:item.placa, itens:[], cents:0 };
      mapa[item.placa].itens.push(d); mapa[item.placa].cents += item.cents;
    }
    if (!comp) comp = mesMaisFrequente(linhas);
    if (!comp) throw new Error('Competência não encontrada no demonstrativo.');
    var lista = Object.keys(mapa).sort().map(function (p) {
      var g = mapa[p], v = veiculo(p);
      g.competencia = comp; g.centsOriginais = g.cents; g.selecionado = false;
      g.veiculo = v ? v.vplaca : ''; g.motorista = v ? (v.vmotorista || '') : '';
      g.descricao = 'Rastreamento/telemetria ' + mesBr(comp) + ' · ' + g.itens.length + ' item(ns)';
      g.id = 'g' + Math.random().toString(36).slice(2, 9);
      return g;
    });
    var soma = lista.reduce(function (s, g) { return s + g.cents; }, 0);
    return { grupos:lista, competencia:comp, total:total, soma:soma, diferenca:Number.isFinite(total) ? total - soma : null,
      pendencias:pendencias, alternativas:alternativas };
  }
  function mesMaisFrequente(linhas) {
    var cont = {}, melhor = '', n = 0;
    linhas.forEach(function (l) {
      (l.match(/\b\d{2}\/(0[1-9]|1[0-2])\/(20\d{2})\b/g) || []).forEach(function (d) {
        var k = d.slice(6) + '-' + d.slice(3, 5); cont[k] = (cont[k] || 0) + 1;
        if (cont[k] > n) { n = cont[k]; melhor = k; }
      });
    });
    return melhor;
  }

  function situacao(g) {
    if (!g.veiculo) return { t:'Veículo não cadastrado', ok:false };
    var v = veiculo(placa(g.veiculo));
    if (!v || texto(v.vstatus).toUpperCase() === 'VENDIDO') return { t:'Veículo não disponível', ok:false };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(g.competencia) || !/^\d{4}-\d{2}-\d{2}$/.test(g.data || '') || !Number.isSafeInteger(g.cents) || g.cents <= 0) return { t:'Confira data, competência e valor', ok:false };
    if (jaLancado(g)) return { t:'Já lançado', ok:false };
    if (typeof db !== 'undefined' && Array.isArray(db.custosRecorrentes) && db.custosRecorrentes.some(function(r) { return r.ativo !== false && r.categoria === CATEGORIA && placa(r.veiculo) === placa(g.veiculo) && (!r.inicio || r.inicio.slice(0,7) <= g.competencia) && (!r.fim || r.fim.slice(0,7) >= g.competencia); })) return { t:'Já existe contrato ativo neste mês', ok:false };
    return { t:'Pronto para lançar', ok:true };
  }
  function desenhar() {
    var prev = el('cusRastPrevia'); if (!prev) return;
    prev.hidden = !conferencia;
    var soma = grupos.reduce(function (s, g) { return s + g.cents; }, 0), bloqueio = bloqueioConferencia();
    var resumo = arquivo + ' · Competência ' + mesBr(competenciaPdf) + ' · ' + grupos.length + ' veículo(s) na prévia · Total na prévia: ' + reais(soma);
    if (conferencia) resumo += ' · Total do PDF: ' + (Number.isFinite(totalPdf) ? reais(totalPdf) : 'não identificado') +
      ' · Total reconhecido na leitura: ' + reais(conferencia.soma) + ' · Diferença (PDF − reconhecido): ' +
      (Number.isFinite(totalPdf) ? reais(totalPdf - conferencia.soma) : 'não calculável') +
      ' · Itens por leitura alternativa: ' + conferencia.alternativas + ' · ' + (bloqueio || 'Leitura conferida com o total do PDF.');
    el('cusRastResumo').textContent = resumo;
    var detalhes = el('cusRastPendencias');
    if (detalhes) detalhes.innerHTML = conferencia && conferencia.pendencias.length ? '<details open><summary>' + conferencia.pendencias.length +
      ' linha(s) pendente(s) — lançamentos bloqueados</summary><p>Não distribua a diferença entre veículos. Confira estas linhas no PDF original e importe novamente.</p><ul>' +
      conferencia.pendencias.map(function (p) { return '<li><strong>Linha extraída ' + p.linha + ': ' + esc(p.motivo) + '</strong><div style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(p.texto) + '</div></li>'; }).join('') + '</ul></details>' : '';
    ['cusRastLancarSel','cusRastLancarTodos'].forEach(function (id) { var b = el(id); if (b) { b.disabled = !!bloqueio || salvando || !grupos.some(function (g) { return situacao(g).ok; }); b.title = bloqueio; } });
    el('cusRastLinhas').innerHTML = grupos.map(function (g, i) {
      var s = situacao(g);
      return '<tr><td><input type="checkbox" data-rast-sel="' + i + '"' + (g.selecionado ? ' checked' : '') + (s.ok ? '' : ' disabled') + ' aria-label="Selecionar ' + esc(g.placa) + '"></td>' +
        '<td>' + esc(g.veiculo || g.placa) + '</td><td>' + esc(g.motorista || '—') + '</td><td>' + mesBr(g.competencia) + '</td>' +
        '<td title="' + esc(g.itens.map(function (d) { return d.plano + ' ' + reais(Math.round(d.valor * 100)); }).join('\n')) + '">' + g.itens.length + '</td>' +
        '<td>' + reais(g.cents) + '</td><td>' + esc(s.t) + '</td><td class="text-nowrap">' +
        '<button type="button" class="btn btn-sm btn-primary" data-rast-lancar="' + i + '"' + (s.ok && !bloqueio && !salvando ? '' : ' disabled') + '>Lançar</button> ' +
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
    var bloqueio = bloqueioConferencia(); if (bloqueio) { alert(bloqueio); return; }
    if (typeof window.fmModuloCarregado === 'function' && ['custos','custosRecorrentes','veiculos'].some(function(m) { return !window.fmModuloCarregado(m); })) { alert('Aguarde o carregamento dos dados antes de lançar.'); return; }
    lista = lista.filter(function (g) { return situacao(g).ok; });
    if (!lista.length) { alert('Nenhum veículo apto para lançar.'); return; }
    var soma = lista.reduce(function (s, g) { return s + g.cents; }, 0);
    if (!confirm('Lançar ' + lista.length + ' custo(s) de ' + CATEGORIA + ' na competência ' + mesBr(lista[0].competencia) + ', total ' + reais(soma) + '?')) return;
    salvando = true; desenhar();
    var novos = lista.map(registro);
    novos.forEach(function (r) { db.custos.push(r); });
    try {
      if (typeof salvarNuvem !== 'function') throw new Error('Gravação indisponível.');
      var ok = await salvarNuvem(['custos']);
      if (ok !== true) throw new Error('Salvamento ainda não confirmado; sincronize antes de tentar novamente.');
      grupos = grupos.filter(function (g) { return lista.indexOf(g) < 0; });
      desenhar(); if (typeof window.renderCustosFrota === 'function') window.renderCustosFrota();
    } catch (err) {
      // Shared writer may acknowledge late; retain source keys to prevent another charge.
      alert('Não foi possível lançar: ' + err.message);
      desenhar();
    } finally { salvando = false; desenhar(); }
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
      '<div id="cusRastPrevia" hidden><p id="cusRastResumo" class="cus-note" aria-live="polite"></p><div id="cusRastPendencias" class="cus-note"></div>' +
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
      if (salvando) { alert('Aguarde o salvamento antes de importar outro arquivo.'); ev.target.value = ''; return; }
      var atual = ++leitura;
      grupos = []; conferencia = null; totalPdf = NaN; desenhar();
      if (!/\.pdf$/i.test(file.name) || file.size > 15 * 1024 * 1024) { alert('Selecione um PDF de até 15 MB.'); ev.target.value = ''; return; }
      Promise.all([carregarPdfJs(), file.arrayBuffer()]).then(function (r) { return linhasPdf(r[1]); }).then(function (linhas) {
        if (atual !== leitura) return;
        if (!linhas.join('').trim()) throw new Error('Este PDF parece escaneado (só imagem, sem texto). Use o PDF original emitido pela empresa de rastreamento.');
        var res = interpretar(linhas);
        arquivo = file.name; competenciaPdf = res.competencia; totalPdf = res.total; conferencia = res;
        grupos = res.grupos.slice(); grupos.forEach(function (g) { g.data = res.competencia + '-01'; }); el('cusRastComp').value = res.competencia; el('cusRastData').value = res.competencia + '-01'; desenhar();
        if (!res.grupos.length && !res.pendencias.length) alert('Nenhuma linha de equipamento encontrada. Nenhum lançamento foi feito.');
      }).catch(function (err) { if (atual === leitura) alert('Não foi possível ler o demonstrativo: ' + err.message); }).finally(function () { if (atual === leitura) ev.target.value = ''; });
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
