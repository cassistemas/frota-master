/* Extrato de pedágios: leitura local, consolidação por placa e confirmação explícita. */
(function () {
  'use strict';
  var grupos = [], divergencias = [], arquivo = '', salvando = false, competencias = {}, datasResumo = {}, competenciasResumo = {};
  function el(id) { return document.getElementById(id); }
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function placa(v) { return texto(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function esc(v) { return texto(v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function reais(c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function centavos(v) { if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : NaN; var s = texto(v).replace(/[^\d,.-]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return s && Number.isFinite(Number(s)) ? Math.round(Number(s) * 100) : NaN; }
  function data(v) {
    if (v instanceof Date && !isNaN(v)) return [v.getFullYear(), String(v.getMonth() + 1).padStart(2, '0'), String(v.getDate()).padStart(2, '0')].join('-');
    var m = texto(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (!m) return '';
    var d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return d.getFullYear() === Number(m[3]) && d.getMonth() + 1 === Number(m[2]) && d.getDate() === Number(m[1]) ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }
  function coluna(row, cab, nome) { return row[cab.indexOf(nome)]; }
  function linhas(wb, nome, cabecalhos) {
    var sh = wb.Sheets[nome]; if (!sh) throw new Error('A aba ' + nome + ' não foi encontrada.');
    // Alguns extratos declaram !ref=A1 mesmo com milhares de células: expandir a área real.
    var keys = Object.keys(sh).filter(function (k) { return /^[A-Z]+\d+$/.test(k); });
    if (keys.length) {
      var maxR = 1, maxC = 0;
      keys.forEach(function (k) { var m = k.match(/^([A-Z]+)(\d+)$/), c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + m[1].charCodeAt(i) - 64; maxR = Math.max(maxR, Number(m[2])); maxC = Math.max(maxC, c); });
      sh['!ref'] = 'A1:' + XLSX.utils.encode_cell({ r: maxR - 1, c: maxC - 1 });
    }
    var rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: true });
    var header = (rows.shift() || []).map(function (v) { return texto(v).toUpperCase(); });
    if (cabecalhos.some(function (h) { return header.indexOf(h) < 0; })) throw new Error('Faltam colunas obrigatórias na aba ' + nome + '.');
    return { cab: header, rows: rows.filter(function (r) { return r.some(function (v) { return texto(v); }); }) };
  }
  function chave(d) { return [placa(d.placa), d.dataHora, texto(d.tag), texto(d.rodovia).toUpperCase(), texto(d.praca).toUpperCase(), d.centavos].join('|'); }
  function referenciaResumo(d) { return [d.extrato, d.placa, d.categoria.toUpperCase()].join('|'); }
  function resumosExistentes() {
    var out = new Set();
    if (typeof db !== 'undefined' && Array.isArray(db.custos)) db.custos.forEach(function (c) {
      if (c.origem === 'pedagio_resumo' && c.referenciaResumo) out.add(c.referenciaResumo);
    });
    return out;
  }
  function existentes() {
    var out = new Set();
    if (typeof db !== 'undefined' && Array.isArray(db.custos)) db.custos.forEach(function (c) {
      if (c.origem === 'pedagio_importado' && Array.isArray(c.detalhesPedagio)) c.detalhesPedagio.forEach(function (d) {
        if (d.chave) out.add(d.chave);
        else if (d.dataHora && d.valor != null) out.add(chave({ placa: c.veiculo, dataHora: d.dataHora, tag: d.tag, rodovia: d.rodovia, praca: d.praca, centavos: Math.round(Number(d.valor) * 100) }));
      });
    });
    return out;
  }
  function ler(wb, nomeArquivo) {
    var det = linhas(wb, 'PASSAGENS_PEDAGIO', ['PLACA','TAG','DATA','RODOVIA','PRACA','VALOR']);
    var resumo = linhas(wb, 'RESUMO_PASSAGENS_PEDAGIO', ['PLACA','CATEGORIA','PASSAGENS','VALOR']);
    var agrupados = new Map(), totais = new Map(), repetidos = new Set();
    det.rows.forEach(function (row, i) {
      var p = placa(coluna(row, det.cab, 'PLACA')), raw = coluna(row, det.cab, 'DATA'), dia = data(raw), valor = centavos(coluna(row, det.cab, 'VALOR'));
      if (!p || !dia || !Number.isSafeInteger(valor) || valor <= 0) throw new Error('Passagem inválida na linha ' + (i + 2) + ': confira placa, data e valor.');
      var categoria = texto(coluna(row, det.cab, 'CATEGORIA')), d = { placa:p, data:dia, dataHora:texto(raw), tag:texto(coluna(row, det.cab, 'TAG')), rodovia:texto(coluna(row, det.cab, 'RODOVIA')), praca:texto(coluna(row, det.cab, 'PRACA')), categoria:categoria, centavos:valor, valor:valor / 100 };
      d.chave = chave(d);
      if (repetidos.has(d.chave)) throw new Error('Passagem repetida na planilha (linha ' + (i + 2) + ').');
      repetidos.add(d.chave);
      var key = p + '|' + categoria.toUpperCase(), sub = totais.get(key) || { count:0, cents:0 }; sub.count++; sub.cents += valor; totais.set(key, sub);
       var mes = dia.slice(0,7), id = p, grupo = agrupados.get(id);
       if (!grupo) { grupo = { id:id, placa:p, meses:[], detalhes:[], cents:0 }; agrupados.set(id, grupo); }
       if (grupo.meses.indexOf(mes) < 0) grupo.meses.push(mes);
      grupo.detalhes.push(d); grupo.cents += valor;
    });
    var alertas = [];
    resumo.rows.forEach(function (row) {
      var p = placa(coluna(row, resumo.cab, 'PLACA')), categoria = texto(coluna(row, resumo.cab, 'CATEGORIA'));
      if (!p) return;
      var n = Number(coluna(row, resumo.cab, 'PASSAGENS')), c = centavos(coluna(row, resumo.cab, 'VALOR'));
      if (!Number.isInteger(n) || !Number.isSafeInteger(c)) throw new Error('Resumo inválido para ' + p + '.');
      var key = p + '|' + categoria.toUpperCase(), detalhe = totais.get(key) || { count:0, cents:0 };
      if (n !== detalhe.count || c !== detalhe.cents) alertas.push({ placa:p, categoria:categoria, count:n - detalhe.count, cents:c - detalhe.cents });
      totais.delete(key);
    });
    totais.forEach(function (v, key) { alertas.push({ placa:key.split('|')[0], categoria:key.split('|')[1], count:-v.count, cents:-v.cents }); });
     // A referência usa o conteúdo do extrato, não o nome do arquivo: renomear não libera duplicatas.
     var assinatura = Array.from(repetidos).sort().join('\n') + '\n' + resumo.rows.map(function (r) { return [placa(coluna(r, resumo.cab, 'PLACA')), texto(coluna(r, resumo.cab, 'CATEGORIA')).toUpperCase(), coluna(r, resumo.cab, 'PASSAGENS'), centavos(coluna(r, resumo.cab, 'VALOR'))].join('|'); }).sort().join('\n');
     var hash = 2166136261;
     for (var j = 0; j < assinatura.length; j++) { hash ^= assinatura.charCodeAt(j); hash = Math.imul(hash, 16777619); }
     var numeroExtrato = texto(nomeArquivo).match(/^Extrato[_ -](\d+)(?:-\d+)?\.xlsx?$/i);
     alertas.forEach(function (d) { d.extrato = numeroExtrato ? 'extrato-' + numeroExtrato[1] : (hash >>> 0).toString(36); });
     return { grupos:Array.from(agrupados.values()).sort(function (a,b) { return a.placa.localeCompare(b.placa); }), divergencias:alertas };
  }
  function cadastro(p) {
    if (typeof db === 'undefined' || !Array.isArray(db.veiculos)) return null;
    return db.veiculos.find(function (v) { return placa(v.vplaca) === p; }) || null;
  }
  function pendentes(g) { var vistos = existentes(); return g.detalhes.filter(function (d) { return !vistos.has(d.chave); }); }
  function desenhar() {
    var box = el('cusPedPrevia'); if (!box) return;
    var pend = grupos.map(function (g) { return { grupo:g, detalhes:pendentes(g) }; }).filter(function (x) { return x.detalhes.length; });
    var cents = pend.reduce(function (s,x) { return s + x.detalhes.reduce(function (a,d) { return a + d.centavos; },0); },0);
     el('cusPedResumo').textContent = arquivo + ' · ' + pend.length + ' pré-lançamento(s) por placa · ' + pend.reduce(function (n,x) { return n+x.detalhes.length; },0) + ' passagens pendentes · ' + reais(cents);
    var prontoBanco = typeof window.fmModuloCarregado === 'function' && window.fmModuloCarregado('custos') && window.fmModuloCarregado('veiculos');
     el('cusPedLinhas').innerHTML = grupos.map(function (g, i) {
       var falta = pendentes(g); if (!falta.length) return '';
       var valor = falta.reduce(function (n,d) { return n+d.centavos; },0), v = cadastro(g.placa), pronto = !!v && texto(v.vstatus).toUpperCase() !== 'VENDIDO';
       var meses = Array.from(new Set(falta.map(function (d) { return d.data.slice(0,7); }))).sort(), selecionado = competencias[g.id] || (meses.length === 1 ? meses[0] : '');
       var celulaMes = meses.length === 1 ? esc(meses[0].slice(5) + '/' + meses[0].slice(0,4)) : '<select class="form-select form-select-sm" data-ped-competencia="' + i + '" aria-label="Competência de ' + esc(g.placa) + '"><option value="">Escolha o mês</option>' + meses.map(function (m) { return '<option value="' + m + '"' + (m === selecionado ? ' selected' : '') + '>' + m.slice(5) + '/' + m.slice(0,4) + '</option>'; }).join('') + '</select>';
       return '<tr><td><b>' + esc(g.placa) + '</b></td><td>' + celulaMes + '</td><td>' + falta.length + (falta.length !== g.detalhes.length ? ' de ' + g.detalhes.length : '') + '</td><td><b>' + reais(valor) + '</b></td><td>' + (!prontoBanco ? 'Aguardando dados' : !v ? 'Veículo não cadastrado' : !pronto ? 'Veículo vendido' : !selecionado ? 'Escolha a competência' : 'Aguardando confirmação') + '</td><td>' + (prontoBanco && pronto && selecionado ? '<button type="button" class="btn btn-primary btn-sm" data-ped-confirmar="' + i + '">Confirmar lançamento</button>' : '—') + '</td></tr>';
    }).join('');
     var vistosResumo = resumosExistentes();
     el('cusPedDivergencias').innerHTML = divergencias.length ? '<strong>Diferenças do resumo para conferência:</strong> ' + divergencias.map(function (d) { return esc(d.placa) + ' · ' + esc(d.categoria) + ' · ' + d.count + ' passagem(ns) · ' + reais(d.cents) + (vistosResumo.has(referenciaResumo(d)) ? ' (lançado)' : ''); }).join('; ') : 'Resumo conciliado com as passagens detalhadas.';
     el('cusPedResumoLinhas').innerHTML = divergencias.map(function (d, i) {
       if (d.count <= 0 || d.cents <= 0 || vistosResumo.has(referenciaResumo(d))) return '';
       var v = cadastro(d.placa), pronto = !!v && texto(v.vstatus).toUpperCase() !== 'VENDIDO', dia = datasResumo[i] || '', mes = competenciasResumo[i] || (dia ? dia.slice(0,7) : '');
       return '<tr><td><b>' + esc(d.placa) + '</b></td><td>' + d.count + ' sem detalhe</td><td><b>' + reais(d.cents) + '</b></td><td><input type="date" class="form-control form-control-sm" data-ped-resumo-data="' + i + '" aria-label="Data conferida para ' + esc(d.placa) + '" value="' + esc(dia) + '"></td><td><input type="month" class="form-control form-control-sm" data-ped-resumo-mes="' + i + '" aria-label="Competência conferida para ' + esc(d.placa) + '" value="' + esc(mes) + '"></td><td>' + (!prontoBanco ? 'Aguardando dados' : !v ? 'Veículo não cadastrado' : !pronto ? 'Veículo vendido' : !dia || !mes ? 'Informe data e competência' : 'Aguardando confirmação') + '</td><td>' + (prontoBanco && pronto && dia && mes ? '<button type="button" class="btn btn-primary btn-sm" data-ped-resumo-confirmar="' + i + '">Confirmar lançamento</button>' : '—') + '</td></tr>';
     }).join('');
     el('cusPedResumoConferencia').hidden = !el('cusPedResumoLinhas').innerHTML;
    box.hidden = false;
  }
  async function confirmarResumo(i) {
    if (salvando || typeof window.fmModuloCarregado !== 'function' || !window.fmModuloCarregado('custos') || !window.fmModuloCarregado('veiculos')) return;
    var d = divergencias[i];
    if (!d || d.count <= 0 || d.cents <= 0 || typeof db === 'undefined' || !Array.isArray(db.custos)) return;
    var v = cadastro(d.placa), dia = datasResumo[i], mes = competenciasResumo[i] || (dia ? dia.slice(0,7) : ''), ref = referenciaResumo(d);
    if (!v || texto(v.vstatus).toUpperCase() === 'VENDIDO' || !/^\d{4}-\d{2}-\d{2}$/.test(dia || '') || data(dia.split('-').reverse().join('/')) !== dia || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '') || resumosExistentes().has(ref)) { desenhar(); return; }
    if (!confirm('O resumo indica ' + d.count + ' passagem(ns) de ' + v.vplaca + ' sem data ou praça detalhada. Conferiu que ' + reais(d.cents) + ' ainda não foi lançado? Salvar em ' + dia.split('-').reverse().join('/') + ', competência ' + mes.slice(5) + '/' + mes.slice(0,4) + '?')) return;
    salvando = true;
    var registro = { id:'cus-ped-res-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9), data:dia, competencia:mes, veiculo:v.vplaca, motorista:v.vmotorista || '', categoria:'Pedágio', tipo:'variavel', descricao:'Pedágio do resumo · ' + d.count + ' passagem(ns) sem detalhe', valor:d.cents / 100, parcelas:1, status:'Realizado', rateio:'nao', observacao:'Extrato ' + arquivo + ' · diferença do resumo sem data/praça das passagens; data do lançamento informada após conferência', origem:'pedagio_resumo', referenciaResumo:ref, atualizadoEm:new Date().toISOString() };
    db.custos.push(registro);
    try {
      if (typeof salvarNuvem !== 'function') throw new Error('Gravação indisponível.');
      var ok = await salvarNuvem(['custos']);
      if (ok === false) throw new Error('Gravação não confirmada.');
      desenhar(); if (typeof window.renderCustosFrota === 'function') window.renderCustosFrota();
    } catch (err) {
      var ix = db.custos.indexOf(registro); if (ix >= 0) db.custos.splice(ix,1);
      alert('Não foi possível salvar o lançamento. Confira a conexão e tente novamente.');
      desenhar();
    } finally { salvando = false; }
  }
  async function confirmar(i) {
    if (salvando || typeof window.fmModuloCarregado !== 'function' || !window.fmModuloCarregado('custos') || !window.fmModuloCarregado('veiculos')) return;
    var g = grupos[i]; if (!g || typeof db === 'undefined' || !Array.isArray(db.custos)) return;
     var v = cadastro(g.placa), detalhes = pendentes(g), meses = Array.from(new Set(detalhes.map(function (d) { return d.data.slice(0,7); }))), mes = competencias[g.id] || (meses.length === 1 ? meses[0] : '');
     if (!v || texto(v.vstatus).toUpperCase() === 'VENDIDO' || !detalhes.length || !mes || meses.indexOf(mes) < 0) { desenhar(); return; }
    var soma = detalhes.reduce(function (s,d) { return s + d.centavos; },0);
     if (!confirm('Confirmar ' + detalhes.length + ' passagem(ns) de ' + v.vplaca + ' na competência ' + mes.slice(5) + '/' + mes.slice(0,4) + ', total ' + reais(soma) + '?')) return;
    salvando = true;
     var registro = { id:'cus-ped-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9), data:mes + '-01', competencia:mes, veiculo:v.vplaca, motorista:v.vmotorista || '', categoria:'Pedágio', tipo:'variavel', descricao:'Pedágios ' + mes.slice(5) + '/' + mes.slice(0,4) + ' · ' + detalhes.length + ' passagens', valor:soma / 100, parcelas:1, status:'Realizado', rateio:'nao', observacao:'Extrato ' + arquivo + ' · conferido por placa', origem:'pedagio_importado', detalhesPedagio:detalhes.map(function (d) { return { chave:d.chave, data:d.data, dataHora:d.dataHora, tag:d.tag, rodovia:d.rodovia, praca:d.praca, categoria:d.categoria, valor:d.valor }; }), atualizadoEm:new Date().toISOString() };
    db.custos.push(registro);
    try {
      if (typeof salvarNuvem !== 'function') throw new Error('Gravação indisponível.');
      var ok = await salvarNuvem(['custos']);
      if (ok === false) throw new Error('Gravação não confirmada.');
      desenhar(); if (typeof window.renderCustosFrota === 'function') window.renderCustosFrota();
    } catch (err) {
      var ix = db.custos.indexOf(registro); if (ix >= 0) db.custos.splice(ix,1);
      alert('Não foi possível salvar o lançamento. Confira a conexão e tente novamente.');
      desenhar();
    } finally { salvando = false; }
  }
  function iniciar() {
    var pane = el('cusPane-lancamentos'); if (!pane || el('cusPedArquivo')) return;
     var box = document.createElement('section'); box.className = 'cus-panel'; box.innerHTML = '<h5>Importar extrato de pedágios</h5><label for="cusPedArquivo">Planilha de extrato (.xlsx)</label><input id="cusPedArquivo" type="file" accept=".xlsx,.xls" class="form-control" data-nao-limpar="1"><div id="cusPedPrevia" hidden><p id="cusPedResumo" class="cus-note" aria-live="polite"></p><div class="cus-table-wrap"><table class="table cus-table" data-sem-relatorio="1"><thead><tr><th>Placa</th><th>Competência</th><th>Passagens</th><th>Total</th><th>Situação</th><th>Ação</th></tr></thead><tbody id="cusPedLinhas"></tbody></table></div><p id="cusPedDivergencias" class="cus-note"></p><div id="cusPedResumoConferencia" hidden><div class="cus-table-wrap"><table class="table cus-table" data-sem-relatorio="1"><thead><tr><th>Placa</th><th>Resumo</th><th>Total</th><th>Data conferida</th><th>Competência</th><th>Situação</th><th>Ação</th></tr></thead><tbody id="cusPedResumoLinhas"></tbody></table></div></div></div>';
    pane.insertBefore(box, pane.firstChild);
    el('cusPedArquivo').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0]; if (!file) return;
       grupos = []; divergencias = []; competencias = {}; datasResumo = {}; competenciasResumo = {}; el('cusPedPrevia').hidden = true;
      if (!/\.xlsx?$/i.test(file.name) || file.size > 10 * 1024 * 1024) { alert('Selecione uma planilha Excel de até 10 MB.'); ev.target.value = ''; return; }
      file.arrayBuffer().then(function (buffer) {
        if (!window.XLSX) throw new Error('Leitor de Excel indisponível.');
         var result = ler(XLSX.read(buffer, { type:'array', cellDates:true }), file.name);
        if (!result.grupos.length) throw new Error('Nenhuma passagem detalhada encontrada.');
        arquivo = file.name; grupos = result.grupos; divergencias = result.divergencias; desenhar();
      }).catch(function (err) { alert('Não foi possível ler o extrato: ' + err.message); }).finally(function () { ev.target.value = ''; });
    });
     box.addEventListener('click', function (ev) { var btn = ev.target.closest('[data-ped-confirmar]'); if (btn) confirmar(Number(btn.dataset.pedConfirmar)); var resumo = ev.target.closest('[data-ped-resumo-confirmar]'); if (resumo) confirmarResumo(Number(resumo.dataset.pedResumoConfirmar)); });
     box.addEventListener('change', function (ev) { if (ev.target.matches('[data-ped-competencia]')) { var g = grupos[Number(ev.target.dataset.pedCompetencia)]; if (g) competencias[g.id] = ev.target.value; } else if (ev.target.matches('[data-ped-resumo-data]')) { var i = Number(ev.target.dataset.pedResumoData); datasResumo[i] = ev.target.value; if (!competenciasResumo[i]) competenciasResumo[i] = ev.target.value.slice(0,7); } else if (ev.target.matches('[data-ped-resumo-mes]')) competenciasResumo[Number(ev.target.dataset.pedResumoMes)] = ev.target.value; else return; desenhar(); });
    window.addEventListener('fmModulosCarregados', function () { if (grupos.length) desenhar(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();