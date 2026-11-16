const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {localizarPlacas} = require('../placas-layout.js');
const ler = arquivo => fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8');

test('reconhece placas antigas e Mercosul sem mudar o texto exibido', () => {
  for (const placa of ['ABC-1234', 'TRP-2H05', 'ABC1234', 'TRP2H05', 'abc-1234', 'ABC 1234']) {
    assert.deepEqual(localizarPlacas(placa), [{inicio:0, texto:placa}]);
  }
});

test('isola somente as placas, preservando modelo, separadores e espaços', () => {
  const texto = 'Caminhão TRP-2H05 / carreta ABC-1234 — EM VIAGEM';
  const partes = localizarPlacas(texto);
  assert.deepEqual(partes.map(p => p.texto), ['TRP-2H05', 'ABC-1234']);
  for (const parte of partes) {
    assert.equal(texto.slice(parte.inicio, parte.inicio + parte.texto.length), parte.texto);
  }
});

test('não interpreta números, nomes ou fragmentos de códigos maiores como placas', () => {
  for (const texto of ['Sem veículo', 'R$ 1.234,56', '2026-11-23', 'XABC1234', 'ABC12345', 'ABC-12H4']) {
    assert.deepEqual(localizarPlacas(texto), [], texto);
  }
});

test('buscas repetidas não compartilham o cursor da expressão regular', () => {
  assert.deepEqual(localizarPlacas('TRP-2H05'), localizarPlacas('TRP-2H05'));
  assert.equal(localizarPlacas('(ABC-1234), TRP2H05').length, 2);
});

test('integra camada visual à tela principal e protege células de Feriados', () => {
  const html = ler('index.html');
  const css = ler('pro-ui.css');
  const plantao = ler('diarias-plantao.js');
  assert.match(html, /src="\.\/placas-layout\.js\?v=1"/);
  assert.match(html, /pro-ui\.css\?v=20261123-placas-inteiras/);
  assert.match(plantao, /coluna === 4 \? 'fm-celula-placa'/);
  assert.match(css, /\.fm-placa-inteira\s*\{[^}]*white-space: nowrap !important/);
  assert.match(css, /\.fm-placas-rolagem\s*\{[^}]*overflow-x: auto !important/);
});

test('camada visual usa nós de texto e não acessa persistência financeira', () => {
  const script = ler('placas-layout.js');
  assert.doesNotMatch(script, /innerHTML|salvarNuvem|localStorage|\bdb\./);
  assert.match(script, /placa\.textContent = parte\.texto/);
  assert.match(script, /observador\.disconnect\(\)/);
  assert.match(script, /select, button, \[contenteditable\]/);
});
