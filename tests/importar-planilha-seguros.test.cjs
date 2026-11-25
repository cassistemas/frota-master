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
    const indices = [0, 1, 2];
    const revisao = JSON.stringify(importador.selecionadasValidas(validar(linhas), indices));
    db.seguros.push(existente);
    assert.equal((await opcoes.gravar(linhas, indices, revisao, () => {})).status, 'mudou');
    assert.equal(envios.length, 0);
    const novaRevisao = JSON.stringify(importador.selecionadasValidas(validar(linhas, db.seguros), indices));
    assert.equal((await opcoes.gravar(linhas, indices, novaRevisao, () => {})).status, 'confirmado');
    assert.deepEqual(envios, [['seguros']]);
    assert.equal(db.seguros[2].sveiculo, 'XYZ4567');
    assert.deepEqual(db.seguros.slice(0, 2), [legado, existente]);
});

test('falha de gravação não anuncia sucesso e o lote pendente não é inserido novamente', async () => {
    const { db, opcoes } = ambiente(async (_, { aoEstado }) => { aoEstado('enviando'); aoEstado('erro'); return false; });
    const linhas = ler('Seguro principal', [colunas, linha('ABC1D23')]);
    const revisao = JSON.stringify(validar(linhas));
    const estados = [];
    assert.equal((await opcoes.gravar(linhas, [0], revisao, s => estados.push(s))).status, 'erro');
    assert.deepEqual(estados, ['enviando','erro']);
    assert.equal((await opcoes.gravar(linhas, [0], revisao, () => {})).status, 'mudou');
    assert.equal(db.seguros.length, 2);
    assert.deepEqual(db.seguros[0], legado);
});

test('grava somente a linha selecionada, mesmo quando há outras novas válidas', async () => {
    const { db, opcoes } = ambiente(async (_, { aoEstado }) => { aoEstado('confirmado'); return true; });
    const linhas = ler('Seguro principal', [colunas, linha('ABC1D23'), linha('XYZ4567')]);
    const r = validar(linhas);
    assert.deepEqual(r.map(l => l.status), ['nova', 'nova']);
    assert.equal((await opcoes.gravar(linhas, [], '[]', () => {})).status, 'sem-novos');
    assert.equal((await opcoes.gravar(linhas, [1, 1], JSON.stringify([r[1]]), () => {})).status, 'confirmado');
    assert.equal(db.seguros.length, 2);
    assert.equal(db.seguros[1].sveiculo, 'XYZ4567');
});

test('combina cabeçalhos em duas linhas e lê metadados mesclados sem copiar valores de outra placa', () => {
    const faixa = (r, c, rr, cc) => ({ s: { r, c }, e: { r: rr, c: cc } });
    const linhas = importador.lerAbas([{ nome: 'Cotação 2° risco', primeiraLinha: 4, dados: [
        ['Placa', 'Nº da apólice', 'Companhia seguradora', 'Vigência', '', 'Prêmio líquido', 'IOF', 'Prêmio bruto'],
        ['', '', '', 'Início', 'Fim', '', '', ''],
        ['ABC1D23', '001', 'Seguradora A', '2026-01-01', '2026-12-31', 100, 10, 110],
        ['XYZ4567', '', '', '', '', '', 12, 120],
        ['Totais', '', '', '', '', 100, 22, 230],
    ], mesclas: [faixa(0, 3, 0, 4), faixa(2, 1, 3, 1), faixa(2, 2, 3, 2), faixa(2, 3, 3, 3), faixa(2, 4, 3, 4), faixa(2, 5, 3, 5)] }]);
    const r = validar(linhas);
    assert.deepEqual(r.map(l => [l.status, l.tipo, l.linha]), [['nova','segundo',6], ['nova','segundo',7]]);
    assert.equal(r[0].totalExcel, 11000);
    assert.equal(r[0].avisos.length, 0);
    assert.equal(r[1].registro.sapolice, '001');
    assert.equal(r[1].registro.spremio, null);
    assert.equal(r[1].calculado, 1200);
    assert.match(r[1].avisos.join(' '), /Total do Excel difere/);
});

