/* Executar: node --test tests/relatorios-edicao-ui.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');

function ambienteBusca(id = 'cveiculo', indice = '0') {
  const elementos = {};
  function elemento() {
    return {
      dataset: {}, classList: { add() {} }, listeners: {}, children: [],
      value: '', hidden: false, innerHTML: '',
      setAttribute() {}, dispatchEvent() {}, querySelector() { return null; },
      appendChild(el) { this.children.push(el); },
      addEventListener(tipo, fn) { this.listeners[tipo] = fn; }
    };
  }
  const select = Object.assign(elemento(), {
    id, value: 'ABC1D23', selectedIndex: 0,
    options: [{ value: 'ABC1D23', textContent: 'ABC1D23', dataset: {} }],
    parentNode: { classList: { add() {} }, insertBefore(el) { elementos[el.id] = el; } }
  });
  elementos[id] = select;
  elementos.c_idx = { value: indice };
  elementos.le_idx = { value: indice };
  const ctx = {
    document: {
      createElement: elemento, querySelector() { return null; },
      querySelectorAll() { return []; }, getElementById: id => elementos[id] || null
    },
    MutationObserver: class { observe() {} }, Event: class {},
    setTimeout() {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('campos-busca.js').replace(
    '  window.fmAtualizarBuscasCadastro = prepararTodos;',
    '  window.prepararTeste = prepararCampo; return;'
  ), ctx);
  ctx.prepararTeste(select, 'veículo');
  return { select, input: elementos[id + '-busca'], lista: elementos['fm-lista-' + id] };
}

test('edição de combustível mantém a placa preenchida e não abre lista ao focar', () => {
  const a = ambienteBusca();
  a.input.listeners.focus();
  assert.equal(a.lista.hidden, true);
  assert.equal(a.input.value, 'ABC1D23');
  assert.equal(a.select.value, 'ABC1D23');
  a.input.listeners.click();
  assert.equal(a.lista.hidden, false);
});

test('novo lançamento e clique/teclado continuam permitindo buscar veículos', () => {
  const a = ambienteBusca('cveiculo', '');
  a.input.listeners.focus();
  assert.equal(a.lista.hidden, false);
  a.input.dataset.fmBuscaFocoSilencioso = '1';
  a.input.listeners.focus();
  assert.equal(a.lista.hidden, true);
  delete a.input.dataset.fmBuscaFocoSilencioso;
  a.input.listeners.input();
  assert.equal(a.lista.hidden, false);
});

test('mantém a proteção de edição de licenças e o foco normal dos outros campos', () => {
  const licenca = ambienteBusca('leveiculo');
  licenca.input.listeners.focus();
  assert.equal(licenca.lista.hidden, true);
  const outro = ambienteBusca('muveiculo');
  outro.input.listeners.focus();
  assert.equal(outro.lista.hidden, false);
});

test('os quatro botões têm ícones consistentes e preservam a ação de clique', () => {
  const ctx = {
    document: {
      createElement() {
        return {
          children: [], listeners: {},
          appendChild(el) { this.children.push(el); },
          addEventListener(tipo, fn) { this.listeners[tipo] = fn; }
        };
      }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('relatorios-universal.js').replace(
    '  function montarBarra(tabela) {',
    '  window.botaoTeste = botao; return; function montarBarra(tabela) {'
  ), ctx);
  for (const [rotulo, classe] of [['Excel', 'rel-excel'], ['PDF', 'rel-pdf'],
    ['Imprimir', 'rel-print'], ['Baixar tudo', 'rel-all']]) {
    let cliques = 0;
    const botao = ctx.botaoTeste(rotulo, classe, () => cliques++);
    assert.equal(botao.type, 'button');
    assert.equal(botao.className, 'rel-btn ' + classe);
    assert.match(botao.innerHTML, /<svg class="rel-icon"/);
    assert.equal(botao.children[0].textContent, rotulo);
    botao.listeners.click();
    assert.equal(cliques, 1);
  }
});

test('Editar rola até o formulário com foco silencioso e sem alterar o valor', () => {
  let capturar, rolagens = 0, focos = 0;
  const input = {
    type: 'search', value: '', dataset: {}, offsetParent: {},
    closest(seletor) {
      return seletor === 'table' ? null : { scrollIntoView() { rolagens++; } };
    },
    focus() {
      assert.equal(this.dataset.fmBuscaFocoSilencioso, '1');
      focos++;
    }
  };
  const fila = [];
  const ctx = {
    document: {
      addEventListener(tipo, fn) { capturar = fn; },
      querySelectorAll() { return [input]; }
    },
    setTimeout(fn) { fila.push(fn); }
  };
  vm.createContext(ctx);
  vm.runInContext(ler('editar-rolar.js'), ctx);
  const btn = {
    textContent: 'Editar',
    getAttribute(nome) { return nome === 'onclick' ? "editar('combustivel',0)" : ''; },
    closest(seletor) { return seletor === '#combustivel' ? {} : null; }
  };
  capturar({ target: { closest() { return btn; } } });
  input.value = 'ABC1D23';
  fila.shift()();
  assert.equal(rolagens, 1);
  assert.equal(focos, 1);
  assert.equal(input.value, 'ABC1D23');
  assert.equal(input.dataset.fmBuscaFocoSilencioso, undefined);
});

test('scripts alterados e scripts inline mantêm sintaxe válida', () => {
  for (const nome of ['campos-busca.js', 'editar-rolar.js', 'relatorios-universal.js']) {
    new vm.Script(ler(nome), { filename: nome });
  }
  for (const bloco of ler('index.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (bloco[1].trim()) new vm.Script(bloco[1]);
  }
});
