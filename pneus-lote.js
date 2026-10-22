/* Lançamento de vários pneus de uma vez.
   Usa os dados comuns do formulário de Pneus e salva cada pneu pelo salvarPneu existente,
   mantendo estoque, histórico e Pneus por KM. Valida tudo antes de gravar qualquer pneu. */
(function () {
  'use strict';
  var COMUNS = ['pmarca','pmodelo','pmedida','pvalor','pdata','pdatainstalacao','pvida','psulco','pveiculo','pfornecedor','pkminstalacao','pkmatual','pstatus','pobs'];
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function chave(v) { return String(v || '').trim().toUpperCase(); }
  function posicoes() { var s = $('pposicao'); return s ? Array.prototype.map.call(s.options, function (o) { return o.value || o.text; }) : []; }

  function linha(i, pos) {
    var ops = posicoes().map(function (p) { return '<option' + (p === pos ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('');
    return '<tr><td>' + (i + 1) + '</td>' +
      '<td><select class="form-select form-select-sm pl-pos">' + ops + '</select></td>' +
      '<td><input class="form-control form-control-sm pl-num" placeholder="Número"></td>' +
      '<td><input class="form-control form-control-sm pl-dot" placeholder="DOT"></td>' +
      '<td><input class="form-control form-control-sm pl-marca" placeholder="Igual ao comum"></td>' +
      '<td><input class="form-control form-control-sm pl-valor" placeholder="Igual ao comum" inputmode="decimal" oninput="if(window.mascaraMoeda)mascaraMoeda(this)"></td></tr>';
  }
  function montarLinhas() {
    var qtd = Math.max(1, Math.min(30, parseInt(($('plQtd') || {}).value, 10) || 1));
    var pos = posicoes(), corpo = $('plLinhas'), atuais = corpo.querySelectorAll('tr').length;
    for (var i = atuais; i < qtd; i++) corpo.insertAdjacentHTML('beforeend', linha(i, pos[i] || pos[pos.length - 1]));
    while (corpo.querySelectorAll('tr').length > qtd) corpo.removeChild(corpo.lastElementChild);
  }
  function lerLinhas() {
    return Array.prototype.map.call($('plLinhas').querySelectorAll('tr'), function (tr) {
      return { pos: tr.querySelector('.pl-pos').value, num: tr.querySelector('.pl-num').value.trim(),
        dot: tr.querySelector('.pl-dot').value.trim(), marca: tr.querySelector('.pl-marca').value.trim(),
        valor: tr.querySelector('.pl-valor').value.trim() };
    }).filter(function (l) { return l.num; });
  }

  function salvarLote() {
    if ($('p_idx').value !== '') { alert('Cancele a edição do pneu antes de lançar vários pneus.'); return; }
    var estoque = ($('pstatus') || {}).value === 'Estoque';
    if (estoque) { $('pveiculo').value = ''; $('pkminstalacao').value = ''; }
    else if (!$('pveiculo').value) { alert('Selecione o veículo no formulário acima.'); return; }
    var linhas = lerLinhas();
    if (!linhas.length) { alert('Informe o número de pelo menos um pneu.'); return; }
    var comum = {}; COMUNS.forEach(function (id) { comum[id] = $(id) ? $(id).value : ''; });
    var b = typeof db !== 'undefined' ? db : window.db, existentes = {}, vistos = {}, posUsadas = {}, erros = [];
    ((b && b.pneus) || []).forEach(function (p) { existentes[chave(p.pnumero)] = 1; });
    linhas.forEach(function (l, i) {
      var k = chave(l.num), rot = 'Pneu ' + l.num + ': ';
      if (existentes[k]) erros.push(rot + 'número já cadastrado.');
      if (vistos[k]) erros.push(rot + 'número repetido na lista.');
      if (estoque) l.pos = '';
      else if (posUsadas[l.pos]) erros.push(rot + 'posição ' + l.pos + ' repetida.');
      vistos[k] = 1; if (!estoque) posUsadas[l.pos] = 1;
      var obj = Object.assign({}, comum, { pnumero: l.num, pdot: l.dot, pposicao: l.pos, pid: 'lote-teste-' + i });
      if (l.marca) obj.pmarca = l.marca;
      if (l.valor) obj.pvalor = l.valor;
      var plano = window.FMPneusFrota ? window.FMPneusFrota.preparar(obj, null) : { erro: 'A integração de Pneus por KM não está disponível.' };
      if (plano.erro) erros.push(rot + plano.erro);
    });
    if (erros.length) { alert('Nada foi salvo. Corrija:\n\n' + erros.join('\n')); return; }
    if (!confirm(estoque ? 'Salvar ' + linhas.length + ' pneus no estoque?' : 'Salvar ' + linhas.length + ' pneus no veículo ' + comum.pveiculo + '?')) return;
    var alerta = window.alert, falhas = [];
    linhas.forEach(function (l) {
      COMUNS.forEach(function (id) { if ($(id)) $(id).value = comum[id]; });
      $('p_idx').value = ''; $('pnumero').value = l.num; $('pdot').value = l.dot; $('pposicao').value = l.pos;
      if (l.marca) $('pmarca').value = l.marca;
      if (l.valor) $('pvalor').value = l.valor;
      if (typeof window.calcularKMPneu === 'function') window.calcularKMPneu();
      window.alert = function (m) { falhas.push('Pneu ' + l.num + ': ' + m); };
      try { window.salvarPneu(); } finally { window.alert = alerta; }
    });
    if (falhas.length) alert('Alguns pneus não foram salvos:\n\n' + falhas.join('\n'));
    else alert(linhas.length + ' pneus salvos. Clique no olho de cada um para ver todas as informações.');
    $('plLinhas').innerHTML = ''; montarLinhas();
  }

  function iniciar() {
    var cont = $('pneus') && $('pneus').querySelector('.glass-container');
    if (!cont || $('pneusLote')) return;
    cont.insertAdjacentHTML('beforeend',
      '<div id="pneusLote" class="mt-3"><button type="button" class="btn btn-outline-dark" id="plAbrir">🛞 Lançar vários pneus de uma vez</button>' +
      '<div id="plPainel" class="mt-3" style="display:none"><p class="text-muted mb-2">Preencha acima o veículo e os dados iguais para todos (marca, medida, valor, datas, KM, status). ' +
      'Aqui informe só o que muda em cada pneu. Linhas sem número são ignoradas. Com status Estoque, veículo e posição não são necessários.</p>' +
      '<label>Quantidade de pneus <input id="plQtd" type="number" min="1" max="30" value="6" class="form-control form-control-sm d-inline-block" style="width:80px"></label>' +
      '<div class="table-responsive mt-2"><table class="table table-sm"><thead><tr><th>#</th><th>Posição</th><th>Número</th><th>DOT</th><th>Marca (se diferente)</th><th>Valor (se diferente)</th></tr></thead><tbody id="plLinhas"></tbody></table></div>' +
      '<div class="text-end"><button type="button" class="btn btn-outline-secondary" id="plFechar">Cancelar</button> <button type="button" class="btn btn-dark" id="plSalvar">Salvar todos</button></div></div></div>');
    $('plAbrir').onclick = function () { $('plPainel').style.display = ''; montarLinhas(); };
    $('plFechar').onclick = function () { $('plPainel').style.display = 'none'; $('plLinhas').innerHTML = ''; };
    $('plQtd').oninput = montarLinhas;
    $('plSalvar').onclick = salvarLote;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  window.FMPneusLote = { salvar: salvarLote };
})();
