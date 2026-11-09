const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../diarias-plantao.js'), 'utf8');

function ambiente({nome = 'BRUNO PIRES GOMES', confirmar = true} = {}) {
  const elementos = {};
  const campos = ['motorista', 'data', 'tipo', 'ocasiao', 'inicio', 'fim', 'veiculo', 'valor', 'status', 'obs'];
  const eventos = {};
  const envios = [];
  const preparar = [];
  function elemento(id) {
    return elementos[id] = {
      value:'', innerHTML:'', textContent:'', options:[], tagName:'INPUT',
      addEventListener(tipo, fn) { eventos[id + ':' + tipo] = fn; },
      setAttribute() {}, scrollIntoView() {},
      reset() { campos.forEach(campo => { elementos['pa_' + campo].value = ''; }); }
    };
  }
  ['diPlantaoConteudo', 'diViagemConteudo', 'diAbaViagem', 'diAbaPlantao'].forEach(elemento);
  Object.defineProperty(elementos.diPlantaoConteudo, 'innerHTML', {
    set(html) {
      for (const match of html.matchAll(/id="([^"]+)"/g)) elemento(match[1]);
    }
  });
  const contexto = {
    document:{getElementById:id => elementos[id]},
    db:{motoristas:[{motNome:nome}], veiculos:[], plantoes:[]},
    usuarioLogado:{tipo:'admin'},
    fmModuloCarregado:() => true,
    addEventListener() {},
    fmPrepararRegistro(modulo, registro, anterior) {
      preparar.push({modulo, anterior});
      return {...registro, _rid:anterior ? anterior._rid : 'novo-' + preparar.length};
    },
    async salvarNuvem(modulos) {
      envios.push(Array.from(modulos));
      return confirmar;
    },
    console:{error() {}}
  };
  vm.runInNewContext(script, contexto);
  contexto.FMPlantao.aba('plantao');
  const valores = {motorista:nome, data:'2026-11-07', tipo:'Sobreaviso', ocasiao:'Sábado', inicio:'00:00', fim:'23:59', valor:'', status:'Pendente'};
  Object.entries(valores).forEach(([campo, valor]) => { elementos['pa_' + campo].value = valor; });
  return {
    contexto, elementos, envios, preparar,
    async salvar() { await eventos['pa_form:submit']({preventDefault() {}}); },
    acao(dataset) { return eventos['diPlantaoConteudo:click']({target:{closest:() => ({dataset})}}); }
  };
}

test('salva motorista selecionado sem valor e confirma apenas a coleção de plantões', async () => {
  const a = ambiente();
  await a.salvar();
  assert.equal(a.contexto.db.plantoes.length, 1);
  assert.equal(a.contexto.db.plantoes[0].valorCentavos, 0);
  assert.equal(a.contexto.db.plantoes[0].motorista, 'BRUNO PIRES GOMES');
  assert.deepEqual(a.envios, [['plantoes']]);
  assert.match(a.elementos.pa_aviso.textContent, /salvo e confirmado/);
  assert.equal(a.elementos.pa_salvar.disabled, false);
});

test('resolve espaços e maiúsculas sem perder o nome original do cadastro', async () => {
  const nome = ' BRUNO  PIRES GOMES ';
  const a = ambiente({nome});
  a.elementos.pa_motorista.value = 'bruno pires gomes';
  a.elementos.pa_valor.value = '1';
  await a.salvar();
  assert.equal(a.contexto.db.plantoes[0].motorista, nome);
  assert.equal(a.contexto.db.plantoes[0].valorCentavos, 100);
  assert.equal(a.envios.length, 1);
});

test('motorista ausente ou não cadastrado não gera registro nem envio', async () => {
  for (const nome of ['', 'Pessoa não cadastrada']) {
    const a = ambiente();
    a.elementos.pa_motorista.value = nome;
    await a.salvar();
    assert.equal(a.contexto.db.plantoes.length, 0);
    assert.equal(a.envios.length, 0);
    assert.match(a.elementos.pa_aviso.textContent, /motorista cadastrado/);
  }
});

test('valor é opcional, mas texto inválido e valor negativo continuam bloqueados', async () => {
  for (const valor of ['abc', '-1', '1,234']) {
    const a = ambiente();
    a.elementos.pa_valor.value = valor;
    await a.salvar();
    assert.equal(a.contexto.db.plantoes.length, 0);
    assert.equal(a.envios.length, 0);
    assert.match(a.elementos.pa_aviso.textContent, /valor válido/);
  }
});

test('edição sem valor mantém a identidade e não cria outro lançamento', async () => {
  const a = ambiente();
  await a.salvar();
  const id = a.contexto.db.plantoes[0]._rid;
  await a.acao({pa:'editar', id});
  a.elementos.pa_valor.value = '';
  a.elementos.pa_obs.value = 'Valor a definir pelo RH';
  await a.salvar();
  assert.equal(a.contexto.db.plantoes.length, 1);
  assert.equal(a.contexto.db.plantoes[0]._rid, id);
  assert.equal(a.contexto.db.plantoes[0].valorCentavos, 0);
  assert.equal(a.contexto.db.plantoes[0].obs, 'Valor a definir pelo RH');
  assert.equal(a.envios.length, 2);
});

test('duplicidade continua bloqueada com diferenças de espaços no nome', async () => {
  const a = ambiente();
  a.contexto.db.plantoes.push({
    _rid:'existente', motorista:' BRUNO  PIRES GOMES ', data:'2026-11-07',
    tipo:'Sobreaviso', ocasiao:'Sábado', inicio:'00:00', fim:'23:59',
    valorCentavos:0, status:'Pendente'
  });
  await a.salvar();
  assert.equal(a.contexto.db.plantoes.length, 1);
  assert.equal(a.envios.length, 0);
  assert.match(a.elementos.pa_aviso.textContent, /Já existe/);
});

test('sem confirmação do banco informa pendência, não sucesso', async () => {
  const a = ambiente({confirmar:false});
  await a.salvar();
  assert.equal(a.contexto.db.plantoes.length, 1);
  assert.match(a.elementos.pa_aviso.textContent, /fila de sincronização/);
  assert.doesNotMatch(a.elementos.pa_aviso.textContent, /salvo e confirmado/);
  assert.equal(a.elementos.pa_salvar.disabled, false);
});

test('sem acesso ou com cadastro não carregado mantém formulário sem gravar', async () => {
  const a = ambiente();
  a.contexto.usuarioLogado = null;
  await a.salvar();
  assert.match(a.elementos.pa_aviso.textContent, /permissão/);
  assert.equal(a.contexto.db.plantoes.length, 0);
  assert.equal(a.elementos.pa_motorista.value, 'BRUNO PIRES GOMES');
  a.contexto.usuarioLogado = {tipo:'admin'};
  a.contexto.fmModuloCarregado = () => false;
  await a.salvar();
  assert.match(a.elementos.pa_aviso.textContent, /carregamento/);
  assert.equal(a.envios.length, 0);
});
