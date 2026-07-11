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

function irPrimeiraPagina(modulo){

    PAGINACAO.paginas[modulo]=1;

    renderModulo(modulo);

}

function irUltimaPagina(modulo){

    let total;

    if(modulo==="multas"){

        total=getMultasFiltradas().length;

    }else{

        total=db[modulo]?.length || 0;

    }

    PAGINACAO.paginas[modulo]=Math.max(
        1,
        Math.ceil(total/PAGINACAO.itensPorPagina)
    );

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
    const indicacao = document.getElementById('filtroMuIndicacao')?.value || '';
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
    !indicacao &&
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
        (!indicacao ||
 String(mu.muindicacao ?? "Não").trim().toUpperCase() ===
 String(indicacao).trim().toUpperCase())
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

function renderPaginacao(modulo, containerId){

    const total=db[modulo].length;

    const totalPaginas=Math.max(
        1,
        Math.ceil(total/PAGINACAO.itensPorPagina)
    );

    const pagina=obterPagina(modulo);

    const container=document.getElementById(containerId);

    if(!container) return;

    container.innerHTML=`

<div class="paginacao-global">

<button
${pagina===1?'disabled':''}
onclick="irPrimeiraPagina('${modulo}')">

<< Primeira

</button>

<button
${pagina===1?'disabled':''}
onclick="mudarPagina('${modulo}',-1)">

< Anterior

</button>

<div class="pagina-info">

Página ${pagina} de ${totalPaginas}

</div>

<button
${pagina===totalPaginas?'disabled':''}
onclick="mudarPagina('${modulo}',1)">

Próxima >

</button>

<button
${pagina===totalPaginas?'disabled':''}
onclick="irUltimaPagina('${modulo}')">

Última >>

</button>

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
 'filtroMuIndicacao',
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

function getSaidaVeiculosFiltrados() {
    if (!db.saidaVeiculos) return [];

    let dados = [...db.saidaVeiculos];

    // Captura dos filtros
    const reserva = document.getElementById("filtroSVReserva")?.value.toLowerCase().trim() || "";
    const veiculo = document.getElementById("filtroSVVeiculo")?.value.toLowerCase().trim() || "";
    const motorista = document.getElementById("filtroSVMotorista")?.value.toLowerCase().trim() || "";
    const dataIni = document.getElementById("filtroSVDataIni")?.value || "";
    const dataFim = document.getElementById("filtroSVDataFim")?.value || "";

    return dados.filter(s => {
        // Normaliza os valores do registro para comparação (garantindo que não quebre se estiver vazio)
        const svReserva = String(s.svnumeroreserva || "").toLowerCase().trim();
        const svVeiculo = String(s.svveiculo || "").toLowerCase().trim();
        const svMotorista = String(s.svmotorista || "").toLowerCase().trim();

        return (
            (!reserva || svReserva.includes(reserva)) &&
            (!veiculo || svVeiculo === veiculo) &&
            (!motorista || svMotorista.includes(motorista)) &&
            (!dataIni || s.svdataSaida >= dataIni) &&
            (!dataFim || s.svdataSaida <= dataFim)
        );
    });
}

function aplicarFiltroSaidaVeiculos(){

    PAGINACAO.paginas["saidaVeiculos"]=1;

    renderModulo("saidaVeiculos");

}

function limparFiltroSaidaVeiculos(){

    [

    "filtroSVReserva",

    "filtroSVVeiculo",

    "filtroSVMotorista",

    "filtroSVDataIni",

    "filtroSVDataFim"

    ].forEach(id=>{

        const el=document.getElementById(id);

        if(el) el.value="";

    });

    renderModulo("saidaVeiculos");

}

function veiculoEmUso(
    veiculo,
    dataSaida,
    horaSaida,
    dataChegada,
    horaChegada,
    ignorarIndex = -1
){

    if(!db.saidaVeiculos) return false;

    const inicioNovo = new Date(`${dataSaida}T${horaSaida}`);
    const fimNovo    = new Date(`${dataChegada}T${horaChegada}`);

    return db.saidaVeiculos.some((s, i) => {

        if(i === ignorarIndex) return false;

        if(s.svveiculo !== veiculo) return false;

        // ignora reservas canceladas/finalizadas se desejar
        if(s.svreserva !== "Reservado") return false;

        const inicioExistente = new Date(
            `${s.svdataSaida}T${s.svhoraSaida}`
        );

        const fimExistente = new Date(
            `${s.svdataChegada}T${s.svhoraChegada}`
        );

        // verifica sobreposição dos períodos
        return (
            inicioNovo < fimExistente &&
            fimNovo > inicioExistente
        );

    });

}

function totalVeiculosEmViagem(){

    if(!db.saidaVeiculos) return 0;

    return db.saidaVeiculos.filter(s =>

        s.svstatus === "Em Viagem"

    ).length;

}

function renderModulo(modulo){

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
<td>${f.fnome || ''}</td>
<td>${f.ffantasia || ''}</td>
<td>${f.fresp || ''}</td>
<td>${f.fcnpj || ''}</td>
<td>${f.ftel || ''}</td>
<td>${f.femail || ''}</td>
<td>${f.fcidade || ''}</td>
<td>${f.fuf || ''}</td>

<td class="text-nowrap">
    <button class="btn-edit"
        onclick="editar('fornecedores',${realIndex})">
        ✎
    </button>

    <button class="btn-del"
        onclick="deletar('fornecedores',${realIndex})">
        ✕
    </button>
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

if(modulo=="motoristas"){

    renderMotoristas();

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

if(modulo === 'terceiros'){

const dados = db.terceiros;

document.getElementById('listaTerceiros').innerHTML =

dados.map(t=>{

const idx = db.terceiros.indexOf(t);

return `
<tr>

<td>${t.ternome}</td>
<td>${t.terempresa}</td>
<td>${t.tertipoveiculo}</td>
<td>${t.terplaca}</td>
<td>${t.tercarreta || '--'}</td>
<td>${t.terano || '--'}</td>
<td>${t.tertelefone}</td>

<td>
<span class="badge ${
t.terstatus === 'Ativo'
? 'bg-success'
: 'bg-danger'
}">
${t.terstatus}
</span>
</td>

<td>

<button class="btn-edit"
onclick="editar('terceiros',${idx})">
✎
</button>

<button class="btn-del"
onclick="deletar('terceiros',${idx})">
✕
</button>

</td>

</tr>
`;

}).join('');

renderPaginacao(
'terceiros',
'paginacaoTerceiros'
);

}

if(modulo==="saidaVeiculos"){

    carregarVeiculosSelect("svveiculo");
    carregarVeiculosSelect("filtroSVVeiculo");

    const dados = getSaidaVeiculosFiltrados();

    document.getElementById("listaSaidaVeiculos").innerHTML =

    getDadosPaginadosCustom(
        dados,
        "saidaVeiculos"
    )

    .map((s)=>{

        const real = db.saidaVeiculos.indexOf(s);

        // STATUS MANUAL
        const status = s.svstatus || "Em Viagem";

        return `
        <tr>

            <td>

                ${s.svnumeroreserva || "--"}

                <br>

                <span class="badge ${
                    s.svreserva === "Reservado"
                        ? "bg-danger"
                        : "bg-success"
                }">

                    ${s.svreserva}

                </span>

            </td>

            <td>

                ${s.svveiculo}

                ${
                    status === "Em Viagem"
                    ? '<span class="badge bg-danger ms-2">EM VIAGEM</span>'
                    : ''
                }

            </td>

            <td>

                ${s.svmotorista || "--"}

            </td>

            <td>

                ${formatarDataBR(s.svdataSaida)}

                <br>

                ${s.svhoraSaida || "--"}

            </td>

            <td>

                ${
                    s.svdataChegada
                    ? formatarDataBR(s.svdataChegada)
                    : "--"
                }

                <br>

                ${s.svhoraChegada || "--"}

            </td>

            <td>

                ${s.svdestino || "--"}

            </td>

            <td>

                <span class="badge ${
                    status === "Finalizado"
                        ? "bg-success"
                        : status === "Em Viagem"
                        ? "bg-danger"
                        : "bg-secondary"
                }">

                    ${status}

                </span>

            </td>

           <td>

    ${
        usuarioLogado.tipo === "admin" ||
        s.criadoPor === usuarioLogado.usuario
        ?
        `
        <button
            class="btn-edit"
            onclick="editar('saidaVeiculos',${real})">
            ✎
        </button>
        `
        : ""
    }

    ${
        usuarioLogado.tipo === "admin"
        ?
        `
        <button
            class="btn-del"
            onclick="deletar('saidaVeiculos',${real})">
            ✕
        </button>
        `
        : ""
    }

