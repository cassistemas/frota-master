/* Executar: node --test tests/reservas-pedidos.test.cjs tests/reservas-calendario.test.cjs tests/reservas-dashboard.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../reservas-regras.js');
const { montarEventos } = require('../reservas-calendario.js');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
const reserva = extra => Object.assign({ id:'r1', uid:'u1', status:'Aprovada', placa:'ABC-1234', numeroReserva:'12',
  dataSaida:'2099-08-20', horaSaida:'08:00', dataChegada:'2099-08-20', horaChegada:'18:00', destino:'Centro' }, extra);
const saida = extra => Object.assign({ svnumeroreserva:'12', svveiculo:'ABC1234', svreserva:'Reservado', svstatus:'Em Viagem',
  svdataSaida:'2099-08-20', svhoraSaida:'08:00', svdataChegada:'2099-08-20', svhoraChegada:'18:00' }, extra);

test('edição depende de autorização individual, consumida após envio', () => {
  for (const status of ['Pendente', 'Aprovada']) {
    const s = reserva({status});
    assert.ok(R.validarAcao(s, 'u1', 'editar'));
    assert.equal(R.validarAcao(s, 'u1', 'solicitar-edicao'), '');
    s.pedidoEdicao = {situacao:'Pendente'};
    assert.ok(R.validarAcao(s, 'u1', 'editar'));
    assert.ok(R.validarAcao(s, 'u1', 'solicitar-edicao'));
    s.pedidoEdicao.situacao = 'Autorizada';
    assert.equal(R.validarAcao(s, 'u1', 'editar'), '');
    assert.ok(R.validarAcao(s, 'outro', 'editar'));
    for (const situacao of ['Aguardando confirmação', 'Aplicada', 'Recusado']) {
      s.pedidoEdicao.situacao = situacao;
      assert.ok(R.validarAcao(s, 'u1', 'editar'));
    }
  }
});
test('cancelamento pendente bloqueia edição sem liberar a agenda', () => {
  const s = reserva({pedidoCancelamento:{situacao:'Pendente'}, pedidoEdicao:{situacao:'Autorizada'}});
  assert.ok(R.validarAcao(s, 'u1', 'editar'));
  assert.ok(R.validarAcao(s, 'u1', 'cancelar'));
  assert.equal(montarEventos({solicitacoes:[s], saidas:[saida()]}).eventos.length, 1);
  assert.equal(montarEventos({solicitacoes:[Object.assign({},s,{status:'Cancelada'})], saidas:[saida({svreserva:'Liberado',svstatus:'Cancelado'})]}).eventos.length, 0);
});
test('histórico e viagens iniciadas não podem ser alterados pelo solicitante', () => {
  for (const extra of [{status:'Em uso'}, {status:'Concluída'}, {status:'Devolução informada'}, {status:'Cancelada'},
    {status:'Recusada'}, {dataSaidaReal:'2099-08-20'}, {saidaRealEm:{seconds:1}}]) {
    const s = reserva(Object.assign({pedidoEdicao:{situacao:'Autorizada'}}, extra));
    for (const acao of ['editar', 'cancelar', 'solicitar-edicao', 'excluir']) assert.ok(R.validarAcao(s,'u1',acao));
  }
  assert.ok(R.validarAcao(reserva(),'u1','excluir'));
});
test('edição não conflita consigo mesma, mas confere as demais reservas', () => {
  const original = reserva(), candidato = reserva();
  const ctx = {veiculos:[{vplaca:'ABC1234',vstatus:'Ativo'}],saidas:[saida()],solicitacoes:[original],reservaOriginal:original};
  assert.equal(R.validarSolicitacao(candidato,ctx), '');
  ctx.saidas.push(saida({svnumeroreserva:'13'}));
  assert.match(R.validarSolicitacao(candidato,ctx), /já possui/);
  ctx.saidas.pop(); ctx.solicitacoes.push(reserva({id:'r2'}));
  assert.match(R.validarSolicitacao(candidato,ctx), /outra solicitação/);
});
test('histórico mostra 12 itens por página e reajusta ao filtrar', () => {
  const html = ler('reserva.html');
  const inicio = html.indexOf('var POR_PAGINA=12'), fim = html.indexOf('["hStatus","hUsuario","hDe","hAte"].forEach',inicio);
  assert.ok(inicio>0 && fim>inicio);
  const elementos = Object.fromEntries(['hStatus','hUsuario','hDe','hAte','listaHistorico','hResumo','hPag','hAnt','hProx'].map(id=>[id,{value:''}]));
  const contexto = {auth:{currentUser:{uid:'u1'}}, estado:{admin:false,solicitacoes:Array.from({length:25},(_,i)=>reserva({id:'r'+i}))},
    $:id=>elementos[id], itemHtml:s=>s.id+';', esc:String};
  vm.createContext(contexto); vm.runInContext(html.slice(inicio,fim),contexto);
  vm.runInContext('montarHistorico()',contexto);
  assert.equal(elementos.listaHistorico.innerHTML.split(';').length-1,12);
  assert.equal(elementos.hPag.textContent,'Página 1 de 3');
  assert.equal(elementos.hAnt.disabled,true);
  vm.runInContext('hPagina=3; montarHistorico()',contexto);
  assert.equal(elementos.listaHistorico.innerHTML.split(';').length-1,1);
  assert.equal(elementos.hProx.disabled,true);
  elementos.hStatus.value='Cancelada'; vm.runInContext('montarHistorico()',contexto);
  assert.equal(elementos.hPag.textContent,'Página 1 de 1');
});
test('scripts de reservas permanecem válidos e conectados às páginas', () => {
  const html = ler('reserva.html'), index = ler('index.html');
  for (const bloco of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(bloco[1]);
  for (const nome of ['reservas-pedidos.js','reservas-aprovacao.js','reservas-regras.js','avisos-reserva.js']) new vm.Script(ler(nome));
  assert.match(index,/src="\.\/reservas-pedidos\.js\?v=/);
  assert.match(index,/reservaTransacao === true\) return resultadoSaida/);
  assert.match(ler('reservas-pedidos.js'),/salvarSaidaVeiculo\(\{reservaTransacao:true\}\)/);
  assert.doesNotMatch(html,/data-excluir|up\.status="Cancelada"/);
});
test('preparação da saída preserva o formulário e não publica estado intermediário', () => {
  const fonte = ler('reservas-pedidos.js');
  const trecho = fonte.slice(fonte.indexOf('function prepararSaida('), fonte.indexOf('async function decidir('));
  const ids = ['sv_idx','svreserva','svnumeroreserva','svveiculo','svmotorista','svdestino','svdataSaida','svhoraSaida','svdataChegada','svhoraChegada','svstatus','svobs'];
  const elementos = Object.fromEntries(ids.map(id => [id,{value:'formulário aberto',tagName:'INPUT'}]));
  const anterior = [saida({svnumeroreserva:'99'})];
  let chamadas = 0;
  const contexto = {db:{saidaVeiculos:anterior}, document:{getElementById:id=>elementos[id]},
    salvarSaidaVeiculo(opcoes) {
      chamadas++;
      assert.equal(opcoes.reservaTransacao,true);
      const idx = Number(elementos.sv_idx.value);
      assert.equal(elementos.svstatus.value,'Cancelado');
      const atual = Object.assign({},contexto.db.saidaVeiculos[idx],{svstatus:'Cancelado',svreserva:'Liberado'});
      contexto.db.saidaVeiculos[idx] = atual;
      return atual;
    }};
  vm.createContext(contexto); vm.runInContext(trecho,contexto);
  const resultado = contexto.prepararSaida([saida()],0,reserva(),undefined,true);
  assert.equal(chamadas,1);
  assert.equal(resultado[0].svstatus,'Cancelado');
  assert.equal(resultado[0].svreserva,'Liberado');
  assert.equal(contexto.db.saidaVeiculos,anterior);
  ids.forEach(id=>assert.equal(elementos[id].value,'formulário aberto'));
  contexto.salvarSaidaVeiculo=()=>false;
  assert.throws(()=>contexto.prepararSaida([saida()],0,reserva(),undefined,true),/Nenhuma alteração/);
  assert.equal(contexto.db.saidaVeiculos,anterior);
  ids.forEach(id=>assert.equal(elementos[id].value,'formulário aberto'));
});
