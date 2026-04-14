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
    const status = document.getElementById('filtroMuStatus')?.value || '';
    const dataIni = document.getElementById('filtroMuDataIni')?.value || '';
    const dataFim = document.getElementById('filtroMuDataFim')?.value || '';
    const valorMin = document.getElementById('filtroMuValorMin')?.value || '';
    const valorMax = document.getElementById('filtroMuValorMax')?.value || '';
    const ait = document.getElementById('filtroMuAIT')?.value?.toLowerCase() || '';

if (
    !veiculo &&
    !motorista &&
    !status &&
    !dataIni &&
    !dataFim &&
    !valorMin &&
    !valorMax &&
    !ait
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
        'filtroMuVeiculo','filtroMuMotorista','filtroMuStatus',
        'filtroMuDataIni','filtroMuDataFim','filtroMuAIT',
        'filtroMuValorMin','filtroMuValorMax'
    ].forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.value = '';
    });

    aplicarFiltroMultas();
}

// ==========================
// INTEGRAÇÃO COM RENDER
// ==========================

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
    const dados = getDadosPaginados('manutencoes');

    document.getElementById('listaManutencao').innerHTML =
    dados.map((m,i)=>{
        const realIndex = db.manutencoes.indexOf(m);
        return `
        <tr>
        <td>${m.mveiculo}</td>
        <td>${formatarDataBR(m.mdata)}</td>
        <td>${m.mkm}</td>
        <td>${m.mvalor}</td>
        <td>${m.mfornecedor}</td>
        <td>${m.mservico}</td>
        <td>
        <button class="btn-edit" onclick="editar('manutencoes',${realIndex})">✎</button>
        <button class="btn-del" onclick="deletar('manutencoes',${realIndex})">✕</button>
        </td>
        </tr>
        `;
    }).join('');

    renderPaginacao('manutencoes','paginacaoManutencoes');
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

    if(modulo === 'multas'){
        carregarVeiculosSelect('filtroMuVeiculo');
        carregarMotoristasSelect('filtroMuMotorista');

        const filtrados = getMultasFiltradas();
        const dados = getDadosPaginadosCustom(filtrados, 'multas');

        document.getElementById('listaMultas').innerHTML =
        dados.map((mu,i)=>{
            const realIndex = db.multas.indexOf(mu);
            return `
            <tr>
            <td>${mu.muveiculo || mu.veiculo || '--'}</td>
            <td>${mu.mumotorista || mu.motorista || '--'}</td>
            <td><b>${mu.muait || mu.ait || '---'}</b></td>
            <td>${formatarDataBR(mu.mudata || mu.data)}</td>
            <td>${formatarDataBR(mu.muvenc || mu.vencimento)}</td>
            <td><b>${mu.muvalor || mu.valor || '--'}</b></td>
            <td><span class="badge ${mu.mustatus=='Pago'?'bg-success':'bg-danger'}">${mu.mustatus}</span></td>
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

    renderModulo('veiculos');
    renderModulo('multas');
    renderModulo('fornecedores');
    renderModulo('manutencoes');
    renderModulo('combustivel');
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

    const select = document.getElementById(id);
    if(!select) return;

    select.innerHTML = '<option value="">Motorista</option>';

    if (!db.motoristas) return;

    db.motoristas.forEach(m => {

        const nome =
            m.motNome ||   // 🔥 PRINCIPAL (seu caso)
            m.mnome ||
            m.nome ||
            m.motorista;

        if(!nome) return;

        select.innerHTML += `<option value="${nome}">${nome}</option>`;
    });
}

function carregarVeiculosSelect(id){

    const select = document.getElementById(id);
    if(!select) return;

    select.innerHTML = '<option value="">Veículo</option>';

    if (!db.veiculos) return;

    db.veiculos.forEach(v => {
        select.innerHTML += `<option value="${v.vplaca}">${v.vplaca}</option>`;
    });
}