</td>
        </tr>

        `;

    })

    .join("");

    renderPaginacaoCustom(
        dados,
        "saidaVeiculos",
        "paginacaoSaidaVeiculos"
    );

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
            <td>${mu.muinfracao || '--'}</td>
            <td><b>${mu.muait || mu.ait || '---'}</b></td>
            <td>${mu.murenainf || '--'}</td>
            <td>${formatarDataBR(mu.mudata || mu.data)}</td>
            <td>${formatarDataBR(mu.muvenc || mu.vencimento)}</td>
            <td><b>${mu.muvalor || mu.valor || '--'}</b></td>
            <td>
    <span class="badge ${corStatusMulta(mu.mustatus)}">
        ${mu.mustatus}
    </span>
</td>
<td>
    <span class="badge ${
        (mu.muindicacao || "Não") === "Sim"
            ? "bg-success"
            : "bg-secondary"
    }">
        ${mu.muindicacao || "Não"}
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

function renderPaginacaoCustom(lista, modulo, containerId){

    const total = lista.length;

    const totalPaginas = Math.max(
        1,
        Math.ceil(total / PAGINACAO.itensPorPagina)
    );

    const pagina = PAGINACAO.paginas[modulo] || 1;

    const container = document.getElementById(containerId);

    if(!container) return;

    container.innerHTML = `

