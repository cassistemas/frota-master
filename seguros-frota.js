(function (root) {
    'use strict';
    const tipos = { principal: 'Seguro principal', segundo: '2º risco', legado: 'Histórico' };
    const comum = [['spremio','Prêmio'], ['siof','IOF'], ['total','Total']];
    const colunas = {
        principal: [['sveiculo','PLACA'], ['smodelo',''], ['sfipePercent','FIPE %'], ['sfipe','FIPE VEÍCULO'], ['sfipeCarroceria','FIPE CARROCERIA'], ['smateriais','D. MATERIAIS'], ['scorporais','D. CORPORAIS'], ['smorais','D. MORAIS'], ['scarroceria','CARROCERIA'], ['svidro','VIDROS'], ['sguincho','GUINCHO KM'], ['spremio','PRÊMIO'], ['siof','IOF'], ['total','TOTAL']],
        segundo: [['item','ITEM'], ['sanoFab','ANO'], ['sanoMod','MODELO'], ['sveiculo','PLACA'], ['smodelo',''], ['sgru','GRU'], ['smorais','D. MORAIS'], ['spremio','PRÊMIO'], ['siof','IOF'], ['total','TOTAL']],
        legado: [['sveiculo','Placa'], ['smodelo','Modelo'], ['sseguradora','Seguradora'], ['svencimento','Vencimento'], ['prazo','Alerta']]
    };
    const dinheiro = new Set(['sfipe','sfipeCarroceria','smateriais','scorporais','smorais','scarroceria','sgru','spremio','siof','total']);
    const camposAno = { sanoFab: 'dtAnoFab', sanoMod: 'dtAnoMod' };
    const camposVeiculo = [['sanoFab','Ano de fabricação'], ['sanoMod','Ano-modelo'],
        ...colunas.principal.slice(1, -3).map(([k, l]) => [k, k === 'smodelo' ? 'Modelo' : l]), ['sgru','GRU'], ...comum];
    const anoValido = v => /^[1-9][0-9]{3}$/.test(v);
    const limitesTexto = { smodelo: 120, svidro: 80, sguincho: 80 };
    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const texto = v => String(v == null ? '' : v).trim();
    const chave = v => texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
    const placa = v => chave(v).replace(/[^a-z0-9]/g, '');
    const placaIgual = (a, b) => placa(a) !== '' && placa(a) === placa(b);
    const esc = v => texto(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const tipo = r => r.stipo === 'principal' || r.stipo === 'segundo' ? r.stipo : 'legado';
    const apolice = r => JSON.stringify([tipo(r), chave(r.sseguradora), chave(r.sapolice), r.sinicio || '', r.svencimento || '']);
    const camposApolice = ['sseguradora', 'scorretora', 'sapolice', 'sinicio', 'svencimento'];
    const camposHistorico = ['sseguradora', 'svencimento'];
    const hoje = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
    const dataBR = v => /^\d{4}-\d\d-\d\d$/.test(v || '') ? v.split('-').reverse().join('/') : '';
    function centavos(v) {
        let s = texto(v).replace(/^R\$\s*/, '');
        if (!s) return null;
        if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '');
        const p = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(s);
        if (!p) return NaN;
        const n = Number(p[1]) * 100 + Number((p[2] || '').padEnd(2, '0'));
        return Number.isSafeInteger(n) && n <= 999999999999 ? n : NaN;
    }
    function total(r) {
        if (r.spremio == null && r.siof == null) return null;
        return (r.spremio || 0) + (r.siof || 0);
    }
    function subtotal(linhas, campo) {
        const valores = linhas.map(r => campo === 'total' ? total(r) : r[campo]).filter(v => v != null);
        return valores.length ? valores.reduce((a,b) => a+b, 0) : null;
    }
    function prazo(v, ref = hoje()) {
        const dias = (Date.parse(v || '') - Date.parse(ref)) / 86400000;
        if (!Number.isFinite(dias)) return ['sem', 'Sem data'];
        if (dias < 0) return ['vencido', 'Vencido'];
        if (dias <= 30) return ['atencao', 'Vence em até 30 dias'];
        return ['vigente', 'Em dia'];
    }
    function agrupar(registros) {
        const grupos = new Map();
        registros.forEach((r, i) => {
            const k = apolice(r);
            if (!grupos.has(k)) grupos.set(k, { cab: r, linhas: [] });
            grupos.get(k).linhas.push({ r, i });
        });
        return [...grupos.values()];
    }
    const api = { centavos, total, subtotal, prazo, apolice, agrupar };
    if (typeof module === 'object' && module.exports) { module.exports = api; return; }
    root.FMSegurosFrota = api;

    const el = id => document.getElementById(id);
    const campo = k => el('fmSeg_' + k);
    const lista = () => typeof db === 'object' && db ? (db.seguros || []) : [];
    const veiculos = () => typeof db === 'object' && db ? (db.veiculos || []) : [];
    const usaFichaPorPlaca = t => t === 'principal' || t === 'segundo';
    const dadosDetran = p => typeof db === 'object' && db && Array.isArray(db.detran)
        ? db.detran.find(x => placaIgual(x.dtPlaca, p)) : null;
    const anoCadastrado = (d, k) => {
        const ano = texto(d?.[camposAno[k]]);
        return anoValido(ano) ? ano : '';
    };
    let aba = 'principal', editando = null, ocupada = false, registrosGerenciar = [], rascunhoApolice = {};
    const op = (value, label) => '<option value="' + esc(value) + '">' + esc(label) + '</option>';
    const ops = obj => Object.entries(obj).map(([v,l]) => op(v,l)).join('');
    const input = (k, label, attrs = '') => '<label><span>'+esc(label)+'</span><input id="fmSeg_'+k+'" class="form-control" '+attrs+'></label>';
    const select = (k, label, options) => '<label>'+esc(label)+'<select id="fmSeg_'+k+'" class="form-select">'+options+'</select></label>';
    function apolicesCadastradas() {
        const t = campo('stipo').value;
        if (!usaFichaPorPlaca(t)) return [];
        return agrupar(lista().filter(r => tipo(r) === t &&
            (texto(r.sapolice) || texto(r.sseguradora)))).map(({ cab, linhas }) => {
            const vigencia = [dataBR(cab.sinicio), dataBR(cab.svencimento)].filter(Boolean).join(' a ');
            return {
                chave: apolice(cab),
                rotulo: [texto(cab.sseguradora), texto(cab.sapolice) && 'Nº ' + texto(cab.sapolice), vigencia].filter(Boolean).join(' · '),
                dados: { ...cab, scorretora: linhas.find(({ r }) => texto(r.scorretora))?.r.scorretora },
            };
        }).sort((a,b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
    }
    function lerApolice() {
        return Object.fromEntries(camposApolice.map(k => [k, texto(campo(k).value)]));
    }
    function preencherApolice(dados) {
        camposApolice.forEach(k => { campo(k).value = texto(dados[k]); });
    }
    function atualizarApolices(atual = campo('apoliceExistente').value) {
        const s = campo('apoliceExistente');
        const opcoes = apolicesCadastradas();
        s.innerHTML = op('', 'Nova apólice') + opcoes.map(p => op(p.chave, p.rotulo)).join('');
        s.value = opcoes.some(p => p.chave === atual) ? atual : '';
    }
    function escolherApolice() {
        if (!campo('sseguradora').readOnly) rascunhoApolice = lerApolice();
        const escolhida = apolicesCadastradas().find(p => p.chave === campo('apoliceExistente').value);
        if (!escolhida) campo('apoliceExistente').value = '';
        preencherApolice(escolhida?.dados || rascunhoApolice);
        ajustarForm();
    }
    const exMoeda = v => v == null ? '—' : moeda.format(v/100);
    function campoValor(k, r, indice) {
        if (k === 'item') return indice + 1;
        if (k in camposAno) return r[k] ?? anoCadastrado(dadosDetran(r.sveiculo), k);
        if (k === 'total') return total(r);
        if (k === 'prazo') return prazo(r.svencimento)[1];
        if (k === 'svidro') return r.svidro ?? (r.svidros == null ? '' : exMoeda(r.svidros));
        return r[k];
    }
    function valorEditavel(k, v) {
        if (dinheiro.has(k)) return v == null ? '' : exMoeda(v);
        if (k === 'sfipePercent' && v != null) return decimal.format(v/100).replace(/,00$/, '');
        return texto(v);
    }
    function tabelaValor(k, r, indice) {
        const v = campoValor(k, r, indice);
        if (k === 'prazo') return alerta(r);
        if (k in camposAno) return esc(v);
        return esc(dinheiro.has(k) ? exMoeda(v) : (k === 'svencimento' ? dataBR(v) : valorEditavel(k, v)) || '—');
    }
    function alerta(r) {
        const [css, rotulo] = prazo(r.svencimento);
        return '<span class="fm-seg-prazo fm-seg-'+css+'">'+rotulo+'</span>';
    }
    function montar() {
        const host = el('fmApolices');
        if (!host || campo('form')) return;
        host.innerHTML = `<details id="fmSeg_editor" class="glass-container fm-seg-editor">
            <summary id="fmSeg_titulo">Cadastrar veículo na apólice</summary>
            <p id="fmSeg_instrucoes">Informe os dados da apólice e os valores por placa. Este cadastro não gera lançamentos financeiros.</p>
            <form id="fmSeg_form" aria-labelledby="fmSeg_titulo" data-nao-limpar>
                <div id="fmSeg_dadosApolice" class="fm-seg-grid fm-seg-dados-apolice">
                    ${select('stipo','Tipo de seguro',ops(tipos))}
                    ${select('apoliceExistente','Apólice cadastrada',op('', 'Nova apólice'))}
                    ${input('sseguradora','Seguradora','maxlength="120"')}
                    ${input('scorretora','Corretora','maxlength="120"')}
                    ${input('sapolice','Nº da apólice','maxlength="120"')}
                    ${input('sinicio','Início da vigência','type="date"')}
                    ${input('svencimento','Fim da vigência','type="date"')}
                    <p id="fmSeg_ajudaApolice" class="fm-seg-ajuda-apolice mb-0" hidden>Para alterar os dados da apólice neste registro, selecione Nova apólice.</p>
                </div>
                <h5 id="fmSeg_coberturas">Veículo e coberturas</h5>
                <div class="fm-seg-grid">
                    ${select('sveiculo','Placa',op('','Selecione'))}
                    ${input('smodelo','Modelo',`maxlength="${limitesTexto.smodelo}"`)}
                    ${camposVeiculo.filter(([k]) => k in camposAno).map(([k,l]) => input(k, l, 'inputmode="numeric" maxlength="4" pattern="[1-9][0-9]{3}"')).join('')}
                    ${camposVeiculo.filter(([k]) => k !== 'smodelo' && !(k in camposAno)).map(([k,l]) => input(k, k === 'total' ? 'Total (prêmio + IOF)' : l + (dinheiro.has(k) ? ' (R$)' : ''),
                        k === 'total' ? 'readonly' : dinheiro.has(k) || k === 'sfipePercent' ? 'inputmode="decimal" maxlength="20"' : `maxlength="${limitesTexto[k]}"`)).join('')}
                </div>
                <div class="fm-seg-acoes">
                    <button type="button" id="fmSeg_cancelar" class="btn btn-outline-secondary" hidden>Cancelar edição</button>
                    <button type="submit" id="fmSeg_salvar" class="btn btn-primary">Salvar registro</button>
                </div>
            </form>
        </details>
        <p id="fmSeg_aviso" role="status" class="mb-0"></p>
        <div class="glass-container">
            <div class="fm-seg-abas" role="group" aria-label="Tipo de seguro">${Object.entries(tipos).map(([k,v])=>`<button type="button" class="btn btn-outline-primary" data-seg-aba="${k}" aria-pressed="false">${v}</button>`).join('')}</div>
            <div class="fm-seg-grid fm-seg-filtros">
                ${input('fPlaca','Filtrar placa')}
                ${input('fSeguradora','Filtrar seguradora')}
                ${input('fAte','Vencimento até','type="date"')}
                <label>Alerta de prazo<select id="fmSeg_fPrazo" class="form-select"><option value="">Todos</option><option value="vencido">Vencidos</option><option value="atencao">Até 30 dias</option><option value="vigente">Em dia</option><option value="sem">Sem data</option></select></label>
            </div>
            <div class="fm-seg-acoes">
                <button type="button" class="btn btn-outline-primary" id="fmSeg_exportar">Exportar Excel</button>
            </div>
            <div id="fmSeg_gerenciar" class="fm-seg-acoes fm-seg-gerenciar" role="group" aria-label="Ações do registro selecionado" hidden>
                ${select('registro','Registro',op('','Selecione uma placa'))}
                <button type="button" class="btn-edit fm-acao-tabela fm-acao-editar" data-seg-gerenciar="editar" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/></svg><span>Editar</span></button>
                <button type="button" class="btn-del fm-acao-tabela fm-acao-excluir" data-seg-gerenciar="excluir" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6 12 12 M18 6 6 18"/></svg><span>Excluir</span></button>
            </div>
            <div id="fmSeg_resultado"></div>
        </div>`;
        campo('form').addEventListener('submit', salvar);
        campo('sveiculo').required = true;
        campo('stipo').addEventListener('change', () => {
            if (campo('apoliceExistente').value) preencherApolice(rascunhoApolice);
            aba = campo('stipo').value;
            atualizarApolices('');
            ajustarForm();
            consultar();
        });
        campo('apoliceExistente').addEventListener('change', escolherApolice);
        campo('sveiculo').addEventListener('change', preencherVeiculo);
        dinheiro.forEach(k => {
            if (k === 'total') return;
            const c = campo(k);
            c.addEventListener('blur', () => {
                const v = centavos(c.value);
                if (!Number.isNaN(v)) c.value = valorEditavel(k, v);
                if (k === 'spremio' || k === 'siof') preverTotal();
            });
        });
        ['spremio','siof'].forEach(k => campo(k).addEventListener('input', preverTotal));
        ['fPlaca','fSeguradora','fAte','fPrazo'].forEach(k => campo(k).addEventListener('input', consultar));
        campo('cancelar').addEventListener('click', cancelar);
        campo('registro').addEventListener('change', ajustarAcoesRegistro);
        campo('exportar').addEventListener('click', exportar);
        host.addEventListener('click', acoes);
        limpar();
    }
    function aviso(msg) { campo('aviso').textContent = msg; }
    function preencherVeiculo() {
        const p = campo('sveiculo').value;
        const v = veiculos().find(x => placaIgual(x.vplaca, p));
        const d = dadosDetran(p);
        campo('smodelo').value = texto(v?.vmodelo || d?.dtMarca);
        Object.keys(camposAno).forEach(k => { campo(k).value = anoCadastrado(d, k); });
    }
    function preencherPlacas(atual) {
        const vistos = new Set();
        const opcoes = veiculos().filter(v => {
            const p = placa(v.vplaca);
            if (!p || vistos.has(p)) return false;
            vistos.add(p);
            return true;
        }).slice().sort((a,b) => texto(a.vplaca).localeCompare(texto(b.vplaca), 'pt-BR'));
        const cadastrado = opcoes.find(v => placa(v.vplaca) === placa(atual));
        const rotulo = opcoes.length ? 'Selecione a placa' : root.fmModuloCarregado?.('veiculos')
            ? 'Nenhum veículo cadastrado' : 'Aguardando o cadastro de veículos…';
        campo('sveiculo').innerHTML = op('',rotulo) + (atual && !cadastrado ? op(atual, atual + ' · registro histórico') : '') + opcoes.map(v => op(v.vplaca,[v.vplaca,v.vmodelo].filter(Boolean).join(' · '))).join('');
        campo('sveiculo').value = cadastrado ? cadastrado.vplaca : (atual || '');
    }
    function atualizarPlacas() {
        const select = campo('sveiculo');
        if (select) preencherPlacas(select.value);
    }
    function ajustarForm() {
        const t = campo('stipo').value;
        const porPlaca = usaFichaPorPlaca(t);
        const podeMudarTipo = editando && tipo(editando.registro) === 'legado';
        const visiveis = new Map(colunas[t]);
        campo('editor').hidden = aba === 'legado' && !editando;
        campo('instrucoes').hidden = campo('coberturas').hidden = porPlaca;
        campo('stipo').disabled = !podeMudarTipo;
        const apoliceExistente = campo('apoliceExistente');
        const reutilizaApolice = porPlaca && !!apoliceExistente.value;
        apoliceExistente.parentElement.hidden = apoliceExistente.disabled = !porPlaca;
        campo('ajudaApolice').hidden = !reutilizaApolice;
        camposApolice.forEach(k => {
            const c = campo(k), historico = camposHistorico.includes(k);
            c.parentElement.hidden = c.disabled = !porPlaca && !historico;
            c.required = !porPlaca && historico;
            c.readOnly = reutilizaApolice;
        });
        camposVeiculo.forEach(([k, l]) => {
            const c = campo(k);
            c.parentElement.hidden = c.disabled = !visiveis.has(k);
            const titulo = c.parentElement.querySelector?.('span');
            if (titulo) titulo.textContent = k === 'total' ? (t === 'principal' ? 'TOTAL' : 'Total (prêmio + IOF)') :
                k in camposAno ? l : k === 'smodelo' && t === 'segundo' ? 'Descrição do veículo' :
                (visiveis.get(k) || l) + (t === 'segundo' && dinheiro.has(k) ? ' (R$)' : '');
        });
        const botaoCancelar = campo('cancelar');
        botaoCancelar.hidden = !editando && !usaFichaPorPlaca(aba);
        botaoCancelar.textContent = editando ? 'Cancelar edição' : 'Cancelar';
        if (!editando) campo('titulo').textContent = t === 'segundo' ? 'Cadastrar veículo no 2º risco' : 'Cadastrar veículo no seguro principal';
        preverTotal();
    }
    function preverTotal() {
        const p = centavos(campo('spremio').value), i = centavos(campo('siof').value);
        campo('total').value = Number.isNaN(p) || Number.isNaN(i) || (p == null && i == null) ? '' : exMoeda((p || 0)+(i || 0));
    }
    function limpar() {
        editando = null;
        campo('form').reset();
        rascunhoApolice = {};
        preencherApolice(rascunhoApolice);
        campo('stipo').innerHTML = ops({ principal: tipos.principal, segundo: tipos.segundo });
        campo('stipo').value = aba === 'segundo' ? 'segundo' : 'principal';
        atualizarApolices('');
        campo('titulo').textContent = 'Cadastrar veículo na apólice';
        preencherPlacas('');
        ajustarForm();
        aviso('');
    }
    function cancelar() {
        if (ocupada || (!editando && !usaFichaPorPlaca(aba))) return;
        const estavaEditando = !!editando;
        const porPlaca = estavaEditando ? usaFichaPorPlaca(tipo(editando.registro)) : usaFichaPorPlaca(aba);
        limpar();
        if (porPlaca) campo('editor').open = false;
        atualizar();
        if (porPlaca) {
            if (estavaEditando && !campo('gerenciar').hidden) campo('registro').focus();
            else campo('titulo').focus();
        }
    }
    function editar(r) {
        if (ocupada) return;
        limpar();
        editando = { registro: r };
        const t = tipo(r);
        if (t === 'legado') campo('stipo').add(new Option(tipos.legado, 'legado'));
        campo('stipo').value = t;
        preencherApolice(r);
        rascunhoApolice = lerApolice();
        atualizarApolices(usaFichaPorPlaca(t) ? apolice(r) : '');
        preencherPlacas(r.sveiculo);
        colunas[t].forEach(([k]) => {
            if (['item','sveiculo','sseguradora','svencimento','prazo','total'].includes(k)) return;
            campo(k).value = valorEditavel(k, campoValor(k, r));
        });
        campo('titulo').textContent = 'Editar registro · ' + r.sveiculo;
        campo('editor').open = true;
        ajustarForm();
        campo('sveiculo').focus();
    }
    function podeGravar() {
        return typeof root.fmModuloCarregado === 'function' && root.fmModuloCarregado('seguros') && typeof auth !== 'undefined' && !!auth.currentUser;
    }
    function encontrar(r) {
        const id = r._rid || r._fid || r.id;
        return lista().findIndex(x => x === r || (id && (x._rid || x._fid || x.id) === id));
    }
    function salvar(e) {
        e.preventDefault();
        if (ocupada) return;
        if (!podeGravar()) return aviso('Aguarde o carregamento dos seguros e confirme que está conectado.');
        const anterior = editando?.registro;
        const i = anterior ? encontrar(anterior) : -1;
        if (anterior && (i < 0 || JSON.stringify(lista()[i]) !== JSON.stringify(anterior))) return aviso('O registro mudou. Cancele a edição e abra novamente.');
        const t = campo('stipo').value;
        const r = Object.assign({}, anterior || {});
        r.stipo = t;
        if (t === 'legado') {
            camposHistorico.forEach(k => { r[k] = texto(campo(k).value); });
            ['stipo','scorretora','sapolice','sinicio','ssituacao'].forEach(k => { delete r[k]; });
            if (!r.sseguradora || !r.svencimento) return aviso('Informe seguradora e vencimento.');
        } else {
            const dados = lerApolice();
            if (dados.sinicio && dados.svencimento && dados.sinicio > dados.svencimento) {
                campo('svencimento').focus();
                return aviso('O fim da vigência não pode ser anterior ao início.');
            }
            camposApolice.forEach(k => { if (dados[k] !== texto(r[k])) r[k] = dados[k]; });
        }
        const selecionada = campo('sveiculo').value;
        const v = veiculos().find(x => placaIgual(x.vplaca, selecionada));
        if (!v && !(anterior && placaIgual(anterior.sveiculo, selecionada))) return aviso('Selecione uma placa cadastrada.');
        r.sveiculo = v ? v.vplaca : anterior.sveiculo;
        for (const [k, nome] of colunas[t]) {
            if (!camposVeiculo.some(([c]) => c === k) || k === 'total') continue;
            const v = campo(k).value;
            const valor = k === 'sfipePercent' ? centavos(texto(v).replace(/\s*%$/, '')) : dinheiro.has(k) ? centavos(v) : texto(v);
            if (k in camposAno && valor && !anoValido(valor)) return aviso('Informe ' + (k === 'sanoFab' ? 'o ano de fabricação' : 'o ano-modelo') + ' com quatro dígitos ou deixe em branco.');
            if (Number.isNaN(valor)) return aviso('Revise o valor de ' + nome + '. Use um valor positivo ou zero, com até duas casas decimais.');
            r[k] = valor;
        }
        const alvo = apolice(r);
        const mesmaFichaSegundo = t === 'segundo' && anterior && tipo(anterior) === t && placaIgual(anterior.sveiculo, r.sveiculo);
        if (t !== 'legado' && !mesmaFichaSegundo && lista().some((x, j) => j !== i && placaIgual(x.sveiculo, r.sveiculo) &&
            (t === 'segundo' ? tipo(x) === t : apolice(x) === alvo))) {
            return aviso(t === 'segundo' ? 'Esta placa já consta no 2º risco. Edite o registro existente.' : 'Esta placa já consta nesta apólice. Edite o registro existente.');
        }
        const pronto = fmPrepararRegistro('seguros', r, anterior);
        if (i < 0) lista().push(pronto); else lista()[i] = pronto;
        aba = t;
        limpar();
        return persistir('Registro salvo no banco.');
    }
    function gravarSeguros() {
        root.fmPularSincronizacaoPreUmaVez = true;
        return salvarNuvem(['seguros']);
    }
    async function persistir(mensagem) {
        ocupada = true;
        atualizar();
        aviso('Salvando no banco…');
        let ok = false;
        try {
            ok = await gravarSeguros();
        } catch (erro) { console.error(erro); }
        finally {
            ocupada = false;
            atualizar();
            aviso(ok ? mensagem : 'O banco não confirmou a gravação. Confira o status da sincronização antes de fechar.');
        }
        if (typeof renderDashboard === 'function') renderDashboard();
    }
    function filtrados() {
        const p = placa(campo('fPlaca').value), s = chave(campo('fSeguradora').value);
        const ate = campo('fAte').value, alertaPrazo = campo('fPrazo').value;
        return lista().filter(r => tipo(r) === aba && (!p || placa(r.sveiculo).includes(p)) &&
            (usaFichaPorPlaca(aba) || ((!s || chave(r.sseguradora).includes(s)) && (!ate || r.svencimento && r.svencimento <= ate) &&
            (!alertaPrazo || prazo(r.svencimento)[0] === alertaPrazo))));
    }
    function registroSelecionado() {
        const valor = campo('registro').value;
        return valor === '' ? null : registrosGerenciar[Number(valor)];
    }
    function ajustarAcoesRegistro() {
        const selecionado = registroSelecionado();
        const desativar = ocupada || !selecionado;
        campo('registro').disabled = ocupada;
        campo('gerenciar').querySelectorAll('[data-seg-gerenciar]').forEach(b => { b.disabled = desativar; });
    }
    function renderAcoesRegistro(registros) {
        const selecionado = registroSelecionado();
        registrosGerenciar = registros;
        campo('gerenciar').hidden = !registros.length;
        const repetidas = new Map();
        const opcoes = registros.map((r, i) => {
            const p = placa(r.sveiculo), n = (repetidas.get(p) || 0) + 1;
            repetidas.set(p, n);
            return op(i, [r.sveiculo, r.smodelo, n > 1 ? `Registro ${n}` : ''].filter(Boolean).join(' · '));
        }).join('');
        const s = campo('registro');
        s.innerHTML = op('', 'Selecione uma placa') + opcoes;
        const i = registros.indexOf(selecionado);
        s.value = i === -1 ? '' : String(i);
        ajustarAcoesRegistro();
    }
    function consultar() {
        const registros = filtrados(), col = colunas[aba];
        const geral = lista();
        el('fmApolices').querySelectorAll('[data-seg-aba]').forEach(b => {
            const t = b.dataset.segAba;
            b.setAttribute('aria-pressed', String(t === aba));
            b.textContent = `${tipos[t]} (${geral.filter(r => tipo(r) === t).length})`;
        });
        const porPlaca = usaFichaPorPlaca(aba);
        ['fSeguradora','fAte','fPrazo'].forEach(k => { campo(k).parentElement.hidden = porPlaca; });
        renderAcoesRegistro(porPlaca ? registros : []);
        const botaoExportar = campo('exportar');
        if (botaoExportar) botaoExportar.disabled = !registros.length;
        const vazio = root.fmModuloCarregado?.('seguros') ? 'Nenhum registro nesta aba para os filtros informados.' : 'Aguardando o carregamento dos seguros…';
        if (!registros.length) {
            campo('resultado').textContent = vazio;
            return;
        }
        const th = col.map(([k,l]) => `<th scope="col"${!l && k === 'smodelo' ? ` aria-label="${aba === 'segundo' ? 'Descrição do veículo' : 'Modelo'}"` : ''}>${esc(l)}</th>`).join('');
        if (porPlaca) {
            campo('resultado').innerHTML = `<div class="table-responsive" role="region" tabindex="0" aria-label="${tipos[aba]} por placa"><table class="table table-striped align-middle fm-seg-${aba}" data-sem-relatorio><thead><tr>${th}</tr></thead><tbody>${registros.map((r, i) => `<tr>${col.map(([k]) => `<td>${tabelaValor(k,r,i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
            return;
        }
        const linhas = new Map(geral.map((r,i) => [r,i]));
        const thComAcoes = th + '<th scope="col">Ações</th>';
        const acoesLinha = r => `<td class="fm-seg-linha-acoes"><button type="button" class="btn-edit" data-seg-editar="${linhas.get(r)}" aria-label="Editar ${esc(r.sveiculo)}" title="Editar">✎</button> <button type="button" class="btn-del" data-seg-excluir="${linhas.get(r)}" aria-label="Excluir ${esc(r.sveiculo)}" title="Excluir">✕</button></td>`;
        const tr = r => `<tr>${col.map(([k])=>`<td>${tabelaValor(k,r)}</td>`).join('')}${acoesLinha(r)}</tr>`;
        campo('resultado').innerHTML = `<p>Cadastros anteriores, sem identificação de apólice. Para completar um registro, edite-o e escolha Seguro principal ou 2º risco.</p><div class="table-responsive"><table class="table table-striped align-middle"><thead><tr>${thComAcoes}</tr></thead><tbody>${registros.map(tr).join('')}</tbody></table></div>`;
    }
    function acoes(e) {
        const b = e.target.closest('button');
        if (!b || ocupada) return;
        if (b.dataset.segAba) {
            const destino = b.dataset.segAba;
            if (editando && destino !== aba) return aviso('Salve ou cancele a edição antes de trocar de aba.');
            if (destino !== aba) {
                aba = destino;
                limpar();
            }
            consultar();
        } else if (b.dataset.segGerenciar) {
            if (!usaFichaPorPlaca(aba)) return;
            const r = registroSelecionado();
            const i = lista().indexOf(r);
            if (i < 0 || !filtrados().includes(r)) return aviso('Selecione um registro desta aba.');
            if (b.dataset.segGerenciar === 'editar') editar(r);
            else if (b.dataset.segGerenciar === 'excluir') {
                if (!podeGravar()) return aviso('Aguarde o carregamento dos seguros e confirme que está conectado.');
                if (typeof root.fmExcluirVinculado !== 'function') return aviso('Recarregue a página antes de excluir.');
                return excluir(i, r);
            }
        } else if (b.dataset.segEditar != null) {
            const r = lista()[Number(b.dataset.segEditar)];
            if (r) editar(r);
        } else if (b.dataset.segExcluir != null) {
            if (!podeGravar()) return aviso('Aguarde o carregamento dos seguros e confirme que está conectado.');
            if (typeof root.fmExcluirVinculado !== 'function') return aviso('Recarregue a página antes de excluir.');
            const i = Number(b.dataset.segExcluir), r = lista()[i];
            if (r) excluir(i, r);
        }
    }
    async function excluir(i, r) {
        ocupada = true;
        campo('salvar').disabled = true;
        try {
            await root.fmExcluirVinculado('seguros', i);
            if (editando?.registro === r && encontrar(r) < 0) limpar();
        } finally {
            ocupada = false;
            atualizar();
        }
    }
    function exportar() {
        if (!root.XLSX) return aviso('A exportação Excel não está disponível. Recarregue a página e tente novamente.');
        const registros = filtrados();
        if (!registros.length) return;
        const col = colunas[aba];
        const itens = aba === 'legado' ? agrupar(registros).flatMap(g => g.linhas.map(x => x.r)) : registros;
        const dados = [col.map(([,l]) => l), ...itens.map((r, i) => col.map(([k]) => {
            const v = campoValor(k, r, i);
            if (dinheiro.has(k) || k === 'sfipePercent') return v == null ? null : v/100;
            if (k in camposAno) return anoValido(texto(v)) ? Number(v) : '';
            return v ?? '';
        }))];
        const x = root.XLSX, planilha = x.utils.aoa_to_sheet(dados), livro = x.utils.book_new();
        planilha['!cols'] = col.map(([k,l]) => ({wch: aba === 'segundo' && k === 'smodelo' ? 38 : Math.max(14, l.length + 2)}));
        for (let i = 1; i < dados.length; i++) col.forEach(([k],j)=>{
            const c = planilha[x.utils.encode_cell({r:i,c:j})];
            if (c?.t === 'n' && dinheiro.has(k)) c.z = '"R$" #,##0.00';
        });
        x.utils.book_append_sheet(livro,planilha,tipos[aba]);
        x.writeFile(livro,'seguros-'+aba+'.xlsx');
    }
    function atualizar() {
        montar();
        if (!campo('form')) return;
        atualizarPlacas();
        atualizarApolices();
        ajustarForm();
        campo('salvar').disabled = ocupada;
        consultar();
    }
    api.render = atualizar;
    api.atualizarPlacas = atualizarPlacas;
    root.addEventListener('frota:placa-alterada', atualizarPlacas);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', atualizar, {once:true});
    else atualizar();
})(typeof window === 'undefined' ? globalThis : window);
