// ==========================
// PAGINAÇÃO GLOBAL
// ==========================

// ==========================
// FORMATAÇÃO DE DATA BR
// ==========================
function formatarDataBR(data) {
    if (!data) return '--';

    // evita erro de fuso horário
    const partes = data.split('-');
    if (partes.length !== 3) return data;

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

const PAGINACAO = {
    paginas: {
        veiculos: 1,
        multas: 1,
        manutencoes: 1
    },
    itensPorPagina: {
        veiculos: 10,
        multas: 10,
        manutencoes: 5
    }
};

function renderPaginacaoControles(modulo, totalItens, containerId){

    let pagina = PAGINACAO.paginas[modulo] || 1;
    let porPagina = PAGINACAO.itensPorPagina[modulo] || 5;

    let totalPaginas = Math.ceil(totalItens / porPagina);

    let html = '';

    for(let i = 1; i <= totalPaginas; i++){
        html += `
            <button class="btn btn-sm ${i === pagina ? 'btn-primary' : 'btn-outline-primary'}"
            onclick="irPagina('${modulo}', ${i})">
            ${i}
            </button>
        `;
    }

    let container = document.getElementById(containerId);
    if(container){
        container.innerHTML = html;
    }
}

function irPagina(modulo, pagina){
    PAGINACAO.paginas[modulo] = pagina;
    renderTudo();
}

function obterPagina(modulo) {
    if (!PAGINACAO.paginas[modulo]) PAGINACAO.paginas[modulo] = 1;
    return PAGINACAO.paginas[modulo];
}

function mudarPagina(modulo, direcao) {
    const total = db[modulo].length;
    const totalPaginas = Math.ceil(total / PAGINACAO.itensPorPagina);

    let paginaAtual = obterPagina(modulo);

    paginaAtual += direcao;

    if (paginaAtual < 1) paginaAtual = 1;
    if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

    PAGINACAO.paginas[modulo] = paginaAtual;

    renderModulo(modulo);
}

function getDadosPaginados(modulo) {
    const pagina = obterPagina(modulo);
    const inicio = (pagina - 1) * PAGINACAO.itensPorPagina;
    const fim = inicio + PAGINACAO.itensPorPagina;

    return db[modulo].slice(inicio, fim);
}

function renderPaginacao(modulo, containerId) {
    const total = db[modulo].length;
    const totalPaginas = Math.ceil(total / PAGINACAO.itensPorPagina);
    const pagina = obterPagina(modulo);

    const container = document.getElementById(containerId);
    if (!container) return;

    if (totalPaginas <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div style="display:flex;justify-content:center;gap:10px;margin-top:10px;">
            <button class="btn btn-sm btn-outline-primary" onclick="mudarPagina('${modulo}', -1)">⬅</button>
            <span>Página ${pagina} de ${totalPaginas}</span>
            <button class="btn btn-sm btn-outline-primary" onclick="mudarPagina('${modulo}', 1)">➡</button>
        </div>
    `;
}

// ==========================
// INTEGRAÇÃO COM RENDER
// ==========================

function renderModulo(modulo) {

    const btnSet = (m,i) => `<td><button class="btn-edit" onclick="editar('${m}',${i})">✎</button><button class="btn-del" onclick="deletar('${m}',${i})">✕</button></td>`;

    if(modulo === 'veiculos'){
        const dados = getDadosPaginados('veiculos');

        document.getElementById('listaVeiculos').innerHTML =
        dados.map((v,i)=>{
            const realIndex = db.veiculos.indexOf(v);
            return `
            <tr>
            <td><b>${v.vplaca}</b></td>
            <td>${v.vmodelo}</td>
            <td>${v.vkm} KM</td>
            <td>${v.vmotorista}</td>
            <td>${v.vtara || '--'} Kg</td>
            <td>${v.vpliquido || '--'} Kg</td>
            <td>${v.vm3 || '--'} m³</td>
            ${btnSet('veiculos', realIndex)}
            </tr>
            `;
        }).join('');

        renderPaginacao('veiculos','paginacaoVeiculos');
    }

    if(modulo === 'multas'){
        const dados = getDadosPaginados('multas');

        document.getElementById('listaMultas').innerHTML =
        dados.map((mu,i)=>{
            const realIndex = db.multas.indexOf(mu);
            return `
            <tr>
            <td>${mu.muveiculo}</td>
            <td>${mu.mumotorista}</td>
            <td><b>${mu.muait || '---'}</b></td>
            <td>${formatarDataBR(mu.mudata)}</td>
            <td>${formatarDataBR(mu.muvenc)}</td>
            <td><b>${mu.muvalor}</b></td>
            <td><span class="badge ${mu.mustatus=='Pago'?'bg-success':'bg-danger'}">${mu.mustatus}</span></td>
            <td>
            <button class="btn-edit" onclick="editar('multas',${realIndex})">✎</button>
            <button class="btn-del" onclick="deletar('multas',${realIndex})">✕</button>
            </td>
            </tr>
            `;
        }).join('');

        renderPaginacao('multas','paginacaoMultas');
    }
}

// ==========================
// HOOK GLOBAL
// ==========================

function ativarPaginacao(){
    renderModulo('veiculos');
    renderModulo('multas');
    renderModulo('manutencoes');
}
