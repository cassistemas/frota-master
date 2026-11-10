/* Executar: node --test tests/dashboard-veiculos.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inicio = html.indexOf('function dadosCustosVeiculosDashboard(base){');
const fim = html.indexOf('function renderDashboard(){', inicio);
assert.ok(inicio >= 0 && fim > inicio, 'Projeção do gráfico encontrada');
function moeda(valor) {
  if (typeof valor === 'number') return valor;
  return Number(String(valor || '').replace(/R\$|\s|\./g, '').replace(',', '.')) || 0;
}
function projetar(base) {
  const antes = JSON.stringify(base);
  const ctx = {
    base, moedaParaFloat: moeda,
    totalManutencaoRegistro: x => moeda(x.mvalor) + moeda(x.mvalornfse)
  };
  vm.runInNewContext(html.slice(inicio, fim) + '\nresultado = dadosCustosVeiculosDashboard(base);', ctx);
  assert.equal(JSON.stringify(base), antes, 'Não modifica cadastro, despesas ou históricos');
  return JSON.parse(JSON.stringify(ctx.resultado));
}
test('reúne nomes anteriores e placa atual em uma única barra pelo histórico', () => {
  const r = projetar({
    veiculos: [{ _rid: 'v1', vplaca: 'ABC-1234', historicoPlacas: [
      { placaAnterior: 'Scania laranja', placaNova: 'DAF 310' },
      { placaAnterior: 'DAF 310', placaNova: 'ABC-1234' }
    ] }],
    manutencoes: [
      { mveiculo: 'Scania laranja', mvalor: 'R$ 100,10', mvalornfse: 'R$ 20,20' },
      { mveiculo: 'DAF 310', mvalor: 'R$ 30,00' }
    ],
    multas: [{ muveiculo: 'abc1234', muvalor: 'R$ 40,00', mustatus: 'Pendente' }]
  });
  assert.deepEqual(r.labels, ['ABC-1234']);
  assert.ok(Math.abs(r.valores[0] - 190.30) < 1e-9);
});
test('usa a identidade do veículo e o histórico de KM sem deduzir nomes', () => {
  const r = projetar({
    veiculos: [{ _rid: 'v1', vplaca: 'XYZ-9999' }],
    historicoKm: [{ veiculoId: 'v1', placa: 'Scania laranja' }],
    manutencoes: [{ mveiculo: 'Scania laranja', mvalor: 'R$ 10,00' }],
    multas: [{ veiculoId: 'v1', muveiculo: 'DAF 310', muvalor: 'R$ 20,00' }]
  });
  assert.deepEqual(r, { labels: ['XYZ-9999'], valores: [30] });
});
test('Estoque e nomes sem vínculo ficam separados sem perder nenhum valor', () => {
  const r = projetar({
    veiculos: [{ vplaca: 'ABC-1234', vmodelo: 'Scania' }],
    manutencoes: [
      { mveiculo: 'Estoque', mvalor: 'R$ 10,00' },
      { mveiculo: 'Scania laranja', mvalor: 'R$ 20,00' },
      { mveiculo: '', mvalor: 'R$ 30,00' },
      { mveiculo: 'ABC-1234', mvalor: 'R$ 40,00' }
    ],
    multas: [{ muveiculo: 'DAF 310', muvalor: 'R$ 50,00' }]
  });
  assert.deepEqual(r.labels, ['Sem vínculo identificado', 'ABC-1234']);
  assert.deepEqual(r.valores, [110, 40]);
  assert.equal(r.valores.reduce((a, b) => a + b, 0), 150);
});
test('histórico ambíguo não atribui a despesa a um veículo por suposição', () => {
  const r = projetar({
    veiculos: ['ABC-1234', 'XYZ-9999'].map(vplaca => ({
      vplaca, historicoPlacas: [{ placaAnterior: 'DAF 310', placaNova: vplaca }]
    })),
    manutencoes: [{ mveiculo: 'DAF 310', mvalor: 'R$ 12,34' }]
  });
  assert.deepEqual(r, { labels: ['Sem vínculo identificado'], valores: [12.34] });
});
test('aceita base vazia e não une nomes apenas por retirar pontuação', () => {
  assert.deepEqual(projetar({}), { labels: [], valores: [] });
  const r = projetar({
    veiculos: [{ vplaca: 'DAF 310' }],
    multas: [{ muveiculo: 'DAF310', muvalor: 'R$ 1,00' }]
  });
  assert.deepEqual(r.labels, ['Sem vínculo identificado']);
});
test('o gráfico da página usa a projeção atual e os scripts inline têm sintaxe válida', () => {
  assert.match(html, /const mData = dadosCustosVeiculosDashboard\(db\);/);
  assert.match(html, /labels:mData.labels/);
  assert.match(html, /data:mData.valores/);
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (script[1].trim()) new vm.Script(script[1]);
  }
});
