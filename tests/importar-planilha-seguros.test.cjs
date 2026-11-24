const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const seguros = require('../seguros-frota.js');
const importador = require('../importar-planilha-seguros.js');

const cadastro = [
    { vplaca: 'ABC-1D23', vmodelo: 'Scania' },
    { vplaca: 'XYZ4567', vmodelo: 'Volvo' },
];
const legado = { sveiculo: 'ABC-1D23', sseguradora: 'Seguradora Á', svencimento: '2026-12-31' };
const existente = { ...legado, stipo: 'principal', sapolice: '001', sinicio: '2026-01-01', spremio: 5000 };
const colunas = ['Placa', 'Seguradora', 'Apólice', 'Início da vigência', 'Fim da vigência', 'Prêmio (R$)', 'IOF', 'Total'];
const linha = (p, iof = '9,50') => [p, 'seguradora a', '001', '01/01/2026', '31/12/2026', 'R$ 1.234,56', iof, 999999];
const ler = (nome, dados) => importador.lerAbas([{ nome, dados }]);
const validar = (linhas, atuais = []) => importador.validar(linhas, cadastro, atuais, seguros);

test('separa os riscos e usa centavos, cadastro e datas, sem importar subtotais', () => {
    const lidas = importador.lerAbas([
        { nome: 'Seguro principal', primeiraLinha: 4, dados: [colunas, linha('ABC1D23'), ['Subtotal das placas exibidas', '', '', '', '', 100]] },
        { nome: 'Cotações', dados: [['2º risco'], ['Apólice', '001', 'Seguradora', 'Seguradora Á'], ['Início', 46023, 'Vencimento', '2026-12-31'], ['Placa', 'GRU', 'Prêmio'], ['ABC-1D23', 20000, 23.80]] },
    ]);
    const resultado = validar(lidas, [legado]);
    assert.deepEqual(resultado.map(l => [l.status, l.tipo, l.linha]), [['nova', 'principal', 5], ['nova', 'segundo', 5]]);
    const [p, s] = resultado.map(l => l.registro);
    assert.equal(p.sveiculo, 'ABC-1D23');
    assert.equal(p.smodelo, 'Scania');
    assert.equal(p.sinicio, '2026-01-01');
    assert.equal(seguros.total(p), 124406);
    assert.equal(s.sapolice, '001');
    assert.equal(s.sinicio, '2026-01-01');
    assert.equal(s.sgru, 2000000);
    assert.equal(s.spremio, 2380);
    assert.equal(s.sfipe, undefined);
});

test('não duplica placa/apólice na planilha ou no banco, mas aceita outra placa e outro risco', () => {
    const linhas = ler('Seguro principal', [colunas, linha('ABC1D23'), linha('XYZ-4567'), linha('XYZ4567')])
        .concat(ler('2º risco', [colunas, linha('ABC1D23')]));
    const atuais = [existente, legado];
    const r = validar(linhas, atuais);
    assert.deepEqual(r.map(l => l.status), ['duplicada','nova','duplicada','nova']);
    assert.equal(r[1].registro.sseguradora, existente.sseguradora);
    assert.equal(existente.spremio, 5000);
    assert.equal(atuais.length, 2);
    assert.ok(validar(linhas, atuais.concat(r.filter(l => l.status === 'nova').map(l => l.registro))).every(l => l.status === 'duplicada'));
});

test('bloqueia placa fora do cadastro, risco ambíguo, valores ruins e dados obrigatórios ausentes', () => {
    const r = validar(ler('Planilha', [colunas.concat('Tipo de seguro'),
        linha('AAA1234').concat('2º risco'), linha('ABC1D23', '-1').concat('Principal'),
        ['ABC1D23', 'Seguradora Á', '', '31/02/2026', '', '', '', '', 'Principal'],
        linha('ABC1D23').concat('Seguro principal / 2º risco'), linha('XYZ4567').concat('Principal')
    ]));
    assert.deepEqual(r.map(l => l.status), ['invalida','invalida','invalida','invalida','nova']);
    assert.match(r[0].erros.join(' '), /Placa não cadastrada/);
    assert.match(r[1].erros.join(' '), /iof: valor inválido/);
    assert.match(r[2].erros.join(' '), /número da apólice: não informado.*início da vigência: valor inválido.*fim da vigência: não informado/);
    assert.match(r[3].erros.join(' '), /Tipo de seguro não identificado/);
});

