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
      id, value:'', innerHTML:'', textContent:'', options:[], tagName:'INPUT',
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
    acao(dataset) { return eventos['diPlantaoConteudo:click']({target:{closest:() => ({dataset})}}); },
    mudarStatus(id, value) { return eventos['diPlantaoConteudo:change']({target:{dataset:{paStatus:id}, value}}); },
    mudarCampo(campo, value) {
      const target = elementos['pa_' + campo]; target.value = value;
      return eventos['diPlantaoConteudo:change']({target});
    },
    formatarValor() { return eventos['pa_valor:blur'](); }
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

test('formata moeda brasileira ao sair do campo, salva centavos e mantém formato na edição', async () => {
  const a = ambiente();
  a.elementos.pa_valor.value = '1234,56';
  a.formatarValor();
  assert.equal(a.elementos.pa_valor.value.replace(/\s/g, ' '), 'R$ 1.234,56');
  await a.salvar();
  assert.equal(a.contexto.db.plantoes[0].valorCentavos, 123456);
  await a.acao({pa:'editar', id:a.contexto.db.plantoes[0]._rid});
  assert.equal(a.elementos.pa_valor.value.replace(/\s/g, ' '), 'R$ 1.234,56');
  await a.salvar();
  assert.equal(a.contexto.db.plantoes.length, 1);
  assert.equal(a.contexto.db.plantoes[0].valorCentavos, 123456);
});

test('formatação preserva valor opcional vazio e não disfarça entradas inválidas', () => {
  const a = ambiente();
  for (const valor of ['', 'abc', '-1', '1,234']) {
    a.elementos.pa_valor.value = valor;
    a.formatarValor();
    assert.equal(a.elementos.pa_valor.value, valor);
  }
  a.elementos.pa_valor.value = '0';
  a.formatarValor();
  assert.equal(a.elementos.pa_valor.value.replace(/\s/g, ' '), 'R$ 0,00');
});

test('situação usa vermelho, azul e verde no formulário, filtro e lista', async () => {
  const a = ambiente();
  for (const [status, cor] of [['Pendente', 'critico'], ['Enviadas RH', 'info'], ['Pago', 'ok']]) {
    a.mudarCampo('status', status);
    assert.ok(a.elementos.pa_status.className.includes('fm-status-cor-' + cor));
    a.mudarCampo('fStatus', status);
    assert.ok(a.elementos.pa_fStatus.className.includes('fm-status-cor-' + cor));
  }
  a.mudarCampo('fStatus', '');
  await a.salvar();
  assert.match(a.elementos.pa_lista.innerHTML, /fm-status-plantao fm-status-cor-ok/);
  assert.match(a.elementos.pa_lista.innerHTML, /data-pa-status="novo-1"/);
  assert.match(a.elementos.pa_lista.innerHTML, /value="Pago" selected/);
});

test('altera situação diretamente, preserva campos e identidade e atualiza totais', async () => {
  const a = ambiente();
  a.elementos.pa_valor.value = '1234,56';
  await a.salvar();
  const antes = {...a.contexto.db.plantoes[0]};
  await a.mudarStatus(antes._rid, 'Enviadas RH');
  assert.equal(JSON.stringify(a.contexto.db.plantoes[0]), JSON.stringify({...antes, status:'Enviadas RH'}));
  assert.equal(a.preparar[1].anterior._rid, antes._rid);
  assert.deepEqual(a.envios, [['plantoes'], ['plantoes']]);
  assert.match(a.elementos.pa_aviso.textContent, /Situação atualizada e confirmada/);
  assert.match(a.elementos.pa_lista.innerHTML, /fm-status-cor-info/);
  assert.match(a.elementos.pa_totais.innerHTML.replace(/\s/g, ' '), /Enviadas RH<\/h6><h4>R\$ 1\.234,56/);
  await a.mudarStatus(antes._rid, 'Pago');
  assert.match(a.elementos.pa_lista.innerHTML, /fm-status-cor-ok/);
  assert.match(a.elementos.pa_totais.innerHTML.replace(/\s/g, ' '), /Pago<\/h6><h4>R\$ 1\.234,56/);
});

