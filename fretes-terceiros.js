/* =====================================================================
   Frota Master - Sub-aba "Cadastro de Fretes" dentro do modulo Terceiros
   - Cadastro/edicao/exclusao de fretes (localStorage FM_FRETES)
   - Geracao do card visual do frete (canvas) no padrao Cargo Center
   - Envio por WhatsApp para os terceiros cadastrados
   ===================================================================== */
(function () {
  'use strict';

  var LS_KEY = 'FM_FRETES';
  var fretes = [];

  function carregar() {
    try { fretes = JSON.parse(localStorage.getItem(LS_KEY) || '[]') || []; }
    catch (e) { fretes = []; }
    if (!Array.isArray(fretes)) fretes = [];
  }
  function persistir() { localStorage.setItem(LS_KEY, JSON.stringify(fretes)); }

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
    var v = document.getElementById('frevalor');
    if (v && !v.dataset.mask) {
      v.dataset.mask = '1';
      v.addEventListener('input', function () { v.value = moedaBR(v.value); });
    }
    var t = document.getElementById('frecontato');
    if (t && !t.dataset.mask) {
      t.dataset.mask = '1';
      t.addEventListener('input', function () { t.value = telefoneBR(t.value); });
    }
  }

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
      + '    <div class="col-md-3"><label class="form-label-mini">WhatsApp do card</label><input id="frecontato" class="form-control" inputmode="tel" maxlength="15" placeholder="(54) 99950-5407"></div>'
      + '    <div class="col-md-6"><label class="form-label-mini">Chamada de rodapé do card</label><input id="frerodape" class="form-control" placeholder="SEGURANÇA, AGILIDADE E COMPROMISSO DO CARREGAMENTO À ENTREGA."></div>'
      + '    <div class="col-md-12"><label class="form-label-mini">Observações</label><textarea id="freobs" class="form-control" placeholder="Observações do frete"></textarea></div>'
      + '    <div class="col-md-12 text-end">'
      + '      <button class="btn btn-primary" onclick="salvarFrete()">Salvar</button> '
      + '      <button class="btn btn-outline-secondary" onclick="limparFormFrete()">Cancelar</button> '
      + '      <button class="btn btn-success" onclick="preverCardFrete()">🖼️ Gerar Card</button>'
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
      + '      <th>Data</th><th>Origem</th><th>Destino</th><th>Peso</th><th>Carregamento</th>'
      + '      <th>Entrega</th><th>Rastreada</th><th>Valor</th><th>Status</th><th class="col-acoes">Ações</th>'
      + '    </tr></thead>'
      + '    <tbody id="listaFretes"></tbody>'
      + '  </table>'
      + '</div>';
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
      + '<button type="button" class="fm-subaba" data-alvo="subTerFretes">🚚 Cadastro de Fretes</button>';

    var painelFre = document.createElement('div');
    painelFre.id = 'subTerFretes';
    painelFre.className = 'hidden';
    painelFre.innerHTML = painelFretesHTML();

    mod.appendChild(nav);
    mod.appendChild(painelCad);
    mod.appendChild(painelFre);

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
      ['subTerCadastro', 'subTerFretes'].forEach(function (id) {
        var p = document.getElementById(id);
        if (p) p.classList.toggle('hidden', id !== btn.dataset.alvo);
      });
      if (btn.dataset.alvo === 'subTerFretes') renderFretes();
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
      if (selecionar) sel.value = selecionar;
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
      frecontato: telefoneBR(val('frecontato')),
      frerodape: val('frerodape'),
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
    if (idx === '') fretes.push(obj); else fretes[Number(idx)] = obj;
    persistir();
    window.limparFormFrete();
    renderFretes();
    // card gerado automaticamente e ja pronto para compartilhar
    freteAtual = obj;
    cardPronto = false;
    desenharCard(obj).then(function () {
      var m = document.getElementById('modalCardFrete');
      if (m) m.classList.add('aberto');
    });
  };

  window.limparFormFrete = function () {
    ['fredata', 'freorigem', 'fredestino', 'fredistancia', 'frepeso', 'fretipocarga', 'frecarregamento',
      'freentrega', 'frevalor', 'fretipoveiculo', 'frecontato', 'frerodape', 'freobs', 'fre_idx']
      .forEach(function (id) { setVal(id, ''); });
    setVal('freorigemuf', ''); setVal('fredestinouf', '');
    carregarCidades('freorigemuf', 'freorigemcid', '');
    carregarCidades('fredestinouf', 'fredestinocid', '');
    setVal('frerastreada', 'Sim');
    setVal('frestatus', 'Disponível');
  };

  window.editarFrete = function (i) {
    var f = fretes[i]; if (!f) return;
    Object.keys(f).forEach(function (k) { setVal(k, f[k]); });
    aplicarRotaNosSelects(f);
    setVal('fre_idx', i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.excluirFrete = function (i) {
    if (!confirm('Excluir este frete?')) return;
    fretes.splice(i, 1);
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
    var busca = (val('filtroFreBusca') || '').toLowerCase();
    var st = val('filtroFreStatus');
    var html = '';
    fretes.forEach(function (f, i) {
      var texto = [f.freorigem, f.fredestino, f.fretipocarga, f.fretipoveiculo, f.freobs].join(' ').toLowerCase();
      if (busca && texto.indexOf(busca) === -1) return;
      if (st && f.frestatus !== st) return;
      html += '<tr>'
        + '<td>' + esc(dataBR(f.fredata)) + '</td>'
        + '<td>' + esc(f.freorigem) + '</td>'
        + '<td>' + esc(f.fredestino) + '</td>'
        + '<td>' + esc(f.frepeso) + '</td>'
        + '<td>' + esc(dataHoraBR(f.frecarregamento)) + '</td>'
        + '<td>' + esc(dataHoraBR(f.freentrega)) + '</td>'
        + '<td>' + esc(f.frerastreada) + '</td>'
        + '<td class="money">' + esc(f.frevalor) + '</td>'
        + '<td>' + esc(f.frestatus) + '</td>'
        + '<td class="col-acoes">'
        + '<button class="btn btn-sm btn-outline-primary" title="Editar" onclick="editarFrete(' + i + ')">✏️</button> '
        + '<button class="btn btn-sm btn-outline-success" title="Ver card" onclick="preverCardFrete(' + i + ')">🖼️</button> '
        + '<button class="btn btn-sm btn-success" title="Enviar no WhatsApp" onclick="enviarFreteWhats(' + i + ')">💬</button> '
        + '<button class="btn btn-sm btn-outline-danger" title="Excluir" onclick="excluirFrete(' + i + ')">🗑️</button>'
        + '</td></tr>';
    });
    tb.innerHTML = html || '<tr><td colspan="10" class="text-center text-muted">Nenhum frete cadastrado.</td></tr>';
  };
  var renderFretes = window.renderFretes;

  /* ---------------- card (canvas) ---------------- */
  var freteAtual = null;
  var cardPronto = false;
  var imgs = {};

  function carregarImg(src) {
    return new Promise(function (res) {
      if (imgs[src]) return res(imgs[src]);
      var im = new Image();
      im.onload = function () { imgs[src] = im; res(im); };
      im.onerror = function () { res(null); };
      im.src = src;
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
    if (titulo) {
      ctx.font = 'bold 25px ' + FAM;
      ctx.fillStyle = CINZA;
      ctx.fillText(String(titulo).toUpperCase(), x0, y - 10);
      textoAjustado(ctx, String(valor || '').toUpperCase(), x0, y + 26, 470, 32, 'bold', VERM);
      if (valor2) textoAjustado(ctx, String(valor2).toUpperCase(), x0, y + 62, 430, 32, 'bold', VERM);
    } else {
      textoAjustado(ctx, String(valor || '').toUpperCase(), x0, y + 12, 430, 32, 'bold', GRAFITE);
    }
  }


  /* rotulo de cidade sobre o mapa do fundo (cobre o texto original da arte) */
  function rotuloMapa(ctx, x, y, texto, ancora) {
    var txt = String(texto || '').toUpperCase();
    var maxW = 158;
    var s = 19;
    ctx.save();
    while (s > 10) {
      ctx.font = 'bold ' + s + 'px ' + FAM;
      if (ctx.measureText(txt).width <= maxW) break;
      s -= 1;
    }
    var w = Math.min(maxW, ctx.measureText(txt).width);
    var largura = Math.max(w + 22, 172);
    var altura = 38;
    var bx = (ancora === 'esq') ? (x - largura + 6) : (x - 6);
    var by2 = y - altura / 2;
    if (bx + largura > 1074) bx = 1074 - largura;
    if (bx < 560) bx = 560;
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRect(ctx, bx, by2, largura, altura, 19);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(200,16,46,0.85)';
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by2, largura, altura, 19);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = GRAFITE;
    ctx.font = 'bold ' + s + 'px ' + FAM;
    ctx.fillText(txt, bx + largura / 2, y + s / 3);
    ctx.textAlign = 'left';
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
      carregarImg('./card-logo.png')
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
      var s1 = 30;
      ctx.font = 'bold ' + s1 + 'px ' + FAM;
      while (s1 > 15 && ctx.measureText(rota).width + ctx.measureText(dest).width + 158 > maxRota) {
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

      // nomes das cidades sobre o mapa (destino em cima, origem embaixo)
      desenharMapa(ctx, geoO, geoD, rota, dest);



      var linhas = [];
      if (f.fredistancia) linhas.push(['pin', 'Distância', f.fredistancia, '']);
      if (f.frepeso) linhas.push(['peso', 'Peso', f.frepeso, '']);
      if (f.fretipocarga) linhas.push(['caixa', 'Tipo de carga', f.fretipocarga, '']);
      if (f.frecarregamento) linhas.push(['data', 'Carregamento', dataHoraBR(f.frecarregamento), '']);
      if (f.freentrega) {
        var e = String(dataHoraBR(f.freentrega)).toUpperCase(), e1 = e, e2 = '';
        if (e.length > 26) {
          var corte = e.lastIndexOf(' ', 26);
          if (corte > 10) { e1 = e.slice(0, corte); e2 = e.slice(corte + 1); }
        }
        linhas.push(['caminhao', 'Entrega', e1, e2]);
      }
      if (f.fretipoveiculo) linhas.push(['caminhao', 'Veículo', f.fretipoveiculo, '']);
      if (f.frevalor) linhas.push(['valor', 'Valor do frete', f.frevalor, '']);
      if (f.frerastreada === 'Sim') linhas.push(['pin', '', 'CARGA RASTREADA', '']);

      var rod = f.frerodape || 'SEGURANÇA, AGILIDADE E COMPROMISSO DO CARREGAMENTO À ENTREGA.';
      var topo = 548, base2 = 916, alturaRod = 72;
      var disp = base2 - topo - alturaRod;
      var compacto = linhas.length > 4;
      var raioBase = compacto ? 26 : 34;
      var raio = raioBase;
      if (compacto) {
        linhas.forEach(function (l) { if (l[3]) { l[2] = l[2] + ' ' + l[3]; l[3] = ''; } });
      }
      var pesos = linhas.map(function (l) { return l[3] ? 1.5 : 1; });
      var totalPeso = pesos.reduce(function (x, y2) { return x + y2; }, 0) || 1;
      var unidade = Math.min(compacto ? 60 : 96, disp / totalPeso);
      var y = topo + unidade * 0.5;
      linhas.forEach(function (l, i2) {
        if (i2 > 0) {
          ctx.fillStyle = 'rgba(28,28,32,0.10)';
          ctx.fillRect(108 + raio + 26, y - unidade * 0.5, 420, 2);
        }
        linhaInfo(ctx, y, l[0], l[1], l[2], l[3], compacto, raio);
        y += unidade * pesos[i2];
      });

      var yRod = Math.min(base2 - 20, y + 14);
      var partes = String(rod).toUpperCase().split(/\s+/);
      var l1 = '', l2 = '';
      ctx.font = '600 21px ' + FAM;
      partes.forEach(function (pz) {
        if (!l2 && ctx.measureText(l1 + ' ' + pz).width < 430) l1 = (l1 ? l1 + ' ' : '') + pz;
        else l2 = (l2 ? l2 + ' ' : '') + pz;
      });
      iconeCard(ctx, 108, yRod, 'escudo', raio);
      ctx.textAlign = 'left';
      textoAjustado(ctx, l1, 108 + raio + 26, yRod - 4, 440, 21, '600', CINZA);
      if (l2) textoAjustado(ctx, l2, 108 + raio + 26, yRod + 24, 440, 21, 'bold', GRAFITE);

      // ---- rodape profissional: faixa escura com telefone e logo ----
      var tel = f.frecontato || '';
      var by = 944, bh = H - 944, cy = by + bh / 2;

      // limpa area do rodape e desenha faixa escura
      var fg = ctx.createLinearGradient(0, by, W, H);
      fg.addColorStop(0, '#15181e');
      fg.addColorStop(1, '#05070a');
      ctx.fillStyle = fg;
      ctx.fillRect(0, by, W, bh);

      // filete vermelho superior
      var rgd = ctx.createLinearGradient(0, 0, W, 0);
      rgd.addColorStop(0, VERM);
      rgd.addColorStop(1, VERM_ESC);
      ctx.fillStyle = rgd;
      ctx.fillRect(0, by, W, 7);

      // icone telefone
      ctx.save();
      ctx.fillStyle = VERM;
      ctx.beginPath(); ctx.arc(96, cy + 3, 40, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(96, cy + 3);
      ctx.scale(1.05, 1.05);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-13, -14); ctx.lineTo(-4, -14); ctx.lineTo(0, -5); ctx.lineTo(-5, 0);
      ctx.quadraticCurveTo(1, 9, 9, 14); ctx.lineTo(14, 9); ctx.lineTo(22, 14); ctx.lineTo(22, 21);
      ctx.quadraticCurveTo(2, 21, -13, -2); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();

      // telefone
      ctx.textAlign = 'left';
      textoAjustado(ctx, 'CONTATO / WHATSAPP', 152, cy - 12, 320, 20, '600', 'rgba(255,255,255,0.62)');
      textoAjustado(ctx, tel || 'WHATSAPP', 152, cy + 30, 380, 42, 'bold', '#ffffff');

      // logo cargo center a direita
      if (logo) {
        var lh = 76, lw = logo.width * (lh / logo.height);
        var lx = W - 56 - lw, ly = cy - lh / 2;
        ctx.drawImage(logo, lx, ly, lw, lh);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(lx - 40, cy - 44, 2, 88);
      }

      ctx.textAlign = 'left';
      cardPronto = true;
    });
  }

  // garante que exista um frete atual e que o card esteja desenhado
  function garantirCard() {
    if (!freteAtual) freteAtual = coletar();
    if (!freteAtual || (!freteAtual.freorigem && !freteAtual.fredestino)) {
      return Promise.resolve(false);
    }
    if (cardPronto && document.getElementById('canvasCardFrete')) return Promise.resolve(true);
    return desenharCard(freteAtual).then(function () { return cardPronto; });
  }

  window.preverCardFrete = function (i) {
    freteAtual = (typeof i === 'number') ? fretes[i] : coletar();
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
      if (!url) { alert('Preencha origem e destino do frete para gerar o card.'); return; }
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
    return tel
      ? 'https://wa.me/' + tel + '?text=' + msg
      : 'https://wa.me/?text=' + msg;
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
    L.push('*FRETE DISPONÍVEL*');
    L.push('📍 ' + (f.freorigem || '') + ' ➜ ' + (f.fredestino || ''));
    if (f.fredistancia) L.push('🛣 Distância: ' + f.fredistancia);
    if (f.frepeso) L.push('⚖ Peso: ' + f.frepeso);
    if (f.fretipocarga) L.push('📦 Carga: ' + f.fretipocarga);
    if (f.frecarregamento) L.push('📅 Carregamento: ' + dataHoraBR(f.frecarregamento));
    if (f.freentrega) L.push('🚚 Entrega: ' + dataHoraBR(f.freentrega));
    if (f.fretipoveiculo) L.push('🚛 Veículo: ' + f.fretipoveiculo);
    if (f.frevalor) L.push('💰 Valor do frete: ' + f.frevalor);
    if (f.frerastreada === 'Sim') L.push('📍 Carga rastreada');
    if (f.freobs) L.push('📝 ' + f.freobs);
    if (f.frecontato) L.push('📞 Contato: ' + f.frecontato);
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

  window.enviarFreteWhats = function (i) {
    freteAtual = fretes[i];
    if (!freteAtual) return;
    cardPronto = false;
    desenharCard(freteAtual).then(function () {
      document.getElementById('modalCardFrete').classList.add('aberto');
      window.abrirEnvioWhats();
    });
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
