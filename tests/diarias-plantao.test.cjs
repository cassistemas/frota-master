const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const p = require('../diarias-plantao.js');
const registro = () => ({motorista:'Maria', data:'2026-05-02', tipo:'Plantão trabalhado', ocasiao:'Sábado', inicio:'', fim:'', valorCentavos:12550, status:'Pendente', obs:''});

test('converte valores brasileiros em centavos exatos e rejeita formatos ambíguos', () => {
  assert.equal(p.centavos('R$ 1.234,56'), 123456);
  assert.equal(p.centavos('125.50'), 12550);
  assert.equal(p.centavos('0,29'), 29);
  assert.equal(p.centavos('12,5'), 1250);
  assert.equal(p.centavos(0), 0);
  for (const valor of ['', null, 'abc', '-1', '1e3', '0x10', '12.34,56', '1,234', '1.234']) {
    assert.ok(Number.isNaN(p.centavos(valor)), String(valor));
  }
});
test('valida data real e ocasião sem deslocamento de fuso', () => {
  assert.equal(p.erro(registro(), [], null), '');
  assert.equal(p.dia('2026-02-30'), -1);
  assert.match(p.erro({...registro(), ocasiao:'Domingo'}, [], null), /dia da semana/);
  assert.match(p.erro({...registro(), ocasiao:'Feriado'}, [], null), /nome do feriado/);
  assert.equal(p.erro({...registro(), ocasiao:'Feriado', obs:'Feriado municipal'}, [], null), '');
});
test('horários opcionais precisam de par e permitem término no dia seguinte', () => {
  assert.match(p.erro({...registro(), inicio:'08:00'}, [], null), /dois horários/);
  assert.match(p.erro({...registro(), inicio:'08:00', fim:'08:00'}, [], null), /diferentes/);
  assert.equal(p.erro({...registro(), inicio:'22:00', fim:'06:00'}, [], null), '');
});
test('bloqueia duplicação e preserva identidade na edição', () => {
  const existente = {...registro(), _rid:'original'};
  assert.match(p.erro(registro(), [existente], null), /Já existe/);
  assert.equal(p.erro(registro(), [existente], 'original'), '');
  assert.equal(p.erro({...registro(), tipo:'Sobreaviso'}, [existente], null), '');
});
test('valor e situação precisam ser válidos', () => {
  assert.match(p.erro({...registro(), valorCentavos:-1}, [], null), /valor válido/);
  assert.match(p.erro({...registro(), valorCentavos:NaN}, [], null), /valor válido/);
  assert.equal(p.erro({...registro(), valorCentavos:0}, [], null), '');
  assert.match(p.erro({...registro(), status:'Qualquer'}, [], null), /situação/);
});
test('filtros e totais consideram todos os registros, sem modificar originais', () => {
  const lista = Array.from({length:32}, (_, i) => ({...registro(), _rid:String(i), valorCentavos:101, status:i % 2 ? 'Pago' : 'Pendente'}));
  const antes = JSON.stringify(lista);
  assert.equal(p.filtrar(lista, {status:'Pago'}).length, 16);
  assert.equal(p.total(p.filtrar(lista, {status:'Pago'})), 1616);
  assert.equal(p.total(lista), 3232);
  assert.equal(p.filtrar(lista, {ini:'2026-05-03'}).length, 0);
  assert.equal(JSON.stringify(lista), antes);
});
test('aba fica dentro de Diárias e não altera lançamentos de viagem', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../diarias-plantao.js'), 'utf8');
  assert.ok(html.indexOf('id="diPlantaoConteudo"') > html.indexOf('id="diarias"'));
  assert.ok(html.indexOf('<!-- diViagemConteudo -->') < html.indexOf('id="terceiros"'));
  assert.match(html, /plantoes:'FM_PLANTOES'/);
  assert.match(script, /salvarNuvem\(\['plantoes'\]\)/);
  assert.doesNotMatch(script, /db\.diarias\.(push|splice)/);
  assert.match(html, /Object\.keys\(MAP\)\.filter\(mod => mod !== 'plantoes'\)/);
  assert.match(html, /if\(mod === "plantoes" && n\(r\.motorista\)/);
});
test('seletores de plantão usam motNome do cadastro de motoristas', () => {
  const vm = require('node:vm');
  const script = fs.readFileSync(path.join(__dirname, '../diarias-plantao.js'), 'utf8');
  const elementos = Object.fromEntries([
    'pa_form', 'pa_motorista', 'pa_veiculo', 'pa_fMotorista', 'pa_fTipo',
    'pa_fStatus', 'pa_fIni', 'pa_fFim', 'pa_totais', 'pa_lista', 'pa_paginas', 'pa_salvar', 'pa_status'
  ].map(id => [id, {value:'', innerHTML:''}]));
  const contexto = {
    document: {getElementById: id => elementos[id]},
    db: {motoristas:[{motNome:'Maria Silva'}, {motNome:'João Souza'}], veiculos:[], plantoes:[]},
    fmModuloCarregado: () => true,
    addEventListener: () => {}
  };
  vm.runInNewContext(script, contexto);
  contexto.FMPlantao.render();
  for (const id of ['pa_motorista', 'pa_fMotorista']) {
    assert.match(elementos[id].innerHTML, /<option value="Maria Silva">Maria Silva<\/option>/);
    assert.match(elementos[id].innerHTML, /<option value="João Souza">João Souza<\/option>/);
  }
  elementos.pa_motorista.value = 'Maria Silva';
  contexto.FMPlantao.render();
  assert.equal(elementos.pa_motorista.value, 'Maria Silva');
  assert.match(script, /nomeCadastro\(m\.motNome\) === nomeCadastro\(r\.motorista\)/);
  assert.match(script, /if \(motorista\) r\.motorista = String\(motorista\.motNome\);/);
  assert.doesNotMatch(script, /\.mnome\b/);
  contexto.db.motoristas = [{motNome:' BRUNO  PIRES GOMES '}, {motNome:'Ana & João'}];
  contexto.FMPlantao.render();
  assert.match(elementos.pa_motorista.innerHTML, /<option value=" BRUNO  PIRES GOMES "> BRUNO  PIRES GOMES <\/option>/);
  assert.match(elementos.pa_motorista.innerHTML, /<option value="Ana &amp; João">Ana &amp; João<\/option>/);
});
test('exportação própria não é removida nem substituída pelo relatório genérico', () => {
  const script = fs.readFileSync(path.join(__dirname, '../diarias-plantao.js'), 'utf8');
  assert.match(script, /data-sem-relatorio/);
  assert.match(script, /class="btn btn-outline-success" data-pa="exportar"/);
  assert.doesNotMatch(script, /class="btn-excel"/);
  assert.match(script, /var registros = dados\(\);/);
  assert.match(script, /data-modulo="plantoes" data-index=/);
});
test('consulta oferece botão Filtrar ao lado de Limpar filtros e títulos mantêm iniciais maiúsculas', () => {
  const script = fs.readFileSync(path.join(__dirname, '../diarias-plantao.js'), 'utf8');
  assert.match(script, /<h4 class="mb-0">Consultar lançamentos<\/h4><\/div>/);
  assert.match(script, /<div class="col-12 d-flex flex-wrap gap-2"><button type="button" class="btn btn-primary" data-pa="filtrar">Filtrar<\/button><button type="button" class="btn btn-secondary" data-pa="limpar">Limpar filtros<\/button>/);
  assert.equal((script.match(/data-pa="filtrar"/g) || []).length, 1);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /diarias-plantao\.js\?v=20261115-7-moeda-durante-digitacao/);
  assert.match(script, /if \(a === 'filtrar'\) \{ pagina = 1; render\(\); return; \}/);
  assert.equal((script.match(/Novo Plantão \/ Sobreaviso/g) || []).length, 2);
  assert.match(script, /Editar Plantão \/ Sobreaviso/);
  assert.doesNotMatch(script, /(?:Novo|Editar) plantão \/ sobreaviso/);
});