test('lê o arquivo selecionado no navegador e preserva zeros da apólice formatada', async () => {
    const bytes = new ArrayBuffer(8);
    const dados = [colunas, linha('ABC1D23')];
    dados[1][2] = 1;
    const planilha = { '!ref': 'A4:H5', '4:2': { w: '001' } };
    const leitor = {
        read(buffer, opcoes) {
            assert.equal(buffer, bytes);
            assert.equal(opcoes.type, 'array');
            return { SheetNames: ['Seguro principal'], Sheets: { 'Seguro principal': planilha } };
        },
        utils: {
            decode_range: () => ({ s: { r: 3, c: 0 }, e: { r: 4, c: 7 } }),
            sheet_to_json: () => dados,
            encode_cell: ({ r, c }) => `${r}:${c}`,
        },
    };
    const r = await importador.lerArquivo({ name: 'FROTA.xlsx', size: 8, arrayBuffer: async () => bytes }, leitor);
    assert.equal(r[0].linha, 5);
    assert.equal(validar(r)[0].registro.sapolice, '001');
});

function ambiente(gravar) {
    let opcoes;
    const db = { seguros: [{ ...legado }], veiculos: [...cadastro] };
    const campos = new Map();
    const host = {
        addEventListener() {}, querySelectorAll: () => [],
        set innerHTML(html) {
            for (const [, id] of html.matchAll(/id="(fmSeg_\w+)"/g)) campos.set(id, {
                value: '', parentElement: {}, selectedOptions: [], add() {}, reset() {}, addEventListener() {},
            });
        },
    };
    const window = { fmModuloCarregado: () => true, addEventListener() {}, FMImportarSeguros: {
        ...importador, montar(o) { opcoes = o; },
    } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../seguros-frota.js'), 'utf8'), {
        window, db, auth: { currentUser: {} }, document: { readyState: 'loading', addEventListener() {},
            getElementById: id => id === 'fmApolices' ? host : campos.get(id),
        },
        Option: function (label, value) { Object.assign(this, { label, value, dataset: {} }); },
        fmPrepararRegistro: (mod, r) => ({ ...r, _rid: `${mod}-${r.sveiculo}` }), salvarNuvem: gravar,
    });
    window.FMSegurosFrota.render();
    return { db, opcoes };
}

test('confirma só após revalidar a prévia e chama a gravação compartilhada uma vez para o lote', async () => {
    const envios = [];
    const { db, opcoes } = ambiente(async (mods, { aoEstado }) => {
        envios.push([...mods]);
        aoEstado('confirmado');
        return true;
    });
    const linhas = ler('Seguro principal', [colunas, linha('ABC1D23'), linha('XYZ4567'), linha('AAA1234')]);
    const revisao = JSON.stringify(validar(linhas).filter(l => l.status === 'nova'));
    db.seguros.push(existente);
    assert.equal((await opcoes.gravar(linhas, revisao, () => {})).status, 'mudou');
    assert.equal(envios.length, 0);
    const novaRevisao = JSON.stringify(validar(linhas, db.seguros).filter(l => l.status === 'nova'));
    assert.equal((await opcoes.gravar(linhas, novaRevisao, () => {})).status, 'confirmado');
    assert.deepEqual(envios, [['seguros']]);
    assert.equal(db.seguros[2].sveiculo, 'XYZ4567');
    assert.deepEqual(db.seguros.slice(0, 2), [legado, existente]);
});

test('falha de gravação não anuncia sucesso e o lote pendente não é inserido novamente', async () => {
    const { db, opcoes } = ambiente(async (_, { aoEstado }) => { aoEstado('enviando'); aoEstado('erro'); return false; });
    const linhas = ler('Seguro principal', [colunas, linha('ABC1D23')]);
    const revisao = JSON.stringify(validar(linhas).filter(l => l.status === 'nova'));
    const estados = [];
    assert.equal((await opcoes.gravar(linhas, revisao, s => estados.push(s))).status, 'erro');
    assert.deepEqual(estados, ['enviando','erro']);
    assert.equal((await opcoes.gravar(linhas, revisao, () => {})).status, 'mudou');
    assert.equal(db.seguros.length, 2);
    assert.deepEqual(db.seguros[0], legado);
});
