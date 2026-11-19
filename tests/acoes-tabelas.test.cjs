/* Executar: node --test tests/acoes-tabelas.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { tipoAcao } = require('../acoes-tabelas.js');
const fonte = fs.readFileSync(require.resolve('../acoes-tabelas.js'), 'utf8');
function botao(texto, attrs = {}, saida = false) {
  const classes = new Set();
  const celula = { classList: { add(c) { classes.add('td:' + c); } } };
  return {
    textContent: texto, children: [], attrs: { ...attrs }, classes,
    classList: { add(...cs) { cs.forEach(c => classes.add(c)); }, contains(c) { return classes.has(c); } },
    getAttribute(k) { return this.attrs[k] || null; },
    hasAttribute(k) { return Object.hasOwn(this.attrs, k); },
    setAttribute(k, v) { this.attrs[k] = v; },
    closest(s) { return s === 'td' ? celula : s === '#saidaVeiculos' && saida ? {} : null; },
    replaceChildren(...children) {
      this.children = children;
      this.textContent = children.map(c => c.textContent || '').join('');
    }
  };
}
test('reconhece ações com texto, ícones e os handlers dos módulos', () => {
  for (const [texto, attrs, esperado] of [
    ['✎', { onclick: "editar('veiculos',0)" }, 'editar'],
    ['✕', { onclick: "deletar('combustivel',0)" }, 'excluir'],
    ['✏️', { title: 'Editar', onclick: 'editarFrete(0)' }, 'editar'],
    ['🗑️', { title: 'Excluir', onclick: 'excluirFrete(0)' }, 'excluir'],
    ['✎ Editar', {}, 'editar'], ['Excluir', {}, 'excluir'],
    ['✎', { onclick: 'editarRevisao(0)' }, 'editar'],
    ['✕', { onclick: 'excluirEstoque(0)' }, 'excluir']
  ]) assert.equal(tipoAcao(botao(texto, attrs)), esperado);
});
test('não confunde outros botões que usam as classes antigas', () => {
  for (const [texto, attrs] of [
    ['🛣 KM', { title: 'Atualizar quilometragem', onclick: 'atualizarKmVeiculo(0)' }],
    ['◷', { title: 'Ver histórico de KM', onclick: 'abrirHistoricoKmVeiculo(0)' }],
    ['Transferir', { onclick: 'transferirImplementoFrota(0)' }],
    ['Preencher', {}], ['↻ Atualizar KM', {}], ['✎ Lançar fechamento', {}],
    ['👁️', { title: 'Visualizar', onclick: 'verFrete(0)' }]
  ]) assert.equal(tipoAcao(botao(texto, attrs)), '');
});
function ambiente(botoes) {
  let observar;
  const criar = () => ({
    children: [], setAttribute() {}, appendChild(c) { this.children.push(c); }
  });
  const body = { nodeType: 1, matches() { return false; }, querySelectorAll() { return botoes; } };
  vm.runInNewContext(fonte, {
    document: { body, readyState: 'complete', createElement: criar, createElementNS: criar },
    MutationObserver: class { constructor(fn) { observar = fn; } observe() {} }
  });
  return { observar };
}
test('adiciona texto e ícone sem substituir handlers, atributos ou estado', () => {
  const b = botao('✎', { onclick: "editar('motoristas',3)", title: 'Editar motorista' });
  b.onclick = () => 'original';
  b.disabled = true;
  const handler = b.onclick;
  ambiente([b]);
  assert.equal(b.textContent, 'Editar');
  assert.equal(b.children.length, 2);
  assert.equal(b.attrs.onclick, "editar('motoristas',3)");
  assert.equal(b.attrs.title, 'Editar motorista');
  assert.equal(b.onclick, handler);
  assert.equal(b.disabled, true);
  assert.ok(b.classes.has('fm-acao-editar'));
  assert.ok(b.classes.has('td:fm-acoes-celula'));
});
test('Saída de Veículos permanece intocada, inclusive texto e atributos', () => {
  const b = botao('✎', { onclick: 'editarSaidaVeiculo(0)', title: 'Editar saída' }, true);
  const antes = { ...b.attrs };
  ambiente([b]);
  assert.equal(b.textContent, '✎');
  assert.equal(b.children.length, 0);
  assert.equal(b.classes.size, 0);
  assert.deepEqual(b.attrs, antes);
});
test('padroniza novas linhas paginadas e não repete ícones', () => {
  const b = botao('✕', { onclick: 'excluirFrete(0)' });
  const { observar } = ambiente([]);
  const no = {
    nodeType: 1, closest() { return null; }, matches() { return false; },
    querySelectorAll() { return [b]; }
  };
  observar([{ addedNodes: [no] }]);
  const icone = b.children[0];
  observar([{ addedNodes: [no] }]);
  assert.equal(b.textContent, 'Excluir');
  assert.equal(b.children.length, 2);
  assert.equal(b.children[0], icone);
});
