/* Combustível: ler foto do cupom no próprio computador, com melhoria da imagem e várias tentativas,
   pré-preencher o formulário para conferência e descartar a foto. Nada é salvo antes de clicar em Salvar. */
(function () {
  'use strict';
  var BASE = 'vendor/';
  function el(id) { return document.getElementById(id); }
  function N(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function num(s) {
    s = String(s || '').replace(/\s/g, '').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
    s = s.replace(/[^\d.,-]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) { var k = s.lastIndexOf('.'); s = s.slice(0, k).replace(/\./g, '') + s.slice(k); }
    return parseFloat(s) || 0;
  }
  function carregarLib() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (ok, err) { var s = document.createElement('script'); s.src = BASE + 'tesseract.min.js'; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  }

  /* ---------- Melhoria da imagem ---------- */
  function carregarImagem(arquivo) {
    return new Promise(function (ok, err) {
      var url = URL.createObjectURL(arquivo), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok(img); };
      img.onerror = function (e) { URL.revokeObjectURL(url); err(e); };
      img.src = url;
    });
  }
  function canvasDe(img, graus) {
    var alvo = 2600, w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var esc = Math.min(3, Math.max(1, alvo / Math.max(w, h)));
    if (Math.max(w, h) > alvo) esc = alvo / Math.max(w, h);
    var W = Math.round(w * esc), H = Math.round(h * esc), gira = graus === 90 || graus === 270;
    var c = document.createElement('canvas'); c.width = gira ? H : W; c.height = gira ? W : H;
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.translate(c.width / 2, c.height / 2); x.rotate((graus || 0) * Math.PI / 180); x.drawImage(img, -W / 2, -H / 2, W, H);
    return c;
  }
  function recortar(c, inicio, fim) {
    var y = Math.max(0, Math.round(c.height * inicio)), h = Math.max(1, Math.round(c.height * (fim - inicio)));
    var margem = Math.round(c.width * 0.025), r = document.createElement('canvas');
    r.width = c.width - margem * 2; r.height = h;
    r.getContext('2d').drawImage(c, margem, y, r.width, h, 0, 0, r.width, h);
    return r;
  }
  function tratar(c, modo) {
    var x = c.getContext('2d'), W = c.width, H = c.height, d = x.getImageData(0, 0, W, H), p = d.data, g = new Float32Array(W * H), i;
    for (i = 0; i < W * H; i++) g[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
    // contraste: estica entre percentis 2% e 98%
    var hist = new Array(256).fill(0); for (i = 0; i < g.length; i++) hist[g[i] | 0]++;
    var lo = 0, hi = 255, acc = 0; for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > g.length * 0.02) { lo = i; break; } }
    acc = 0; for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > g.length * 0.02) { hi = i; break; } }
    var r = Math.max(1, hi - lo); for (i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, (g[i] - lo) * 255 / r));
    if (modo === 'binario') {
      // limiar adaptativo (média local por imagem integral)
      var S = new Float64Array((W + 1) * (H + 1)), yy, xx;
      for (yy = 1; yy <= H; yy++) { var lin = 0; for (xx = 1; xx <= W; xx++) { lin += g[(yy - 1) * W + xx - 1]; S[yy * (W + 1) + xx] = S[(yy - 1) * (W + 1) + xx] + lin; } }
      var raio = Math.max(8, Math.round(Math.min(W, H) / 40));
      for (yy = 0; yy < H; yy++) for (xx = 0; xx < W; xx++) {
        var x1 = Math.max(0, xx - raio), y1 = Math.max(0, yy - raio), x2 = Math.min(W, xx + raio + 1), y2 = Math.min(H, yy + raio + 1);
        var soma = S[y2 * (W + 1) + x2] - S[y1 * (W + 1) + x2] - S[y2 * (W + 1) + x1] + S[y1 * (W + 1) + x1];
        var media = soma / ((x2 - x1) * (y2 - y1)); g[yy * W + xx] = g[yy * W + xx] < media - 10 ? 0 : 255;
      }
    } else if (modo === 'nitido') {
      var o = new Float32Array(g); for (var y = 1; y < H - 1; y++) for (var z = 1; z < W - 1; z++) { var k = y * W + z; o[k] = Math.max(0, Math.min(255, 5 * g[k] - g[k - 1] - g[k + 1] - g[k - W] - g[k + W])); } g = o;
    }
    for (i = 0; i < g.length; i++) { p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = g[i]; p[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0); return c;
  }

  /* ---------- Extração dos dados ---------- */
  var TIPOS = [
    [/S[\s-]?[1I][0O]\b|DIESEL\s*S\s*[1I][0O]/, 'Diesel S10'], [/S[\s-]?500|S-?5OO/, 'Diesel S500'],
    [/DIESEL|OLEO\s*DIESEL/, 'Diesel S500'], [/GASOLINA|GAS\.?\s*(COMUM|ADIT)/, 'Gasolina'], [/ETANOL|ALCOOL/, 'Etanol']
  ];
  function valores(T, rotulos, padrao) {
    var re = new RegExp('(?:' + rotulos + ')[^\\d\\n]{0,15}(' + padrao + ')', 'g'), m, out = [];
    while ((m = re.exec(T))) out.push(num(m[1]));
    return out;
  }
  function extrair(txt) {
    var T = txt.toUpperCase().replace(/[“”"]/g, ' '), d = {};
    var m = T.match(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-](20\d{2}|\d{2})\b/);
    if (m) {
      var a = m[3].length === 2 ? '20' + m[3] : m[3], atual = new Date().getFullYear();
      if (Math.abs(+a - atual) > 2 && String(a).slice(-1) === String(atual).slice(-1)) a = String(atual);
      var mes = ('0' + m[2]).slice(-2), dia = ('0' + m[1]).slice(-2);
      if (+a >= 2020 && +a <= atual + 2 && +mes >= 1 && +mes <= 12 && +dia >= 1 && +dia <= 31) d.data = a + '-' + mes + '-' + dia;
    }
    for (var t = 0; t < TIPOS.length; t++) if (TIPOS[t][0].test(T)) { d.tipo = TIPOS[t][1]; break; }
    var NUM = '\\d{1,4}[.,]\\d{1,3}';
    var litros = valores(T, 'LITROS|LITRO|QTDE?\\.?|QUANT[A-Z.]*|VOLUME|VOL\\.?', NUM);
    var m2, re = /(\d{1,4}[.,]\d{2,3})\s*(?:L\b|LT\b|LTS\b|LITROS)/g; while ((m2 = re.exec(T))) litros.push(num(m2[1]));
    var unit = valores(T, 'R\\$\\s*\\/\\s*L|PRE[CÇ]O\\s*(?:UNIT[A-Z.]*|\\/\\s*L|LITRO|POR\\s*LITRO)?|VL\\.?\\s*UNIT[A-Z.]*|V\\.\\s*UNIT|UNIT[A-Z.]*|UN\\.', '\\d{1,2}[.,]\\d{2,4}');
    var totais = valores(T, 'VALOR\\s*TOTAL|TOTAL\\s*A\\s*PAGAR|VALOR\\s*A\\s*PAGAR|TOTAL\\s*R\\$|TOTAL|VALOR\\s*PAGO|DINHEIRO|CART[AÃ]O', '\\d{1,3}(?:\\.\\d{3})*[.,]\\d{2}');
    litros = litros.filter(function (v) { return v > 0.5 && v < 2000; });
    unit = unit.filter(function (v) { return v > 0.5 && v < 20; });
    totais = totais.filter(function (v) { return v > 1 && v < 100000; });
    // Cupom NFC-e: os dados do abastecimento normalmente ficam em uma linha da tabela
    // Descrição | Qtde | UN | Vl Unit | Total. Diesel tem prioridade sobre ARLA.
    var linhasProduto = T.split(/\n/).filter(function (linha) { return /DIESEL|GASOLINA|ETANOL|ALCOOL/.test(linha); });
    var produto = null;
    linhasProduto.forEach(function (linha) {
      var limpo = linha.replace(/^\s*\d{6,14}\s+/, '').replace(/S[\s-]?[1I]O\b/g, 'S10').replace(/S[\s-]?[1I]0\b/g, 'S10').replace(/S[\s-]?5[O0]0\b/g, 'S500');
      var depois = limpo.replace(/^.*?(?:DIESEL(?:\s+S(?:10|500))?|GASOLINA(?:\s+COMUM)?|ETANOL|ALCOOL)\s*/i, '');
      depois = depois.replace(/\bB[I1]\b/g, ' ').replace(/(\d)[.,]\s+(\d)/g, '$1,$2').replace(/(\d)\s*[.,]\s*(\d{2})\b/g, '$1,$2').replace(/[|¦]/g, ' ').replace(/(\d,\d{2,3})\.(?=\s)/g, '$1 ');
      var ml = depois.match(/(?:B[I1]\s*)?(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:L|LT|LTS|1)?\s+(\d{1,2}[.,]\d{2,4})\s+(\d{1,3}(?:\.\d{3})*[.,]\d{2})/);
      if (!ml) {
        var ns = depois.match(/\d{1,4}(?:[.,]\d{1,3})?/g) || [];
        for (var ni = 0; ni + 2 < ns.length; ni++) {
          var q = num(ns[ni]), u = num(ns[ni + 1]), tt = num(ns[ni + 2]);
          if (q >= 100 && q < 2000 && u > 1 && u < 20 && tt > 10 && Math.abs(q * u - tt) > Math.max(0.2, tt * 0.012)) {
            var candidatosQ = [q / 10, q / 100, q / 1000];
            for (var qi = 0; qi < candidatosQ.length; qi++) if (Math.abs(candidatosQ[qi] * u - tt) <= Math.max(0.2, tt * 0.012)) { q = candidatosQ[qi]; break; }
          }
          if (q > 1 && q < 2000 && u > 1 && u < 20 && tt > 10 && Math.abs(q * u - tt) <= Math.max(0.2, tt * 0.012)) { ml = [null, String(q), String(u), String(tt)]; break; }
        }
      }
      if (!ml) return;
      var candidato = { l: q || num(ml[1]), u: num(ml[2]), t: num(ml[3]), linha: linha };
      candidato.dif = Math.abs(candidato.l * candidato.u - candidato.t);
      if (candidato.l > 1 && candidato.l < 2000 && candidato.u > 1 && candidato.u < 20 && candidato.dif <= Math.max(0.2, candidato.t * 0.012) && (!produto || candidato.dif < produto.dif)) produto = candidato;
    });
    if (produto) {
      d.litros = produto.l; d.valorLitro = produto.u; d.total = produto.t; d.conferido = true;
      if (/S\s*10|S10|S1O/.test(produto.linha)) d.tipo = 'Diesel S10';
      else if (/S\s*500|S500|S5OO/.test(produto.linha)) d.tipo = 'Diesel S500';
      else if (/DIESEL/.test(produto.linha)) d.tipo = 'Diesel S500';
    }
    // conferência: litros × preço = total
    var melhor = null;
    litros.forEach(function (l) { unit.forEach(function (u) { totais.forEach(function (tt) { var dif = Math.abs(l * u - tt); if (dif <= Math.max(0.1, tt * 0.005) && (!melhor || dif < melhor.dif)) melhor = { l: l, u: u, t: tt, dif: dif }; }); }); });
    if (!produto && melhor) { d.litros = melhor.l; d.valorLitro = melhor.u; d.total = melhor.t; d.conferido = true; }
    else if (!produto) {
      d.litros = litros[0]; d.valorLitro = unit[0]; d.total = totais.length ? Math.max.apply(null, totais) : 0;
      if (d.litros && d.total && !d.valorLitro) d.valorLitro = Math.round(d.total / d.litros * 1000) / 1000;
      if (!d.litros && d.total && d.valorLitro) d.litros = Math.round(d.total / d.valorLitro * 100) / 100;
      if (d.litros && d.valorLitro && d.total && Math.abs(d.litros * d.valorLitro - d.total) > Math.max(0.1, d.total * 0.01)) d.divergente = true;
    }
    m = T.match(/\b(?:KM|KH|HOD[OÔ0]METRO|ODOMETRO|QUILOMETRAGEM)\s*[:.]?\s*(\d{1,3}(?:\.\d{3})+|\d{4,7})\b/);
    if (m) d.km = String(m[1]).replace(/\D/g, '');
    var placas = [], rp = /\b([A-Z0-9]{3})[\s-]?([0-9OIBS][A-Z0-9][0-9OIBS]{2})\b/g;
    while ((m = rp.exec(T))) { var le = m[1].replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B'), nu = m[2], cor = nu[0].replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8') + nu[1] + nu.slice(2).replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8'); if (/^[A-Z]{3}$/.test(le)) placas.push(le + cor); }
    d.placas = placas;
    m = T.match(/CNPJ\s*[:.]?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/); if (m) d.cnpj = m[1];
    var linhas = txt.split(/\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 3 && /[A-Za-z]{3}/.test(l); });
    var p = linhas.filter(function (l) { return /AUTO\s*POSTO|POSTO|COMBUST|DERIVADOS|PETROL|LTDA|EIRELI|\bME\b/i.test(l) && !/CONSUMIDOR|CLIENTE|CARGAS/i.test(l); })[0] || linhas[0];
    if (p) d.posto = p.replace(/[^\wÀ-ú .&-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return d;
  }
  function unirDados(destino, novo) {
    if (!novo) return destino;
    ['data', 'posto', 'cnpj', 'km'].forEach(function (k) { if (!destino[k] && novo[k]) destino[k] = novo[k]; });
    if ((!destino.placas || !destino.placas.length) && novo.placas && novo.placas.length) destino.placas = novo.placas.slice();
    if (novo.conferido && (!destino.conferido || !destino.litros)) {
      destino.litros = novo.litros; destino.valorLitro = novo.valorLitro; destino.total = novo.total; destino.conferido = true; destino.divergente = false;
    }
    if (novo.tipo && novo.tipo !== 'Arla32' && (!destino.tipo || destino.tipo === 'Arla32' || (destino.tipo === 'Diesel S500' && novo.tipo === 'Diesel S10'))) destino.tipo = novo.tipo;
    return destino;
  }
  function pontuar(d) {
    var s = 0; ['data', 'tipo', 'litros', 'valorLitro', 'total', 'km', 'posto'].forEach(function (k) { if (d[k]) s += 2; });
    if (d.placas && d.placas.length) s += 2; if (d.conferido) s += 8; if (d.divergente) s -= 3; return s;
  }

  /* ---------- Placa: aceita 1 caractere diferente ---------- */
  function dist(a, b) { if (a.length !== b.length) return 9; var n = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; }
  function escolherVeiculo(sel, placas) {
    if (!sel || !placas || !placas.length) return null;
    var melhor = null;
    Array.prototype.forEach.call(sel.options, function (o) {
      var alvo = N(o.value || o.text).slice(0, 7); if (alvo.length !== 7) return;
      placas.forEach(function (p) { var dd = dist(N(p), alvo); if (dd <= 1 && (!melhor || dd < melhor.d)) melhor = { o: o, d: dd }; });
    });
    return melhor;
  }

  /* ---------- Leitura com várias tentativas ---------- */
  function ler(arquivo, aviso) {
    var worker, img;
    return carregarLib().then(function () { return carregarImagem(arquivo); }).then(function (i) {
      img = i;
      return Tesseract.createWorker('por', 1, { workerPath: BASE + 'tesseract/worker.min.js', corePath: BASE + 'tesseract/tesseract-core-simd-lstm.wasm.js', langPath: BASE + 'tesseract' });
    }).then(function (w) {
      worker = w;
      var tentativas = [
        { g: 0, modo: 'nitido', psm: '4', area: [0, 1] },
        { g: 0, modo: 'binario', psm: '6', area: [.12, .44] },
        { g: 0, modo: 'nitido', psm: '6', area: [.12, .44] },
        { g: 0, modo: 'cinza', psm: '6', area: [.12, .44] },
        { g: 0, modo: 'cinza', psm: '4', area: [.15, .38] },
        { g: 0, modo: 'nitido', psm: '6', area: [.62, 1] },
        { g: 0, modo: 'cinza', psm: '6', area: [0, 1] },
        { g: 90, modo: 'binario', psm: '6', area: [0, 1] }, { g: 270, modo: 'binario', psm: '6', area: [0, 1] }, { g: 180, modo: 'binario', psm: '6', area: [0, 1] }
      ], melhor = null, combinado = {}, n = 0;
      function proxima() {
        if (n >= tentativas.length || (melhor && melhor.pontos >= 20)) return Promise.resolve(melhor);
        var t = tentativas[n++]; aviso('Lendo a foto... tentativa ' + n + ' de ' + tentativas.length);
        var base = canvasDe(img, t.g), c = t.area[0] || t.area[1] !== 1 ? recortar(base, t.area[0], t.area[1]) : base;
        c = tratar(c, t.modo);
        return worker.setParameters({ tessedit_pageseg_mode: t.psm, preserve_interword_spaces: '1' }).then(function () { return worker.recognize(c); }).then(function (r) {
          var txt = (r && r.data && r.data.text) || '', d = extrair(txt), pts = pontuar(d);
          unirDados(combinado, d);
          if (!melhor || pts > melhor.pontos) { if (melhor) melhor.canvas = null; melhor = { dados: d, pontos: pts, canvas: c }; }
          // As quatro primeiras leituras cobrem cupom inteiro, tabela e rodapé; só gira se ainda estiver fraca.
          if (n === 7 && pontuar(combinado) >= 16) n = tentativas.length;
          return proxima();
        });
      }
      return proxima().then(function () { if (!melhor) return null; melhor.dados = unirDados(combinado, melhor.dados); melhor.pontos = pontuar(melhor.dados); return melhor; });
    }).then(function (res) { if (worker) worker.terminate(); img = null; return res; }, function (e) { if (worker) worker.terminate(); throw e; });
  }

  /* ---------- Preencher formulário e mostrar conferência ---------- */
  function br(v, casas) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: casas || 2 }); }
  function preencher(d) {
    var lidos = [], faltam = [], conferir = [];
    function set(id, v) { var c = el(id); if (!c) return; c.value = v; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); if (c._flatpickr) c._flatpickr.setDate(v, false); }
    var sel = el('cveiculo'), v = escolherVeiculo(sel, d.placas);
    if (v) { sel.value = v.o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); lidos.push('Veículo: ' + v.o.text); if (v.d) conferir.push('placa lida com 1 caractere diferente'); }
    else faltam.push('veículo');
    if (d.data) { set('cdata', d.data); lidos.push('Data: ' + d.data.split('-').reverse().join('/')); } else faltam.push('data');
    if (d.tipo) { set('ctipo', d.tipo); if (el('ctipo') && el('ctipo').value !== d.tipo) conferir.push('tipo "' + d.tipo + '" não existe na lista'); else lidos.push('Combustível: ' + d.tipo); } else faltam.push('tipo de combustível');
    if (d.litros) { set('clitros', String(d.litros)); lidos.push('Litros: ' + br(d.litros, 3)); } else faltam.push('litros');
    if (d.valorLitro) { var vl = el('cvalorlitro'); if (vl) { vl.value = br(d.valorLitro, 3); vl.dispatchEvent(new Event('input', { bubbles: true })); } lidos.push('Valor/L: R$ ' + br(d.valorLitro, 3)); } else faltam.push('valor por litro');
    if (d.total) lidos.push('Total do cupom: R$ ' + br(d.total));
    if (d.conferido) lidos.push('Conta conferida: litros × valor/L = total');
    if (d.divergente) conferir.push('litros × valor/L não bate com o total do cupom');
    if (d.km) { set('ckm', d.km); lidos.push('KM: ' + d.km); } else faltam.push('KM atual');
    if (d.posto) { set('cposto', d.posto); lidos.push('Posto: ' + d.posto + (d.cnpj ? ' (CNPJ ' + d.cnpj + ')' : '')); } else faltam.push('posto');
    return { lidos: lidos, faltam: faltam, conferir: conferir };
  }
  function esc(t) { return String(t).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function mostrar(r, canvas) {
    var box = el('cFotoResultado'); if (!box) return;
    var h = '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:8px">';
    if (canvas) { var prev = document.createElement('canvas'), k = 260 / Math.max(canvas.width, canvas.height); prev.width = Math.round(canvas.width * k); prev.height = Math.round(canvas.height * k); prev.getContext('2d').drawImage(canvas, 0, 0, prev.width, prev.height); h += '<img alt="Foto melhorada usada na leitura" src="' + prev.toDataURL('image/jpeg', 0.7) + '" style="max-width:260px;border:1px solid #ccc;border-radius:6px">'; }
    h += '<div class="small" style="flex:1;min-width:220px">';
    if (r.lidos.length) h += '<div class="text-success fw-semibold">Lido</div><ul class="mb-1">' + r.lidos.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (r.conferir.length) h += '<div class="text-warning fw-semibold">Conferir</div><ul class="mb-1">' + r.conferir.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (r.faltam.length) h += '<div class="text-danger fw-semibold">Não lido — completar</div><ul class="mb-1">' + r.faltam.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    h += '<button type="button" class="btn btn-sm btn-outline-secondary" id="cFotoFechar">Fechar conferência</button></div></div>';
    box.innerHTML = h;
    el('cFotoFechar').onclick = function () { box.innerHTML = ''; };
  }

  function montar() {
    var form = el('c_idx'); if (!form || el('cFotoCupom')) return;
    var w = document.createElement('div'); w.className = 'mb-3';
    w.innerHTML = '<label class="form-label fw-semibold" for="cFotoCupom">📷 Ler foto do cupom de abastecimento</label>' +
      '<input type="file" id="cFotoCupom" accept="image/*" capture="environment" class="form-control" data-nao-limpar>' +
      '<div id="cFotoAviso" class="small text-muted mt-1">A foto é melhorada e lida aqui no computador, preenche os campos abaixo para você conferir e é descartada. Nada é salvo até clicar em Salvar.</div>' +
      '<div id="cFotoResultado" data-nao-limpar></div>';
    form.parentNode.insertBefore(w, form.nextSibling);
    var inp = el('cFotoCupom'), aviso = function (t) { el('cFotoAviso').textContent = t; };
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      inp.disabled = true; el('cFotoResultado').innerHTML = ''; aviso('Preparando leitura...');
      ler(f, aviso).then(function (res) {
        if (!res) throw new Error('sem resultado');
        var r = preencher(res.dados); mostrar(r, res.canvas); res.canvas = null;
        aviso(r.faltam.length || r.conferir.length ? 'Pré-lançamento preenchido. Confira os itens marcados, complete o que falta e clique em Salvar.' : 'Pré-lançamento preenchido. Confira os dados e clique em Salvar.');
        var c = el('cveiculo'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(function (e) { console.warn('Foto combustível', e); aviso('Não foi possível ler a foto. Tente uma foto mais nítida, com boa luz e o cupom reto, ou preencha à mão.'); })
        .then(function () { inp.value = ''; f = null; inp.disabled = false; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
  setTimeout(montar, 1500);
})();
