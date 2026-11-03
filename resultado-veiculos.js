/* Visibilidade somente na lista de Resultado: nunca exclui lançamentos ou altera totais. */
(function () {
  'use strict';
  var fontes = ['veiculos', 'custos', 'custosRecorrentes', 'quilometragens', 'producoes', 'gestaoDepreciacoes'];
  var campo = 'resultadoListaOculto', ocupado = false;
  function base() { return typeof db !== 'undefined' ? db : null; }
  function registros(mod) { var b = base(); return b && Array.isArray(b[mod]) ? b[mod] : []; }
  function placa(mod, x) { return x[mod === 'veiculos' ? 'vplaca' : 'veiculo']; }
  function normalizar(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function esc(p) { return String(p || '').replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function ocultos() {
    var out = {};
    fontes.forEach(function (mod) { registros(mod).forEach(function (x) {
      var p = placa(mod, x), k = normalizar(p);
      if (k && x[campo]) out[k] = p;
    }); });
    return out;
  }
  function lista(placas) {
    var ocultas = ocultos(), unicas = {};
    return (placas || []).filter(function (p) {
      var k = normalizar(p);
      if (!k || ocultas[k] || unicas[k]) return false;
      unicas[k] = true;
      return true;
    });
  }
  function acoes(p) {
    return '<button type="button" class="btn btn-outline-danger btn-sm" data-resultado-excluir="' + esc(p) + '" title="Remover apenas desta lista, preservando os lançamentos">Excluir da lista</button>';
  }
  function renderOcultos() {
    var painel = document.getElementById('resResultadoOcultos');
    if (!painel) return;
    var mapa = ocultos(), placas = Object.keys(mapa).sort().map(function (k) { return mapa[k]; });
    painel.innerHTML = '<summary>Veículos excluídos desta lista (' + placas.length + ')</summary><p class="cus-note">A exclusão afeta somente esta lista. Cadastros, lançamentos, totais e o Relatório mensal são preservados. Restaurar apenas reexibe a linha.</p>' +
      (placas.length ? placas.map(function (p) {
        return '<div class="d-flex flex-wrap align-items-center gap-2 mt-2"><strong>' + esc(p) + '</strong><button type="button" class="btn btn-outline-secondary btn-sm" data-resultado-restaurar="' + esc(p) + '">Restaurar na lista</button></div>';
      }).join('') : '<p class="cus-note">Nenhum veículo excluído desta lista.</p>');
  }
  function render() {
    if (typeof window.renderResultadoFrota === 'function') window.renderResultadoFrota();
    renderOcultos();
  }
  async function alterar(p, esconder) {
    if (ocupado || !normalizar(p)) return false;
    if (typeof window.fmModuloCarregado === 'function' && fontes.some(function (mod) { return !window.fmModuloCarregado(mod); })) {
      alert('Aguarde o carregamento dos veículos e lançamentos antes de continuar.'); return false;
    }
    if (esconder && !confirm('Excluir ' + p + ' somente da lista de Resultado?\n\nO cadastro e os lançamentos NÃO serão apagados. Os totais financeiros e o Relatório mensal NÃO mudam. Esta ação não transfere lançamentos para outra placa.')) return false;
    if (typeof salvarNuvem !== 'function') { alert('O salvamento está indisponível. Tente novamente.'); return false; }
    var alterados = [], mods = [];
    ocupado = true;
    try {
      fontes.forEach(function (mod) {
        var mudou = false;
        registros(mod).forEach(function (x, i) {
          if (normalizar(placa(mod, x)) !== normalizar(p)) return;
          var novo = Object.assign({}, x);
          novo[campo] = esconder;
          if (typeof window.fmPrepararRegistro === 'function') novo = window.fmPrepararRegistro(mod, novo, x) || novo;
          alterados.push({mod: mod, antes: x, depois: novo});
          base()[mod][i] = novo;
          mudou = true;
        });
        if (mudou) mods.push(mod);
      });
      if (!mods.length) return false;
      if (await salvarNuvem(mods) === false) throw new Error('Não salvo');
      return true;
    } catch (err) {
      alterados.forEach(function (item) {
        var itens = registros(item.mod), i = itens.indexOf(item.depois);
        if (i >= 0) itens[i] = item.antes;
      });
      alert('Não foi possível salvar a alteração. Verifique sua conexão e tente novamente.');
      return false;
    } finally { ocupado = false; render(); }
  }
  document.addEventListener('click', function (ev) {
    var botao = ev.target.closest && ev.target.closest('[data-resultado-excluir],[data-resultado-restaurar]');
    if (!botao || botao.disabled || ocupado) return;
    var restaurar = botao.hasAttribute('data-resultado-restaurar');
    botao.disabled = true;
    Promise.resolve(alterar(restaurar ? botao.dataset.resultadoRestaurar : botao.dataset.resultadoExcluir, !restaurar)).finally(function () { botao.disabled = false; });
  });
  window.FMResultadoVeiculos = {lista: lista, acoes: acoes, renderOcultos: renderOcultos};
})();
