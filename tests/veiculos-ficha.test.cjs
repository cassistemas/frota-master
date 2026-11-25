const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ler = nome => fs.readFileSync(path.join(__dirname, '..', nome), 'utf8');
const html = ler('index.html');

function elemento() {
    return {
        children: [],
        style: {},
        value: '',
        append(...nos) { this.children.push(...nos); },
        appendChild(no) { this.append(no); },
        replaceChildren(fragmento) { this.children = [...fragmento.children]; }
    };
}

function montar() {
    const alvo = Object.freeze({
        vplaca: 'XYZ0A16', vmodelo: '<modelo>', vtipo: 'Truck', vmotorista: 'Ana',
        vkminicial: 0, vkm: 750, vpbt: 25000, vtara: 12000, vpliquido: 13000,
        vm3: 0, vmedidas: '', vstatus: 'Indisponível'
    });
    const veiculos = Object.freeze([...Array.from({ length: 15 }, (_, i) => ({ vplaca: `OUT${i}` })), alvo]);
    const els = new Map();
    const get = id => {
        if (!els.has(id)) els.set(id, elemento());
        return els.get(id);
    };
    const dialogo = get('fichaVeiculo');
    dialogo.showModal = () => { dialogo.open = true; };
    dialogo.addEventListener = (tipo, cb) => { assert.equal(tipo, 'close'); dialogo.aoFechar = cb; };
    const ctx = vm.createContext({
        document: { getElementById: get, createElement: elemento, createDocumentFragment: elemento, addEventListener() {} },
        db: { veiculos },
        fmKmTotalVeiculo: v => (v.vkm || 0) - (v.vkminicial || 0),
        fmSeletorStatusVeiculo: v => v.vstatus || 'Ativo',
        addEventListener() {}
    });
    ctx.window = ctx;
    vm.runInContext(ler('veiculos.js'), ctx);
    vm.runInContext(ler('paginacao.js'), ctx);
    const fonteFiltros = html.match(/<script>\s*\/\* ===== FILTROS AVANÇADOS[\s\S]*?<\/script>/)[0];
    vm.runInContext(fonteFiltros.replace(/^<script>|<\/script>$/g, ''), ctx);
    return { ctx, get, dialogo };
}

function indiceDaLinha(get) {
    const botoes = [...get('listaVeiculos').innerHTML.matchAll(/onclick="abrirFichaVeiculo\((\d+), this\)"/g)];
    assert.equal(botoes.length, 1);
    return Number(botoes[0][1]);
}

function conferirFicha({ ctx, get, dialogo }, indice) {
    let foco = false;
    ctx.abrirFichaVeiculo(indice, { isConnected: true, focus() { foco = true; } });
    assert.equal(dialogo.open, true);
    assert.equal(get('fichaVeiculoTitulo').textContent, 'Ficha do veículo · XYZ0A16');
    assert.deepEqual(Object.fromEntries(get('fichaVeiculoDados').children.map(item => item.children.map(no => no.textContent))), {
        Placa: 'XYZ0A16', Modelo: '<modelo>', 'Tipo de veículo': 'Truck', Motorista: 'Ana',
        Situação: 'Indisponível', 'KM inicial': '0 km', 'KM atual': '750 km', 'KM total': '750 km',
        PBT: '25.000 kg', Tara: '12.000 kg', 'Peso líquido': '13.000 kg', Capacidade: '0 m³', Medidas: 'Não informado'
    });
    dialogo.aoFechar();
    assert.equal(foco, true);
}

test('abre a ficha do veículo da segunda página pelo índice original do cadastro', () => {
    const app = montar();
    app.ctx.irUltimaPagina('veiculos');
    conferirFicha(app, indiceDaLinha(app.get));
});

test('o olho continua abrindo o veículo correto quando a lista é filtrada', () => {
    const app = montar();
    app.get('fvPlaca').value = 'XYZ0A16';
    app.ctx.aplicarFiltrosModulo('veiculos');
    conferirFicha(app, indiceDaLinha(app.get));
});
