const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { centavos, total, subtotal, prazo, apolice, agrupar } = require('../seguros-frota.js');

const base = { stipo: 'principal', sseguradora: 'Seguradora Á', sapolice: '001', sinicio: '2026-01-01', svencimento: '2026-12-31', sveiculo: 'ABC1D23' };

test('prêmio e IOF são somados em centavos, sem incluir valores de cobertura', () => {
    assert.equal(centavos('R$ 1.234,56'), 123456);
    assert.equal(centavos('10.25'), 1025);
    assert.equal(centavos('0'), 0);
    assert.equal(centavos(''), null);
    assert.ok(Number.isNaN(centavos('-1,00')));
    assert.ok(Number.isNaN(centavos('12,345')));
    assert.equal(total({ spremio: 10, siof: 20, smorais: 500000 }), 30);
    assert.equal(total({ sfipe: 500000 }), null);
    assert.equal(subtotal([{ spremio: 10, siof: 20 }, { spremio: 40 }, {}], 'total'), 70);
    assert.equal(subtotal([{},{}], 'spremio'), null);
});

test('placas diferentes compartilham a apólice, mas tipos e vigências não se misturam', () => {
    const segundaPlaca = { ...base, sveiculo: 'XYZ4J56', sseguradora: 'seguradora a' };
    const segundoRisco = { ...base, stipo:'segundo' };
    const renovacao = { ...base, sinicio:'2027-01-01', svencimento:'2027-12-31' };
    const legado = { sveiculo: base.sveiculo, sseguradora: base.sseguradora, svencimento: base.svencimento };
    assert.equal(apolice(base), apolice(segundaPlaca));
    assert.notEqual(apolice(base), apolice(segundoRisco));
    assert.notEqual(apolice(base), apolice(renovacao));
    assert.deepEqual(agrupar([base, segundaPlaca, segundoRisco, renovacao, legado]).map(g => g.linhas.length), [2,1,1,1]);
    assert.equal(total(legado), null);
});

test('aprovação não interfere no alerta de vencimento e o limite é de 30 dias', () => {
    const aprovada = { ...base, ssituacao: 'aprovada' };
    assert.equal(prazo(aprovada.svencimento, '2027-01-01')[0], 'vencido');
    assert.equal(prazo(aprovada.svencimento, '2026-12-31')[0], 'atencao');
    assert.equal(prazo(aprovada.svencimento, '2026-12-01')[0], 'atencao');
    assert.equal(prazo(aprovada.svencimento, '2026-11-30')[0], 'vigente');
    assert.equal(prazo('', '2026-12-31')[0], 'sem');
});

test('a página monta a consulta no módulo existente e preserva os alertas do painel', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /id="seguros"[^]*?id="fmApolices"/);
    assert.match(html, /src="\.\/seguros-frota\.js\?/);
    assert.match(html, /db\.seguros\.forEach\(s=>analisar\(s\.sveiculo,'Seguro',s\.svencimento\)\)/);
});

test('a chave de sincronização distingue apólice, tipo, vigência e placa', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const inicio = html.indexOf('function fmTextoChave(v)');
    const fim = html.indexOf('window.fmChaveNegocio =', inicio);
    assert.ok(inicio >= 0 && fim > inicio);
    const chave = require('node:vm').runInNewContext(html.slice(inicio, fim) + '\nfmChaveNegocio');
    const seguro = r => chave('seguros', r);
    assert.equal(seguro(base), seguro({ ...base, sveiculo: 'ABC-1D23', sseguradora: 'SEGURADORA A' }));
    for (const mudanca of [{ sveiculo: 'XYZ4J56' }, { stipo: 'segundo' }, { sapolice: '002' }, { sinicio: '2026-02-01' }, { stipo: undefined }]) {
        assert.notEqual(seguro(base), seguro({ ...base, ...mudanca }));
    }
});
