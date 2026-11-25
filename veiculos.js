/* Ficha somente para consulta. O cadastro e as gravações ficam no index.html. */
(function () {
    'use strict';

    function valorFicha(valor, unidade) {
        if (valor == null || String(valor).trim() === '') return 'Não informado';
        const texto = typeof valor === 'number' ? valor.toLocaleString('pt-BR') : String(valor);
        return unidade ? `${texto} ${unidade}` : texto;
    }

    window.botaoFichaVeiculo = function (indice) {
        return `<button class="btn-ficha-veiculo" type="button" title="Ver ficha do veículo" aria-label="Ver ficha do veículo" aria-haspopup="dialog" aria-controls="fichaVeiculo" onclick="abrirFichaVeiculo(${indice}, this)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><span>Ver ficha</span></button>`;
    };

    window.abrirFichaVeiculo = function (indice, botao) {
        const veiculo = typeof db === 'undefined' ? null : db?.veiculos?.[indice];
        const dialogo = document.getElementById('fichaVeiculo');
        if (!veiculo || !dialogo || dialogo.open) return;

        const campos = [
            ['Placa', veiculo.vplaca],
            ['Modelo', veiculo.vmodelo],
            ['Tipo de veículo', veiculo.vtipo],
            ['Motorista', veiculo.vmotorista],
            ['Situação', veiculo.vstatus || 'Ativo'],
            ['KM inicial', veiculo.vkminicial, 'km'],
            ['KM atual', veiculo.vkm, 'km'],
            ['KM total', typeof fmKmTotalVeiculo === 'function' ? fmKmTotalVeiculo(veiculo) : veiculo.vkmtotal, 'km'],
            ['PBT', veiculo.vpbt, 'kg'],
            ['Tara', veiculo.vtara, 'kg'],
            ['Peso líquido', veiculo.vpliquido, 'kg'],
            ['Capacidade', veiculo.vm3, 'm³'],
            ['Medidas', veiculo.vmedidas]
        ];
        const lista = document.createDocumentFragment();
        campos.forEach(([rotulo, valor, unidade]) => {
            const item = document.createElement('div');
            const titulo = document.createElement('dt');
            const detalhe = document.createElement('dd');
            titulo.textContent = rotulo;
            detalhe.textContent = valorFicha(valor, unidade);
            item.append(titulo, detalhe);
            lista.appendChild(item);
        });
        document.getElementById('fichaVeiculoTitulo').textContent = veiculo.vplaca
            ? `Ficha do veículo · ${veiculo.vplaca}` : 'Ficha do veículo';
        document.getElementById('fichaVeiculoDados').replaceChildren(lista);
        dialogo.showModal();
        dialogo.addEventListener('close', () => {
            if (botao?.isConnected) botao.focus();
        }, { once: true });
    };
})();
