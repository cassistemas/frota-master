const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');

test('Cadastro de Terceiros mantém as 19 colunas e escapa a observação', () => {
    const fonte = ler('paginacao.js');
    const inicio = fonte.indexOf("if(modulo === 'terceiros'){");
    const fim = fonte.indexOf('if(modulo==="saidaVeiculos")', inicio);
    assert.ok(inicio >= 0 && fim > inicio);
    const terceiro = { tercidade: 'Curitiba', terobs: '<teste> & "texto"', terfrete: 'R$ 50,00' };
    const lista = {};
    vm.runInNewContext(fonte.slice(inicio, fim), {
        modulo: 'terceiros', db: { terceiros: [terceiro] }, window: {},
        document: { getElementById: id => id === 'listaTerceiros' ? lista : null },
        getTerceirosFiltrados: () => [terceiro],
        getDadosPaginadosCustom: dados => dados,
        fmSeletorStatusManual: () => 'Ativo', renderPaginacao() {}
    });
    const celulas = lista.innerHTML.match(/<td\b[^>]*>[\s\S]*?<\/td>/g);
    assert.equal(celulas.length, 19);
    assert.match(celulas[14], /Curitiba/);
    assert.match(celulas[15], /&lt;teste&gt; &amp; &quot;texto&quot;/);
    assert.match(celulas[16], /R\$ 50,00/);
    assert.match(celulas[17], /Ativo/);
    assert.match(celulas[18], /editar\('terceiros',0\)/);
    assert.match(celulas[18], /deletar\('terceiros',0\)/);
});

function ambiente() {
    const eventos = {};
    const quadros = new Map();
    let id = 0;
    const lista = {
        isConnected: true, scrollWidth: 1600, clientWidth: 800, scrollLeft: 100,
        getClientRects: () => [1],
        getBoundingClientRect: () => ({ left: 0, right: 800, top: 100, bottom: 400 }),
        contains: alvo => alvo === lista
    };
    const document = {
        hidden: false,
        addEventListener: (tipo, fn) => { eventos[tipo] = fn; }
    };
    const window = {
        innerWidth: 1000, innerHeight: 700,
        requestAnimationFrame: fn => { quadros.set(++id, fn); return id; },
        cancelAnimationFrame: chave => quadros.delete(chave),
        addEventListener: (tipo, fn) => { eventos[tipo] = fn; }
    };
    vm.runInNewContext(ler('terceiros-rolagem.js'), { document, window });
    function apontar(x, controle = false, pointerType = 'mouse') {
        const target = { closest: seletor => seletor === '#terceiros .tabela-terceiros' ? lista : controle ? {} : null };
        eventos.pointermove({ target, clientX: x, clientY: 200, pointerType, buttons: 0 });
    }
    function quadro() {
        const entrada = quadros.entries().next().value;
        if (entrada) { quadros.delete(entrada[0]); entrada[1](16); }
    }
    return { eventos, lista, apontar, quadro, quadros };
}

test('Rola nas duas bordas e para ao voltar ao centro', () => {
    const a = ambiente();
    a.apontar(795); a.quadro();
    assert.ok(a.lista.scrollLeft > 100);
    a.apontar(400);
    assert.equal(a.quadros.size, 0);
    const antes = a.lista.scrollLeft;
    a.apontar(5); a.quadro();
    assert.ok(a.lista.scrollLeft < antes);
    a.eventos.blur();
    assert.equal(a.quadros.size, 0);
});

test('Não rola em controles, por toque ou quando a tabela cabe na tela', () => {
    const a = ambiente();
    a.apontar(795, true);
    assert.equal(a.quadros.size, 0);
    a.apontar(795, false, 'touch');
    assert.equal(a.quadros.size, 0);
    a.lista.scrollWidth = a.lista.clientWidth;
    a.apontar(795);
    assert.equal(a.quadros.size, 0);
});
