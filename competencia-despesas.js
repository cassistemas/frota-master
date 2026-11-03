/* Competência opcional: mantém a data original e usa o escritor de cada módulo. */
(function (root) {
  'use strict';
  var campos = {
    combustivel: ['ccompetencia', 'cdata'],
    manutencoes: ['mcompetencia', 'mdata'],
    multas: ['mucompetencia', 'mudata'],
    licenciamento: ['lcompetencia', 'lvencimento'],
    tacografo: ['tcompetencia', 'tdataafericao'],
    licencas: ['lecompetencia', 'venciv'],
    diarias: ['dicompetencia', 'didata'],
    revisoes: ['rcompetencia', 'rdata'],
    pneus: ['pcompetencia', 'pdata'],
    estoque: ['ecompetencia', 'edata'],
    estoqueSaida: ['scompetencia', 'sdata', 'ecompetencia'],
    eventosPneus: ['resPneuCompetencia', 'resPneuData', 'competencia'],
    fretes: ['frecompetencia', 'fredata']
  };
  function normalizar(valor) {
    var s = String(valor || '').trim();
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : '';
  }
  function manual(mod, registro) {
    var cfg = campos[mod];
    var valor = cfg && registro && registro[cfg[2] || cfg[0]];
    if (mod === 'licencas' && typeof root.fmNormalizarCompetenciaCiv === 'function') {
      return root.fmNormalizarCompetenciaCiv(valor);
    }
    return cfg ? normalizar(valor) : '';
  }
  function competencia(mod, registro, alternativa) {
    return manual(mod, registro) || String(alternativa || '').slice(0, 7);
  }
  function camposFormulario(mod, lista) {
    var cfg = campos[mod];
    return cfg && root.document && root.document.getElementById(cfg[0]) && lista.indexOf(cfg[0]) < 0
      ? lista.concat(cfg[0]) : lista;
  }
  function preencher(mod, registro) {
    var cfg = campos[mod], el = cfg && root.document && root.document.getElementById(cfg[0]);
    if (el) el.value = manual(mod, registro);
  }
  function validar(mod, registro) {
    var cfg = campos[mod], valor = cfg && registro && registro[cfg[0]];
    if (valor && !normalizar(valor)) {
      root.alert('Informe uma competência válida (mês e ano) ou deixe em branco para manter a regra atual.');
      return false;
    }
    return true;
  }
  function montar() {
    Object.keys(campos).forEach(function (mod) {
      var cfg = campos[mod], data = root.document.getElementById(cfg[1]);
      if (!data || root.document.getElementById(cfg[0])) return;
      var coluna = root.document.createElement('div');
      coluna.className = 'col-md-3 fm-competencia-despesa';
      var label = root.document.createElement('label');
      label.className = 'form-label fw-bold';
      label.htmlFor = cfg[0];
      label.textContent = 'Competência (opcional)';
      var input = root.document.createElement('input');
      input.id = cfg[0];
      input.type = 'month';
      input.className = 'form-control';
      input.setAttribute('aria-describedby', cfg[0] + '-ajuda');
      var ajuda = root.document.createElement('small');
      ajuda.id = cfg[0] + '-ajuda';
      ajuda.className = 'text-muted d-block mt-1';
      ajuda.textContent = 'Pode ser anterior ou posterior à data. Em branco: mantém a regra atual.';
      coluna.appendChild(label);
      coluna.appendChild(input);
      coluna.appendChild(ajuda);
      var ancora = data.closest('[class*="col-"]') || data.parentElement;
      ancora.insertAdjacentElement('afterend', coluna);
    });
  }
  root.FMCompetenciaDespesas = {
    normalizar: normalizar, manual: manual, competencia: competencia,
    camposFormulario: camposFormulario, preencher: preencher, validar: validar,
    montar: montar
  };
  // Escritores próprios: instale os campos antes de ler o formulário e nunca
  // deixe a competência do registro anterior em edições de cadastros antigos.
  function ligarFormularios() {
    function ligar(nome, antes) {
      var original = root[nome];
      if (typeof original !== 'function' || original.fmCompetencia) return;
      var fn = function () {
        montar();
        antes.apply(this, arguments);
        return original.apply(this, arguments);
      };
      fn.fmCompetencia = true;
      root[nome] = fn;
    }
    ['salvarEstoque', 'salvarSaidaEstoque', 'salvarFrete', 'salvarPneu'].forEach(function (nome, i) {
      var mod = ['estoque', 'estoqueSaida', 'fretes', 'pneus', 'eventosPneus'][i];
      var original = root[nome];
      if (typeof original !== 'function') return;
      root[nome] = function () {
        montar();
        var cfg = campos[mod], el = root.document.getElementById(cfg[0]);
        if (el && el.value && !normalizar(el.value)) {
          root.alert('Informe uma competência válida (mês e ano) ou deixe em branco para manter a regra atual.');
          return false;
        }
        return original.apply(this, arguments);
      };
    });
    ['limparFormEstoqueEntrada', 'limparFormEstoqueSaida', 'limparFormFrete'].forEach(function (nome, i) {
      ligar(nome, function () { preencher(['estoque', 'estoqueSaida', 'fretes'][i], {}); });
    });
    ligar('editarEstoque', function (i) {
      var b = typeof db !== 'undefined' ? db : root.db;
      var r = b && b.estoque && b.estoque[i] || {};
      preencher(r.etipo === 'Saída' ? 'estoqueSaida' : 'estoque', r);
    });
    ligar('editarFrete', function () { preencher('fretes', {}); });
    ligar('duplicarPneu', function () { preencher('pneus', {}); });
  }
  ligarFormularios();
  // Os módulos constroem alguns formulários somente ao abrir a tela.
  if (root.document && typeof root.MutationObserver === 'function') {
    new root.MutationObserver(function (mudancas) {
      if (mudancas.some(function (m) { return m.addedNodes.length; })) montar();
    }).observe(root.document.documentElement, { childList: true, subtree: true });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FMCompetenciaDespesas;
  if (root.document) {
    montar();
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', montar);
  }
})(typeof window !== 'undefined' ? window : globalThis);
