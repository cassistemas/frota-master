/* Executar com: node --test tests/combustivel-foto.test.cjs
   Testes simulados: não usam a chave real nem medem a precisão do Google. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../combustivel-foto.js'), 'utf8');

function ambiente(opcoes = {}) {
  const contagem = { imagens: 0, jpeg: 0, urls: 0 }, chamadas = [];
  const ctx = {
    console, Promise, Date, AbortController,
    setTimeout: (f, ms) => ms === 1500 ? 0 : setTimeout(f, ms), clearTimeout,
    document: {
      readyState: 'loading', addEventListener() {},
      createElement() { return { width: 0, height: 0, getContext: () => ({ drawImage() {} }),
        toDataURL(tipo, qualidade) {
          contagem.jpeg++; assert.equal(tipo, 'image/jpeg'); assert.equal(qualidade, 0.85);
          return 'data:image/jpeg;base64,Zm90bw==';
        } }; }
    },
    localStorage: { getItem: () => 'chave-ficticia-apenas-para-teste' },
    location: { protocol: 'https:', hostname: 'localhost' },
    URL: { createObjectURL() { contagem.urls++; return 'blob:teste'; }, revokeObjectURL() {} },
    Image: class {
      constructor() { contagem.imagens++; this.naturalWidth = 2400; this.naturalHeight = 3200; }
      set src(v) { this.onload(); }
    },
    fetch: async (url, init) => { chamadas.push({ url, init }); return opcoes.resposta || {
      ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(dados()) }] } }] })
    }; },
    firebase: { auth: () => ({ currentUser: { getIdToken: async () => 'token-ficticio' } }) }
  };
  ctx.window = ctx;
  const exposicao = 'window.cupomTeste = { criarContexto, lerGeminiDireto, lerIA, comPrazo };\n';
  vm.runInNewContext(source.replace("  if (document.readyState === 'loading')", exposicao + "  if (document.readyState === 'loading')"), ctx);
  const contexto = ctx.cupomTeste.criarContexto({ type: 'image/jpeg', size: 1024 }, () => {});
  return { ...ctx.cupomTeste, contexto, contagem, chamadas };
}
function dados() {
  return { data: '2026-01-10', posto: 'Posto Teste', placa: 'ABC1234', km: 123000,
    tipo: 'Diesel S10', litros: 100, valorLitro: 6, total: 600,
    arla: { litros: 10, valorLitro: 3, total: 30 } };
}

test('prepara uma única imagem/JPEG e mantém 1600 px e qualidade 0,85', async () => {
  const a = ambiente();
  const [foto, repetida] = await Promise.all([a.contexto.obterIA(), a.contexto.obterIA()]);
  await a.contexto.obterImagem();
  assert.equal(foto, repetida);
  assert.equal(foto.canvas.width, 1200); assert.equal(foto.canvas.height, 1600);
  assert.deepEqual(a.contagem, { imagens: 1, jpeg: 1, urls: 1 });
  a.contexto.liberar();
});

test('usa modelo fixo, JSON e mantém valores separados de combustível e ARLA', async () => {
  const a = ambiente(), res = await a.lerGeminiDireto(a.contexto, () => {});
  assert.equal(a.chamadas.length, 1);
  const { url, init } = a.chamadas[0], corpo = JSON.parse(init.body);
  assert.match(url, /gemini-2\.5-flash:generateContent$/);
  assert.doesNotMatch(url, /key=/);
  assert.equal(init.headers['x-goog-api-key'], 'chave-ficticia-apenas-para-teste');
  assert.equal(corpo.generationConfig.responseMimeType, 'application/json');
  assert.equal(corpo.generationConfig.thinkingConfig.thinkingBudget, 1024);
  assert.equal(res.dados.total, 600); assert.equal(res.dados.arla.total, 30);
  assert.equal(res.dados.conferido, true);
});

test('erro do Gemini não inicia cascata de outros modelos; alternativa reutiliza o JPEG', async () => {
  const resposta = { ok: false, status: 503, json: async () => ({}) }, a = ambiente({ resposta });
  await assert.rejects(a.lerGeminiDireto(a.contexto, () => {}), /503/);
  assert.equal(a.chamadas.length, 1);
  resposta.ok = true; resposta.json = async () => ({ dados: dados() });
  const res = await a.lerIA(a.contexto, () => {});
  assert.equal(a.chamadas.length, 2);
  assert.equal(a.chamadas[1].url, '/api/public/ler-cupom');
  assert.equal(JSON.parse(a.chamadas[1].init.body).imagem, 'data:image/jpeg;base64,Zm90bw==');
  assert.equal(res.dados.litros, 100);
  assert.deepEqual(a.contagem, { imagens: 1, jpeg: 1, urls: 1 });
});

test('limite de tempo aborta a tarefa e ignora conclusão tardia', async () => {
  const a = ambiente(); let sinal, resolver;
  const tarefa = a.comPrazo(signal => { sinal = signal; return new Promise(ok => { resolver = ok; }); }, 5, 'tempo esgotado');
  await assert.rejects(tarefa, /tempo esgotado/);
  assert.equal(sinal.aborted, true);
  resolver('tarde demais');
  await Promise.resolve();
});

test('arquivo inválido é rejeitado antes de iniciar qualquer chamada de IA', async () => {
  const a = ambiente(), contexto = a.criarContexto({ type: 'text/plain', size: 12, name: 'teste.txt' }, () => {});
  await assert.rejects(contexto.obterImagem(), /FORMATO_INVALIDO/);
  assert.equal(a.chamadas.length, 0); assert.equal(a.contagem.imagens, 0);
});
