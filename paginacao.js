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
    itensPorPagina: 15,

    paginas: {},
};

function obterPagina(modulo) {
    const total = db[modulo]?.length || 0;
    const totalPaginas = Math.ceil(total / PAGINACAO.itensPorPagina);

    // Se ainda não existe página definida, começa pela última
    if (!PAGINACAO.paginas[modulo]) {
        PAGINACAO.paginas[modulo] = totalPaginas > 0 ? totalPaginas : 1;
    }

    return PAGINACAO.paginas[modulo];
}

function obterPaginaCustom(modulo, totalItens) {

    const totalPaginas = Math.ceil(totalItens / PAGINACAO.itensPorPagina);

    if (!PAGINACAO.paginas[modulo]) {
        PAGINACAO.paginas[modulo] = totalPaginas > 0 ? totalPaginas : 1;
    }

    if (PAGINACAO.paginas[modulo] > totalPaginas) {
        PAGINACAO.paginas[modulo] = totalPaginas || 1;
    }

    return PAGINACAO.paginas[modulo];
}

function mudarPagina(modulo, direcao) {
    let total;

if (modulo === 'multas') {

    // 🔥 se filtros ainda não existem → usa base normal
    if (!document.getElementById('filtroMuVeiculo')) {
        total = db.multas.length;
    } else {
        total = getMultasFiltradas().length;
    }

} else {
    total = db[modulo].length;
}

const totalPaginas = Math.ceil(total / PAGINACAO.itensPorPagina);

let paginaAtual = obterPaginaCustom(modulo, total);

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

function getDadosPaginadosCustom(lista, modulo) {

    const pagina = obterPaginaCustom(modulo, lista.length);
    const inicio = (pagina - 1) * PAGINACAO.itensPorPagina;
    const fim = inicio + PAGINACAO.itensPorPagina;

    return lista.slice(inicio, fim);
}

function irParaUltimaPagina(modulo){
    let total;

if (modulo === 'multas') {
    total = getMultasFiltradas().length;
} else {
    total = db[modulo]?.length || 0;
}
    const totalPaginas = Math.ceil(total / PAGINACAO.itensPorPagina);

    PAGINACAO.paginas[modulo] = totalPaginas > 0 ? totalPaginas : 1;
}

function salvarCombustivelCustom() {
    const campos = ['cveiculo', 'cdata', 'ctipo', 'clitros', 'cvalorlitro','ckm', 'cposto'];
    const idxCampo = 'c_idx';
    
    // 1. Salva os dados no banco/localStorage
    salvar('combustivel', campos, idxCampo);
    
    // 2. CORREÇÃO: Força o sistema a ir para a última página para mostrar o novo registro
    irParaUltimaPagina('combustivel');
    
    // 3. CORREÇÃO: Atualiza a tabela na tela imediatamente
    renderModulo('combustivel');
    calcularMediaConsumo();
    
    // 4. Limpa o formulário
    limparForm('combustivel', campos, idxCampo);
}

function calcularMediaConsumo(filtros = {}) {

    // 👉 só calcula se for combustível ou vazio
if (filtros.tipo && filtros.tipo !== 'combustivel') {
    document.getElementById('mediaKM').innerText = '--';
    return;
}

    if (!db.combustivel || db.combustivel.length < 2) {
        document.getElementById('mediaKM').innerText = '--';
        return;
    }

    let dados = [...db.combustivel];

    // ✅ FILTRO POR VEÍCULO
    if (filtros.placa) {
        dados = dados.filter(c => c.cveiculo === filtros.placa);
    }

    // ✅ FILTRO POR DATA
    if (filtros.dataIni) {
        dados = dados.filter(c => c.cdata >= filtros.dataIni);
    }

    if (filtros.dataFim) {
        dados = dados.filter(c => c.cdata <= filtros.dataFim);
    }

    // Ordenar por data
    dados.sort((a, b) => new Date(a.cdata) - new Date(b.cdata));

    let totalKM = 0;
    let totalLitros = 0;

    for (let i = 1; i < dados.length; i++) {

        const atual = dados[i];
        const anterior = dados[i - 1];

        const kmAtual = parseFloat(atual.ckm) || 0;
        const kmAnterior = parseFloat(anterior.ckm) || 0;
        const litros = parseFloat(String(atual.clitros).replace(',', '.')) || 0;

        if (kmAtual > kmAnterior && litros > 0) {
            totalKM += (kmAtual - kmAnterior);
            totalLitros += litros;
        }
    }

    if (totalLitros === 0) {
        document.getElementById('mediaKM').innerText = '--';
        return;
    }

    const media = totalKM / totalLitros;

    document.getElementById('mediaKM').innerText =
        media.toFixed(2) + ' km/L';
}

function aplicarFiltroDashboard() {

    const filtros = {
        placa: document.getElementById('filtroPlaca')?.value || '',
        dataIni: document.getElementById('filtroDataIni')?.value || '',
        dataFim: document.getElementById('filtroDataFim')?.value || '',
        tipo: document.getElementById('filtroTipo')?.value || ''
    };

    calcularMediaConsumo(filtros);
}

function limparFiltroDashboard() {
    document.getElementById('filtroPlaca').value = '';
    document.getElementById('filtroDataIni').value = '';
    document.getElementById('filtroDataFim').value = '';

    // Recalcula a média geral sem filtros
    calcularMediaConsumo();
}

function getMultasFiltradas() {

    // 🔥 se DOM ainda não carregou → não filtra
if (!document.getElementById('filtroMuVeiculo')) {
    return db.multas || [];
}

    if (!db.multas || db.multas.length === 0) return [];

    let dados = [...db.multas];

    const veiculo = document.getElementById('filtroMuVeiculo')?.value || '';
    const motorista = document.getElementById('filtroMuMotorista')?.value || '';
    const infracao = document.getElementById('filtroMuInfracao')?.value || '';
    const status = document.getElementById('filtroMuStatus')?.value || '';
    const dataIni = document.getElementById('filtroMuDataIni')?.value || '';
    const dataFim = document.getElementById('filtroMuDataFim')?.value || '';
    const valorMin = document.getElementById('filtroMuValorMin')?.value || '';
    const valorMax = document.getElementById('filtroMuValorMax')?.value || '';
    const ait = document.getElementById('filtroMuAIT')?.value?.toLowerCase() || '';
    const renainf = document.getElementById('filtroMuRenainf')?.value?.toLowerCase() || '';

if (
    !veiculo &&
    !motorista &&
    !infracao &&
    !status &&
    !dataIni &&
    !dataFim &&
    !valorMin &&
    !valorMax &&
    !ait &&
    !renainf
) {
    return dados;
}

   return dados.filter(mu => {

    return (
       (!veiculo || 
    String(mu.muveiculo || mu.veiculo || '')
    .toLowerCase()
    .trim() === veiculo.toLowerCase().trim()
) &&
(!motorista || 
    String(mu.mumotorista || mu.motorista || '')
    .toLowerCase()
    .trim() === motorista.toLowerCase().trim()
) &&
(!infracao ||
    String(mu.muinfracao || mu.infracao || '')
    .toLowerCase()
    .trim() === infracao.toLowerCase().trim()
) &&
        (!status || mu.mustatus == status)
        &&
        (!dataIni || (mu.mudata || mu.data) >= dataIni)
        &&
        (!dataFim || (mu.mudata || mu.data) <= dataFim)
        &&
        (!valorMin || moedaParaFloat(mu.muvalor || mu.valor) >= parseFloat(valorMin))
        &&
        (!valorMax || moedaParaFloat(mu.muvalor || mu.valor) <= parseFloat(valorMax))
        &&
        (!ait || (mu.muait || '').toLowerCase().includes(ait))
        &&
       (!renainf || (mu.murenainf || '').toLowerCase().includes(renainf))

    );

});
}

function getManutencoesFiltradas(){

    if(!db.manutencoes) return [];

    let dados = [...db.manutencoes];

    const veiculo =
    document.getElementById('filtroManVeiculo')?.value || '';

    const fornecedor =
    document.getElementById('filtroManFornecedor')?.value || '';

    const dataIni =
    document.getElementById('filtroManDataIni')?.value || '';

    const dataFim =
    document.getElementById('filtroManDataFim')?.value || '';

    const kmMin =
    document.getElementById('filtroManKmMin')?.value || '';

    const kmMax =
    document.getElementById('filtroManKmMax')?.value || '';

    const nf =
    document.getElementById('filtroManNF')?.value?.toLowerCase() || '';

    const servico =
    document.getElementById('filtroManServico')?.value?.toLowerCase() || '';

    return dados.filter(m => {

        return (

            (!veiculo ||
                String(m.mveiculo || '')
                .trim()
                .toLowerCase() ===
                String(veiculo || '')
                .trim()
                .toLowerCase()
            )

            &&

            (!fornecedor ||
                String(m.mfornecedor || '')
                .trim()
                .toLowerCase() ===
                String(fornecedor || '')
                .trim()
                .toLowerCase()
            )

            &&

            (!dataIni || m.mdata >= dataIni)

            &&

            (!dataFim || m.mdata <= dataFim)

            &&

            (!kmMin ||
                parseFloat(m.mkm || 0) >= parseFloat(kmMin)
            )

            &&

            (!kmMax ||
                parseFloat(m.mkm || 0) <= parseFloat(kmMax)
            )

            &&

            (!nf ||
                (m.mnf || '')
                .toLowerCase()
                .includes(nf)
            )

            &&

            (!servico ||
                (m.mservico || '')
                .toLowerCase()
                .includes(servico)
            )

        );

    });

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

function renderPaginacaoCustom(lista, modulo, containerId) {

    const total = lista.length;
    const totalPaginas = Math.ceil(total / PAGINACAO.itensPorPagina);
    const pagina = obterPaginaCustom(modulo, total);

    const container = document.getElementById(containerId);
    if (!container) return;

    if (totalPaginas <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div style="display:flex;justify-content:center;gap:10px;margin-top:10px;">
            <button onclick="mudarPagina('${modulo}', -1)">⬅</button>
            <span>Página ${pagina} de ${totalPaginas}</span>
            <button onclick="mudarPagina('${modulo}', 1)">➡</button>
        </div>
    `;
}

function aplicarFiltroMultas(){
    PAGINACAO.paginas['multas'] = 1;
    renderModulo('multas');
}

function limparFiltroMultas(){
[
 'filtroMuVeiculo',
 'filtroMuMotorista',
 'filtroMuInfracao',
 'filtroMuStatus',
 'filtroMuDataIni',
 'filtroMuDataFim',
 'filtroMuAIT',
 'filtroMuRenainf',
 'filtroMuValorMin',
 'filtroMuValorMax'
].forEach(id => {

        const el = document.getElementById(id);

        if(el) el.value = '';

    });

    // 🔥 volta para última página
    irParaUltimaPagina('multas');

    // 🔥 renderiza novamente
    renderModulo('multas');
}

// ==========================
// INTEGRAÇÃO COM RENDER
// ==========================

function corStatusMulta(status) {
    switch (status) {
        case 'Pago':
        case 'Enviadas RH':
            return 'bg-success';

        case 'Recurso':
        case 'Em Recurso':
            return 'bg-warning text-dark';

        default:
            return 'bg-danger';
    }
}

function aplicarFiltroManutencoes(){

    paginaAnteriorManutencao =
        PAGINACAO.paginas['manutencoes'] || 1;

    PAGINACAO.paginas['manutencoes'] = 1;

    renderModulo('manutencoes');
}

function getDiariasFiltradas(){

    if(!db.diarias) return [];

    let dados = [...db.diarias];

    const motorista =
    document.getElementById('filtroDiMotorista')?.value || '';

    const status =
    document.getElementById('filtroDiStatus')?.value || '';

    const dataIni =
    document.getElementById('filtroDiDataIni')?.value || '';

    const dataFim =
    document.getElementById('filtroDiDataFim')?.value || '';

    const valorMin =
    document.getElementById('filtroDiValorMin')?.value || '';

    const valorMax =
    document.getElementById('filtroDiValorMax')?.value || '';

    return dados.filter(d => {

        const valor =
        moedaParaFloat(d.divalor || 0);

        const nomeDiaria =
    String(d.dimotorista || '')
    .trim()
    .toLowerCase();

const nomeFiltro =
    String(motorista || '')
    .trim()
    .toLowerCase();

return (

    (!motorista ||
    nomeDiaria === nomeFiltro)

    &&

    (!status ||
    (d.distatus || 'Pendente') === status)

    &&

    (!dataIni ||
    d.didata >= dataIni)

    &&

    (!dataFim ||
    d.didata <= dataFim)

    &&

    (!valorMin ||
    valor >= parseFloat(valorMin))

    &&

    (!valorMax ||
    valor <= parseFloat(valorMax))

);

    });

}

function aplicarFiltroDiarias(){

    PAGINACAO.paginas['diarias'] = 1;

    renderModulo('diarias');
}

function limparFiltroDiarias(){

    [
        'filtroDiMotorista',
         'filtroDiStatus',
        'filtroDiDataIni',
        'filtroDiDataFim',
        'filtroDiValorMin',
        'filtroDiValorMax'
    ].forEach(id => {

        const el = document.getElementById(id);

        if(el) el.value = '';

    });

    renderModulo('diarias');
}

function renderModulo(modulo) {

if (!PAGINACAO.paginas[modulo]) {
    PAGINACAO.paginas[modulo] = 1;
}

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

    if(modulo === 'diarias'){

    if(
        document.getElementById('dimotorista')
        .options.length <= 1
    ){
        carregarMotoristasSelect('dimotorista');
    }

    if(
        document.getElementById('filtroDiMotorista')
        .options.length <= 1
    ){
        carregarMotoristasSelect('filtroDiMotorista');
    }

const filtrados = getDiariasFiltradas();

document.getElementById('totalDiariasQtd').innerText =
filtrados.length;

const totalDiarias = filtrados.reduce((acc,d)=>{

    return acc + moedaParaFloat(d.divalor || 0);

},0);

document.getElementById('totalDiariasValor').innerText =

floatParaMoeda(totalDiarias);

const dados = getDadosPaginadosCustom(
    filtrados,
    'diarias'
);

    document.getElementById('listaDiarias').innerHTML =

    dados.map(d => {

        const realIndex = db.diarias.indexOf(d);

        return `
       <tr>

    <td>${d.dimotorista || '--'}</td>

    <td>${formatarDataBR(d.didata)}</td>

    <td>${d.divalor || '--'}</td>

    <td>${d.dicoleta || '--'}</td>

<td>
    <span class="badge ${
        d.distatus === 'Pago'
            ? 'bg-success'
            : d.distatus === 'Enviadas RH'
            ? 'bg-warning text-dark'
            : 'bg-danger'
    }">
        ${d.distatus || 'Pendente'}
    </span>
</td>

<td>${d.diobs || '--'}</td>

<td>

                <button class="btn-edit"
                onclick="editar('diarias',${realIndex})">
                ✎
                </button>

                <button class="btn-del"
                onclick="deletar('diarias',${realIndex})">
                ✕
                </button>

            </td>

        </tr>
        `;

    }).join('');

    renderPaginacaoCustom(
    filtrados,
    'diarias',
    'paginacaoDiarias'
);
}

    if(modulo === 'fornecedores'){
    const dados = getDadosPaginados('fornecedores');

    document.getElementById('listaFornecedores').innerHTML =
    dados.map((f,i)=>{
        const realIndex = db.fornecedores.indexOf(f);
        return `
        <tr>
        <td>${f.fnome}</td>
        <td>${f.fresp}</td>
        <td>${f.fcnpj}</td>
        <td>${f.ftel}</td>
        <td>
        <button class="btn-edit" onclick="editar('fornecedores',${realIndex})">✎</button>
        <button class="btn-del" onclick="deletar('fornecedores',${realIndex})">✕</button>
        </td>
        </tr>
        `;
    }).join('');

    renderPaginacao('fornecedores','paginacaoFornecedores');
}

    if(modulo === 'manutencoes'){

    const filtrados =
getManutencoesFiltradas();

const dados =
getDadosPaginadosCustom(
    filtrados,
    'manutencoes'
);

const total =
filtrados;

    const totalGasto =
    total.reduce((s,m)=>{

        return s +
        moedaParaFloat(
        m.mvalor || '0'
        );

    },0);

    document.getElementById(
    'totalManutencoesQtd'
    ).innerText =
    total.length;

    document.getElementById(
    'totalManutencoesValor'
    ).innerText =
    floatParaMoeda(totalGasto);

    document.getElementById(
    'ticketMedioManutencao'
    ).innerText =
    floatParaMoeda(
    total.length
    ?
    totalGasto/total.length
    :
    0
    );

    if(total.length){

        const ultima =
        [...total]
        .sort((a,b)=>
        b.mdata.localeCompare(a.mdata)
        )[0];

        document.getElementById(
        'ultimaManutencao'
        ).innerText =
        formatarDataBR(
        ultima.mdata
        );

    }

    document.getElementById(
    'listaManutencao'
    ).innerHTML =

    dados.map(m=>{

        const idx =
        db.manutencoes.indexOf(m);

        return `
        <tr>

        <td>${m.mveiculo}</td>
        <td>${formatarDataBR(m.mdata)}</td>
        <td>${m.mkm}</td>
        <td>${m.mvalor}</td>
        <td>${m.mnf||''}</td>
        <td>${m.mfornecedor}</td>
        <td>${m.mservico}</td>

        <td>

        <button
        class="btn-edit"
        onclick="editar('manutencoes',${idx})">
        ✎
        </button>

        <button
        class="btn-del"
        onclick="deletar('manutencoes',${idx})">
        ✕
        </button>

        </td>

        </tr>
        `;

    }).join('');

    renderPaginacaoCustom(
    filtrados,
    'manutencoes',
    'paginacaoManutencoes'
);
}

if(modulo === 'combustivel'){
        const dados = getDadosPaginados('combustivel');

        document.getElementById('listaCombustivel').innerHTML =
dados.map(c => {

    const litros = parseFloat(String(c.clitros).replace(',', '.')) || 0;
    const valor = parseFloat(String(c.cvalorlitro).replace(',', '.')) || 0;

    const total = litros * valor;

    const valorFormatado = valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });

    const totalFormatado = total.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });

    const realIndex = db.combustivel.indexOf(c);

    return `
    <tr>
        <td>${c.cveiculo}</td>
        <td>${formatarDataBR(c.cdata)}</td>
        <td>${c.ctipo}</td>

        <td>${c.ckm || '--'}</td>

        <td>${litros}L</td>

        <td>${valorFormatado}</td>

        <td><b>${totalFormatado}</b></td>

        <td>--</td>

        <td>${c.cposto || '--'}</td>

        <td>
            <button class="btn-edit" onclick="editar('combustivel', ${realIndex})">✎</button>
            <button class="btn-del" onclick="deletar('combustivel', ${realIndex})">✕</button>
        </td>
    </tr>
    `;
}).join('');

        renderPaginacao('combustivel', 'paginacaoCombustivel');
    }

if(modulo === 'motoristas'){

    const dados = getDadosPaginados('motoristas');

    document.getElementById('listaMotoristas').innerHTML =
    dados.map((m,i)=>{

        const realIndex = db.motoristas.indexOf(m);

        return `
        <tr>
            <td>${m.motNome || '--'}</td>
            <td>${m.motCpf || '--'}</td>
            <td>${m.motCnh || '--'}</td>
            <td>${m.motTel || '--'}</td>
            <td>
                ${m.motInicio || '--'} às ${m.motFim || '--'}
            </td>
            <td>
                <button class="btn-edit" onclick="editar('motoristas',${realIndex})">✎</button>

                <button class="btn-del" onclick="deletar('motoristas',${realIndex})">✕</button>
            </td>
        </tr>
        `;
    }).join('');

    renderPaginacao('motoristas','paginacaoMotoristas');
}

if(modulo === 'pneus'){

    carregarPneuSelects();

    const dados = getDadosPaginados('pneus');

    document.getElementById('listaPneus').innerHTML =

    dados.map(p=>{

        const realIndex = db.pneus.indexOf(p);

        return `
        <tr>

        <td>${p.pnumero}</td>
        <td>${p.pmarca}</td>
        <td>${p.pveiculo}</td>
        <td>${p.pkmrodado}</td>
        <td>${p.pstatus}</td>
        <td>${p.pfornecedor}</td>

        <td>

        <button class="btn-edit"
        onclick="editar('pneus',${realIndex})">
        ✎
        </button>

        <button class="btn-del"
        onclick="deletar('pneus',${realIndex})">
        ✕
        </button>

        </td>

        </tr>
        `;

    }).join('');

    renderPaginacao('pneus','paginacaoPneus');

}

    if(modulo === 'multas'){

    // só carrega se ainda estiver vazio
    if(document.getElementById('filtroMuVeiculo').options.length <= 1){
        carregarVeiculosSelect('filtroMuVeiculo');
    }

    if(document.getElementById('filtroMuMotorista').options.length <= 1){
        carregarMotoristasSelect('filtroMuMotorista');
    }

    const filtrados = getMultasFiltradas();

// TOTAL DE MULTAS
document.getElementById('quantidadeMultas').innerText =
filtrados.length;

// TOTAL EM VALOR
const total = calcularTotalMultas(filtrados);

document.getElementById('totalMultas').innerText =
'Total: ' + floatParaMoeda(total);

const dados = getDadosPaginadosCustom(filtrados, 'multas');

        document.getElementById('listaMultas').innerHTML =
        dados.map((mu,i)=>{
            const realIndex = db.multas.indexOf(mu);
            return `
            <tr>
            <td>${mu.muveiculo || mu.veiculo || '--'}</td>
            <td>${mu.mumotorista || mu.motorista || '--'}</td>
            <td><b>${mu.muait || mu.ait || '---'}</b></td>
            <td>${mu.murenainf || '--'}</td>
            <td>${formatarDataBR(mu.mudata || mu.data)}</td>
            <td>${formatarDataBR(mu.muvenc || mu.vencimento)}</td>
            <td><b>${mu.muvalor || mu.valor || '--'}</b></td>
            <td>${mu.muinfracao || '--'}</td>
            <td>
    <span class="badge ${corStatusMulta(mu.mustatus)}">
        ${mu.mustatus}
    </span>
</td>
            <td>${mu.muobs || '--'}</td>
            <td>
            <button class="btn-edit" onclick="editar('multas',${realIndex})">✎</button>
            <button class="btn-del" onclick="deletar('multas',${realIndex})">✕</button>
            </td>
            </tr>
            `;
        }).join('');

        renderPaginacaoCustom(filtrados, 'multas','paginacaoMultas');
    }
}

// ==========================
// HOOK GLOBAL
// ==========================

function ativarPaginacao(){

    irParaUltimaPagina('veiculos');
    irParaUltimaPagina('multas');
    irParaUltimaPagina('fornecedores');
    irParaUltimaPagina('manutencoes');
    irParaUltimaPagina('combustivel');
    irParaUltimaPagina('motoristas');
    irParaUltimaPagina('pneus');

    renderModulo('veiculos');
    renderModulo('motoristas');
    renderModulo('multas');
    renderModulo('fornecedores');
    renderModulo('manutencoes');
    renderModulo('combustivel');
    renderModulo('pneus');
}

document.addEventListener('DOMContentLoaded', () => {

    console.log('Eventos do filtro ativados');

    const placa = document.getElementById('filtroPlaca');
    const dataIni = document.getElementById('filtroDataIni');
    const dataFim = document.getElementById('filtroDataFim');

    placa?.addEventListener('change', aplicarFiltroDashboard);
    dataIni?.addEventListener('change', aplicarFiltroDashboard);
    dataFim?.addEventListener('change', aplicarFiltroDashboard);

});

// 🔥 Atualiza automaticamente ao mudar filtros
['filtroPlaca','filtroDataIni','filtroDataFim','filtroTipo']
.forEach(id => {
    document.getElementById(id)?.addEventListener('change', aplicarFiltroDashboard);
});

// 🔄 Calcula média ao carregar sistema
window.addEventListener('load', () => {
    calcularMediaConsumo();
});

function carregarMotoristasSelect(id){

    const select =
        document.getElementById(id);

    if(!select) return;

    select.innerHTML =
        '<option value="">Motorista</option>';

    if(
        !db ||
        !Array.isArray(db.motoristas)
    ) return;

    db.motoristas.forEach(m => {

        console.log(m);

        // pega qualquer campo possível
        const nome =
            m.motNome ||
            m.nome ||
            m.motorista ||
            m.mnome ||
            '';

        if(nome.trim() === '') return;

        select.innerHTML += `
            <option value="${nome}">
                ${nome}
            </option>
        `;
    });
}

function getDadosPaginadosCustom(lista, modulo){

    const pagina =
    PAGINACAO.paginas[modulo] || 1;

    const inicio =
    (pagina - 1) *
    PAGINACAO.itensPorPagina;

    return lista.slice(
        inicio,
        inicio +
        PAGINACAO.itensPorPagina
    );

}

function limparFiltroManutencoes(){

    [
    'filtroManVeiculo',
    'filtroManFornecedor',
    'filtroManDataIni',
    'filtroManDataFim',
    'filtroManValorMin',
    'filtroManValorMax',
    'filtroManKmMin',
    'filtroManKmMax',
    'filtroManNF',
    'filtroManServico'
    ].forEach(id => {

        const el = document.getElementById(id);

        if(el) el.value = '';

    });

    PAGINACAO.paginas['manutencoes'] =
        paginaAnteriorManutencao || 1;

    renderModulo('manutencoes');
}

function renderPaginacaoCustom(
    lista,
    modulo,
    containerId
){

    const totalPaginas =
    Math.ceil(
        lista.length /
        PAGINACAO.itensPorPagina
    );

    const container =
    document.getElementById(containerId);

    if(!container) return;

    if(totalPaginas <= 1){

        container.innerHTML = '';

        return;

    }

    let html = '';

    for(let i=1;i<=totalPaginas;i++){

        html += `
        <button
        class="btn btn-sm ${
            i === PAGINACAO.paginas[modulo]
            ? 'btn-primary'
            : 'btn-outline-primary'
        }"
        onclick="
        PAGINACAO.paginas['${modulo}']=${i};
        renderModulo('${modulo}');
        ">
        ${i}
        </button>
        `;

    }

    container.innerHTML = html;

}

function carregarVeiculosSelect(id){

    const select =
    document.getElementById(id);

    if(!select) return;

    const atual = select.value;

    select.innerHTML =
    '<option value="">Veículos</option>';

    (db.veiculos || []).forEach(v=>{

        const valor =
        v.placa || v.nome || v.veiculo;

        select.innerHTML += `
        <option value="${valor}">
            ${valor}
        </option>
        `;

    });

    select.value = atual;

}

function carregarFornecedoresSelect(id){

    const select =
    document.getElementById(id);

    if(!select) return;

    const atual = select.value;

    select.innerHTML =
    '<option value="">Todos Fornecedores</option>';

    (db.fornecedores || []).forEach(f=>{

        const valor = f.fnome;

        select.innerHTML += `
        <option value="${valor}">
            ${valor}
        </option>
        `;

    });

    select.value = atual;

}

function calcularTotalMultas(lista) {
    let total = 0;

    lista.forEach(mu => {
        const valor = moedaParaFloat(mu.muvalor || mu.valor);
        total += valor;
    });

    return total;
}
