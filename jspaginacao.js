// ================================
// PAGINAÇÃO GLOBAL - FROTA MASTER
// ================================

const PAGINACAO = {
    tamanhoPagina: 10,
    paginas: {}
};

function iniciarPaginacao(modulo, lista) {
    if (!PAGINACAO.paginas[modulo]) {
        PAGINACAO.paginas[modulo] = 1;
    }

    const paginaAtual = PAGINACAO.paginas[modulo];
    const inicio = (paginaAtual - 1) * PAGINACAO.tamanhoPagina;
    const fim = inicio + PAGINACAO.tamanhoPagina;

    return lista.slice(inicio, fim);
}

function totalPaginas(modulo, lista) {
    return Math.ceil(lista.length / PAGINACAO.tamanhoPagina);
}

function mudarPagina(modulo, direcao, lista) {
    const total = totalPaginas(modulo, lista);

    if (!PAGINACAO.paginas[modulo]) PAGINACAO.paginas[modulo] = 1;

    PAGINACAO.paginas[modulo] += direcao;

    if (PAGINACAO.paginas[modulo] < 1) PAGINACAO.paginas[modulo] = 1;
    if (PAGINACAO.paginas[modulo] > total) PAGINACAO.paginas[modulo] = total;

    renderTudo();
}

function irParaPagina(modulo, numero, lista) {
    const total = totalPaginas(modulo, lista);

    if (numero < 1) numero = 1;
    if (numero > total) numero = total;

    PAGINACAO.paginas[modulo] = numero;

    renderTudo();
}

function renderPaginacao(modulo, lista, containerId) {
    const total = totalPaginas(modulo, lista);
    const paginaAtual = PAGINACAO.paginas[modulo] || 1;

    if (total <= 1) {
        document.getElementById(containerId).innerHTML = "";
        return;
    }

    let html = `<div class="d-flex justify-content-between align-items-center mt-2">`;

    html += `
        <button class="btn btn-sm btn-outline-primary"
        onclick="mudarPagina('${modulo}', -1, db.${modulo})">⬅</button>
    `;

    html += `<div>`;

    for (let i = 1; i <= total; i++) {
        html += `
            <button class="btn btn-sm ${i === paginaAtual ? 'btn-primary' : 'btn-outline-secondary'} me-1"
            onclick="irParaPagina('${modulo}', ${i}, db.${modulo})">${i}</button>
        `;
    }

    html += `</div>`;

    html += `
        <button class="btn btn-sm btn-outline-primary"
        onclick="mudarPagina('${modulo}', 1, db.${modulo})">➡</button>
    `;

    html += `</div>`;

    document.getElementById(containerId).innerHTML = html;
}

// ================================
// INTEGRAÇÃO COM OS MÓDULOS
// ================================

function aplicarPaginacao(modulo, lista, renderFunc, containerId) {
    const paginados = iniciarPaginacao(modulo, lista);
    renderFunc(paginados);
    renderPaginacao(modulo, lista, containerId);
}

// ================================
// EXEMPLO DE USO NO SEU SISTEMA
// ================================

/*
SUBSTITUIR:

db.veiculos.map((v,i)=>{...})

POR:

aplicarPaginacao('veiculos', db.veiculos, (dados)=>{
    document.getElementById('listaVeiculos').innerHTML = dados.map((v,i)=>`...\`).join('');
}, 'paginacaoVeiculos');


E NO HTML ADICIONAR:

<div id="paginacaoVeiculos"></div>

*/