<div class="paginacao-global">

    <button
        ${pagina === 1 ? "disabled" : ""}
        onclick="
            PAGINACAO.paginas['${modulo}']=1;
            renderModulo('${modulo}');
        ">
        << Primeira
    </button>

    <button
        ${pagina === 1 ? "disabled" : ""}
        onclick="mudarPagina('${modulo}',-1)">
        < Anterior
    </button>

    <div class="pagina-info">
        Página ${pagina} de ${totalPaginas}
    </div>

    <button
        ${pagina === totalPaginas ? "disabled" : ""}
        onclick="mudarPagina('${modulo}',1)">
        Próxima >
    </button>

    <button
        ${pagina === totalPaginas ? "disabled" : ""}
        onclick="
            PAGINACAO.paginas['${modulo}']=${totalPaginas};
            renderModulo('${modulo}');
        ">
        Última >>
    </button>

</div>

`;

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

function getTerceirosFiltrados(){

let dados = [...db.terceiros];

const motorista =
document.getElementById(
'filtroTerMotorista'
)?.value.toLowerCase() || '';

const empresa =
document.getElementById(
'filtroTerEmpresa'
)?.value.toLowerCase() || '';

const placa =
document.getElementById(
'filtroTerPlaca'
)?.value.toLowerCase() || '';

const status =
document.getElementById(
'filtroTerStatus'
)?.value || '';

return dados.filter(t => {

return (

(!motorista ||
(t.ternome || '')
.toLowerCase()
.includes(motorista))

&&

(!empresa ||
(t.terempresa || '')
.toLowerCase()
.includes(empresa))

&&

(!placa ||
(t.terplaca || '')
.toLowerCase()
.includes(placa))

&&

(!status ||
t.terstatus === status)

);

});

}

function aplicarFiltroTerceiros(){

PAGINACAO.paginas['terceiros'] = 1;

renderModulo('terceiros');

}

function limparFiltroTerceiros(){

[
'filtroTerMotorista',
'filtroTerEmpresa',
'filtroTerPlaca',
'filtroTerStatus'
].forEach(id=>{

const el =
document.getElementById(id);

if(el) el.value='';

});

renderModulo('terceiros');

}



