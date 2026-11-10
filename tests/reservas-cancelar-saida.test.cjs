/* Executar: node --test tests/reservas-cancelar-saida.test.cjs tests/reservas-pedidos.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../reservas-regras.js');
const { montarEventos } = require('../reservas-calendario.js');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
const copiar = valor => JSON.parse(JSON.stringify(valor));
const saida = extra => Object.assign({svnumeroreserva:'12', svveiculo:'ABC1234', svreserva:'Reservado',
  svstatus:'Em Viagem', svdataSaida:'2099-08-20', svhoraSaida:'08:00', svdataChegada:'2099-08-20',
  svhoraChegada:'18:00', svmotorista:'Ana', svdestino:'Centro', svobs:'Documento original'}, extra);
const reserva = extra => Object.assign({id:'r1', uid:'u1', numeroReserva:'12', placa:'ABC-1234', status:'Aprovada',
  dataSaida:'2099-08-20', horaSaida:'08:00', dataChegada:'2099-08-20', horaChegada:'18:00', destino:'Centro'}, extra);

function ambiente(opcoes = {}) {
  const remotos = {'frota/saidaVeiculos':{dados:[saida()]}, 'reservasVeiculos/r1':reserva(),
    'reservasVeiculos/outra':reserva({id:'outra', numeroReserva:'99', placa:'XYZ1234'})};
  if (opcoes.remotos) Object.assign(remotos, copiar(opcoes.remotos));
  const alertas = [], escritas = [], ids = ['sv_idx','svreserva','svnumeroreserva','svveiculo','svmotorista',
    'svdestino','svdataSaida','svhoraSaida','svdataChegada','svhoraChegada','svstatus','svobs'];
  const elementos = Object.fromEntries(ids.map(id => [id,{value:'rascunho do formulário',tagName:'INPUT'}]));
  function ref(chave) { return {chave, id:chave.split('/')[1]}; }
  function doc(r) { return {id:r.id, ref:r, exists:!!remotos[r.chave], data:()=>copiar(remotos[r.chave])}; }
  let preparacoes = 0, transacoes = 0;
  const contexto = {
    ocupado:false, admin:()=>opcoes.admin !== false, regras:()=>R, auth:{currentUser:{uid:'admin'}},
    navigator:{onLine:opcoes.online !== false}, nomeUsuarioAtual:()=> 'Administrador Ana',
    db:{saidaVeiculos:[Object.assign({}, copiar(remotos['frota/saidaVeiculos'].dados[0]), opcoes.local)]},
    document:{getElementById:id=>elementos[id]}, alert:m=>alertas.push(m),
    prompt:()=>opcoes.motivo === undefined ? 'Viagem desmarcada' : opcoes.motivo,
    confirm:()=>opcoes.confirmar !== false, renderModulo:()=>{},
    salvarSaidaVeiculo(config) {
      preparacoes++;
      assert.equal(config.reservaTransacao, true);
      if (opcoes.invalido) return false;
      const idx = Number(elementos.sv_idx.value);
      contexto.db.saidaVeiculos[idx] = Object.assign({}, contexto.db.saidaVeiculos[idx],
        {svstatus:elementos.svstatus.value, svreserva:'Liberado'});
      return contexto.db.saidaVeiculos[idx];
    },
    dbCloud:{
      collection:colecao=>({doc:id=>ref(colecao+'/'+id), get:async()=>({forEach:fn=>{
        Object.keys(remotos).filter(k=>k.startsWith(colecao+'/')).forEach(k=>fn(doc(ref(k))));
      }})}),
      runTransaction:async callback=>{
        transacoes++;
        if (opcoes.antesTransacao) opcoes.antesTransacao(remotos);
        const pendentes = [];
        await callback({get:async r=>doc(r), set:(r,d)=>pendentes.push([r.chave,copiar(d)]),
          update:(r,d)=>pendentes.push([r.chave,Object.assign({},remotos[r.chave],copiar(d))])});
        if (opcoes.falhar) throw new Error('Falha de conexão');
        pendentes.forEach(([k,d])=>{ remotos[k]=d; escritas.push(k); });
      }
    }
  };
  const fonte = ler('reservas-pedidos.js');
  vm.createContext(contexto);
  vm.runInContext(fonte.slice(fonte.indexOf('function prepararSaida('),fonte.indexOf('async function decidir(')) +
    fonte.slice(fonte.indexOf('function mesmaReserva('),fonte.indexOf('  document.addEventListener("click"')), contexto);
  const botao = {dataset:{cancelarSaida:'0'},textContent:'Cancelar',disabled:false};
  return {contexto, remotos, alertas, escritas, elementos, botao, cancelar:()=>contexto.cancelarSaida(botao),
    get preparacoes(){return preparacoes;}, get transacoes(){return transacoes;}};
}

test('cancelamento confirma saída e reserva juntas sem apagar histórico ou formulário', async () => {
  const a = ambiente({local:{_rid:'temporario-do-aparelho'}});
  const local = a.contexto.db.saidaVeiculos;
  await a.cancelar();
  assert.equal(a.preparacoes,1);
  assert.deepEqual(a.escritas,['frota/saidaVeiculos','reservasVeiculos/r1']);
  const s = a.remotos['frota/saidaVeiculos'].dados[0], r = a.remotos['reservasVeiculos/r1'];
  assert.equal(s.svstatus,'Cancelado'); assert.equal(s.svreserva,'Liberado');
  assert.equal(r.status,'Cancelada'); assert.equal(r.canceladaApos,'Aprovada');
  assert.equal(r.motivoCancelamento,'Viagem desmarcada');
  assert.equal(r.canceladoEm,s.canceladoEm); assert.equal(r.canceladoPor,'Administrador Ana');
  assert.match(s.svobs,/Documento original/); assert.match(s.svobs,/Viagem desmarcada/);
  assert.equal(a.remotos['reservasVeiculos/outra'].status,'Aprovada');
  assert.equal(a.contexto.db.saidaVeiculos,local);
  Object.values(a.elementos).forEach(el=>assert.equal(el.value,'rascunho do formulário'));
  assert.match(a.alertas.at(-1),/confirmado no banco/);
  assert.equal(a.botao.disabled,false); assert.equal(a.botao.textContent,'Cancelar');
});

test('viagem iniciada durante a confirmação impede qualquer gravação', async () => {
  for (const extra of [{status:'Em uso'}, {dataSaidaReal:'2099-08-20'}, {saidaRealEm:{seconds:1}},
    {status:'Devolução informada'}, {status:'Concluída'}]) {
    const a = ambiente({antesTransacao:d=>Object.assign(d['reservasVeiculos/r1'],extra)});
    await a.cancelar();
    assert.equal(a.escritas.length,0);
    assert.equal(a.remotos['frota/saidaVeiculos'].dados[0].svstatus,'Em Viagem');
    assert.match(a.alertas.at(-1),/não confirmado/);
  }
});

test('falha no banco ou validação não cancela apenas metade dos registros', async () => {
  for (const opcoes of [{falhar:true}, {invalido:true},
    {antesTransacao:d=>{d['frota/saidaVeiculos'].dados[0].svdestino='Alterado em outro aparelho';}}]) {
    const a = ambiente(opcoes);
    await a.cancelar();
    assert.equal(a.escritas.length,0);
    assert.equal(a.remotos['reservasVeiculos/r1'].status,'Aprovada');
    assert.equal(a.remotos['frota/saidaVeiculos'].dados[0].svstatus,'Em Viagem');
    assert.doesNotMatch(a.alertas.join(' '),/Cancelamento confirmado no banco/);
    assert.equal(a.contexto.db.saidaVeiculos[0].svstatus,'Em Viagem');
    Object.values(a.elementos).forEach(el=>assert.equal(el.value,'rascunho do formulário'));
    assert.equal(a.botao.disabled,false);
  }
});

test('cancelamento exige administrador, internet, motivo e confirmação', async () => {
  for (const opcoes of [{admin:false}, {online:false}, {motivo:null}, {motivo:'   '}, {confirmar:false}]) {
    const a = ambiente(opcoes);
    await a.cancelar();
    assert.equal(a.transacoes,0);
    assert.equal(a.escritas.length,0);
  }
});

test('cancelamento encerra edição pendente e libera o mesmo período na agenda e na reserva', async () => {
  const a = ambiente({remotos:{'reservasVeiculos/r1':reserva({pedidoEdicao:{situacao:'Autorizada'}})}});
  await a.cancelar();
  const s = a.remotos['frota/saidaVeiculos'].dados[0], r = a.remotos['reservasVeiculos/r1'];
  assert.equal(r.pedidoEdicao.situacao,'Encerrada');
  assert.ok(R.validarAcao(r,'u1','iniciar'));
  assert.equal(montarEventos({solicitacoes:[r],saidas:[s]}).eventos.length,0);
  const ctx = {veiculos:[{vplaca:'ABC1234',vstatus:'Ativo'}],saidas:[s],solicitacoes:[r]};
  assert.equal(R.validarSolicitacao(reserva({id:'nova'}),ctx),'');
  // Registros antigos inconsistentes também não voltam a bloquear pelo status da saída.
  ctx.saidas = [Object.assign({},s,{svreserva:'Reservado'})];
  assert.equal(R.validarSolicitacao(reserva({id:'nova'}),ctx),'');
});

test('botão é ligado à lista real e scripts continuam sintaticamente válidos', () => {
  const index = ler('index.html'), paginacao = ler('paginacao.js');
  assert.match(paginacao,/data-cancelar-saida="\$\{real\}"/);
  assert.match(ler('reservas-pedidos.js'),/#listaSaidaVeiculos \[data-cancelar-saida\]/);
  assert.match(index,/paginacao\.js\?v=20261116-cancelar-saida/);
  for (const nome of ['reservas-pedidos.js','reservas-regras.js','paginacao.js']) new vm.Script(ler(nome));
});

test('aplicativo mantém motivo, data e responsável no histórico sem oferecer iniciar saída', () => {
  const html = ler('reserva.html');
  const trecho = html.slice(html.indexOf('  function cls(s)'), html.indexOf('  var POR_PAGINA=12'));
  const contexto = {R, auth:{currentUser:{uid:'u1'}}, estado:{admin:false}, esc:String};
  vm.createContext(contexto); vm.runInContext(trecho,contexto);
  const r = reserva({status:'Cancelada', motivoCancelamento:'Viagem desmarcada',
    canceladoEm:'2099-08-19T12:00:00.000Z', canceladoPor:'Administrador Ana'});
  for (const acoes of [true,false]) {
    const item = contexto.itemHtml(r,acoes);
    assert.match(item,/Cancelada em/);
    assert.match(item,/Administrador Ana/);
    assert.match(item,/Motivo do cancelamento: Viagem desmarcada/);
    assert.doesNotMatch(item,/data-iniciar=/);
  }
});
