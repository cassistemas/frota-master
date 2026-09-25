/* =====================================================================
   Frota Master - Sub-aba "Cadastro de Fretes" dentro do modulo Terceiros
   - Cadastro/edicao/exclusao de fretes (banco de dados)
   - Geracao do card visual do frete (canvas) no padrao Cargo Center
   - Envio por WhatsApp para os terceiros cadastrados
   ===================================================================== */
(function () {
  'use strict';

  var fretes = [];

  function novoId() {
    return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function garantirIds(lista) {
    (lista || []).forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      if (!f._fid) f._fid = novoId();
      if (!f._ts) f._ts = 0;
    });
    return lista || [];
  }

  function carregar() {
    fretes = [];
    // Mantem a lista do modulo acessivel para a fila tecnica de sincronizacao.
    // Sem isso, um frete criado antes da primeira resposta do banco nao tinha
    // seus dados guardados na fila e podia desaparecer ao receber o snapshot.
    try { if (typeof db !== 'undefined') db.fretes = fretes; } catch (e) {}
  }
  function logado() {
    // "auth" foi declarado com const no script principal: ele existe no
    // escopo global lexico, mas nao como window.auth.
    try { return !!(typeof auth !== 'undefined' && auth && auth.currentUser); } catch (e) { return false; }
  }
  function nuvem() {
    try { if (typeof dbCloud !== 'undefined' && dbCloud && dbCloud.collection) return dbCloud; } catch (e) {}
    return null;
  }

  /* A fila guarda apenas o nome do modulo. Os registros ficam somente no banco. */
  function pendenteLer() {
    try { return typeof fmFilaLer === 'function' && fmFilaLer().indexOf('fretes') !== -1; }
    catch (e) { return false; }
  }
  function pendenteGravar(v) {
    try {
      if (v && typeof fmFilaAdicionar === 'function') fmFilaAdicionar(['fretes']);
      if (!v && typeof fmFilaRemover === 'function') fmFilaRemover(['fretes']);
    } catch (e) {}
    try { if (typeof window.fmMarcarPendencias === 'function') window.fmMarcarPendencias(v ? 1 : 0); } catch (e) {}
  }

  var envioPendente = false;

  function gravarNuvem() {
    var cloud = nuvem();
    if (!cloud || !logado()) {
      envioPendente = true;
      pendenteGravar(true);
      try { if (typeof statusNuvem === 'function') statusNuvem('Sem conexão com o banco. O frete ainda não foi salvo.', '#dc3545'); } catch (e) {}
      return Promise.resolve(false);
    }
    if (typeof window.fmModuloCarregado === 'function' && !window.fmModuloCarregado('fretes')) {
      envioPendente = true;
      pendenteGravar(true);
      return Promise.resolve(false);
    }
    envioPendente = false;
    try { if (typeof carimbarRegistros === 'function') carimbarRegistros(); } catch (e) {}
    var p = cloud.collection('frota').doc('fretes')
      .set({ dados: fretes, excluidos: [], atualizadoEm: new Date().toISOString() }, { merge: true });
    return p.then(function () {
      envioPendente = false;
      pendenteGravar(false);
      try { if (typeof window.fmMarcarSyncConfirmado === 'function') window.fmMarcarSyncConfirmado(); } catch (e) {}
      return true;
    }).catch(function (err) {
      console.error('Erro ao salvar fretes no banco:', err);
      envioPendente = true;
      pendenteGravar(true);
      try {
        if (typeof statusNuvem === 'function')
          statusNuvem('ERRO ao gravar fretes: ' + (err && err.code || 'desconhecido'), '#dc3545');
      } catch (e) {}
      return false;
    });
  }

  function consolidar(remotos) {
    if (typeof window.fmDeduplicarLista === 'function') {
      return window.fmDeduplicarLista('fretes', remotos || [], true).dados;
    }
    return garantirIds(Array.isArray(remotos) ? remotos : []);
  }

  var escutando = false;
  function escutarNuvem() {
    var cloud = nuvem();
    if (!cloud || escutando || !logado()) return;
    escutando = true;
    cloud.collection('frota').doc('fretes').onSnapshot({ includeMetadataChanges: true }, function (doc) {
      if (window.fmImportandoBackup) return;
      var d = doc.exists ? (doc.data() || {}) : {};
      var dados = Array.isArray(d.dados) ? d.dados : [];
      var servidorConfirmado = !(doc.metadata && doc.metadata.fromCache);
      var pendente = envioPendente || pendenteLer();
      var filaDados = {};
      try { filaDados = typeof fmFilaDadosLer === 'function' ? fmFilaDadosLer() : {}; } catch (e) {}
      var guardados = Array.isArray(filaDados.fretes) ? filaDados.fretes : [];
      var locais = Array.isArray(fretes) ? fretes.concat(guardados) : guardados;

      // O banco continua sendo a fonte principal. Somente registros realmente
      // pendentes entram na conciliacao, impedindo que a primeira leitura
      // apague um frete salvo enquanto a tela ainda carregava.
      fretes = consolidar(pendente && locais.length ? dados.concat(locais) : dados);
      if (typeof db !== 'undefined') db.fretes = fretes;
      try { if (typeof marcarRegistrosCarregados === 'function') marcarRegistrosCarregados(fretes); } catch (e) {}
      if (typeof window.renderFretes === 'function') window.renderFretes();
      if (servidorConfirmado) {
        window.fmModulosCarregados = window.fmModulosCarregados || {};
        window.fmModulosCarregados.fretes = true;
      }
      if (servidorConfirmado && pendente) {
        var assinaturaBanco = '';
        var assinaturaAtual = '';
        try {
          assinaturaBanco = JSON.stringify(consolidar(dados));
          assinaturaAtual = JSON.stringify(fretes);
        } catch (e) {}
        if (assinaturaAtual !== assinaturaBanco) gravarNuvem();
        else pendenteGravar(false);
      }
    }, function (err) { console.error('Erro ao ler fretes do banco:', err); });
  }

  function observarLogin() {
    try {
      if (typeof auth !== 'undefined' && auth && typeof auth.onAuthStateChanged === 'function') {
        auth.onAuthStateChanged(function (u) {
          if (!u) return;
          escutarNuvem();
          if (envioPendente || pendenteLer()) setTimeout(function(){ escutarNuvem(); }, 1500);
        });
        return;
      }
    } catch (e) {}
    setTimeout(observarLogin, 1000);
  }
  observarLogin();

  // reenvia sozinho quando a internet volta e periodicamente
  window.addEventListener('online', function () {
    if (envioPendente || pendenteLer()) gravarNuvem();
  });
  setInterval(function () {
    if ((envioPendente || pendenteLer()) && navigator.onLine && logado()) gravarNuvem();
  }, 30000);
  window.fmEnviarFretesPendentes = function () {
    if (envioPendente || pendenteLer()) gravarNuvem();
  };

  function persistir() {
    return gravarNuvem();
  }


  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value).trim() : ''; }
  function setVal(id, v) { var e = document.getElementById(id); if (e) e.value = v == null ? '' : v; }
  function soDigitos(s) { return String(s || '').replace(/\D+/g, ''); }
  function dataBR(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }
  function dataHoraBR(v) {
    if (!v) return '';
    var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + 'h' + m[5];
    return String(v);
  }
  function moedaBR(v) {
    var d = soDigitos(v);
    if (!d) return '';
    d = d.replace(/^0+(?=\d{3})/, '');
    var n = (parseInt(d, 10) || 0) / 100;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function telefoneBR(v) {
    var d = soDigitos(v).slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function aplicarMascaras() {
    ['frevalor', 'frecustoterceiro'].forEach(function (id) {
      var v = document.getElementById(id);
      if (v && !v.dataset.mask) {
        v.dataset.mask = '1';
        v.addEventListener('input', function () { v.value = moedaBR(v.value); });
      }
    });
    var t = document.getElementById('frecontato');
    if (t && !t.dataset.mask) {
      t.dataset.mask = '1';
      t.addEventListener('input', function () { t.value = telefoneBR(t.value); });
    }
  }

  /* ------- vinculo do frete: veiculo proprio ou terceiro contratado ------- */
  function listaArr(k) {
    try { return (typeof db !== 'undefined' && Array.isArray(db[k])) ? db[k] : []; } catch (e) { return []; }
  }
  function preencherSelectsFrete() {
    var sv = document.getElementById('freveiculo');
    if (sv) {
      var atual = sv.value;
      var opc = listaArr('veiculos')
        .filter(function (v) { return v && v.vplaca && String(v.vstatus || '').trim().toUpperCase() !== 'VENDIDO'; })
        .sort(function (a, b) { return String(a.vplaca).localeCompare(String(b.vplaca)); })
        .map(function (v) {
          var rot = v.vplaca + (v.vmodelo ? ' — ' + v.vmodelo : '');
          return '<option value="' + esc(v.vplaca) + '">' + esc(rot) + '</option>';
        }).join('');
      sv.innerHTML = '<option value="">Selecione o veículo</option>' + opc;
      sv.value = atual;
    }
    var st = document.getElementById('freterceiro');
    if (st) {
      var atualT = st.value;
      var opcT = listaArr('terceiros').map(function (t) {
        var rot = (t.terempresa || t.ternome || t.terproprietario || 'Terceiro')
          + (t.terplaca ? ' — ' + t.terplaca : '');
        return '<option value="' + esc(rot) + '">' + esc(rot) + '</option>';
      }).join('');
      st.innerHTML = '<option value="">Selecione o terceiro</option>' + opcT;
      st.value = atualT;
    }
  }
  window.alternarExecucaoFrete = function () {
    var terceiro = val('freexecucao') === 'terceiro';
    [['grpFreVeiculo', !terceiro], ['grpFreTerceiro', terceiro], ['grpFreCustoTerceiro', terceiro]]
      .forEach(function (p) {
        var el = document.getElementById(p[0]);
        if (el) el.classList.toggle('hidden', !p[1]);
      });
  };

  /* ---------------- importacao do CTe (XML) ---------------- */
  function txtTag(doc, nome) {
    var ns = doc.getElementsByTagName(nome);
    return ns && ns[0] ? String(ns[0].textContent || '').trim() : '';
  }
  function aplicarCte(xmlTexto) {
    var doc = new DOMParser().parseFromString(xmlTexto, 'text/xml');
    if (!doc || doc.getElementsByTagName('parsererror').length) return false;
    if (!doc.getElementsByTagName('infCte').length) return false;
    var emi = doc.getElementsByTagName('emit')[0];
    var transportadora = emi ? String((emi.getElementsByTagName('xNome')[0] || {}).textContent || '').trim() : '';
    var dh = txtTag(doc, 'dhEmi') || txtTag(doc, 'dEmi');
    if (dh) setVal('fredata', String(dh).slice(0, 10));
    var oCid = txtTag(doc, 'xMunIni'), oUf = txtTag(doc, 'UFIni');
    var dCid = txtTag(doc, 'xMunFim'), dUf = txtTag(doc, 'UFFim');
    if (oCid && oUf) setVal('freorigem', oCid + '-' + oUf);
    if (dCid && dUf) setVal('fredestino', dCid + '-' + dUf);
    var valor = txtTag(doc, 'vTPrest') || txtTag(doc, 'vRec') || txtTag(doc, 'vPrest');
    var predominante = txtTag(doc, 'proPred');
    if (predominante) setVal('fretipocarga', predominante);
    var peso = '', pesoReal = '', m3 = '', volumes = '';
    Array.prototype.forEach.call(doc.getElementsByTagName('infQ'), function (q) {
      var un = String((q.getElementsByTagName('cUnid')[0] || {}).textContent || '').trim();
      var tp = String((q.getElementsByTagName('tpMed')[0] || {}).textContent || '').trim().toUpperCase();
      var qt = Number(String((q.getElementsByTagName('qCarga')[0] || {}).textContent || '0').replace(',', '.')) || 0;
      if (!qt) return;
      if (un === '00' || tp.indexOf('M3') !== -1) m3 = qt;
      else if (un === '03' || tp.indexOf('VOLUME') !== -1) volumes = qt;
      else if (tp.indexOf('CUB') !== -1) { /* peso cubado: ignorado */ }
      else if (tp.indexOf('REAL') !== -1) pesoReal = qt;
      else if (un === '01' || un === '02' || tp.indexOf('PESO') !== -1) { if (peso === '') peso = un === '02' ? qt * 1000 : qt; }
    });
    if (pesoReal !== '') peso = pesoReal;
    if (dh && dh.length >= 16) setVal('frecarregamento', String(dh).slice(0, 16));
    var dProg = txtTag(doc, 'dProg') || txtTag(doc, 'dIniPer') || txtTag(doc, 'dFimPer');
    var hProg = txtTag(doc, 'hProg') || txtTag(doc, 'hIni') || txtTag(doc, 'hFim');
    if (dProg) setVal('freentrega', dProg + 'T' + (hProg ? hProg.slice(0, 5) : '18:00'));
    var nome = function (tag) { var el = doc.getElementsByTagName(tag)[0]; return el ? String((el.getElementsByTagName('xNome')[0] || {}).textContent || '').trim() : ''; };
    var nfs = doc.getElementsByTagName('infNFe').length;
    var vCarga = Number(txtTag(doc, 'vCarga')) || 0;
    var obs = [];
    var nCT = txtTag(doc, 'nCT');
    if (nCT) obs.push('CTe ' + nCT + (txtTag(doc, 'serie') ? ' série ' + txtTag(doc, 'serie') : ''));
    if (transportadora) obs.push('Emitente: ' + transportadora);
    if (nome('rem')) obs.push('Remetente: ' + nome('rem'));
    if (nome('dest')) obs.push('Destinatário: ' + nome('dest'));
    if (volumes !== '') obs.push('Volumes: ' + volumes.toLocaleString('pt-BR'));
    if (nfs) obs.push('NF-e: ' + nfs);
    if (vCarga) obs.push('Valor da mercadoria: ' + vCarga.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
    var carac = txtTag(doc, 'xCaracAd');
    if (carac) obs.push(carac);
    if (obs.length) {
      var atual = val('freobs');
      var novo = obs.join(' | ');
      setVal('freobs', atual && atual.indexOf('CTe ' + nCT) === -1 ? atual + '\n' + novo : (atual && nCT && atual.indexOf('CTe ' + nCT) !== -1 ? atual : novo));
    }
    if (peso !== '') setVal('frepeso', (peso >= 1000 ? (peso / 1000) : peso).toLocaleString('pt-BR') + ' TONELADAS');
    if (m3 !== '') setVal('frevolume', m3);
    if (valor) {
      var reais = Number(String(valor).replace(',', '.')) || 0;
      var mascarado = moedaBR(String(Math.round(reais * 100)));
      if (val('freexecucao') === 'terceiro') setVal('frecustoterceiro', mascarado);
      else setVal('frevalor', mascarado);
    }
    if (transportadora && val('freexecucao') === 'terceiro') {
      var st = document.getElementById('freterceiro');
      if (st) {
        var achou = Array.prototype.filter.call(st.options, function (o) {
          return o.value && transportadora.toUpperCase().indexOf(String(o.value).split(' — ')[0].toUpperCase()) !== -1;
        })[0];
        if (achou) st.value = achou.value;
      }
    }
    aplicarRotaNosSelects({ freorigem: val('freorigem'), fredestino: val('fredestino') });
    return true;
  }
  window.importarCteFrete = function (input) {
    var arq = input && input.files && input.files[0];
    if (!arq) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      var ok = false;
      try { ok = aplicarCte(String(leitor.result || '')); } catch (e) { ok = false; }
      input.value = '';
      if (ok) alert('Dados do CTe importados. Confira os campos e clique em Salvar.');
      else alert('Não foi possível ler este arquivo como CTe. Envie o XML original do CTe.');
    };
    leitor.onerror = function () { input.value = ''; alert('Não foi possível ler o arquivo.'); };
    leitor.readAsText(arq, 'UTF-8');
  };

  window.importarMdfeFrete = function (input) {
    var arq = input && input.files && input.files[0]; if (!arq) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      var x = null;
      try { x = window.FMMDFeXML && window.FMMDFeXML.ler(String(leitor.result || '')); } catch (e) {}
      input.value = '';
      if (!x) { alert('Não foi possível ler este arquivo como MDF-e. Envie o XML original do MDF-e.'); return; }
      if (x.data && !val('fredata')) setVal('fredata', x.data);
      if (x.origem && !val('freorigem')) setVal('freorigem', x.origem);
      if (x.destino && !val('fredestino')) setVal('fredestino', x.destino);
      if (val('freorigem') || val('fredestino')) aplicarRotaNosSelects({ freorigem: val('freorigem'), fredestino: val('fredestino') });
      if (x.toneladas !== null && !val('frepeso')) setVal('frepeso', x.toneladas.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' TONELADAS');
      if (x.carga && !val('fretipocarga')) setVal('fretipocarga', x.carga);
      if (x.placa) {
        var veic = document.getElementById('freveiculo');
        var placa = x.placa;
        if (veic && val('freexecucao') !== 'terceiro') {
          var op = Array.prototype.filter.call(veic.options, function (o) { return o.value.toUpperCase().replace(/[^A-Z0-9]/g, '') === placa; })[0];
          if (op && !veic.value) { veic.value = op.value; preencherTipoPeloVinculo(); }
        }
      }
      var obs = val('freobs'), ref = x.documento || ('MDF-e ' + x.chave);
      if (ref && obs.indexOf(ref) === -1) {
        var detalhes = [ref, x.placa && 'Placa: ' + x.placa, x.motorista && 'Condutor: ' + x.motorista, x.valorCarga && 'Valor da mercadoria: ' + x.valorCarga.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), x.quantidadeCtes && 'CT-e vinculados: ' + x.quantidadeCtes, x.quantidadeNfes && 'NF-e vinculadas: ' + x.quantidadeNfes].filter(Boolean);
        setVal('freobs', [obs, detalhes.join(' | ')].filter(Boolean).join('\n'));
      }
      var faltas = [!x.origem && 'origem', !x.destino && 'destino', x.multiplasOrigens && 'município de origem (há vários)', x.multiplosDestinos && 'município de destino (há vários)', x.multiplosCondutores && 'condutor (há vários)'].filter(Boolean);
      alert('Dados do MDF-e importados. O valor da mercadoria não é o valor do frete; informe e confira os valores reais antes de salvar.' + (faltas.length ? ' Confira também: ' + faltas.join(', ') + '.' : ''));
    };
    leitor.onerror = function () { input.value = ''; alert('Não foi possível ler o arquivo.'); };
    leitor.readAsText(arq, 'UTF-8');
  };

  function telWhats(tel) {
    var d = soDigitos(tel);
    if (!d) return '';
    if (d.length <= 11) d = '55' + d;
    return d;
  }

  function painelFretesHTML() {
    return ''
      + '<div class="glass-container">'
      + '  <h5 class="mb-3">🚚 Cadastro de Frete</h5>'
      + '  <input type="hidden" id="fre_idx">'
      + '  <div class="row g-3">'
      + '    <div class="col-md-2"><label class="form-label-mini">Data</label><input type="date" id="fredata" class="form-control"></div>'
      + '    <div class="col-md-1"><label class="form-label-mini">UF Origem</label><select id="freorigemuf" class="form-select"></select></div>'
      + '    <div class="col-md-3"><label class="form-label-mini">Cidade Origem</label><select id="freorigemcid" class="form-select"><option value="">Selecione a UF</option></select></div>'
      + '    <div class="col-md-1"><label class="form-label-mini">UF Destino</label><select id="fredestinouf" class="form-select"></select></div>'
      + '    <div class="col-md-3"><label class="form-label-mini">Cidade Destino</label><select id="fredestinocid" class="form-select"><option value="">Selecione a UF</option></select></div>'
      + '    <div class="col-md-2"><label class="form-label-mini">Distância</label><input id="fredistancia" class="form-control" readonly placeholder="—"></div>'
      + '    <input type="hidden" id="freorigem"><input type="hidden" id="fredestino">'
      + '    <div class="col-md-2"><label class="form-label-mini">Peso</label><input id="frepeso" class="form-control" placeholder="20 TONELADAS"></div>'
      + '    <div class="col-md-2"><label class="form-label-mini">Tipo de Carga</label><input id="fretipocarga" class="form-control" placeholder="Carga geral"></div>'
      + '    <div class="col-md-3"><label class="form-label-mini">Carregamento (data e hora)</label><input type="datetime-local" id="frecarregamento" class="form-control"></div>'
      + '    <div class="col-md-3"><label class="form-label-mini">Entrega (data e hora)</label><input type="datetime-local" id="freentrega" class="form-control"></div>'
      + '    <div class="col-md-2"><label class="form-label-mini">Carga Rastreada</label><select id="frerastreada" class="form-select"><option value="Sim">Sim</option><option value="Não">Não</option></select></div>'
      + '    <div class="col-md-2"><label class="form-label-mini">Valor do Frete</label><input id="frevalor" class="form-control" inputmode="numeric" placeholder="R$ 0,00"></div>'
      + '    <div class="col-md-2"><label class="form-label-mini">Status</label><select id="frestatus" class="form-select"><option value="Disponível">Disponível</option><option value="Fechado">Fechado</option><option value="Cancelado">Cancelado</option></select></div>'
      + '    <div class="col-md-3"><label class="form-label-mini">Tipo de Veículo</label><input id="fretipoveiculo" class="form-control" placeholder="Carreta / Truck"></div>'
      + '    <div class="col-md-2"><label class="form-label-mini">Volume (m³)</label><input id="frevolume" type="number" min="0" step="0.001" class="form-control" placeholder="0"></div>'
      + '    <div class="col-md-2"><label class="form-label-mini">Quem executou</label><select id="freexecucao" class="form-select" onchange="alternarExecucaoFrete()"><option value="propria">Frota própria</option><option value="terceiro">Terceiro</option></select></div>'
      + '    <div class="col-md-3" id="grpFreVeiculo"><label class="form-label-mini">Veículo próprio</label><select id="freveiculo" class="form-select"></select></div>'
      + '    <div class="col-md-3 hidden" id="grpFreTerceiro"><label class="form-label-mini">Terceiro contratado</label><select id="freterceiro" class="form-select"></select></div>'
      + '    <div class="col-md-2 hidden" id="grpFreCustoTerceiro"><label class="form-label-mini">Valor pago ao terceiro</label><input id="frecustoterceiro" class="form-control" inputmode="numeric" placeholder="R$ 0,00"></div>'
      + '    <div class="col-md-4"><label class="form-label-mini">Importar CTe (XML)</label><input type="file" id="freCteArquivo" class="form-control" accept=".xml,text/xml,application/xml" onchange="importarCteFrete(this)"><small class="text-muted">Os dados são lidos do arquivo e o arquivo não fica guardado no sistema.</small></div>'
      + '    <div class="col-md-4"><label class="form-label-mini">Importar MDF-e (XML)</label><input type="file" id="freMdfeArquivo" class="form-control" accept=".xml,text/xml,application/xml" onchange="importarMdfeFrete(this)"><small class="text-muted">Valor da carga não é valor do frete. Confira antes de salvar.</small></div>'
      + '    <div class="col-md-12"><label class="form-label-mini">Observações</label><textarea id="freobs" class="form-control" placeholder="Observações do frete"></textarea></div>'
      + '    <div class="col-md-12 text-end">'
      + '      <button class="btn btn-primary" onclick="salvarFrete()">Salvar</button> '
      + '      <button class="btn btn-outline-secondary" onclick="limparFormFrete()">Cancelar</button>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '<div class="glass-container">'
      + '  <div class="row g-2 align-items-end">'
      + '    <div class="col-md-3"><input id="filtroFreBusca" class="form-control" placeholder="Origem, destino, carga..."></div>'
      + '    <div class="col-md-2"><select id="filtroFreStatus" class="form-select"><option value="">Todos os status</option><option value="Disponível">Disponível</option><option value="Fechado">Fechado</option><option value="Cancelado">Cancelado</option></select></div>'
      + '    <div class="col-md-2"><button class="btn btn-primary w-100" onclick="renderFretes()">Filtrar</button></div>'
      + '    <div class="col-md-2"><button class="btn btn-secondary w-100" onclick="limparFiltroFretes()">Limpar</button></div>'
      + '  </div>'
      + '</div>'
      + '<div class="table-responsive tabela-terceiros">'
      + '  <table class="table table-sm align-middle">'
      + '    <thead><tr>'
      + '      <th>Data</th><th>Origem</th><th>Destino</th><th>Peso</th><th>Quem executou</th><th>Carregamento</th>'
      + '      <th>Entrega</th><th>Rastreada</th><th>Valor</th><th>Status</th><th class="col-acoes">Ações</th>'
      + '    </tr></thead>'
      + '    <tbody id="listaFretes"></tbody>'
      + '  </table>'
      + '</div>';
  }

  function painelCardHTML() {
    function c(col, rot, campo) { return '    <div class="col-md-' + col + '"><label class="form-label-mini">' + rot + '</label>' + campo + '</div>'; }
    return ''
      + '<div class="glass-container">'
      + '  <h5 class="mb-3">🖼️ Gerar Card do Frete</h5>'
      + '  <p class="text-muted small">Preencha os dados para gerar o card de divulgação e enviar aos motoristas e proprietários do Cadastro de Terceiros. Nada daqui é salvo no Cadastro de Fretes.</p>'
      + '  <div class="row g-3">'
      + c(2, 'UF origem', '<select id="cardorigemuf" class="form-select"></select>')
      + c(4, 'Cidade origem', '<select id="cardorigemcid" class="form-select"><option value="">Selecione a UF</option></select>')
      + c(2, 'UF destino', '<select id="carddestinouf" class="form-select"></select>')
      + c(4, 'Cidade destino', '<select id="carddestinocid" class="form-select"><option value="">Selecione a UF</option></select>')
      + c(3, 'Distância', '<input id="carddistancia" class="form-control" placeholder="Calculada automaticamente">')
      + c(3, 'Peso', '<input id="cardpeso" class="form-control" placeholder="Ex.: 12 TONELADAS">')
      + c(3, 'Tipo de carga', '<input id="cardtipocarga" class="form-control" placeholder="Ex.: Paletizada">')
      + c(3, 'Tipo de veículo', '<input id="cardtipoveiculo" class="form-control" list="tiposVeiculoLista" placeholder="Ex.: Truck">')
      + c(3, 'Carregamento', '<input id="cardcarregamento" type="datetime-local" class="form-control">')
      + c(3, 'Entrega', '<input id="cardentrega" type="datetime-local" class="form-control">')
      + c(3, 'Valor', '<input id="cardvalor" class="form-control" placeholder="R$ 0,00">')
      + c(3, 'Carga rastreada', '<select id="cardrastreada" class="form-select"><option>Sim</option><option>Não</option></select>')
      + c(4, 'WhatsApp do card', '<input id="frecontato" class="form-control" inputmode="tel" maxlength="15" placeholder="(54) 99950-5407">')
      + c(8, 'Chamada de rodapé do card', '<input id="frerodape" class="form-control" placeholder="SEGURANÇA, AGILIDADE E COMPROMISSO DO CARREGAMENTO À ENTREGA.">')
      + '    <div class="col-md-12 text-end">'
      + '      <button class="btn btn-outline-secondary" onclick="limparCardFrete()">Limpar</button> '
      + '      <button class="btn btn-success" onclick="gerarCardSelecionado()">🖼️ Gerar Card</button> '
      + '      <button class="btn btn-primary" onclick="enviarCardTerceiros()">💬 Enviar para terceiros</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function cardRota(ufId, cidId) {
    var uf = val(ufId), cid = val(cidId);
    return uf && cid ? cid + '-' + uf : '';
  }
  var cardDistToken = 0;
  function cardDistancia() {
    var o = cardRota('cardorigemuf', 'cardorigemcid'), d = cardRota('carddestinouf', 'carddestinocid');
    var campo = document.getElementById('carddistancia');
    if (!campo || !o || !d) return;
    if (o === d) { campo.value = '0 km'; return; }
    var chave = 'FM_DIST_' + o + '|' + d, cc = cacheGet(chave);
    if (cc && cc.txt) { campo.value = cc.txt; return; }
    var meu = ++cardDistToken;
    campo.value = 'Calculando...';
    Promise.all([geocodificar(o), geocodificar(d)]).then(function (p) {
      if (meu !== cardDistToken) return;
      if (!p[0] || !p[1]) { campo.value = ''; return; }
      return fetch('https://router.project-osrm.org/route/v1/driving/' + p[0].lon + ',' + p[0].lat + ';' + p[1].lon + ',' + p[1].lat + '?overview=false')
        .then(function (r) { return r.json(); })
        .then(function (j) { return (j && j.routes && j.routes[0]) ? j.routes[0].distance / 1000 : haversine(p[0], p[1]) * 1.25; })
        .catch(function () { return haversine(p[0], p[1]) * 1.25; })
        .then(function (km) { if (meu !== cardDistToken) return; var t = kmTexto(km); cacheSet(chave, { txt: t }); campo.value = t; });
    });
  }

  window.renderAbaCard = function () {
    [['cardorigemuf', 'cardorigemcid'], ['carddestinouf', 'carddestinocid']].forEach(function (par) {
      var uf = document.getElementById(par[0]), cid = document.getElementById(par[1]);
      if (!uf || uf.dataset.lig) return;
      uf.dataset.lig = '1';
      preencherUFs(uf);
      uf.addEventListener('change', function () { carregarCidades(par[0], par[1], ''); });
      cid.addEventListener('change', cardDistancia);
    });
    var v = document.getElementById('cardvalor');
    if (v && !v.dataset.lig) {
      v.dataset.lig = '1';
      v.addEventListener('blur', function () { if (v.value) v.value = moedaBR(v.value); });
    }
  };
  window.carregarDadosCard = function () {};

  function coletarCard() {
    return {
      freorigem: cardRota('cardorigemuf', 'cardorigemcid'),
      fredestino: cardRota('carddestinouf', 'carddestinocid'),
      fredistancia: val('carddistancia'),
      frepeso: val('cardpeso'),
      fretipocarga: val('cardtipocarga'),
      fretipoveiculo: val('cardtipoveiculo'),
      frecarregamento: val('cardcarregamento'),
      freentrega: val('cardentrega'),
      frerastreada: val('cardrastreada') || 'Sim',
      frevalor: val('cardvalor') ? moedaBR(val('cardvalor')) : '',
      frestatus: 'Disponível',
      frecontato: telefoneBR(val('frecontato')),
      frerodape: val('frerodape')
    };
  }

  window.limparCardFrete = function () {
    ['cardorigemuf', 'carddestinouf', 'carddistancia', 'cardpeso', 'cardtipocarga', 'cardtipoveiculo', 'cardcarregamento', 'cardentrega', 'cardvalor', 'frecontato', 'frerodape'].forEach(function (id) { setVal(id, ''); });
    ['cardorigemcid', 'carddestinocid'].forEach(function (id) { var s = document.getElementById(id); if (s) s.innerHTML = '<option value="">Selecione a UF</option>'; });
    setVal('cardrastreada', 'Sim');
    freteAtual = null; cardPronto = false;
  };

  window.gerarCardSelecionado = function () {
    window.preverCardFrete(coletarCard());
  };

  window.enviarCardTerceiros = function () {
    var f = coletarCard();
    if (!f.freorigem || !f.fredestino) { alert('Preencha origem e destino para gerar o card.'); return; }
    freteAtual = f; cardPronto = false;
    desenharCard(freteAtual).then(function () {
      document.getElementById('modalCardFrete').classList.add('aberto');
      window.abrirEnvioWhats();
    });
  };

  // soma automatica dos fretes pagos a cada terceiro (vem do Cadastro de Fretes)
  function normTxt(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
  function rotuloTerceiro(t) {
    return (t.terempresa || t.ternome || t.terproprietario || 'Terceiro') + (t.terplaca ? ' — ' + t.terplaca : '');
  }
  function valorNum(v) {
    var n = parseFloat(String(v || '0').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  window.fmFretesDoTerceiro = function (t) {
    var rot = normTxt(rotuloTerceiro(t || {})), placa = normTxt((t || {}).terplaca);
    var qtd = 0, total = 0;
    fretes.forEach(function (f) {
      if (f.freexecucao !== 'terceiro' || String(f.frestatus || '') === 'Cancelado') return;
      var alvo = normTxt(f.freterceiro);
      if (!alvo || !(alvo === rot || (placa && alvo.slice(-placa.length) === placa))) return;
      qtd++; total += valorNum(f.frecustoterceiro || f.frevalor);
    });
    return { qtd: qtd, total: total, texto: total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) };
  };

  // tipo de veiculo preenchido automaticamente pelo veiculo escolhido no frete
  function preencherTipoPeloVinculo() {
    var tipo = '';
    if (val('freexecucao') === 'terceiro') {
      var t = listaArr('terceiros').filter(function (x) { return rotuloTerceiro(x) === val('freterceiro'); })[0];
      tipo = t ? (t.tertipoveiculo || '') : '';
    } else {
      var v = listaArr('veiculos').filter(function (x) { return x.vplaca === val('freveiculo'); })[0];
      tipo = v ? (v.vtipo || '') : '';
    }
    if (tipo) setVal('fretipoveiculo', tipo);
  }

  function modaisHTML() {
    return ''
      + '<div class="fm-modal" id="modalCardFrete">'
      + '  <div class="fm-modal-box">'
      + '    <div class="fm-modal-head"><strong>Card do Frete</strong>'
      + '      <button class="btn btn-sm btn-outline-secondary" onclick="fecharCardFrete()">Fechar</button></div>'
      + '    <div class="fm-modal-body text-center">'
      + '      <canvas id="canvasCardFrete" width="1080" height="1080" class="fm-card-canvas"></canvas>'
      + '    </div>'
      + '    <div class="fm-modal-foot">'
      + '      <button class="btn btn-outline-primary" onclick="baixarCardFrete()">⬇️ Baixar card</button>'
      + '      <button class="btn btn-success" onclick="compartilharCardFrete()">📤 Compartilhar card</button>'
      + '      <button class="btn btn-primary" onclick="abrirEnvioWhats()">💬 Enviar aos terceiros</button>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '<div class="fm-modal" id="modalEnvioWhats">'
      + '  <div class="fm-modal-box">'
      + '    <div class="fm-modal-head"><strong>Enviar frete por WhatsApp</strong>'
      + '      <button class="btn btn-sm btn-outline-secondary" onclick="fecharEnvioWhats()">Fechar</button></div>'
      + '    <div class="fm-modal-body">'
      + '      <p class="text-muted small mb-2">Baixe ou compartilhe o card e envie a mensagem para os terceiros cadastrados.</p>'
      + '      <input id="buscaTerWhats" class="form-control mb-2" placeholder="Buscar terceiro por nome, empresa ou cidade" oninput="renderListaTerWhats()">'
      + '      <div class="table-responsive" style="max-height:340px;overflow:auto">'
      + '        <table class="table table-sm align-middle"><thead><tr>'
      + '          <th>Motorista / Proprietário</th><th>Empresa</th><th>Cidade</th><th>Telefone</th><th>Enviar</th>'
      + '        </tr></thead><tbody id="listaTerWhats"></tbody></table>'
      + '      </div>'
      + '    </div>'
      + '    <div class="fm-modal-foot">'
      + '      <button class="btn btn-outline-primary" onclick="baixarCardFrete()">⬇️ Baixar card</button>'
      + '      <button class="btn btn-success" onclick="compartilharCardFrete()">📤 Compartilhar card</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function montarSubAbas() {
    var mod = document.getElementById('terceiros');
    if (!mod || mod.dataset.fmSubabas === '1') return;
    mod.dataset.fmSubabas = '1';

    var titulo = mod.querySelector('h3');
    var conteudo = [];
    Array.prototype.forEach.call(mod.children, function (el) {
      if (el !== titulo) conteudo.push(el);
    });

    var painelCad = document.createElement('div');
    painelCad.id = 'subTerCadastro';
    conteudo.forEach(function (el) { painelCad.appendChild(el); });

    var nav = document.createElement('div');
    nav.className = 'fm-subabas';
    nav.innerHTML = ''
      + '<button type="button" class="fm-subaba active" data-alvo="subTerCadastro">👤 Cadastro de Terceiros</button>'
      + '<button type="button" class="fm-subaba" data-alvo="subTerFretes">🚚 Cadastro de Fretes</button>'
      + '<button type="button" class="fm-subaba" data-alvo="subTerCard">🖼️ Gerar Card</button>';

    var painelFre = document.createElement('div');
    painelFre.id = 'subTerFretes';
    painelFre.className = 'hidden';
    painelFre.innerHTML = painelFretesHTML();

    mod.appendChild(nav);
    mod.appendChild(painelCad);
    mod.appendChild(painelFre);
    var painelCard = document.createElement('div');
    painelCard.id = 'subTerCard';
    painelCard.className = 'hidden';
    painelCard.innerHTML = painelCardHTML();
    mod.appendChild(painelCard);
    ['freveiculo', 'freterceiro'].forEach(function (id) {
      var e = document.getElementById(id);
      if (e) e.addEventListener('change', preencherTipoPeloVinculo);
    });

    aplicarMascaras();
    initLocalidades();

    var modais = document.createElement('div');
    modais.innerHTML = modaisHTML();
    document.body.appendChild(modais);

    nav.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.fm-subaba');
      if (!btn) return;
      nav.querySelectorAll('.fm-subaba').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      ['subTerCadastro', 'subTerFretes', 'subTerCard'].forEach(function (id) {
        var p = document.getElementById(id);
        if (p) p.classList.toggle('hidden', id !== btn.dataset.alvo);
      });
      if (btn.dataset.alvo === 'subTerFretes') renderFretes();
      if (btn.dataset.alvo === 'subTerCard') window.renderAbaCard();
    });

    renderFretes();
  }

  /* ---------------- estados / cidades / distancia ---------------- */
  var UFS = [
    ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
    ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
    ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
    ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
    ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
    ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
    ['SE', 'Sergipe'], ['TO', 'Tocantins']
  ];

  function cacheGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function cacheSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  function cidadesDaUF(uf) {
    if (!uf) return Promise.resolve([]);
    var key = 'FM_CIDADES_' + uf;
    var c = cacheGet(key);
    if (c && c.length) return Promise.resolve(c);
    return fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados/' + uf + '/municipios?orderBy=nome')
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        var nomes = (arr || []).map(function (m) { return m.nome; });
        if (nomes.length) cacheSet(key, nomes);
        return nomes;
      })
      .catch(function () { return []; });
  }

  function preencherUFs(sel) {
    if (!sel || sel.dataset.pronto === '1') return;
    sel.dataset.pronto = '1';
    var h = '<option value="">UF</option>';
    UFS.forEach(function (u) { h += '<option value="' + u[0] + '">' + u[0] + '</option>'; });
    sel.innerHTML = h;
  }

  function carregarCidades(ufId, cidId, selecionar) {
    var uf = val(ufId);
    var sel = document.getElementById(cidId);
    if (!sel) return Promise.resolve();
    sel.innerHTML = '<option value="">Carregando...</option>';
    return cidadesDaUF(uf).then(function (nomes) {
      var h = '<option value="">' + (uf ? 'Selecione a cidade' : 'Selecione a UF') + '</option>';
      nomes.forEach(function (n) { h += '<option value="' + esc(n) + '">' + esc(n) + '</option>'; });
      sel.innerHTML = h;
      if (selecionar) {
        var norm = function (t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); };
        var alvo = norm(selecionar);
        var op = Array.prototype.filter.call(sel.options, function (o) { return o.value && norm(o.value) === alvo; })[0];
        sel.value = op ? op.value : selecionar;
      }
      sincronizarRota();
    });
  }

  function montarLocal(cidId, ufId) {
    var c = val(cidId), u = val(ufId);
    return (c && u) ? (c + '-' + u) : '';
  }

  function sincronizarRota() {
    setVal('freorigem', montarLocal('freorigemcid', 'freorigemuf'));
    setVal('fredestino', montarLocal('fredestinocid', 'fredestinouf'));
    atualizarDistancia();
  }

  function geocodificar(local) {
    var key = 'FM_GEO_' + local;
    var c = cacheGet(key);
    if (c && c.lat) return Promise.resolve(c);
    var partes = String(local || '').match(/^(.*)-([A-Z]{2})$/);
    var uf = partes ? partes[2] : '';
    var fallback = coordenadaAproximada(local, uf);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var limite = ctrl ? setTimeout(function () { ctrl.abort(); }, 3500) : null;
    return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&country=Brasil&city='
      + encodeURIComponent(partes ? partes[1] : local) + '&state=' + encodeURIComponent(uf), ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        if (limite) clearTimeout(limite);
        if (!arr || !arr.length) return fallback;
        var p = { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
        cacheSet(key, p);
        return p;
      })
      .catch(function () { if (limite) clearTimeout(limite); return fallback; });
  }

  /* centros aproximados garantem mapa e distancia mesmo se o servico externo estiver indisponivel */
  var CENTROS_UF = {
    AC:{lat:-9.02,lon:-70.81}, AL:{lat:-9.57,lon:-36.78}, AP:{lat:1.41,lon:-51.77}, AM:{lat:-3.42,lon:-65.86},
    BA:{lat:-12.58,lon:-41.70}, CE:{lat:-5.20,lon:-39.53}, DF:{lat:-15.79,lon:-47.88}, ES:{lat:-19.19,lon:-40.34},
    GO:{lat:-15.98,lon:-49.86}, MA:{lat:-5.42,lon:-45.44}, MT:{lat:-12.64,lon:-55.42}, MS:{lat:-20.77,lon:-54.79},
    MG:{lat:-18.51,lon:-44.56}, PA:{lat:-3.79,lon:-52.48}, PB:{lat:-7.24,lon:-36.78}, PR:{lat:-24.89,lon:-51.55},
    PE:{lat:-8.38,lon:-37.86}, PI:{lat:-7.72,lon:-42.73}, RJ:{lat:-22.25,lon:-42.66}, RN:{lat:-5.81,lon:-36.59},
    RS:{lat:-30.17,lon:-53.50}, RO:{lat:-10.83,lon:-63.34}, RR:{lat:2.74,lon:-62.08}, SC:{lat:-27.24,lon:-50.22},
    SP:{lat:-22.19,lon:-48.79}, SE:{lat:-10.57,lon:-37.45}, TO:{lat:-10.18,lon:-48.33}
  };

  function coordenadaAproximada(local, uf) {
    var centro = CENTROS_UF[uf];
    if (!centro) return null;
    var hash = 0, texto = String(local || '');
    for (var i = 0; i < texto.length; i++) hash = ((hash << 5) - hash + texto.charCodeAt(i)) | 0;
    return {
      lat: centro.lat + ((Math.abs(hash) % 101) - 50) / 100,
      lon: centro.lon + ((Math.abs(hash >> 8) % 101) - 50) / 100
    };
  }

  function haversine(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function kmTexto(km) {
    return Math.round(km).toLocaleString('pt-BR') + ' km';
  }

  var distToken = 0;
  function atualizarDistancia() {
    var o = val('freorigem'), d = val('fredestino');
    var campo = document.getElementById('fredistancia');
    if (!campo) return;
    if (!o || !d) { campo.value = ''; return; }
    if (o === d) { campo.value = '0 km'; return; }
    var chave = 'FM_DIST_' + o + '|' + d;
    var c = cacheGet(chave);
    if (c && c.txt) { campo.value = c.txt; return; }
    var meu = ++distToken;
    campo.value = 'Calculando...';
    Promise.all([geocodificar(o), geocodificar(d)]).then(function (p) {
      if (meu !== distToken) return;
      if (!p[0] || !p[1]) { campo.value = ''; return; }
      return fetch('https://router.project-osrm.org/route/v1/driving/'
        + p[0].lon + ',' + p[0].lat + ';' + p[1].lon + ',' + p[1].lat + '?overview=false')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var km = (j && j.routes && j.routes[0]) ? j.routes[0].distance / 1000 : haversine(p[0], p[1]) * 1.25;
          return km;
        })
        .catch(function () { return haversine(p[0], p[1]) * 1.25; })
        .then(function (km) {
          if (meu !== distToken) return;
          var txt = kmTexto(km);
          cacheSet(chave, { txt: txt });
          campo.value = txt;
        });
    });
  }

  function initLocalidades() {
    ['freorigemuf', 'fredestinouf'].forEach(function (id) { preencherUFs(document.getElementById(id)); });
    [['freorigemuf', 'freorigemcid'], ['fredestinouf', 'fredestinocid']].forEach(function (par) {
      var uf = document.getElementById(par[0]);
      var cid = document.getElementById(par[1]);
      if (uf && !uf.dataset.lig) {
        uf.dataset.lig = '1';
        uf.addEventListener('change', function () { carregarCidades(par[0], par[1], ''); });
      }
      if (cid && !cid.dataset.lig) {
        cid.dataset.lig = '1';
        cid.addEventListener('change', sincronizarRota);
      }
    });
  }

  function aplicarRotaNosSelects(f) {
    function parse(txt) {
      var m = String(txt || '').match(/^(.*)-([A-Z]{2})$/);
      return m ? { cidade: m[1], uf: m[2] } : null;
    }
    var o = parse(f.freorigem), d = parse(f.fredestino);
    initLocalidades();
    var ps = [];
    if (o) { setVal('freorigemuf', o.uf); ps.push(carregarCidades('freorigemuf', 'freorigemcid', o.cidade)); }
    if (d) { setVal('fredestinouf', d.uf); ps.push(carregarCidades('fredestinouf', 'fredestinocid', d.cidade)); }
    Promise.all(ps).then(sincronizarRota);
  }

  function coletar() {

    return {
      fredata: val('fredata'),
      freorigem: val('freorigem'),
      fredestino: val('fredestino'),
      fredistancia: val('fredistancia'),
      frepeso: val('frepeso'),
      fretipocarga: val('fretipocarga'),
      frecarregamento: val('frecarregamento'),
      freentrega: val('freentrega'),
      frerastreada: val('frerastreada') || 'Sim',
      frevalor: moedaBR(val('frevalor')),
      frestatus: val('frestatus') || 'Disponível',
      fretipoveiculo: val('fretipoveiculo'),
      frevolume: val('frevolume'),
      freexecucao: val('freexecucao') === 'terceiro' ? 'terceiro' : 'propria',
      freveiculo: val('freexecucao') === 'terceiro' ? '' : val('freveiculo'),
      freterceiro: val('freexecucao') === 'terceiro' ? val('freterceiro') : '',
      frecustoterceiro: val('freexecucao') === 'terceiro' ? moedaBR(val('frecustoterceiro')) : '',
      freobs: val('freobs')
    };
  }

  window.salvarFrete = function () {
    var obj = coletar();
    if (!obj.freorigem || !obj.fredestino) {
      alert('Informe a origem e o destino do frete.');
      return;
    }
    var idx = val('fre_idx');
    obj._ts = Date.now();
    if (idx === '') {
      obj._fid = novoId();
      fretes.push(obj);
    } else {
      var ant = fretes[Number(idx)] || {};
      obj = Object.assign({}, ant, obj);
      obj._fid = ant._fid || novoId();
      obj._registradoPor = ant._registradoPor;
      obj._registradoEm = ant._registradoEm;
      fretes[Number(idx)] = obj;
    }
    if (typeof db !== 'undefined') db.fretes = fretes;
    persistir().then(function (ok) {
      if (ok) {
        try { if (typeof statusNuvem === 'function') statusNuvem('Frete salvo e confirmado no banco de dados', '#198754'); } catch (e) {}
      }
    });
    window.limparFormFrete();
    renderFretes();
    // o card agora e gerado na aba exclusiva "Gerar Card"
    if (typeof window.renderAbaCard === 'function') window.renderAbaCard();
    try { if (typeof renderModulo === 'function') renderModulo('terceiros'); } catch (e) {}
  };

  window.limparFormFrete = function () {
    ['fredata', 'freorigem', 'fredestino', 'fredistancia', 'frepeso', 'fretipocarga', 'frecarregamento',
      'freentrega', 'frevalor', 'fretipoveiculo', 'frecontato', 'frerodape', 'freobs', 'fre_idx',
      'frevolume', 'freveiculo', 'freterceiro', 'frecustoterceiro']
      .forEach(function (id) { setVal(id, ''); });
    setVal('freorigemuf', ''); setVal('fredestinouf', '');
    carregarCidades('freorigemuf', 'freorigemcid', '');
    carregarCidades('fredestinouf', 'fredestinocid', '');
    setVal('frerastreada', '');
    setVal('frestatus', '');
    setVal('freexecucao', 'propria');
    window.alternarExecucaoFrete();
    if (typeof window.fmSincronizarValoresBuscasCadastro === 'function') window.fmSincronizarValoresBuscasCadastro();
  };

  window.editarFrete = function (i) {
    var f = fretes[i]; if (!f) return;
    preencherSelectsFrete();
    setVal('freexecucao', f.freexecucao === 'terceiro' ? 'terceiro' : 'propria');
    window.alternarExecucaoFrete();
    Object.keys(f).forEach(function (k) {
      var valor = f[k];
      if (k === 'frevalor' || k === 'frecustoterceiro') valor = moedaBR(valor);
      if (k === 'frecontato') valor = telefoneBR(valor);
      setVal(k, valor);
    });
    aplicarRotaNosSelects(f);
    setVal('fre_idx', i);
    if (typeof window.fmSincronizarValoresBuscasCadastro === 'function') window.fmSincronizarValoresBuscasCadastro();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.verFrete = function (i) {
    var f = fretes[i]; if (!f) return;
    function rotulo(k) {
      var el = document.getElementById(k), lb = null;
      if (el) {
        lb = document.querySelector('label[for="' + k + '"]');
        if (!lb) { var p = el.parentElement; while (p && !lb && p !== document.body) { lb = p.querySelector('label'); if (lb && lb.contains(el)) break; p = lb ? p : p.parentElement; } }
        if (!lb && el.placeholder) return el.placeholder;
      }
      var t = lb ? lb.textContent.trim() : '';
      return t || k.replace(/^fre_?/, '').replace(/^\w/, function (c) { return c.toUpperCase(); });
    }
    function fmt(k, v) {
      if (k === 'frevalor' || k === 'frecustoterceiro') return moedaBR(v);
      if (k === 'frecontato') return telefoneBR(v);
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return dataHoraBR(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBR(v);
      if (k === 'freexecucao') return v === 'terceiro' ? 'Terceiro' : 'Frota própria';
      return v;
    }
    var linhas = '';
    Object.keys(f).forEach(function (k) {
      var v = f[k];
      if (k === 'fre_idx' || k === 'id' || v === null || v === undefined || v === '' || typeof v === 'object') return;
      linhas += '<tr><th style="width:40%;color:#64748b;font-weight:600">' + esc(rotulo(k)) + '</th><td style="white-space:pre-wrap">' + esc(String(fmt(k, v))) + '</td></tr>';
    });
    var m = document.getElementById('fmModalVerFrete');
    if (!m) {
      m = document.createElement('div'); m.id = 'fmModalVerFrete'; m.className = 'fm-modal';
      m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('aberto'); });
      document.body.appendChild(m);
    }
    m.innerHTML = '<div class="fm-modal-box"><div class="fm-modal-head"><strong>👁️ Detalhes do frete</strong>'
      + '<button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById(\'fmModalVerFrete\').classList.remove(\'aberto\')">✕</button></div>'
      + '<div class="fm-modal-body"><table class="table table-sm mb-0"><tbody>' + (linhas || '<tr><td>Sem informações.</td></tr>') + '</tbody></table></div>'
      + '<div class="fm-modal-foot"><button class="btn btn-primary" onclick="document.getElementById(\'fmModalVerFrete\').classList.remove(\'aberto\');editarFrete(' + i + ')">✏️ Editar</button>'
      + '<button class="btn btn-secondary" onclick="document.getElementById(\'fmModalVerFrete\').classList.remove(\'aberto\')">Fechar</button></div></div>';
    m.classList.add('aberto');
  };

  window.excluirFrete = function (i) {
    if (!confirm('Excluir este frete?')) return;
    fretes.splice(i, 1);
    if (typeof db !== 'undefined') db.fretes = fretes;
    persistir();
    renderFretes();
  };

  window.limparFiltroFretes = function () {
    setVal('filtroFreBusca', '');
    setVal('filtroFreStatus', '');
    renderFretes();
  };

  window.renderFretes = function renderFretes() {
    var tb = document.getElementById('listaFretes');
    if (!tb) return;
    preencherSelectsFrete();
    var busca = (val('filtroFreBusca') || '').toLowerCase();
    var st = val('filtroFreStatus');
    var html = '';
    fretes.forEach(function (f, i) {
      var texto = [f.freorigem, f.fredestino, f.fretipocarga, f.fretipoveiculo, f.freobs].join(' ').toLowerCase();
      if (busca && texto.indexOf(busca) === -1) return;
      if (st && f.frestatus !== st) return;
      var quem = f.freexecucao === 'terceiro'
        ? (f.freterceiro ? 'Terceiro: ' + f.freterceiro : 'Terceiro')
        : (f.freveiculo ? 'Própria: ' + f.freveiculo : 'Frota própria');
      html += '<tr>'
        + '<td>' + esc(dataBR(f.fredata)) + '</td>'
        + '<td>' + esc(f.freorigem) + '</td>'
        + '<td>' + esc(f.fredestino) + '</td>'
        + '<td>' + esc(f.frepeso) + '</td>'
        + '<td>' + esc(quem) + '</td>'
        + '<td>' + esc(dataHoraBR(f.frecarregamento)) + '</td>'
        + '<td>' + esc(dataHoraBR(f.freentrega)) + '</td>'
        + '<td>' + esc(f.frerastreada) + '</td>'
        + '<td class="money">' + esc(f.frevalor) + '</td>'
        + '<td><span class="fm-status-rapido fm-status-badge fm-status-frete ' + (typeof window.fmClasseStatusCor === 'function' ? window.fmClasseStatusCor(f.frestatus || 'Disponível') : '') + '" data-status="' + esc(f.frestatus || 'Disponível') + '">' + esc(f.frestatus || 'Disponível') + '</span></td>'
        + '<td class="col-acoes">'
        + '<button class="btn btn-sm btn-outline-secondary" title="Visualizar" onclick="verFrete(' + i + ')">👁️</button> '
        + '<button class="btn btn-sm btn-outline-primary" title="Editar" onclick="editarFrete(' + i + ')">✏️</button> '
        + '<button class="btn btn-sm btn-outline-danger" title="Excluir" onclick="excluirFrete(' + i + ')">🗑️</button>'
        + '</td></tr>';
    });
    tb.innerHTML = html || '<tr><td colspan="11" class="text-center text-muted">Nenhum frete cadastrado.</td></tr>';
  };
  var renderFretes = window.renderFretes;


  /* ---------------- card (canvas) ---------------- */
  var freteAtual = null;
  var cardPronto = false;
  var imgs = {};

  function carregarImg(src) {
    return new Promise(function (res) {
      if (imgs[src]) return res(imgs[src]);
      var real = src;
      // Usa a arte embutida (data URI) para o canvas nunca ficar "sujo"
      // e permitir baixar/compartilhar mesmo abrindo o arquivo local.
      if (/card-base\.jpg$/.test(src) && window.FM_CARD_BASE) real = window.FM_CARD_BASE;
      var im = new Image();
      try { im.crossOrigin = 'anonymous'; } catch (e) { /* ignora */ }
      im.onload = function () { imgs[src] = im; res(im); };
      im.onerror = function () { res(null); };
      im.src = real;
    });
  }


  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // familia tipografica unica do card
  var FAM = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  function textoAjustado(ctx, txt, x, y, maxW, size, peso, cor, familia) {
    var s = size;
    ctx.fillStyle = cor;
    while (true) {
      ctx.font = peso + ' ' + s + 'px ' + (familia || FAM);
      if (ctx.measureText(txt).width <= maxW || s <= 12) break;
      s -= 2;
    }
    ctx.fillText(txt, x, y);
    return s;
  }

  function iconeCirculo(ctx, x, y, tipo) { return iconeCirculoR(ctx, x, y, tipo, 34); }

  function iconeCirculoR(ctx, x, y, tipo, raio) {
    var GOLD = '#c9922f';
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    if (tipo === 'peso') {
      ctx.beginPath(); ctx.moveTo(x - 16, y - 8); ctx.lineTo(x + 16, y - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 18, y + 14); ctx.lineTo(x + 18, y + 14); ctx.stroke();
    } else if (tipo === 'caixa') {
      ctx.strokeRect(x - 15, y - 12, 30, 24);
      ctx.beginPath(); ctx.moveTo(x - 15, y - 4); ctx.lineTo(x + 15, y - 4); ctx.stroke();
    } else if (tipo === 'data') {
      ctx.strokeRect(x - 16, y - 14, 32, 28);
      ctx.beginPath(); ctx.moveTo(x - 16, y - 5); ctx.lineTo(x + 16, y - 5); ctx.stroke();
    } else if (tipo === 'caminhao') {
      ctx.strokeRect(x - 18, y - 10, 20, 16);
      ctx.beginPath(); ctx.moveTo(x + 2, y - 4); ctx.lineTo(x + 16, y - 4); ctx.lineTo(x + 16, y + 6); ctx.lineTo(x + 2, y + 6); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x - 10, y + 11, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 10, y + 11, 5, 0, Math.PI * 2); ctx.fill();
    } else if (tipo === 'valor') {
      ctx.font = 'bold 34px ' + FAM;
      ctx.textAlign = 'center';
      ctx.fillText('$', x, y + 12);
      ctx.textAlign = 'left';
    } else if (tipo === 'escudo') {
      ctx.beginPath();
      ctx.moveTo(x, y - 16); ctx.lineTo(x + 15, y - 9); ctx.lineTo(x + 15, y + 4);
      ctx.quadraticCurveTo(x + 12, y + 15, x, y + 18);
      ctx.quadraticCurveTo(x - 12, y + 15, x - 15, y + 4);
      ctx.lineTo(x - 15, y - 9); ctx.closePath(); ctx.stroke();
    } else {
      pinGold(ctx, x, y, 1);
    }
    ctx.restore();
  }

  function pinGold(ctx, x, y, escala) {
    var e = escala || 1;
    ctx.save();
    ctx.fillStyle = '#c9922f';
    ctx.beginPath();
    ctx.arc(x, y - 6 * e, 10 * e, Math.PI, 0);
    ctx.lineTo(x, y + 14 * e);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0a1425';
    ctx.beginPath();
    ctx.arc(x, y - 6 * e, 4 * e, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function setaGold(ctx, x, y, w) {
    ctx.save();
    ctx.strokeStyle = '#c9922f';
    ctx.fillStyle = '#c9922f';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - 10, y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w - 12, y - 9); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 12, y + 9);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  var VERM = '#c8102e';
  var VERM_ESC = '#8a000d';
  var GRAFITE = '#1c1c20';
  var CINZA = '#5b6068';

  function pinVerm(ctx, x, y, e) {
    e = e || 1;
    ctx.save();
    ctx.fillStyle = VERM;
    ctx.beginPath();
    ctx.arc(x, y - 6 * e, 11 * e, Math.PI, 0);
    ctx.lineTo(x, y + 15 * e);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y - 6 * e, 4.2 * e, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function setaVerm(ctx, x, y, w) {
    ctx.save();
    ctx.strokeStyle = GRAFITE;
    ctx.fillStyle = GRAFITE;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - 12, y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w - 14, y - 10); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 14, y + 10);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function iconeCard(ctx, x, y, tipo, raio) {
    var r = raio || 34;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = VERM;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = GRAFITE;
    ctx.fillStyle = GRAFITE;
    ctx.lineWidth = 3;
    var k = r / 34;
    ctx.translate(x, y); ctx.scale(k, k);
    if (tipo === 'peso') {
      ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(14, -10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-17, 14); ctx.lineTo(-12, -10); ctx.lineTo(12, -10); ctx.lineTo(17, 14); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -14, 5, 0, Math.PI * 2); ctx.stroke();
    } else if (tipo === 'caixa') {
      ctx.strokeRect(-15, -12, 30, 24);
      ctx.beginPath(); ctx.moveTo(-15, -4); ctx.lineTo(15, -4); ctx.stroke();
    } else if (tipo === 'data') {
      ctx.strokeRect(-16, -14, 32, 28);
      ctx.beginPath(); ctx.moveTo(-16, -5); ctx.lineTo(16, -5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9, -20); ctx.lineTo(-9, -12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, -20); ctx.lineTo(9, -12); ctx.stroke();
    } else if (tipo === 'caminhao') {
      ctx.fillRect(-18, -10, 19, 16);
      ctx.beginPath(); ctx.moveTo(2, -4); ctx.lineTo(13, -4); ctx.lineTo(17, 2); ctx.lineTo(17, 6); ctx.lineTo(2, 6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(-10, 11, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(10, 11, 5, 0, Math.PI * 2); ctx.fill();
    } else if (tipo === 'valor') {
      ctx.font = 'bold 34px ' + FAM;
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 12);
      ctx.textAlign = 'left';
    } else if (tipo === 'rota') {
      ctx.beginPath(); ctx.arc(-12, 8, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12, -8, 5, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(-9, 4); ctx.quadraticCurveTo(0, -4, 9, -6); ctx.stroke();
      ctx.setLineDash([]);

    } else if (tipo === 'escudo') {
      ctx.beginPath();
      ctx.moveTo(0, -17); ctx.lineTo(15, -10); ctx.lineTo(15, 3);
      ctx.quadraticCurveTo(12, 15, 0, 18);
      ctx.quadraticCurveTo(-12, 15, -15, 3);
      ctx.lineTo(-15, -10); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-2, 6); ctx.lineTo(8, -6); ctx.stroke();
    } else {
      ctx.restore();
      ctx.save();
      pinVerm(ctx, x, y + 2, r / 30);
    }
    ctx.restore();
  }

  function linhaInfo(ctx, y, tipo, titulo, valor, valor2, compacto, raio) {
    var r = raio || 34;
    var x0 = 108 + r + 26;
    iconeCard(ctx, 108, y, tipo, r);
    ctx.textAlign = 'left';
    if (compacto) {
      if (titulo) {
        ctx.font = 'bold 25px ' + FAM;
        ctx.fillStyle = CINZA;
        var rot = String(titulo).toUpperCase() + ':';
        ctx.fillText(rot, x0, y + 9);
        var wl = ctx.measureText(rot).width;
        textoAjustado(ctx, String(valor || '').toUpperCase() + (valor2 ? ' ' + String(valor2).toUpperCase() : ''),
          x0 + wl + 10, y + 9, 560 - (x0 + wl), 25, 'bold', VERM);
      } else {
        textoAjustado(ctx, String(valor || '').toUpperCase(), x0, y + 9, 560 - x0, 25, 'bold', GRAFITE);
      }
      return;
    }
    var pequeno = r < 30;
    var sRot = pequeno ? 19 : 25;
    var sVal = pequeno ? 27 : 32;
    if (titulo) {
      ctx.font = 'bold ' + sRot + 'px ' + FAM;
      ctx.fillStyle = CINZA;
      ctx.fillText(String(titulo).toUpperCase(), x0, y - (pequeno ? 8 : 10));
      textoAjustado(ctx, String(valor || '').toUpperCase(), x0, y + (pequeno ? 20 : 26), 470, sVal, 'bold', VERM);
      if (valor2) textoAjustado(ctx, String(valor2).toUpperCase(), x0, y + 62, 430, sVal, 'bold', VERM);
    } else {
      textoAjustado(ctx, String(valor || '').toUpperCase(), x0, y + (pequeno ? 10 : 12), 430, sVal, 'bold', GRAFITE);
    }

  }


  /* rotulo de cidade sobre o mapa do fundo (cobre o texto original da arte) */
  function rotuloMapa(ctx, x, y, texto, ancora) {
    var txt = String(texto || '').toUpperCase();
    var maxW = 190;
    var s = 18;
    ctx.save();
    while (s > 10) {
      ctx.font = 'bold ' + s + 'px ' + FAM;
      if (ctx.measureText(txt).width <= maxW) break;
      s -= 1;
    }
    var w = Math.min(maxW, ctx.measureText(txt).width);
    var tx = ancora === 'esq' ? x - w - 14 : x + 14;
    tx = Math.max(570, Math.min(1068 - w, tx));
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'left';
    ctx.strokeText(txt, tx, y + s / 3);
    ctx.fillStyle = GRAFITE;
    ctx.font = 'bold ' + s + 'px ' + FAM;
    ctx.fillText(txt, tx, y + s / 3);
    ctx.restore();
  }

  /* ---- projecao geografica sobre o mapa do Brasil da arte ---- */
  function projetar(p) {
    if (!p) return null;
    var x = 1429.4 + 11.868 * p.lon;
    var y = 559.8 - 11.868 * p.lat;
    return {
      x: Math.max(575, Math.min(1060, x)),
      y: Math.max(560, Math.min(950, y))
    };
  }

  /* apaga os pinos, a rota e os nomes que ja vem desenhados na arte */
  function limparMapaArte(ctx) {
    /* A arte atual ja possui apenas o mapa-base. Nao pintar sobre ela: isso
       preserva os contornos dos estados e evita manchas brancas no card. */
  }

  function desenharMapa(ctx, po, pd, origem, destino) {
    limparMapaArte(ctx);
    var a = projetar(po), b = projetar(pd);
    if (a && b) {
      ctx.save();
      ctx.strokeStyle = VERM;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      var mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.18;
      var my = (a.y + b.y) / 2 - (b.x - a.x) * 0.18;
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
    if (a) {
      pinVerm(ctx, a.x, a.y, 1.5);
      rotuloMapa(ctx, a.x + 20, a.y + 4, origem || 'ORIGEM', a.x > 860 ? 'esq' : 'dir');
    }
    if (b) {
      pinVerm(ctx, b.x, b.y, 1.5);
      rotuloMapa(ctx, b.x + 20, b.y - 32, destino || 'DESTINO', b.x > 860 ? 'esq' : 'dir');
    }
  }



  function desenharCard(f) {
    var cv = document.getElementById('canvasCardFrete');
    if (!cv) return Promise.resolve();
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;

    return Promise.all([
      carregarImg('./card-base.jpg'),
      f.freorigem ? geocodificar(f.freorigem) : null,
      f.fredestino ? geocodificar(f.fredestino) : null,
      carregarImg('./card-logo-dark.png')
    ]).then(function (res) {
      var base = res[0], geoO = res[1], geoD = res[2], logo = res[3];
      ctx.clearRect(0, 0, W, H);
      if (base) ctx.drawImage(base, 0, 0, W, H);
      else { ctx.fillStyle = '#f7f7f9'; ctx.fillRect(0, 0, W, H); }

      // painel claro cobrindo a area de conteudo dinamico
      var pg = ctx.createLinearGradient(0, 0, 640, 0);
      pg.addColorStop(0, 'rgba(250,250,251,1)');
      pg.addColorStop(0.86, 'rgba(250,250,251,1)');
      pg.addColorStop(1, 'rgba(250,250,251,0)');
      ctx.fillStyle = pg;
      ctx.fillRect(18, 238, 622, 740);

      ctx.textAlign = 'left';
      ctx.font = 'bold 96px ' + FAM;
      ctx.fillStyle = GRAFITE;
      ctx.fillText('FRETE', 62, 330);
      textoAjustado(ctx, 'DISPONÍVEL', 62, 424, 500, 96, 'bold', VERM, FAM);

      var rota = String(f.freorigem || '').toUpperCase();
      var dest = String(f.fredestino || '').toUpperCase();
      pinVerm(ctx, 76, 478, 1);
      var maxRota = 560 - 100;
      var s1 = 40;
      ctx.font = 'bold ' + s1 + 'px ' + FAM;
      while (s1 > 20 && ctx.measureText(rota).width + ctx.measureText(dest).width + 158 > maxRota) {
        s1 -= 1;
        ctx.font = 'bold ' + s1 + 'px ' + FAM;
      }
      textoAjustado(ctx, rota, 100, 488, maxRota * 0.55, s1, 'bold', GRAFITE);
      ctx.font = 'bold ' + s1 + 'px ' + FAM;
      var wRota = ctx.measureText(rota).width;
      setaVerm(ctx, 100 + wRota + 18, 478, 44);
      pinVerm(ctx, 100 + wRota + 90, 478, 1);
      textoAjustado(ctx, dest, 100 + wRota + 114, 488, 566 - (100 + wRota + 114), s1, 'bold', GRAFITE);

      // regua vermelha
      var rg = ctx.createLinearGradient(60, 0, 600, 0);
      rg.addColorStop(0, VERM);
      rg.addColorStop(1, 'rgba(200,16,46,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(60, 520, 540, 5);

      // rota e nomes das cidades sobre o mapa
      desenharMapa(ctx, geoO, geoD, rota, dest);

      // linhas de informacao (inclui valor do frete e distancia)
      function divisor(y) {
        var dg = ctx.createLinearGradient(164, 0, 540, 0);
        dg.addColorStop(0, 'rgba(200,16,46,0.55)');
        dg.addColorStop(1, 'rgba(200,16,46,0)');
        ctx.fillStyle = dg;
        ctx.fillRect(164, y, 376, 2);
      }
      var linhas = [
        ['peso', 'Peso', f.frepeso || 'A COMBINAR'],
        ['valor', 'Valor do frete', f.frevalor || 'A COMBINAR'],
        ['rota', 'Distância', f.fredistancia || 'A CONSULTAR'],
        ['caminhao', 'Tipo de veículo', f.fretipoveiculo || 'A COMBINAR'],
        ['data', 'Carregamento', f.frecarregamento ? dataHoraBR(f.frecarregamento) : 'IMEDIATO'],
        ['data', 'Entrega', f.freentrega ? dataHoraBR(f.freentrega) : 'A COMBINAR'],
        ['pin', '', f.frerastreada === 'Não' ? 'CARGA NÃO RASTREADA' : 'CARGA RASTREADA']
      ];
      var y0 = 558, passo = 51;
      linhas.forEach(function (l, i) {
        var y = y0 + i * passo;
        linhaInfo(ctx, y, l[0], l[1], l[2], '', false, 26);
        divisor(y + Math.round(passo / 2));
      });


      var rod = String(f.frerodape || 'SEGURANÇA, AGILIDADE E COMPROMISSO DO CARREGAMENTO À ENTREGA.').toUpperCase();
      var quebra = rod.indexOf(' DO CARREGAMENTO');
      var rod1 = quebra > 0 ? rod.slice(0, quebra) : rod;
      var rod2 = quebra > 0 ? rod.slice(quebra + 1) : '';
      iconeCard(ctx, 108, 938, 'escudo', 40);
      textoAjustado(ctx, rod1, 164, 929, 420, 20, '600', CINZA);
      if (rod2) textoAjustado(ctx, rod2, 164, 956, 420, 20, 'bold', VERM);

      // rodape vermelho inclinado, igual ao modelo original
      var tel = f.frecontato || '';
      var by = 970, bh = H - by, cy = by + bh / 2;
      ctx.fillStyle = '#d9dde2';
      ctx.beginPath();
      ctx.moveTo(600, by); ctx.lineTo(665, by); ctx.lineTo(780, H); ctx.lineTo(715, H); ctx.closePath();
      ctx.fill();
      var rgd = ctx.createLinearGradient(0, 0, W, 0);
      rgd.addColorStop(0, '#b00016');
      rgd.addColorStop(0.55, VERM);
      rgd.addColorStop(1, '#7b000d');
      ctx.fillStyle = rgd;
      ctx.beginPath();
      ctx.moveTo(0, by); ctx.lineTo(632, by); ctx.lineTo(750, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(112, cy + 3, 31, 0, Math.PI * 2); ctx.stroke();
      ctx.translate(112, cy + 3);
      ctx.scale(0.82, 0.82);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-13, -14); ctx.lineTo(-4, -14); ctx.lineTo(0, -5); ctx.lineTo(-5, 0);
      ctx.quadraticCurveTo(1, 9, 9, 14); ctx.lineTo(14, 9); ctx.lineTo(22, 14); ctx.lineTo(22, 21);
      ctx.quadraticCurveTo(2, 21, -13, -2); ctx.closePath(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(170, cy - 39, 3, 78);
      ctx.textAlign = 'left';
      textoAjustado(ctx, tel || 'WHATSAPP', 195, cy + 20, 455, 46, 'bold', '#ffffff');

      ctx.textAlign = 'left';
      cardPronto = true;
    });
  }

  // garante que exista um frete atual e que o card esteja desenhado
  function garantirCard() {
    if (!freteAtual) freteAtual = coletarCard();
    if (!freteAtual || (!freteAtual.freorigem && !freteAtual.fredestino)) {
      return Promise.resolve(false);
    }
    if (cardPronto && document.getElementById('canvasCardFrete')) return Promise.resolve(true);
    return desenharCard(freteAtual).then(function () { return cardPronto; });
  }

  window.preverCardFrete = function (i) {
    freteAtual = (i && typeof i === 'object') ? i : coletarCard();
    cardPronto = false;
    if (!freteAtual || (!freteAtual.freorigem && !freteAtual.fredestino)) {
      alert('Preencha origem e destino para gerar o card.');
      return;
    }
    desenharCard(freteAtual).then(function () {
      document.getElementById('modalCardFrete').classList.add('aberto');
    });
  };
  window.fecharCardFrete = function () {
    document.getElementById('modalCardFrete').classList.remove('aberto');
  };

  function nomeArquivo() {
    var f = freteAtual || {};
    return ('frete-' + (f.freorigem || '') + '-' + (f.fredestino || ''))
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
  }

  function cardDataURL() {
    var cv = document.getElementById('canvasCardFrete');
    if (!cv) return null;
    try { return cv.toDataURL('image/png'); } catch (e) { return null; }
  }

  function dataURLparaBlob(url) {
    var partes = url.split(',');
    var bin = atob(partes[1]);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: 'image/png' });
  }

  function cardArquivo() {
    var url = cardDataURL();
    if (!url) return null;
    var blob = dataURLparaBlob(url);
    try { return new File([blob], nomeArquivo(), { type: 'image/png' }); }
    catch (e) { blob.name = nomeArquivo(); return blob; }
  }

  window.baixarCardFrete = function () {
    garantirCard().then(function (ok) {
      var url = ok ? cardDataURL() : null;
      if (!ok) { alert('Preencha origem e destino do frete para gerar o card.'); return; }
      if (!url) { alert('Não foi possível gerar a imagem do card. Recarregue a página e tente novamente.'); return; }

      var a = document.createElement('a');
      a.href = url;
      a.download = nomeArquivo();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  function copiarCardClipboard() {
    var url = cardDataURL();
    if (!url) return Promise.resolve(false);
    try {
      if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined')
        return Promise.resolve(false);
      var item = new window.ClipboardItem({ 'image/png': dataURLparaBlob(url) });
      return navigator.clipboard.write([item])
        .then(function () { return true; })
        .catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  function enviarCard(tel) {
    // com telefone escolhido na lista, abre direto a conversa daquele contato
    if (tel) { compartilharFallback(tel); return; }
    var file = cardArquivo();
    var dados = file ? { files: [file], text: mensagemFrete(freteAtual), title: 'Frete' } : null;
    if (dados && navigator.share && (!navigator.canShare || navigator.canShare(dados))) {
      navigator.share(dados).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        compartilharFallback(tel);
      });
      return;
    }
    compartilharFallback(tel);
  }

  window.compartilharCardFrete = function () {
    // se o card ja esta pronto, compartilha direto (mantem o gesto do usuario)
    if (cardPronto && cardDataURL()) { enviarCard(); return; }
    garantirCard().then(function (ok) {
      if (!ok) { alert('Preencha origem e destino do frete para gerar o card.'); return; }
      enviarCard();
    });
  };

  function avisoCard(msg, tom) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);'
      + 'background:' + (tom === 'erro' ? '#b91c1c' : '#0f766e') + ';color:#fff;padding:.75rem 1.1rem;'
      + 'border-radius:10px;font:600 14px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.3);z-index:30000;max-width:90vw;text-align:center;';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 6000);
  }

  function linkWhats(tel) {
    var msg = encodeURIComponent(mensagemFrete(freteAtual));
    var telefone = String(tel || '').replace(/\D/g, '');
    return 'https://api.whatsapp.com/send?'
      + (telefone ? 'phone=' + telefone + '&' : '')
      + 'text=' + msg;
  }

  function abrirWhatsApp(tel) {
    var msg = encodeURIComponent(mensagemFrete(freteAtual));
    var q = (tel ? 'phone=' + tel + '&' : '') + 'text=' + msg;
    var web = linkWhats(tel);
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      // Tenta o Business; o proprio Android abre o link universal se ele nao estiver instalado.
      window.location.href = 'intent://send?' + q + '#Intent;scheme=whatsapp;package=com.whatsapp.w4b;'
        + 'S.browser_fallback_url=' + encodeURIComponent(web) + ';end';
    } else {
      // O link oficial abre o aplicativo disponível e usa a Web no computador.
      window.open(web, '_blank');
    }
  }

  function compartilharFallback(tel) {
    // 1) copia a imagem do card para a area de transferencia
    copiarCardClipboard().then(function (copiou) {
      // 2) abre a conversa ja com a mensagem
      abrirWhatsApp(tel);
      if (copiou) {
        avisoCard('Card copiado! Na conversa do WhatsApp pressione Ctrl+V e envie — a imagem vai anexada.');
      } else {
        // 3) so baixa se nao foi possivel copiar
        window.baixarCardFrete();
        avisoCard('Card baixado. Arraste a imagem para a conversa do WhatsApp para anexar.', 'erro');
      }
    });
  }



  function mensagemFrete(f) {
    f = f || {};
    var L = [];
    L.push('\uD83D\uDE9B *FRETE DISPON\u00CDVEL*');
    L.push('\uD83D\uDDFA\uFE0F Rota: ' + (f.freorigem || '') + ' \u27A1 ' + (f.fredestino || ''));
    if (f.fredistancia) L.push('\uD83D\uDCCF Dist\u00E2ncia: ' + f.fredistancia);
    if (f.frepeso) L.push('\u2696\uFE0F Peso: ' + f.frepeso);
    if (f.fretipocarga) L.push('\uD83D\uDCE6 Carga: ' + f.fretipocarga);
    if (f.frecarregamento) L.push('\uD83D\uDCC5 Carregamento: ' + dataHoraBR(f.frecarregamento));
    if (f.freentrega) L.push('\uD83D\uDE9A Entrega: ' + dataHoraBR(f.freentrega));
    if (f.fretipoveiculo) L.push('\uD83D\uDEFB Ve\u00EDculo: ' + f.fretipoveiculo);
    if (f.frevalor) L.push('\uD83D\uDCB0 Valor do frete: ' + f.frevalor);
    if (f.frerastreada === 'Sim') L.push('\uD83D\uDCE1 Carga rastreada');
    if (f.freobs) L.push('\uD83D\uDCDD Observa\u00E7\u00F5es: ' + f.freobs);
    if (f.frecontato) L.push('\uD83D\uDCDE Contato: ' + f.frecontato);
    return L.join('\n');
  }

  function terceirosLista() {
    var base = null;
    try { base = (typeof db !== 'undefined' && db) ? db : (window.db || null); } catch (e) { base = window.db || null; }
    var lista = (base && Array.isArray(base.terceiros)) ? base.terceiros : [];
    var out = [];
    lista.forEach(function (t) {
      var tel = t.tertelmotorista || t.tertelefone;
      if (tel) {
        out.push({
          nome: t.ternome || t.terproprietario || '(sem nome)',
          empresa: t.terempresa || '',
          cidade: [t.tercidade, t.terestado].filter(Boolean).join(' - '),
          tel: tel,
          status: t.terstatus || ''
        });
      }
      if (t.tertelefone && t.tertelmotorista && soDigitos(t.tertelefone) !== soDigitos(t.tertelmotorista)) {
        out.push({
          nome: (t.terproprietario || t.ternome || '') + ' (proprietário)',
          empresa: t.terempresa || '',
          cidade: [t.tercidade, t.terestado].filter(Boolean).join(' - '),
          tel: t.tertelefone,
          status: t.terstatus || ''
        });
      }
    });
    return out;
  }

  window.renderListaTerWhats = function () {
    var tb = document.getElementById('listaTerWhats');
    if (!tb) return;
    var busca = (val('buscaTerWhats') || '').toLowerCase();
    var html = '';
    terceirosLista().forEach(function (t) {
      var texto = (t.nome + ' ' + t.empresa + ' ' + t.cidade).toLowerCase();
      if (busca && texto.indexOf(busca) === -1) return;
      html += '<tr>'
        + '<td>' + esc(t.nome) + (t.status === 'Bloqueado' ? ' <span class="badge bg-danger">Bloqueado</span>' : '') + '</td>'
        + '<td>' + esc(t.empresa) + '</td>'
        + '<td>' + esc(t.cidade) + '</td>'
        + '<td>' + esc(t.tel) + '</td>'
        + '<td><button class="btn btn-sm btn-success" onclick="abrirWhatsTerceiro(\'' + telWhats(t.tel) + '\')">💬 Enviar</button></td>'
        + '</tr>';
    });
    tb.innerHTML = html || '<tr><td colspan="5" class="text-center text-muted">Nenhum terceiro com telefone cadastrado.</td></tr>';
  };

  window.abrirWhatsTerceiro = function (tel) {
    if (!tel) { alert('Terceiro sem telefone válido.'); return; }
    if (cardPronto && cardDataURL()) { enviarCard(tel); return; }
    garantirCard().then(function (ok) {
      if (!ok) { alert('Preencha origem e destino do frete para gerar o card.'); return; }
      enviarCard(tel);
    });
  };


  window.abrirEnvioWhats = function () {
    window.renderListaTerWhats();
    garantirCard();
    document.getElementById('modalEnvioWhats').classList.add('aberto');
  };

  window.fecharEnvioWhats = function () {
    document.getElementById('modalEnvioWhats').classList.remove('aberto');
  };

  function init() {
    carregar();
    montarSubAbas();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
