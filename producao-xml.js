/* Gestão da Frota > Produção e Receitas: importar CT-e (XML) igual a Terceiros.
   Só preenche o formulário; o salvamento continua pelas regras de salvarProducao. */
(function () {
  function tag(doc, nome, raiz) { var l = (raiz || doc).getElementsByTagName(nome); return l && l[0] ? String(l[0].textContent || '').trim() : ''; }
  function nomeDe(doc, t) { var el = doc.getElementsByTagName(t)[0]; return el ? tag(doc, 'xNome', el) : ''; }
  function set(id, val) { var el = document.getElementById(id); if (!el || val === '' || val == null) return; el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  function moeda(x) { var n = Number(String(x || '0').replace(',', '.')) || 0; return n ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''; }
  function placaN(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function tomador(doc) {
    var t4 = doc.getElementsByTagName('toma4')[0];
    if (t4) return tag(doc, 'xNome', t4);
    var cod = tag(doc, 'toma');
    return ({ '0': nomeDe(doc, 'rem'), '1': nomeDe(doc, 'exped'), '2': nomeDe(doc, 'receb'), '3': nomeDe(doc, 'dest') })[cod] || nomeDe(doc, 'dest') || nomeDe(doc, 'rem');
  }

  function aplicar(xml) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (!doc || doc.getElementsByTagName('parsererror').length || !doc.getElementsByTagName('infCte').length) return null;
    var nCT = tag(doc, 'nCT'), serie = tag(doc, 'serie');
    var documento = nCT ? 'CT-e ' + nCT + (serie ? '/' + serie : '') : '';
    var existente = (window.db && Array.isArray(db.producoes) ? db.producoes : []).some(function (x) { return documento && x.documento === documento && x.id !== (document.getElementById('resProdId') || {}).value; });
    var dh = tag(doc, 'dhEmi') || tag(doc, 'dEmi'), data = dh.slice(0, 10);
    var fim = tag(doc, 'dProg') || tag(doc, 'dFimPer') || data;
    var peso = '', pesoReal = '';
    Array.prototype.forEach.call(doc.getElementsByTagName('infQ'), function (q) {
      var un = tag(doc, 'cUnid', q), tp = tag(doc, 'tpMed', q).toUpperCase(), qt = Number(tag(doc, 'qCarga', q).replace(',', '.')) || 0;
      if (!qt || un === '00' || un === '03' || tp.indexOf('CUB') !== -1 || tp.indexOf('M3') !== -1 || tp.indexOf('VOLUME') !== -1) return;
      var kg = un === '02' ? qt * 1000 : qt;
      if (tp.indexOf('REAL') !== -1) pesoReal = kg; else if (peso === '' && (un === '01' || un === '02' || tp.indexOf('PESO') !== -1)) peso = kg;
    });
    if (pesoReal !== '') peso = pesoReal;
    var icms = tag(doc, 'vICMS') || tag(doc, 'vICMSOutraUF') || tag(doc, 'vICMSSN');
    // placa e motorista (CT-e antigo traz no modal rodoviário)
    var placa = placaN(tag(doc, 'placa'));
    var motorista = '';
    var moto = doc.getElementsByTagName('moto')[0]; if (moto) motorista = tag(doc, 'xNome', moto);

    var tipo = document.getElementById('resProdTipo'); if (tipo) { tipo.value = 'viagem'; tipo.dispatchEvent(new Event('change', { bubbles: true })); }
    if (placa) {
      var lista = document.getElementById('cusVeiculosLista'), achou = '';
      if (lista) Array.prototype.forEach.call(lista.options, function (o) { if (!achou && placaN(o.value).indexOf(placa) !== -1) achou = o.value; });
      set('resProdVeiculo', achou || placa);
    }
    set('resProdMotorista', motorista);
    set('resProdCliente', tomador(doc));
    set('resProdDocumento', documento);
    set('resProdData', data);
    set('resProdFim', /^\d{4}-\d{2}-\d{2}$/.test(fim) ? fim : data);
    set('resProdCompetencia', data.slice(0, 7));
    var oC = tag(doc, 'xMunIni'), oU = tag(doc, 'UFIni'), dC = tag(doc, 'xMunFim'), dU = tag(doc, 'UFFim');
    set('resProdOrigem', oC ? oC + (oU ? '-' + oU : '') : '');
    set('resProdDestino', dC ? dC + (dU ? '-' + dU : '') : '');
    if (peso !== '') set('resProdTon', String(Math.round(peso / 1000 * 1000) / 1000));
    set('resProdReceita', moeda(tag(doc, 'vTPrest') || tag(doc, 'vPrest')));
    set('resProdImpostos', moeda(icms));
    var obs = [];
    if (nomeDe(doc, 'emit')) obs.push('Emitente: ' + nomeDe(doc, 'emit'));
    if (nomeDe(doc, 'rem')) obs.push('Remetente: ' + nomeDe(doc, 'rem'));
    if (nomeDe(doc, 'dest')) obs.push('Destinatário: ' + nomeDe(doc, 'dest'));
    if (tag(doc, 'proPred')) obs.push('Carga: ' + tag(doc, 'proPred'));
    var nfs = doc.getElementsByTagName('infNFe').length; if (nfs) obs.push('NF-e: ' + nfs);
    if (tag(doc, 'vCarga')) obs.push('Mercadoria: ' + moeda(tag(doc, 'vCarga')));
    set('resProdObs', obs.join(' | '));
    atualizarTipo();
    return { existente: existente, faltando: [!placa && 'veículo'].filter(Boolean) };
  }


  /* ---- KM da viagem pela rota (OpenStreetMap) ---- */
  var cacheGeo = {};
  function geo(local) {
    var k = local.toUpperCase(); if (cacheGeo[k]) return cacheGeo[k];
    var partes = local.split('-'), uf = partes.length > 1 ? partes.pop().trim() : '', cid = partes.join('-').trim();
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&city=' + encodeURIComponent(cid) + (uf ? '&state=' + encodeURIComponent(uf) : '');
    return (cacheGeo[k] = fetch(url, { headers: { 'Accept-Language': 'pt-BR' } }).then(function (r) { return r.json(); }).then(function (j) { if (!j || !j[0]) throw 0; return j[0].lon + ',' + j[0].lat; }));
  }
  function calcularKm(forcar) {
    var o = (document.getElementById('resProdOrigem') || {}).value || '', d = (document.getElementById('resProdDestino') || {}).value || '';
    var km = document.getElementById('resProdKm'), info = document.getElementById('resProdKmInfo');
    if (!km || !o.trim() || !d.trim()) return Promise.resolve(false);
    if (km.value && !forcar) return Promise.resolve(true);
    if (info) info.textContent = 'Calculando KM pela rota...';
    return Promise.all([geo(o), geo(d)]).then(function (c) {
      return fetch('https://router.project-osrm.org/route/v1/driving/' + c[0] + ';' + c[1] + '?overview=false').then(function (r) { return r.json(); });
    }).then(function (j) {
      var m = j && j.routes && j.routes[0] && j.routes[0].distance; if (!m) throw 0;
      km.value = Math.round(m / 1000); km.dispatchEvent(new Event('input', { bubbles: true }));
      if (info) info.textContent = 'KM calculado pela rota rodoviária (' + o + ' → ' + d + '). Ajuste se o trajeto real foi diferente.';
      return true;
    }).catch(function () { if (info) info.textContent = 'Não foi possível calcular a rota. Informe o KM manualmente.'; return false; });
  }
  window.calcularKmProducao = function () { calcularKm(true); };

  /* ---- Tipo do veículo: lido do cadastro (usado nos cálculos) ---- */
  function atualizarTipo() {
    var el = document.getElementById('resProdTipoVeiculo'); if (!el) return;
    var p = placaN((document.getElementById('resProdVeiculo') || {}).value);
    var v = p && window.db && Array.isArray(db.veiculos) ? db.veiculos.find(function (x) { return placaN(x.vplaca) === p; }) : null;
    el.value = v ? (v.vtipo || 'Tipo não informado no cadastro do veículo') : (p ? 'Veículo não encontrado no cadastro' : '');
  }
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'resProdVeiculo') atualizarTipo(); });
  document.addEventListener('change', function (e) { if (!e.target) return; if (e.target.id === 'resProdVeiculo') atualizarTipo(); if (e.target.id === 'resProdOrigem' || e.target.id === 'resProdDestino') calcularKm(false); });
  document.addEventListener('click', function (e) { if (e.target && /editarProd|limparProd|salvarProducao/.test(e.target.getAttribute && e.target.getAttribute('onclick') || '')) setTimeout(atualizarTipo, 300); }, true);

  window.importarCteProducao = function (input) {
    var arq = input && input.files && input.files[0]; if (!arq) return;
    var r = new FileReader();
    r.onload = function () {
      var res = null; try { res = aplicar(String(r.result || '')); } catch (e) { res = null; }
      input.value = '';
      if (!res) { alert('Não foi possível ler este arquivo como CT-e. Envie o XML original do CT-e.'); return; }
      calcularKm(true).then(function (okKm) {
        var falta = res.faltando.concat(okKm ? [] : ['KM da viagem']);
        var msg = 'Dados do CT-e importados.' + (falta.length ? ' Complete: ' + falta.join(', ') + '.' : '') + ' Confira e clique em Salvar.';
        if (res.existente) msg = 'Atenção: este CT-e já foi lançado em Produção e Receitas.\n\n' + msg;
        alert(msg);
      });
    };
    r.onerror = function () { input.value = ''; alert('Não foi possível ler o arquivo.'); };
    r.readAsText(arq, 'UTF-8');
  };

  function injetar() {
    var pane = document.getElementById('cusPane-producao');
    if (!pane || document.getElementById('resProdCteArquivo')) return;
    var grid = pane.querySelector('.cus-form-grid'); if (!grid) return;
    var box = document.createElement('div');
    box.style.cssText = 'margin:0 0 12px';
    box.innerHTML = '<label class="form-label-mini">Importar CT-e (XML)</label><input type="file" id="resProdCteArquivo" data-nao-limpar="1" class="form-control" accept=".xml,text/xml,application/xml" onchange="importarCteProducao(this)"><small class="text-muted">Preenche os campos automaticamente. Confira, informe o KM da viagem e clique em Salvar. O arquivo não fica guardado.</small>';
    grid.parentNode.insertBefore(box, grid);
    var kmEl = document.getElementById('resProdKm');
    if (kmEl && !document.getElementById('resProdKmInfo')) kmEl.insertAdjacentHTML('afterend', '<button type="button" class="btn btn-sm btn-outline-secondary mt-1" onclick="calcularKmProducao()">Calcular pela rota</button><small id="resProdKmInfo" class="text-muted d-block"></small>');
    var veic = document.getElementById('resProdVeiculo');
    if (veic && !document.getElementById('resProdTipoVeiculo')) veic.parentNode.insertAdjacentHTML('afterend', '<div><label>Tipo do veículo (do cadastro)</label><input id="resProdTipoVeiculo" data-nao-limpar="1" class="form-control" readonly tabindex="-1" placeholder="Preenchido pelo veículo"></div>');
    [['resProdSituacao', 'Define quando a receita entra no caixa'], ['resProdRecebimento', 'Data em que o dinheiro entrou'], ['resProdStatus', 'Cancelada não entra nos cálculos']].forEach(function (x) { var el = document.getElementById(x[0]); if (el) el.title = x[1]; });
  }
  new MutationObserver(injetar).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', injetar);
})();
