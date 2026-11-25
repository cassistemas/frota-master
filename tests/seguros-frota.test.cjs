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

test('abrir Seguros usa a atualização do módulo dedicado', () => {
    const paginacao = fs.readFileSync(path.join(__dirname, '..', 'paginacao.js'), 'utf8');
    assert.match(paginacao, /if \(modulo === 'seguros'\) \{\s*window\.FMSegurosFrota\?\.render\(\);/);
});

test('a chegada dos veículos alimenta o seletor aberto sem mexer no formulário ou no histórico', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'seguros-frota.js'), 'utf8');
    const gancho = html.match(/^\s*if\(modulo === 'veiculos' && window\.fmModuloVisivel\('seguros'\)\) window\.FMSegurosFrota\?\.atualizarPlacas\(\);$/m);
    assert.ok(gancho);
    const vm = require('node:vm');
    const select = { value: '', innerHTML: '' };
    const modelo = { value: 'Modelo corrigido manualmente' };
    const historico = [{ sveiculo: 'ABC1D23', sseguradora: 'Seguro anterior' }];
    const db = { veiculos: [], seguros: historico };
    let carregado = false;
    let visivel = true;
    const window = {
        addEventListener() {},
        fmModuloCarregado: () => carregado,
        fmModuloVisivel: id => id === 'seguros' && visivel,
    };
    const ctx = vm.createContext({ window, db, modulo: 'veiculos', document: {
        readyState: 'loading', addEventListener() {},
        getElementById: id => ({ fmSeg_sveiculo: select, fmSeg_smodelo: modelo })[id],
    } });
    vm.runInContext(fonte, ctx);
    window.FMSegurosFrota.atualizarPlacas();
    assert.match(select.innerHTML, /Aguardando o cadastro de veículos/);

    select.value = 'ABC1D23';
    window.FMSegurosFrota.atualizarPlacas();
    assert.match(select.innerHTML, /registro histórico/);
    db.veiculos = [{ vplaca: 'ABC-1D23', vmodelo: 'Scania' }, { vplaca: 'XYZ4J56', vmodelo: 'Volvo' }];
    carregado = true;
    visivel = false;
    vm.runInContext(gancho[0], ctx);
    assert.doesNotMatch(select.innerHTML, /Volvo/);
    visivel = true;
    vm.runInContext(gancho[0], ctx);
    assert.match(select.innerHTML, /ABC-1D23 · Scania/);
    assert.match(select.innerHTML, /XYZ4J56 · Volvo/);
    assert.doesNotMatch(select.innerHTML, /registro histórico/);
    assert.equal(select.value, 'ABC-1D23');
    assert.equal(modelo.value, 'Modelo corrigido manualmente');
    assert.equal(db.seguros, historico);
    assert.deepEqual(db.seguros, [{ sveiculo: 'ABC1D23', sseguradora: 'Seguro anterior' }]);
});

test('o Excel de Seguros não usa classe ou acionador de exportação legada', () => {
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'seguros-frota.js'), 'utf8');
    const botao = fonte.match(/<button[^>]*\bid="fmSeg_exportar"[^>]*>/)?.[0];
    assert.ok(botao);
    assert.doesNotMatch(botao, /\bbtn-excel\b|\bonclick=/);
});

