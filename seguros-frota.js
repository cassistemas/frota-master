(function (root) {
    'use strict';
    const tipos = { principal: 'Seguro principal', segundo: '2º risco', legado: 'Histórico' };
    const situacoes = { pendente: 'Pendente', aprovada: 'Aprovada', reprovada: 'Reprovada', cancelada: 'Cancelada' };
    const comum = [['spremio','Prêmio'], ['siof','IOF'], ['total','Total']];
    const colunas = {
        principal: [['sveiculo','PLACA'], ['smodelo',''], ['sfipePercent','FIPE %'], ['sfipe','FIPE VEÍCULO'], ['sfipeCarroceria','FIPE CARROCERIA'], ['smateriais','D. MATERIAIS'], ['scorporais','D. CORPORAIS'], ['smorais','D. MORAIS'], ['scarroceria','CARROCERIA'], ['svidro','VIDROS'], ['sguincho','GUINCHO KM'], ['spremio','PRÊMIO'], ['siof','IOF'], ['total','TOTAL']],
        segundo: [['sveiculo','Placa'], ['smodelo','Modelo'], ['sgru','GRU'], ['smorais','Danos morais'], ...comum],
        legado: [['sveiculo','Placa'], ['smodelo','Modelo'], ['sseguradora','Seguradora'], ['svencimento','Vencimento'], ['prazo','Alerta']]
    };
    const dinheiro = new Set(['sfipe','sfipeCarroceria','smateriais','scorporais','smorais','scarroceria','sgru','spremio','siof','total']);
    const rotulosCompartilhados = new Map(colunas.segundo);
    const camposVeiculo = [...colunas.principal.slice(1, -3).map(([k, l]) => [k, rotulosCompartilhados.get(k) || l]), ['sgru','GRU'], ...comum];
    const limitesTexto = { smodelo: 120, svidro: 80, sguincho: 80 };
    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const texto = v => String(v == null ? '' : v).trim();
    const chave = v => texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
    const placa = v => chave(v).replace(/[^a-z0-9]/g, '');
    const esc = v => texto(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const tipo = r => r.stipo === 'principal' || r.stipo === 'segundo' ? r.stipo : 'legado';
    const apolice = r => JSON.stringify([tipo(r), chave(r.sseguradora), chave(r.sapolice), r.sinicio || '', r.svencimento || '']);
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
    const cabecalho = ['stipo','sseguradora','scorretora','sapolice','sinicio','svencimento','ssituacao'];
    let aba = 'principal', editando = null, ocupada = false, gruposEscolha = [];
    const op = (value, label) => '<option value="' + esc(value) + '">' + esc(label) + '</option>';
    const ops = obj => Object.entries(obj).map(([v,l]) => op(v,l)).join('');
    const input = (k, label, attrs = '') => '<label><span>'+esc(label)+'</span><input id="fmSeg_'+k+'" class="form-control" '+attrs+'></label>';
    const select = (k, label, options) => '<label>'+esc(label)+'<select id="fmSeg_'+k+'" class="form-select">'+options+'</select></label>';
    const exMoeda = v => v == null ? '—' : moeda.format(v/100);
    function campoValor(k, r) {
        if (k === 'total') return total(r);
        if (k === 'prazo') return prazo(r.svencimento)[1];
        if (k === 'svidro') return r.svidro ?? (r.svidros == null ? '' : exMoeda(r.svidros));
        return r[k];
    }
    function valorEditavel(k, v) {
        if (dinheiro.has(k) && v != null) return decimal.format(v/100);
        if (k === 'sfipePercent' && v != null) return decimal.format(v/100).replace(/,00$/, '');
        return texto(v);
    }
    function tabelaValor(k, r) {
        const v = campoValor(k, r);
        if (k === 'prazo') return alerta(r);
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
            <form id="fmSeg_form" aria-labelledby="fmSeg_titulo">
                <div id="fmSeg_dadosApolice" class="fm-seg-grid">
                    ${select('stipo','Tipo de seguro',ops(tipos))}
                    ${select('existente','Apólice cadastrada',op('','Nova apólice'))}
                    ${input('sseguradora','Seguradora','required maxlength="120"')}
                    ${input('scorretora','Corretora','maxlength="120"')}
                    ${input('sapolice','Nº da apólice','maxlength="80"')}
                    ${input('sinicio','Início da vigência','type="date"')}
                    ${input('svencimento','Fim da vigência','type="date" required')}
                    ${select('ssituacao','Situação da apólice',op('','Não informada')+ops(situacoes))}
                </div>
                <h5 id="fmSeg_coberturas">Veículo e coberturas</h5>
                <div class="fm-seg-grid">
                    ${select('sveiculo','Placa',op('','Selecione'))}
                    ${camposVeiculo.map(([k,l]) => input(k, k === 'total' ? 'Total (prêmio + IOF)' : l + (dinheiro.has(k) ? ' (R$)' : ''),
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
            <div id="fmSeg_resultado"></div>
        </div>`;
        campo('form').addEventListener('submit', salvar);
        campo('sveiculo').required = true;
        campo('stipo').addEventListener('change', () => {
            if (campo('stipo').value === 'principal') aba = 'principal';
            atualizarEscolhas(false);
            ajustarForm();
            consultar();
        });
        campo('existente').addEventListener('change', () => {
            const r = gruposEscolha[campo('existente').value]?.cab;
            preencherCabecalho(r);
            ajustarForm();
        });
        campo('sveiculo').addEventListener('change', preencherVeiculo);
        ['spremio','siof'].forEach(k => campo(k).addEventListener('input', preverTotal));
        ['fPlaca','fSeguradora','fAte','fPrazo'].forEach(k => campo(k).addEventListener('input', consultar));
        campo('cancelar').addEventListener('click', () => { limpar(); atualizar(); });
        campo('exportar').addEventListener('click', exportar);
        host.addEventListener('click', acoes);
        limpar();
    }
    function aviso(msg) { campo('aviso').textContent = msg; }
    function preencherVeiculo() {
        const p = placa(campo('sveiculo').value);
        const v = veiculos().find(x => placa(x.vplaca) === p);
        const d = typeof db === 'object' && db && Array.isArray(db.detran) ? db.detran.find(x => placa(x.dtPlaca) === p) : null;
        campo('smodelo').value = texto(v?.vmodelo || d?.dtMarca);
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
    function preencherCabecalho(r) {
        cabecalho.slice(1).forEach(k => { campo(k).value = texto(r?.[k]); });
    }
    function atualizarEscolhas(manter = true) {
        const s = campo('existente');
        if (campo('stipo').value === 'principal') {
            gruposEscolha = [];
            s.innerHTML = op('', 'Nova apólice');
            return;
        }
        const selo = s.selectedOptions[0]?.dataset.chave;
        gruposEscolha = agrupar(lista()).filter(g => tipo(g.cab) === campo('stipo').value && tipo(g.cab) !== 'legado');
        s.innerHTML = op('', 'Nova apólice');
        gruposEscolha.forEach((g,i) => {
            const r = g.cab;
            const o = new Option([r.sapolice, r.sseguradora, dataBR(r.sinicio) + ' a ' + dataBR(r.svencimento)].filter(Boolean).join(' · '), String(i));
            o.dataset.chave = apolice(r);
            s.add(o);
            if (manter && selo === o.dataset.chave) s.value = o.value;
        });
        if (!editando && selo) preencherCabecalho(gruposEscolha[s.value]?.cab);
    }
    function ajustarForm() {
        const t = campo('stipo').value;
        const soPlaca = t === 'principal';
        const visiveis = new Map(colunas[t]);
        const vinculada = !editando && campo('existente').value !== '';
        campo('dadosApolice').hidden = campo('instrucoes').hidden = campo('coberturas').hidden = soPlaca;
        campo('stipo').disabled = !!editando && tipo(editando.registro) !== 'legado';
        campo('existente').parentElement.hidden = !!editando || t === 'legado';
        cabecalho.slice(1).forEach(k => {
            const c = campo(k);
            c.parentElement.hidden = t === 'legado' && !['sseguradora','svencimento'].includes(k);
            c.disabled = soPlaca || vinculada || c.parentElement.hidden;
        });
        campo('sapolice').required = campo('sinicio').required = t === 'segundo';
        camposVeiculo.forEach(([k, l]) => {
            const c = campo(k);
            c.parentElement.hidden = !visiveis.has(k);
            const titulo = c.parentElement.querySelector?.('span');
            if (titulo) titulo.textContent = k === 'total' ? (soPlaca ? 'TOTAL' : 'Total (prêmio + IOF)') :
                (visiveis.get(k) || l) + (!soPlaca && dinheiro.has(k) ? ' (R$)' : '');
        });
        if (!editando) campo('titulo').textContent = soPlaca ? 'Cadastrar veículo no seguro principal' : 'Cadastrar veículo na apólice';
        preverTotal();
    }
    function preverTotal() {
        const p = centavos(campo('spremio').value), i = centavos(campo('siof').value);
        campo('total').value = Number.isNaN(p) || Number.isNaN(i) || (p == null && i == null) ? '' : exMoeda((p || 0)+(i || 0));
    }
    function limpar() {
        editando = null;
        campo('form').reset();
        campo('stipo').innerHTML = ops({ principal: tipos.principal, segundo: tipos.segundo });
        campo('stipo').value = aba === 'segundo' ? 'segundo' : 'principal';
        campo('titulo').textContent = 'Cadastrar veículo na apólice';
        campo('cancelar').hidden = true;
        preencherPlacas('');
        atualizarEscolhas(false);
        ajustarForm();
        aviso('');
    }
    function editar(r) {
        if (ocupada) return;
        limpar();
        editando = { registro: r };
        const t = tipo(r);
        if (t === 'legado') campo('stipo').add(new Option(tipos.legado, 'legado'));
        campo('stipo').value = t;
        cabecalho.slice(1).forEach(k => { campo(k).value = texto(r[k]); });
        preencherPlacas(r.sveiculo);
        colunas[t].forEach(([k]) => {
            if (['sveiculo','sseguradora','svencimento','prazo','total'].includes(k)) return;
            campo(k).value = valorEditavel(k, campoValor(k, r));
        });
        campo('titulo').textContent = 'Editar registro · ' + r.sveiculo;
        campo('editor').open = true;
        campo('cancelar').hidden = false;
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
        if (t !== 'principal') {
            cabecalho.slice(1).forEach(k => { r[k] = texto(campo(k).value); });
            if (t === 'legado') {
                cabecalho.filter(k => !['sseguradora','svencimento'].includes(k)).forEach(k => { delete r[k]; });
            } else if (!r.sapolice || !r.sinicio || r.sinicio > r.svencimento) {
                return aviso('Informe o número da apólice e uma vigência válida (início até o vencimento).');
            }
            if (!r.sseguradora || !r.svencimento) return aviso('Informe seguradora e vencimento.');
        }
        const selecionada = campo('sveiculo').value;
        const v = veiculos().find(x => placa(x.vplaca) === placa(selecionada));
        if (!v && !(anterior && placa(anterior.sveiculo) === placa(selecionada))) return aviso('Selecione uma placa cadastrada.');
        r.sveiculo = v ? v.vplaca : anterior.sveiculo;
        for (const [k, nome] of colunas[t]) {
            if (!camposVeiculo.some(([c]) => c === k) || k === 'total') continue;
            const v = campo(k).value;
            const valor = k === 'sfipePercent' ? centavos(texto(v).replace(/\s*%$/, '')) : dinheiro.has(k) ? centavos(v) : texto(v);
            if (Number.isNaN(valor)) return aviso('Revise o valor de ' + nome + '. Use um valor positivo ou zero, com até duas casas decimais.');
            r[k] = valor;
        }
        const alvo = apolice(r);
        const mesmaApolice = anterior && tipo(anterior) === t && t !== 'legado';
        const origem = mesmaApolice ? apolice(anterior) : null;
        const demais = lista().filter((x,j) => j !== i);
        const grupo = mesmaApolice ? demais.filter(x => apolice(x) === origem) : [];
        const destino = demais.filter(x => apolice(x) === alvo);
        if (origem && origem !== alvo && destino.length) return aviso('Já existe uma apólice com esse tipo, seguradora, número e vigência.');
        if (t !== 'legado' && [...grupo,...destino].some(x => placa(x.sveiculo) === placa(r.sveiculo))) return aviso('Esta placa já consta nesta apólice. Edite o registro existente.');
        const escolhida = !anterior && gruposEscolha[campo('existente').value]?.cab;
        if (escolhida && !lista().some(x => apolice(x) === apolice(escolhida) && cabecalho.every(k => texto(x[k]) === texto(escolhida[k])))) return aviso('A apólice selecionada mudou. Atualize a seleção.');
        if (!escolhida && !mesmaApolice && t === 'segundo' && destino.length) return aviso('Esta apólice já existe. Selecione-a no campo Apólice cadastrada.');
        const mudouCabecalho = mesmaApolice && cabecalho.some(k => texto(r[k]) !== texto(anterior[k]));
        if (mudouCabecalho && grupo.length && !root.confirm('Aplicar os dados de identificação, vigência e situação desta apólice às demais placas vinculadas?')) return;
        const pronto = fmPrepararRegistro('seguros', r, anterior);
        if (i < 0) lista().push(pronto); else lista()[i] = pronto;
        if (mudouCabecalho) grupo.forEach(x => {
            const j = encontrar(x);
            const copia = { ...x };
            cabecalho.forEach(k => { copia[k] = r[k]; });
            lista()[j] = fmPrepararRegistro('seguros', copia, x);
        });
        aba = t;
        limpar();
        persistir('Registro salvo no banco.');
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
            (aba === 'principal' || ((!s || chave(r.sseguradora).includes(s)) && (!ate || r.svencimento && r.svencimento <= ate) &&
            (!alertaPrazo || prazo(r.svencimento)[0] === alertaPrazo))));
    }
    function consultar() {
        const registros = filtrados(), col = colunas[aba];
        const geral = lista();
        el('fmApolices').querySelectorAll('[data-seg-aba]').forEach(b => {
            const t = b.dataset.segAba;
            b.setAttribute('aria-pressed', String(t === aba));
            b.textContent = `${tipos[t]} (${geral.filter(r => tipo(r) === t).length})`;
        });
        const soPlaca = aba === 'principal';
        ['fSeguradora','fAte','fPrazo'].forEach(k => { campo(k).parentElement.hidden = soPlaca; });
        const botaoExportar = campo('exportar');
        if (botaoExportar) botaoExportar.disabled = !registros.length;
        const vazio = root.fmModuloCarregado?.('seguros') ? 'Nenhum registro nesta aba para os filtros informados.' : 'Aguardando o carregamento dos seguros…';
        if (!registros.length) {
            campo('resultado').textContent = vazio;
            return;
        }
        const linhas = new Map(geral.map((r,i) => [r,i]));
        const th = col.map(([k,l]) => `<th scope="col"${!l && k === 'smodelo' ? ' aria-label="Modelo"' : ''}>${esc(l)}</th>`).join('');
        if (soPlaca) {
            const aberto = campo('gerenciar')?.open;
            const repetidas = new Map();
            const opcoes = registros.map(r => {
                const p = placa(r.sveiculo), n = (repetidas.get(p) || 0) + 1;
                repetidas.set(p, n);
                return op(linhas.get(r), [r.sveiculo, r.smodelo, n > 1 ? `Registro ${n}` : ''].filter(Boolean).join(' · '));
            }).join('');
            campo('resultado').innerHTML = `<div class="table-responsive" role="region" tabindex="0" aria-label="Seguro principal por placa"><table class="table table-striped align-middle fm-seg-principal" data-sem-relatorio><thead><tr>${th}</tr></thead><tbody>${registros.map(r => `<tr>${col.map(([k]) => `<td>${tabelaValor(k,r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
                <details id="fmSeg_gerenciar" class="fm-seg-gerenciar"${aberto ? ' open' : ''}>
                    <summary>Editar ou excluir registro</summary>
                    <div class="fm-seg-acoes">${select('registro','Registro',op('','Selecione uma placa')+opcoes)}
                        <button type="button" class="btn btn-outline-primary" data-seg-gerenciar="editar">Editar</button>
                        <button type="button" class="btn btn-outline-danger" data-seg-gerenciar="excluir">Excluir</button>
                    </div>
                </details>`;
            return;
        }
        const thComAcoes = th + '<th scope="col">Ações</th>';
        const acoesLinha = r => `<td class="fm-seg-linha-acoes"><button type="button" class="btn-edit" data-seg-editar="${linhas.get(r)}" aria-label="Editar ${esc(r.sveiculo)}" title="Editar">✎</button> <button type="button" class="btn-del" data-seg-excluir="${linhas.get(r)}" aria-label="Excluir ${esc(r.sveiculo)}" title="Excluir">✕</button></td>`;
        const tr = r => `<tr>${col.map(([k])=>`<td>${tabelaValor(k,r)}</td>`).join('')}${acoesLinha(r)}</tr>`;
        if (aba === 'legado') {
            campo('resultado').innerHTML = `<p>Cadastros anteriores, sem identificação de apólice. Para completar um registro, edite-o e escolha Seguro principal ou 2º risco.</p><div class="table-responsive"><table class="table table-striped align-middle"><thead><tr>${thComAcoes}</tr></thead><tbody>${registros.map(tr).join('')}</tbody></table></div>`;
            return;
        }
        campo('resultado').innerHTML = agrupar(registros).sort((a,b)=>texto(a.cab.svencimento).localeCompare(texto(b.cab.svencimento))).map(({cab:r,linhas:grupo}) => {
            const itens = grupo.map(x=>x.r);
            const rodape = `<tfoot><tr><th scope="row" colspan="${col.length - comum.length}">Subtotal · ${itens.length} placa(s)</th>${comum.map(([k])=>`<td>${exMoeda(subtotal(itens,k))}</td>`).join('')}<td></td></tr></tfoot>`;
            return `<section class="fm-seg-apolice"><div class="fm-seg-cab"><div><h5>Apólice ${esc(r.sapolice || '—')} · ${esc(r.sseguradora || '—')}</h5><div>Corretora: ${esc(r.scorretora || '—')} · Vigência: ${esc(dataBR(r.sinicio) || '—')} a ${esc(dataBR(r.svencimento) || '—')}</div></div><div><span class="fm-seg-situacao">${esc(situacoes[r.ssituacao] || 'Situação não informada')}</span> ${alerta(r)}</div></div><div class="table-responsive" role="region" tabindex="0" aria-label="Placas da apólice ${esc(r.sapolice || '—')}"><table class="table table-striped align-middle"><thead><tr>${thComAcoes}</tr></thead><tbody>${itens.map(tr).join('')}</tbody>${rodape}</table></div></section>`;
        }).join('');
    }
    function acoes(e) {
        const b = e.target.closest('button');
        if (!b || ocupada) return;
        if (b.dataset.segAba) {
            aba = b.dataset.segAba;
            if (!editando && aba !== 'legado' && campo('stipo').value !== aba) limpar();
            consultar();
        } else if (b.dataset.segGerenciar) {
            if (aba !== 'principal') return;
            const valor = campo('registro')?.value;
            const i = Number(valor), r = lista()[i];
            if (!valor || !r || !filtrados().includes(r)) return aviso('Selecione um registro do seguro principal.');
            if (b.dataset.segGerenciar === 'editar') editar(r);
            else if (b.dataset.segGerenciar === 'excluir') {
                if (!podeGravar()) return aviso('Aguarde o carregamento dos seguros e confirme que está conectado.');
                if (typeof root.fmExcluirVinculado !== 'function') return aviso('Recarregue a página antes de excluir.');
                excluir(i, r);
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
        const extra = aba === 'segundo' ? [['sapolice','Apólice'],['sseguradora','Seguradora'],['scorretora','Corretora'],['sinicio','Início da vigência'],['svencimento','Fim da vigência'],['ssituacao','Situação'],['prazo','Alerta']] : [];
        const col = [...extra,...colunas[aba]];
        const dados = [col.map(([,l])=>l)];
        const linha = r => col.map(([k]) => {
            const v = campoValor(k,r);
            if (dinheiro.has(k) || k === 'sfipePercent') return v == null ? null : v/100;
            if (k === 'ssituacao') return situacoes[v] || '';
            return v ?? '';
        });
        if (aba === 'principal') registros.forEach(r => dados.push(linha(r)));
        else for (const g of agrupar(registros)) {
            const itens = g.linhas.map(x=>x.r);
            itens.forEach(r => dados.push(linha(r)));
            if (aba === 'segundo') dados.push(col.map(([k],i)=>{
                const v = comum.some(([c])=>c===k) ? subtotal(itens,k) : null;
                return i === 0 ? 'Subtotal das placas exibidas · ' + g.cab.sapolice : v == null ? null : v/100;
            }));
        }
        const x = root.XLSX, planilha = x.utils.aoa_to_sheet(dados), livro = x.utils.book_new();
        planilha['!cols'] = col.map(([,l])=>({wch:Math.max(14,l.length + 2)}));
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
        atualizarEscolhas();
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