test('troca de situação respeita filtro ativo e não descarta edição em andamento', async () => {
  const a = ambiente();
  await a.salvar();
  const id = a.contexto.db.plantoes[0]._rid;
  await a.acao({pa:'editar', id});
  a.elementos.pa_obs.value = 'Rascunho não salvo';
  a.mudarCampo('fStatus', 'Pendente');
  await a.mudarStatus(id, 'Pago');
  assert.equal(a.elementos.pa_status.value, 'Pago');
  assert.equal(a.elementos.pa_obs.value, 'Rascunho não salvo');
  assert.equal(a.contexto.db.plantoes[0].obs, '');
  assert.match(a.elementos.pa_lista.innerHTML, /Nenhum lançamento/);
  await a.salvar();
  assert.equal(a.contexto.db.plantoes.length, 1);
  assert.equal(a.contexto.db.plantoes[0].status, 'Pago');
  assert.equal(a.contexto.db.plantoes[0].obs, 'Rascunho não salvo');
});

test('situação bloqueia opção inválida, registro removido, falta de acesso e banco incompleto', async () => {
  const a = ambiente();
  await a.salvar();
  const id = a.contexto.db.plantoes[0]._rid;
  await a.mudarStatus(id, 'Pendente'); // Sem mudança: não grava novamente.
  await a.mudarStatus(id, 'Inválido');
  assert.match(a.elementos.pa_aviso.textContent, /situação válida/);
  await a.mudarStatus('removido', 'Pago');
  assert.match(a.elementos.pa_aviso.textContent, /registro mudou/);
  a.contexto.usuarioLogado = null;
  await a.mudarStatus(id, 'Pago');
  assert.match(a.elementos.pa_aviso.textContent, /permissão/);
  a.contexto.usuarioLogado = {tipo:'operador', permissoes:{diarias:true}};
  a.contexto.fmModuloCarregado = () => false;
  await a.mudarStatus(id, 'Pago');
  assert.match(a.elementos.pa_aviso.textContent, /carregamento/);
  assert.equal(a.contexto.db.plantoes[0].status, 'Pendente');
  assert.equal(a.envios.length, 1);
  a.contexto.fmModuloCarregado = () => true;
  await a.mudarStatus(id, 'Pago');
  assert.equal(a.contexto.db.plantoes[0].status, 'Pago');
  assert.equal(a.envios.length, 2);
});

test('situação sem confirmação permanece na fila, sem anunciar sucesso', async () => {
  const a = ambiente({confirmar:false});
  await a.salvar();
  await a.mudarStatus(a.contexto.db.plantoes[0]._rid, 'Pago');
  assert.equal(a.contexto.db.plantoes[0].status, 'Pago');
  assert.match(a.elementos.pa_aviso.textContent, /Situação mantida na fila de sincronização/);
  assert.doesNotMatch(a.elementos.pa_aviso.textContent, /atualizada e confirmada/);
  assert.equal(a.elementos.pa_salvar.disabled, false);
});

test('situação bloqueia alterações simultâneas e libera controles se o envio falhar', async () => {
  const a = ambiente();
  await a.salvar();
  const id = a.contexto.db.plantoes[0]._rid;
  let rejeitar;
  a.contexto.salvarNuvem = () => new Promise((resolve, reject) => { rejeitar = reject; });
  const pendente = a.mudarStatus(id, 'Enviadas RH');
  assert.equal(a.elementos.pa_salvar.disabled, true);
  assert.equal(a.elementos.pa_status.disabled, true);
  assert.match(a.elementos.pa_lista.innerHTML, /data-pa-status="novo-1"[^>]* disabled/);
  await a.mudarStatus(id, 'Pago');
  assert.equal(a.contexto.db.plantoes[0].status, 'Enviadas RH');
  assert.equal(a.preparar.length, 2);
  rejeitar(new Error('Falha de conexão'));
  await pendente;
  assert.equal(a.elementos.pa_salvar.disabled, false);
  assert.equal(a.elementos.pa_status.disabled, false);
  assert.match(a.elementos.pa_aviso.textContent, /fila de sincronização/);
});