test('lê vigência em uma célula no cabeçalho ou na tabela e mantém datas explícitas', () => {
    const lidas = ler('Seguro principal', [
        ['Seguradora', 'Seguradora A'], ['Apólice', '001'],
        ['Vigência: de 01/01/2026 até 31/12/2026'], ['Placa', 'Início', 'Prêmio'],
        ['ABC1D23', 46023, 100],
    ]).concat(ler('2º risco', [
        ['Placa', 'Seguradora', 'Apólice', 'Período de vigência', 'Prêmio'],
        ['XYZ4567', 'Seguradora A', '002', '2026-01-01 – 2026-12-31', 120],
        ['XYZ4567', 'Seguradora A', '003', '31/02/2026 a 31/12/2026', 120],
    ]));
    const r = validar(lidas);
    assert.deepEqual(r.map(l => [l.status, l.registro.sinicio, l.registro.svencimento]), [
        ['nova', '2026-01-01', '2026-12-31'], ['nova', '2026-01-01', '2026-12-31'],
        ['invalida', '', '2026-12-31'],
    ]);
});

test('avisa quando a planilha informa uma cobertura que o tipo de seguro não grava', () => {
    const [r] = validar(ler('2º risco', [colunas.concat('FIPE'), linha('ABC1D23').concat(240000)]));
    assert.equal(r.status, 'nova');
    assert.equal(r.registro.sfipe, undefined);
    assert.ok(r.avisos.includes('Este tipo de seguro não grava: FIPE (240000).'));
});

test('mostra prêmio, IOF e coberturas divergentes sem alterar a duplicata cadastrada', () => {
    const salvo = { ...existente, siof: 100, smateriais: 8000 };
    const [r] = validar(ler('Seguro principal', [colunas.concat('RCF - Danos materiais'), linha('ABC1D23').concat(120)]), [salvo]);
    assert.equal(r.status, 'duplicada');
    assert.match(r.avisos.join(' '), /Excel\/Prévia × Sistema.*Danos materiais:.*Pr[eê]mio:.*IOF:/);
    assert.equal(salvo.smateriais, 8000);
});

