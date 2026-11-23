/* Executar: node --test tests/multas-cobrar-motorista.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const paginacao = fs.readFileSync(path.join(__dirname, '..', 'paginacao.js'), 'utf8');
function funcao(nome) {
  const inicio = html.indexOf(`function ${nome}(`);
  assert.ok(inicio >= 0, nome);
  const resto = html.slice(inicio);
  const proxima = /\nfunction\s/.exec(resto);
  return proxima ? resto.slice(0, proxima.index) : resto;
}
function ambiente(multas = []) {
  const campos = {};
  for (const id of ['mu_idx', 'muveiculo', 'mumotorista', 'muinfracao', 'muait', 'murenainf',
    'mudata', 'muvenc', 'muvalor', 'mustatus', 'muindicacao', 'mucobrarmotorista', 'muobs', 'muarquivos']) {
    campos[id] = { value: '', tagName: 'INPUT', files: [], dispatchEvent() {} };
  }
  for (const id of ['muindicacao', 'mucobrarmotorista']) {
    const campo = campos[id];
    campo.tagName = 'SELECT';
    campo.options = [{ value: 'Não' }, { value: 'Sim' }];
    Object.defineProperty(campo, 'selectedIndex', { set(i) { this.value = this.options[i].value; } });
    campo.value = 'Não';
  }
  let gravacoes = 0;
  const ctx = {
    document: { getElementById: id => campos[id] || null },
    db: { multas }, ID_MAP_INDEX: { multas: 'mu_idx' },
    fmPrepararRegistro: (mod, obj) => obj,
    salvarNuvem() { gravacoes++; }, scrollTo() {},
    Event: class {}, alert() {}, console
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const nome of ['limparForm', 'fmPreencherCampoEdicao', 'editar', 'salvarMulta', 'salvarRegistroMulta']) {
    vm.runInContext(funcao(nome), ctx);
  }
  return { ctx, campos, gravacoes: () => gravacoes };
}
test('scripts e blocos inline mantêm sintaxe válida', () => {
  new vm.Script(paginacao);
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[1].trim()) new vm.Script(m[1]);
  }
});
test('salva Sim e Não na própria multa pelo gravador existente e limpa o campo', () => {
  for (const escolha of ['Sim', 'Não']) {
    const a = ambiente();
    a.campos.mucobrarmotorista.value = escolha;
    a.campos.muvalor.value = '100,00';
    a.ctx.salvarMulta();
    assert.equal(a.ctx.db.multas.length, 1);
    assert.equal(a.ctx.db.multas[0].mucobrarmotorista, escolha);
    assert.equal(a.ctx.db.multas[0].muvalor, '100,00');
    assert.equal(a.campos.mucobrarmotorista.value, 'Não');
    assert.equal(a.gravacoes(), 1);
    assert.deepEqual(Object.keys(a.ctx.db), ['multas']);
  }
});
test('edição permite alterar a escolha sem duplicar a multa ou perder anexos', () => {
  const a = ambiente([{ muvalor: '90,00', mucobrarmotorista: 'Sim', arquivos: [{ nome: 'auto.pdf' }] }]);
  a.ctx.editar('multas', 0);
  assert.equal(a.campos.mucobrarmotorista.value, 'Sim');
  a.campos.mucobrarmotorista.value = 'Não';
  a.ctx.salvarMulta();
  assert.equal(a.ctx.db.multas.length, 1);
  assert.equal(a.ctx.db.multas[0].mucobrarmotorista, 'Não');
  assert.equal(a.ctx.db.multas[0].arquivos[0].nome, 'auto.pdf');
});
test('multa antiga abre como Não sem herdar Sim da edição anterior nem alterar o registro', () => {
  const a = ambiente([{ mucobrarmotorista: 'Sim' }, { muobs: 'Antiga' }]);
  a.ctx.editar('multas', 0);
  a.ctx.editar('multas', 1);
  assert.equal(a.campos.mucobrarmotorista.value, 'Não');
  assert.equal(Object.hasOwn(a.ctx.db.multas[1], 'mucobrarmotorista'), false);
});
test('cancelar restaura Não e o campo aparece ao lado de Indicação no formulário e na lista', () => {
  const a = ambiente();
  const cancelar = html.match(/id="btn_cancel_multas"[^>]*onclick="([^"]+)"/)[1];
  a.campos.mucobrarmotorista.value = 'Sim';
  vm.runInContext(cancelar, a.ctx);
  assert.equal(a.campos.mucobrarmotorista.value, 'Não');
  assert.match(html, /id="muindicacao"[\s\S]*?<\/select>\s*<\/div>\s*<div class="col-md-3">\s*<select id="mucobrarmotorista"/);
  assert.match(html, /<th class="multas-col-sim-nao">Indicação<\/th>\s*<th class="multas-col-sim-nao">Cobrar Motorista<\/th>/);
  assert.match(html, /<div class="table-responsive multas-tablewrap">\s*<table class="table multas-table">/);
  assert.match(paginacao, /<td class="multas-col-sim-nao">\s*<span class="badge \$\{mu\.mucobrarmotorista/);
  assert.match(paginacao, /<td class="multas-col-obs">\$\{mu\.muobs/);
  assert.match(paginacao, /mu\.mucobrarmotorista === 'Sim' \? 'Sim' : 'Não'/);
});

function campoMotorista(a, id = 'mumotorista') {
  const select = {
    id, tagName: 'SELECT', type: 'select-one',
    options: [{ value: '', textContent: 'Motorista...', dataset: {} },
      { value: 'João Cadastrado', textContent: 'João Cadastrado', dataset: {} }],
    appendChild(opcao) { this.options.push(opcao); }, dispatchEvent() {}
  };
  let valor = '';
  Object.defineProperty(select, 'value', {
    get() { return valor; },
    set(v) { valor = this.options.some(o => o.value === String(v)) ? String(v) : ''; }
  });
  Object.defineProperty(select, 'selectedIndex', {
    get() { return this.options.findIndex(o => o.value === valor); },
    set(i) { valor = this.options[i]?.value || ''; }
  });
  a.campos[id] = select;
  a.ctx.document.createElement = () => ({ value: '', textContent: '', dataset: {} });
  const busca = fs.readFileSync(path.join(__dirname, '..', 'campos-busca.js'), 'utf8');
  new vm.Script(busca);
  vm.runInContext(busca.replace('  window.fmAtualizarBuscasCadastro = prepararTodos;',
    '  window.testNomeLivre = { selecionarCorrespondencia, opcoesValidas, atualizarSugestoes }; return;'), a.ctx);
  return select;
}

test('nome livre fica só na multa e pode ser editado sem perder anexos', () => {
  const a = ambiente();
  const select = campoMotorista(a);
  a.ctx.db.motoristas = [{ motNome: 'João Cadastrado' }];
  const input = { value: '  José Avulso  ' };
  assert.equal(a.ctx.testNomeLivre.selecionarCorrespondencia(select, input, false), true);
  assert.equal(select.value, 'José Avulso');
  assert.equal(a.ctx.testNomeLivre.opcoesValidas(select).length, 1);
  a.ctx.salvarMulta();
  assert.equal(a.ctx.db.multas[0].mumotorista, 'José Avulso');
  assert.equal(select.value, '');
  // Simula uma nova abertura, sem nenhuma opção temporária anterior.
  select.options = select.options.filter(o => !o.dataset.fmNomeLivre);
  a.ctx.db.multas[0].arquivos = [{ nome: 'auto.pdf' }];
  a.ctx.editar('multas', 0);
  assert.equal(select.value, 'José Avulso');
  assert.equal(select.options.at(-1).textContent, 'José Avulso');
  input.value = 'Maria Avulsa';
  a.ctx.testNomeLivre.selecionarCorrespondencia(select, input, false);
  a.ctx.salvarMulta();
  assert.equal(a.ctx.db.multas.length, 1);
  assert.equal(a.ctx.db.multas[0].mumotorista, 'Maria Avulsa');
  assert.equal(a.ctx.db.multas[0].arquivos[0].nome, 'auto.pdf');
  assert.deepEqual(a.ctx.db.motoristas, [{ motNome: 'João Cadastrado' }]);
});

test('preserva seleção cadastrada e restringe nomes livres ao formulário de Multas', () => {
  const a = ambiente();
  const select = campoMotorista(a);
  a.ctx.testNomeLivre.selecionarCorrespondencia(select, { value: 'joao cadastrado' }, false);
  assert.equal(select.value, 'João Cadastrado');
  a.ctx.testNomeLivre.selecionarCorrespondencia(select, { value: 'Avulso' }, false);
  select.options = select.options.filter(o => !o.dataset.fmNomeLivre);
  select.value = '';
  a.ctx.testNomeLivre.atualizarSugestoes(select, { value: 'Avulso' }, { hidden: true });
  assert.equal(select.value, 'Avulso');
  a.ctx.testNomeLivre.selecionarCorrespondencia(select, { value: '' }, false);
  assert.equal(select.value, '');
  select.id = 'agmotorista';
  assert.equal(a.ctx.testNomeLivre.selecionarCorrespondencia(select, { value: 'Outro avulso' }, false), false);
  assert.equal(select.value, '');
});
