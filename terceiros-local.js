/* =========================================================
   Terceiros - Estado (UF) e Cidade com carregamento automático
   Fonte das cidades: API IBGE (com cache em localStorage)
   ========================================================= */

const TER_UFS = [
    { sigla: 'AC', nome: 'Acre' },
    { sigla: 'AL', nome: 'Alagoas' },
    { sigla: 'AP', nome: 'Amapá' },
    { sigla: 'AM', nome: 'Amazonas' },
    { sigla: 'BA', nome: 'Bahia' },
    { sigla: 'CE', nome: 'Ceará' },
    { sigla: 'DF', nome: 'Distrito Federal' },
    { sigla: 'ES', nome: 'Espírito Santo' },
    { sigla: 'GO', nome: 'Goiás' },
    { sigla: 'MA', nome: 'Maranhão' },
    { sigla: 'MT', nome: 'Mato Grosso' },
    { sigla: 'MS', nome: 'Mato Grosso do Sul' },
    { sigla: 'MG', nome: 'Minas Gerais' },
    { sigla: 'PA', nome: 'Pará' },
    { sigla: 'PB', nome: 'Paraíba' },
    { sigla: 'PR', nome: 'Paraná' },
    { sigla: 'PE', nome: 'Pernambuco' },
    { sigla: 'PI', nome: 'Piauí' },
    { sigla: 'RJ', nome: 'Rio de Janeiro' },
    { sigla: 'RN', nome: 'Rio Grande do Norte' },
    { sigla: 'RS', nome: 'Rio Grande do Sul' },
    { sigla: 'RO', nome: 'Rondônia' },
    { sigla: 'RR', nome: 'Roraima' },
    { sigla: 'SC', nome: 'Santa Catarina' },
    { sigla: 'SP', nome: 'São Paulo' },
    { sigla: 'SE', nome: 'Sergipe' },
    { sigla: 'TO', nome: 'Tocantins' }
];

function preencherEstadosTer(selectId, labelTodos) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    const atual = sel.value;

    sel.innerHTML = `<option value="">${labelTodos}</option>` +
        TER_UFS.map(uf =>
            `<option value="${uf.sigla}">${uf.sigla} - ${uf.nome}</option>`
        ).join('');

    sel.value = atual;
}

async function buscarCidadesUF(uf) {
    if (!uf) return [];

    const chave = 'FM_CIDADES_' + uf;

    try {
        const cache = localStorage.getItem(chave);
        if (cache) {
            const lista = JSON.parse(cache);
            if (Array.isArray(lista) && lista.length) return lista;
        }
    } catch (e) { /* ignora cache inválido */ }

    try {
        const resp = await fetch(
            `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`
        );
        const dados = await resp.json();
        const lista = (dados || []).map(c => c.nome);

        try { localStorage.setItem(chave, JSON.stringify(lista)); } catch (e) { }

        return lista;
    } catch (e) {
        console.error('Erro ao buscar cidades do IBGE', e);
        return [];
    }
}

async function carregarCidadesTer(estadoId, cidadeId, labelVazio, valorSelecionado) {
    const selEstado = document.getElementById(estadoId);
    const selCidade = document.getElementById(cidadeId);
    if (!selEstado || !selCidade) return;

    const uf = selEstado.value;
    const desejado = valorSelecionado !== undefined
        ? valorSelecionado
        : selCidade.value;

    if (!uf) {
        selCidade.innerHTML = `<option value="">${labelVazio}</option>`;
        selCidade.disabled = true;
        return;
    }

    selCidade.disabled = true;
    selCidade.innerHTML = '<option value="">Carregando cidades...</option>';

    const cidades = await buscarCidadesUF(uf);

    selCidade.innerHTML = `<option value="">${labelVazio}</option>` +
        cidades.map(c => `<option value="${c}">${c}</option>`).join('');

    selCidade.disabled = false;

    if (desejado && cidades.includes(desejado)) {
        selCidade.value = desejado;
    }
}

// Handlers usados no HTML
function onChangeEstadoTer() {
    carregarCidadesTer('terestado', 'tercidade', 'Cidade', '');
}

function onChangeEstadoFiltroTer() {
    carregarCidadesTer('filtroTerEstado', 'filtroTerCidade', 'Todas as Cidades', '')
        .then(() => {
            if (typeof aplicarFiltroTerceiros === 'function') aplicarFiltroTerceiros();
        });
}

document.addEventListener('DOMContentLoaded', () => {
    preencherEstadosTer('terestado', 'Estado');
    preencherEstadosTer('filtroTerEstado', 'Todos os Estados');

    carregarCidadesTer('terestado', 'tercidade', 'Cidade', '');
    carregarCidadesTer('filtroTerEstado', 'filtroTerCidade', 'Todas as Cidades', '');

    // Ao editar um terceiro, garante que a cidade salva apareça selecionada
    const editarOriginal = window.editar;

    if (typeof editarOriginal === 'function') {
        window.editar = function (mod, i) {
            editarOriginal(mod, i);

            if (mod === 'terceiros') {
                const item = (db[mod] || [])[i] || {};
                const selEstado = document.getElementById('terestado');
                if (selEstado) selEstado.value = item.terestado || '';
                carregarCidadesTer('terestado', 'tercidade', 'Cidade', item.tercidade || '');
            }
        };
    }
});

// Preenche Estado/Cidade a partir dos dados do CNPJ
function preencherLocalTerPorCNPJ(uf, municipio) {
    if (!uf) return;

    const selEstado = document.getElementById('terestado');
    if (!selEstado) return;

    if (selEstado.value) return; // não sobrescreve escolha manual

    selEstado.value = String(uf).toUpperCase();

    const nome = (municipio || '')
        .toLowerCase()
        .replace(/(^|\s|')\S/g, c => c.toUpperCase());

    carregarCidadesTer('terestado', 'tercidade', 'Cidade', '').then(() => {
        const selCidade = document.getElementById('tercidade');
        if (!selCidade || !nome) return;

        const opt = Array.from(selCidade.options).find(o =>
            o.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
            nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        );

        if (opt) selCidade.value = opt.value;
    });
}