test('as três abas renderizam e as ações do principal e do 2º risco ficam fora da tabela e do Excel', async () => {
    const vm = require('node:vm');
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'seguros-frota.js'), 'utf8');
    const db = { veiculos: [], seguros: [] };
    let carregado = false;
    const campos = new Map();
    let aoClicar, exportado, montagem, foco, exclusao;
    let confirmarExclusao = false;
    const acoes = ['editar', 'excluir'].map(segGerenciar => ({
        dataset: { segGerenciar }, closest() { return this; },
    }));
    const abas = ['principal', 'segundo', 'legado'].map(segAba => ({
        dataset: { segAba }, closest() { return this; }, setAttribute() {},
    }));
    const host = {
        querySelectorAll: () => abas,
        addEventListener(evento, fn) { if (evento === 'click') aoClicar = fn; },
        set innerHTML(html) {
            montagem = html;
            for (const [, id] of html.matchAll(/id="(fmSeg_\w+)"/g)) {
                campos.set(id, {
                    value: '', parentElement: {}, selectedOptions: [], innerHTML: '', eventos: {},
                    get textContent() { return this.innerHTML.replace(/<[^>]*>/g, ''); },
                    set textContent(v) { this.innerHTML = v; },
                    add() {}, addEventListener(n, fn) { this.eventos[n] = fn; },
                    focus() { foco = id; }, querySelectorAll: () => acoes,
                    reset() { campos.get('fmSeg_smodelo').value = ''; },
                });
            }
        },
    };
    const window = {
        addEventListener() {}, fmModuloCarregado: () => carregado,
        async fmExcluirVinculado(modulo, i) {
            exclusao = [modulo, i];
            if (confirmarExclusao) db.seguros.splice(i, 1);
            return confirmarExclusao;
        },
        XLSX: {
            utils: { aoa_to_sheet: dados => { exportado = JSON.parse(JSON.stringify(dados)); return {}; },
                book_new: () => ({}), book_append_sheet() {}, encode_cell: () => 'A1' },
            writeFile() {},
        },
    };
    vm.runInNewContext(fonte, {
        window, db, auth: { currentUser: {} },
        Option: function (label, value) { Object.assign(this, { label, value, dataset: {} }); },
        document: {
            readyState: 'loading', addEventListener() {},
            getElementById: id => id === 'fmApolices' ? host : campos.get(id) || null,
        },
    });

    window.FMSegurosFrota.render();
    const resultado = campos.get('fmSeg_resultado');
    const excel = campos.get('fmSeg_exportar');
    assert.match(resultado.textContent, /Aguardando o carregamento dos seguros/);
    assert.equal(excel.disabled, true);

    carregado = true;
    const importado = { ...base, sfipe: 25000000, sfipePercent: 10000, svidro: 'BÁSICO', splanilha: { layout: { cab: [['PLACA', 'FIPE %', 'VIDRO']] } } };
    db.seguros = [importado, { ...base, stipo: 'segundo', sveiculo: 'XYZ4J56' }, {
        sveiculo: 'HIS1A23', sseguradora: 'Seguradora anterior', svencimento: '2025-12-31',
    }];
    window.FMSegurosFrota.render();
    assert.equal(excel.disabled, false);
    const cabecalhoPrincipal = ['PLACA', '', 'FIPE %', 'FIPE VEÍCULO', 'FIPE CARROCERIA', 'D. MATERIAIS', 'D. CORPORAIS', 'D. MORAIS', 'CARROCERIA', 'VIDROS', 'GUINCHO KM', 'PRÊMIO', 'IOF', 'TOTAL'];
    assert.equal(campos.has('fmSeg_importar'), false);
    assert.equal(campos.has('fmSeg_sano'), false);
    assert.equal(campos.get('fmSeg_dadosApolice').hidden, true);
    assert.equal(campos.get('fmSeg_sfipePercent').parentElement.hidden, false);
    const tabela = resultado.innerHTML.match(/<table\b[^]*?<\/table>/)[0];
    assert.deepEqual([...tabela.matchAll(/<th\s[^>]*>(.*?)<\/th>/g)].map(m => m[1]), cabecalhoPrincipal);
    assert.equal([...tabela.matchAll(/<td>/g)].length, 14);
    assert.match(tabela, /<td>100<\/td>.*<td>BÁSICO<\/td>/);
    assert.doesNotMatch(tabela, /Subtotal|Ações|Apólice|<button/);
    assert.match(montagem, /class="[^\"]*fm-acao-editar" data-seg-gerenciar="editar"/);
    assert.match(montagem, /class="[^\"]*fm-acao-excluir" data-seg-gerenciar="excluir"/);
    const gerenciar = campos.get('fmSeg_gerenciar');
    const registro = campos.get('fmSeg_registro');
    const editor = campos.get('fmSeg_editor');
    const cancelar = campos.get('fmSeg_cancelar');
    assert.equal(gerenciar.hidden, false);
    assert.match(registro.innerHTML, /ABC1D23/);
    assert.doesNotMatch(registro.innerHTML, /XYZ4J56|HIS1A23/);
    assert.ok(acoes.every(b => b.disabled));
    registro.value = '0';
    registro.eventos.change();
    assert.ok(acoes.every(b => !b.disabled));
    aoClicar({ target: acoes[0] });
    assert.equal(editor.open, true);
    assert.equal(cancelar.hidden, false);
    assert.equal(foco, 'fmSeg_sveiculo');
    campos.get('fmSeg_smodelo').value = 'Alteração não salva';
    cancelar.eventos.click();
    assert.equal(editor.open, false);
    assert.equal(cancelar.hidden, true);
    assert.equal(foco, 'fmSeg_registro');
    assert.equal(campos.get('fmSeg_smodelo').value, '');
    assert.equal(registro.value, '0');
    assert.notEqual(importado.smodelo, 'Alteração não salva');
    await aoClicar({ target: acoes[1] });
    assert.deepEqual(exclusao, ['seguros', 0]);
    assert.equal(db.seguros[0], importado);
    excel.eventos.click();
    assert.deepEqual(exportado[0], cabecalhoPrincipal);
    assert.equal(exportado.length, 2);
    assert.equal(exportado[1].length, 14);
    assert.equal(exportado[1][2], 100);
    assert.equal(exportado[1][3], 250000);
    assert.equal(exportado[1][9], 'BÁSICO');
    assert.equal(db.seguros[0], importado);
    assert.equal(db.seguros[0].svidro, 'BÁSICO');

    // Simula a remoção do botão após a montagem, como no limpador de relatórios.
    campos.delete('fmSeg_exportar');
    for (const [i, placa] of ['ABC1D23', 'XYZ4J56', 'HIS1A23'].entries()) {
        resultado.innerHTML = '';
        aoClicar({ target: abas[i] });
        assert.match(abas[i].textContent, /\(1\)$/);
        assert.match(resultado.innerHTML, /<table\b/);
        assert.ok(resultado.innerHTML.includes(`<td>${placa}</td>`));
    }

    aoClicar({ target: abas[0] });
    registro.value = '0';
    registro.eventos.change();
    const filtro = campos.get('fmSeg_fPlaca');
    filtro.value = 'SEM PLACA';
    filtro.eventos.input();
    assert.equal(gerenciar.hidden, true);
    assert.equal(registro.value, '');
    filtro.value = '';
    filtro.eventos.input();
    assert.ok(acoes.every(b => b.disabled));
    registro.value = '0';
    registro.eventos.change();
    confirmarExclusao = true;
    await aoClicar({ target: acoes[1] });
    assert.ok(!db.seguros.includes(importado));
    assert.deepEqual(db.seguros.map(r => r.sveiculo), ['XYZ4J56', 'HIS1A23']);
    assert.equal(gerenciar.hidden, true);

    campos.set('fmSeg_exportar', excel);
    const segundo = db.seguros[0];
    Object.assign(segundo, { smodelo: 'VW DELIVERY', sgru: 150000000, smorais: 20000000, spremio: 50669, siof: 3739 });
    db.detran = [{ dtPlaca: 'XYZ-4J56', dtAnoFab: '2024' }];
    aoClicar({ target: abas[1] });
    const cabecalhoSegundo = ['ITEM', 'ANO', 'MODELO', 'PLACA', '', 'GRU', 'D. MORAIS', 'PRÊMIO', 'IOF', 'TOTAL'];
    const tabelaSegundo = resultado.innerHTML.match(/<table\b[^]*?<\/table>/)[0];
    assert.deepEqual([...tabelaSegundo.matchAll(/<th\s[^>]*>(.*?)<\/th>/g)].map(m => m[1]), cabecalhoSegundo);
    assert.match(tabelaSegundo, /<td>1<\/td><td>2024<\/td><td><\/td><td>XYZ4J56<\/td><td>VW DELIVERY<\/td>/);
    assert.match(tabelaSegundo, /544,08<\/td>/);
    assert.doesNotMatch(resultado.innerHTML, /Subtotal|Apólice|<button|<tfoot/);
    excel.eventos.click();
    assert.deepEqual(exportado, [cabecalhoSegundo, [1, 2024, '', 'XYZ4J56', 'VW DELIVERY', 1500000, 200000, 506.69, 37.39, 544.08]]);
    assert.equal(segundo.sanoFab, undefined);
    assert.equal(gerenciar.hidden, false);
    assert.equal(campos.get('fmSeg_dadosApolice').hidden, true);
    assert.equal(campos.get('fmSeg_sfipePercent').parentElement.hidden, true);
    assert.equal(campos.get('fmSeg_sanoFab').parentElement.hidden, false);
    registro.value = '0';
    registro.eventos.change();
    aoClicar({ target: acoes[0] });
    assert.equal(editor.open, true);
    assert.equal(campos.get('fmSeg_sanoFab').value, '2024');
    assert.equal(campos.get('fmSeg_sanoMod').value, '');
    assert.match(campos.get('fmSeg_total').value, /544,08/);
    campos.get('fmSeg_smodelo').value = 'Não deve salvar';
    cancelar.eventos.click();
    assert.equal(editor.open, false);
    assert.equal(foco, 'fmSeg_registro');
    assert.equal(segundo.smodelo, 'VW DELIVERY');
    confirmarExclusao = false;
    await aoClicar({ target: acoes[1] });
    assert.deepEqual(exclusao, ['seguros', 0]);
    assert.ok(db.seguros.includes(segundo));
    confirmarExclusao = true;
    await aoClicar({ target: acoes[1] });
    assert.deepEqual(db.seguros.map(r => r.sveiculo), ['HIS1A23']);

    db.seguros = [];
    for (const aba of abas) {
        resultado.textContent = '';
        aoClicar({ target: aba });
        assert.match(aba.textContent, /\(0\)$/);
        assert.match(resultado.textContent, /Nenhum registro/);
    }
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
