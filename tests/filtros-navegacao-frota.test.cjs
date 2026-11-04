/* Executar: node --test tests/filtros-navegacao-frota.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
const custos = ler('custos-frota.js');
const resultado = ler('resultado-frota.js');
const filtros = ler('filtros-por-aba.js');
function funcao(fonte, nome) {
  const linha = fonte.split('\n').find(x => x.trim().startsWith('function ' + nome + '('));
  assert.ok(linha, nome);
  return linha;
}
function ambiente(ativa = 'resultado') {
  const campos = Object.fromEntries(['Veiculo', 'Tipo', 'Categoria', 'Origem', 'Status', 'Inicio', 'Fim'].map(x => ['cusFiltro' + x, { value: 'selecionado' }]));
  const abas = ['resultado', 'relatoriomensal', 'lancamentos', 'quilometragem'].map(nome => ({
    dataset: { tab: nome }, active: nome === ativa,
    classList: { toggle(classe, valor) { if (classe === 'active') this.dono.active = valor; } }
  }));
  abas.forEach(x => { x.classList.dono = x; });
  const panes = abas.map(x => ({ id: 'cusPane-' + x.dataset.tab, classList: { toggle() {} } }));
  const eventos = [];
  const ctx = {
    estado: { tab: 'lancamentos', paginaLancamentos: 4, paginaImplementos: 3, paginaTerceirizacao: 2 },
    document: {
      getElementById: id => campos[id] || null,
      querySelector: () => abas.find(x => x.active),
      querySelectorAll: seletor => seletor === '.cus-tab' ? abas : panes,
      dispatchEvent: ev => eventos.push(ev.type)
    },
    Event: function(type) { this.type = type; },
    mesInicio: () => '2026-11-01', mesFim: () => '2026-11-30',
    render() {}, renderTudo() {}, sincronizarKmVeiculo() {},
    reiniciarPaginasResultadoFrota() {}, renderResultadoFrota() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    funcao(custos, 'abaAtiva'), funcao(custos, 'reiniciarPaginasFiltros'),
    funcao(custos, 'limparFiltros'), funcao(custos, 'trocarAba'), funcao(resultado, 'trocar')
  ].join('\n'), ctx);
  ctx.limparFiltrosCustos = ctx.limparFiltros;
  return { ctx, campos, eventos };
}
test('scripts alterados mantêm sintaxe JavaScript válida', () => {
  for (const nome of ['custos-frota.js', 'resultado-frota.js', 'filtros-por-aba.js', 'periodo-marcado.js', 'resumo-filtros-frota.js']) new vm.Script(ler(nome));
});
test('troca entre abas dos dois grupos limpa filtros e todas as páginas', () => {
  const { ctx, campos, eventos } = ambiente();
  ctx.trocarAba('lancamentos');
  for (const chave of ['Veiculo', 'Tipo', 'Categoria', 'Origem', 'Status']) assert.equal(campos['cusFiltro' + chave].value, '');
  assert.equal(campos.cusFiltroInicio.value, '2026-11-01');
  assert.equal(campos.cusFiltroFim.value, '2026-11-30');
  assert.equal(ctx.estado.paginaImplementos, 1);
  assert.equal(ctx.estado.paginaTerceirizacao, 1);
  assert.deepEqual(eventos, ['frota:filtros-limpos']);
  campos.cusFiltroVeiculo.value = 'ABC1234';
  ctx.trocar('relatoriomensal');
  assert.equal(campos.cusFiltroVeiculo.value, '');
  campos.cusFiltroTipo.value = 'fixo';
  ctx.trocarAba('lancamentos');
  assert.equal(campos.cusFiltroTipo.value, '');
});
test('selecionar a mesma aba mantém o filtro da consulta atual', () => {
  const { ctx, campos, eventos } = ambiente('lancamentos');
  ctx.trocarAba('lancamentos');
  assert.equal(campos.cusFiltroVeiculo.value, 'selecionado');
  assert.equal(eventos.length, 0);
});
test('saída e retorno do módulo limpam sem recuperar a memória antiga', () => {
  let oculta = false, limpezas = 0, removida;
  const observadores = [];
  const root = { classList: { contains: () => oculta }, querySelector: () => null };
  const ctx = {
    sessionStorage: { removeItem: chave => { removida = chave; } },
    document: { readyState: 'complete', getElementById: () => root, querySelector: () => null, addEventListener() {} },
    MutationObserver: function(callback) { this.observe = () => observadores.push(callback); },
    limparFiltrosCustos: () => { limpezas++; }
  };
  ctx.window = ctx;
  vm.runInNewContext(filtros.split('/* Cartão')[0], ctx);
  assert.equal(removida, 'fm_filtros_por_aba');
  oculta = true;
  observadores[0]([{ oldValue: 'cus-page' }]);
  oculta = false;
  observadores[0]([{ oldValue: 'hidden cus-page' }]);
  assert.equal(limpezas, 2);
  observadores[0]([{ oldValue: 'cus-page' }]);
  assert.equal(limpezas, 2);
});
test('filtros e organização das abas estabilizam sem ciclo de observadores na entrada', () => {
  const observadores = [], pendentes = new Map(), elementos = new Map();
  let escritasTexto = 0, escritasClasse = 0;
  const body = {}, tabs = {};
  function emitir(target, type) {
    for (const obs of observadores) {
      const cfg = obs.config;
      const dentro = obs.target === target || cfg.subtree && (
        obs.target === body || obs.target === tabs && target === tab
      );
      if (!dentro || !cfg[type === 'attributes' ? 'attributes' : 'childList']) continue;
      if (type === 'attributes' && cfg.attributeFilter && !cfg.attributeFilter.includes('class')) continue;
      if (!pendentes.has(obs)) pendentes.set(obs, []);
      pendentes.get(obs).push({ target, type, attributeName: type === 'attributes' ? 'class' : null });
    }
  }
  const classes = new Set(['cus-tab', 'active']);
  const tab = {
    dataset: { tab: 'lancamentos' }, textContent: 'Lançamentos', title: '',
    classList: {
      contains: classe => classes.has(classe),
      // DOMTokenList.add notifica o atributo mesmo quando a classe já existe.
      add(classe) { classes.add(classe); escritasClasse++; emitir(tab, 'attributes'); }
    }
  };
  const root = {
    classList: { contains: () => false },
    querySelector: seletor => seletor === '.cus-tabs' ? tabs : null
  };
  const filtro = {
    firstChild: null,
    insertBefore(el) { elementos.set(el.id, el); emitir(filtro, 'childList'); }
  };
  const ctx = {
    sessionStorage: { removeItem() {} }, localStorage: { getItem: () => null },
    document: {
      readyState: 'complete', body, addEventListener() {},
      getElementById: id => id === 'custos' ? root : elementos.get(id) || null,
      querySelector: seletor => ({
        '#custos .cus-tab.active': tab, '#custos .cus-filter': filtro,
        '#custos .cus-tabs': tabs
      })[seletor] || null,
      querySelectorAll: seletor => seletor === '#custos .cus-tabs > .cus-tab[data-tab]' ? [tab] : [],
      createElement() {
        let texto = '';
        return {
          style: {}, get textContent() { return texto; },
          set textContent(valor) { texto = valor; escritasTexto++; emitir(this, 'childList'); }
        };
      }
    },
    MutationObserver: function(callback) {
      this.callback = callback;
      this.observe = (target, config) => { this.target = target; this.config = config; observadores.push(this); };
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(filtros.split('/* Cartão')[0], ctx);
  vm.runInContext(ler('organizacao-campos.js'), ctx);
  function estabilizar() {
    for (let rodada = 0; pendentes.size && rodada < 20; rodada++) {
      const lote = [...pendentes]; pendentes.clear();
      for (const [obs, registros] of lote) obs.callback(registros);
    }
    assert.equal(pendentes.size, 0, 'Observadores devem parar de gerar mutações repetidas');
  }
  estabilizar();
  assert.equal(escritasTexto, 1);
  assert.equal(escritasClasse, 1);
  // Uma atualização de tabela não deve reescrever as classes das abas.
  emitir(body, 'childList');
  estabilizar();
  assert.equal(escritasTexto, 1);
  assert.equal(escritasClasse, 1);
  // A mudança real de aba ainda deve atualizar o rótulo.
  tab.textContent = 'Quilometragem';
  emitir(tab, 'attributes');
  estabilizar();
  assert.equal(elementos.get('fmFiltroAbaRotulo').textContent, 'Filtros da aba: Quilometragem');
  assert.equal(escritasTexto, 2);
  assert.equal(escritasClasse, 1);
});
