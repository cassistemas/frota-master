/* Executar: node --test tests/quilometragem-mensal.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const fonte = fs.readFileSync(path.join(__dirname, '..', 'custos-frota.js'), 'utf8');
const fechamento = extra => Object.assign({ id: 'jan', veiculo: 'ABC1234', data: '2026-01-31', odometroInicial: 100000, odometroFinal: 105000, kmRodado: 5000, confirmado: true }, extra);
const fevereiro = { ini: '2026-02-01', fim: '2026-02-28', v: '' };
function ambiente(dados = {}, carregado = true) {
  const db = Object.assign({ veiculos: [{ vplaca: 'ABC-1234', vkm: 130000 }], quilometragens: [fechamento()] }, dados);
  const campos = {};
  for (const id of ['cusKmIdx', 'cusKmVeiculo', 'cusKmData', 'cusKmInicial', 'cusKmFinal', 'cusKmRodado', 'cusKmObs', 'cusFiltroVeiculo', 'cusFiltroInicio', 'cusFiltroFim', 'cusKmLista', 'cusKmPaginacao']) {
    campos[id] = { value: '', innerHTML: '', focus() {}, scrollIntoView() {} };
  }
  campos.cusFiltroInicio.value = fevereiro.ini;
  campos.cusFiltroFim.value = fevereiro.fim;
  const salvos = [];
  const ctx = { db, console, Date, setTimeout() {}, alert() {},
    document: { readyState: 'loading', addEventListener() {}, getElementById: id => campos[id] || null },
    fmModuloCarregado: () => carregado,
    salvarNuvem: mods => salvos.push(mods)
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fonte.replace('function fechamentoAnterior(', 'window.kmTeste={aberturas:aberturasKmMensais,abrir:abrirFechamentoMensal,ultimo:ultimoOdometro,preencher:preencherKmDoVeiculo,render:renderKm};function fechamentoAnterior('), ctx);
  return { db, campos, ctx, api: ctx.kmTeste, salvos };
}
test('script mantém sintaxe válida', () => {
  new vm.Script(fonte);
});
test('herda o último final do mês anterior e não o KM atual nem leitura futura', () => {
  const amb = ambiente({ quilometragens: [fechamento(), fechamento({ id: 'inicio', data: '2026-01-15', odometroFinal: 102000 }), fechamento({ id: 'futuro', data: '2026-03-31', odometroFinal: 150000 })] });
  const antes = JSON.stringify(amb.db);
  const linhas = amb.api.aberturas(fevereiro);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].veiculo, 'ABC-1234');
  assert.equal(linhas[0].odometroInicial, 105000);
  assert.equal(linhas[0].pendenteMensal, true);
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
test('mostra todos os veículos não vendidos sem duplicar placas equivalentes', () => {
  const amb = ambiente({ veiculos: [{ vplaca: 'ABC-1234' }, { vplaca: 'ABC1234' }, { vplaca: 'XYZ9999' }, { vplaca: 'OLD0000', vstatus: 'VENDIDO' }] });
  const linhas = amb.api.aberturas(fevereiro);
  assert.equal(linhas.length, 2);
  assert.equal(linhas.find(x => x.veiculo === 'XYZ9999').odometroInicial, null);
  assert.equal(amb.api.aberturas(Object.assign({}, fevereiro, { v: 'abc1234' })).length, 1);
});
test('não cria outra abertura se a placa já possui lançamento no mês', () => {
  const amb = ambiente({ quilometragens: [fechamento(), fechamento({ id: 'fev', veiculo: 'ABC-1234', data: '2026-02-28' })] });
  assert.equal(amb.api.aberturas(fevereiro).length, 0);
});
test('mês sem fechamento anterior não recebe valor de mês antigo ou do cadastro', () => {
  const amb = ambiente({ quilometragens: [fechamento({ data: '2025-12-31' })] });
  assert.equal(amb.api.aberturas(fevereiro)[0].odometroInicial, null);
});
test('ignora fechamentos inválidos ou não confirmados', () => {
  for (const extra of [{ odometroFinal: '' }, { odometroInicial: null }, { odometroFinal: 90000 }, { confirmado: false }]) {
    const amb = ambiente({ quilometragens: [fechamento(extra)] });
    assert.equal(amb.api.aberturas(fevereiro)[0].odometroInicial, null);
  }
});
test('aceita odômetro zero como leitura real, sem usar valor do cadastro', () => {
  const amb = ambiente({ quilometragens: [fechamento({ odometroInicial: 0, odometroFinal: 0 })] });
  assert.equal(amb.api.aberturas(fevereiro)[0].odometroInicial, 0);
});
test('não projeta em períodos de vários meses nem antes do banco carregar', () => {
  const amb = ambiente();
  assert.equal(amb.api.aberturas({ ini: '2026-01-01', fim: '2026-02-28' }).length, 0);
  assert.equal(ambiente({}, false).api.aberturas(fevereiro).length, 0);
});
test('virada do ano usa o fechamento de dezembro', () => {
  const amb = ambiente({ quilometragens: [fechamento({ data: '2025-12-31' })] });
  assert.equal(amb.api.aberturas({ ini: '2026-01-01', fim: '2026-01-31' })[0].odometroInicial, 105000);
});
test('abre o formulário com o inicial herdado e final vazio, sem persistir', () => {
  const amb = ambiente();
  const antes = JSON.stringify(amb.db);
  amb.api.abrir('ABC1234', '2026-02');
  assert.equal(amb.campos.cusKmVeiculo.value, 'ABC-1234');
  assert.equal(amb.campos.cusKmData.value.slice(0, 7), '2026-02');
  assert.equal(amb.campos.cusKmInicial.value, '105000');
  assert.equal(amb.campos.cusKmFinal.value, '');
  assert.equal(amb.campos.cusKmRodado.value, '');
  amb.api.preencher(true);
  assert.equal(amb.campos.cusKmFinal.value, '');
  assert.equal(JSON.stringify(amb.db), antes);
  assert.equal(amb.salvos.length, 0);
});
test('sem fechamento anterior, formulário exige inicial informado pelo usuário', () => {
  const amb = ambiente({ quilometragens: [] });
  amb.api.abrir('ABC1234', '2026-02');
  assert.equal(amb.campos.cusKmInicial.value, '');
  assert.equal(amb.campos.cusKmFinal.value, '');
});
test('salva pelo writer existente e substitui a abertura pelo fechamento real', () => {
  const amb = ambiente();
  amb.api.abrir('ABC1234', '2026-02');
  amb.campos.cusKmFinal.value = '110000';
  amb.ctx.salvarQuilometragem();
  assert.equal(amb.db.quilometragens.length, 2);
  assert.equal(amb.db.quilometragens[1].odometroInicial, 105000);
  assert.equal(amb.db.quilometragens[1].odometroFinal, 110000);
  assert.equal(amb.db.quilometragens[1].kmRodado, 5000);
  assert.equal(amb.db.veiculos[0].vkm, 130000);
  assert.equal(amb.api.aberturas(fevereiro).length, 0);
  assert.equal(amb.salvos.length, 1);
});
test('formulário manual não usa fechamento futuro como odômetro inicial', () => {
  const amb = ambiente({ quilometragens: [fechamento(), fechamento({ id: 'futuro', data: '2026-03-31', odometroFinal: 150000 })] });
  amb.campos.cusKmVeiculo.value = 'ABC-1234';
  amb.campos.cusKmData.value = '2026-02-28';
  amb.api.preencher(false);
  assert.equal(amb.campos.cusKmInicial.value, '105000');
});