test('a prévia seleciona todas as páginas e só envia a seleção com as edições salvas', async () => {
    function controle() {
        const eventos = {};
        return {
            innerHTML: '', value: '', textContent: '', focus() {}, querySelector: () => null,
            addEventListener: (tipo, fn) => { eventos[tipo] = fn; },
            emitir: (tipo, e = {}) => eventos[tipo]?.(e),
        };
    }
    const painel = controle(), botao = controle(), ids = new Map();
    botao.setAttribute = () => {};
    painel.querySelector = id => {
        if (!ids.has(id)) ids.set(id, controle());
        return ids.get(id);
    };
    const el = k => painel.querySelector('#fmSeg_' + k);
    const dados = [colunas, ...Array.from({ length: 26 }, (_, i) => {
        const row = linha('ABC1D23');
        row[2] = `A${i}`;
        return row;
    }), linha('XYZ4567', '-1')];
    const original = [['<img src=x onerror=alert(1)>', ''], ['Total geral', 50]];
    const janelaOriginal = { '!ref': 'A4:B5', '!merges': [{ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } }], '4:1': { w: 'R$ 50,00' } };
    const window = { XLSX: { read: () => ({ SheetNames: ['Seguro principal', 'Resumo & totais'],
        Sheets: { 'Seguro principal': {}, 'Resumo & totais': janelaOriginal } }),
        utils: {
            decode_range: () => ({ s: { r: 3, c: 0 }, e: { r: 4, c: 1 } }),
            encode_cell: ({ r, c }) => `${r}:${c}`,
            sheet_to_json: aba => aba === janelaOriginal ? original : dados,
        } } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../importar-planilha-seguros.js'), 'utf8'), { window });
    const gravados = [], salvos = [];
    window.FMImportarSeguros.montar({ painel, botao, seguros, veiculos: () => cadastro, lista: () => salvos,
        podeGravar: () => true, ocupado: () => false, gravar: async (linhas, indices) => {
            gravados.push({ linhas, indices });
            salvos.push(...validar(linhas).filter(l => indices.includes(l.indice)).map(l => l.registro));
            return { status: 'confirmado', quantidade: indices.length };
        },
    });
    const arquivo = el('arquivo'), tabela = el('linhasImportacao'), editor = el('edicaoImportacao');
    arquivo.files = [{ name: 'FROTA.xlsx', size: 8, arrayBuffer: async () => new ArrayBuffer(8) }];
    await arquivo.emitir('change');
    assert.equal(el('abasOriginais').open, true);
    assert.match(el('guiaOriginais').innerHTML, /Resumo &amp; totais/);
    el('guiaOriginais').emitir('click', { target: { closest: () => ({ dataset: { segOriginal: '1' } }) } });
    assert.match(el('gradeOriginal').innerHTML, /scope="row">4<\/th>.*colspan="2">&lt;img/);
    assert.match(el('gradeOriginal').innerHTML, /R\$ 50,00/);
    assert.doesNotMatch(el('gradeOriginal').innerHTML, /<img/);
    assert.match(el('quadrosTotais').innerHTML, /<td>0 de 1<\/td>/);
    assert.equal(el('confirmarImportacao').disabled, true);
    el('marcarImportacao').emitir('click');
    assert.match(el('qtdImportacao').textContent, /^26 de 26/);
    function tabelaEvento(tipo, atributo, dataset, checked) {
        tabela.emitir(tipo, { target: { closest: seletor => seletor === atributo ? { dataset, checked } : null } });
    }
    tabelaEvento('click', '[data-seg-previa]', { segPrevia: 'principal', pagina: '2' });
    assert.match(tabela.innerHTML, /Página 2 de 2/);
    assert.match(tabela.innerHTML, /data-seg-selecionar="25"[^>]+checked/);
    tabelaEvento('change', '[data-seg-selecionar]', { segSelecionar: '25' }, false);
    assert.match(el('qtdImportacao').textContent, /^25 de 26/);
    el('limparImportacao').emitir('click');
    assert.match(el('qtdImportacao').textContent, /^0 de 26/);

    const campos = { stipo: { value: 'principal' }, siof: { value: '8,50', defaultValue: '-1' } };
    editor.querySelectorAll = () => [];
    editor.querySelector = seletor => seletor === 'form' ? { elements: {
        namedItem: k => campos[k] || { value: '', defaultValue: '' },
    } } : seletor === '[name="stipo"]' ? campos.stipo : controle();
    tabelaEvento('click', '[data-seg-editar-previa]', { segEditarPrevia: '26' });
    assert.equal(editor.hidden, false);
    editor.emitir('click', { target: { closest: () => true } });
    assert.equal(editor.hidden, true);
    assert.match(tabela.innerHTML, /iof: valor inválido/);
    tabelaEvento('click', '[data-seg-editar-previa]', { segEditarPrevia: '26' });
    editor.emitir('submit', { preventDefault() {} });
    assert.equal(gravados.length, 0);
    assert.match(tabela.innerHTML, /Editada na prévia/);
    tabelaEvento('change', '[data-seg-selecionar]', { segSelecionar: '26' }, true);
    await el('confirmarImportacao').emitir('click');
    assert.deepEqual(Array.from(gravados[0].indices), [26]);
    assert.equal(gravados[0].linhas[26].dados.siof, '8,50');
    assert.equal(gravados[0].linhas[26].dados.totalExcel, 999999);
    assert.equal(el('conferenciaTotais').open, true);
    assert.match(el('quadrosTotais').innerHTML, /<td>1 de 1<\/td>/);
    el('fecharImportacao').emitir('click');
    assert.equal(el('abasOriginais').hidden, true);
    assert.equal(el('gradeOriginal').innerHTML, '');
    assert.equal(el('conferenciaTotais').hidden, true);
});
