(function (root) {
    'use strict';
    const texto = v => String(v == null ? '' : v).trim();
    const chave = v => texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
    const rotulo = v => chave(v).replace(/[^a-z0-9]+/g, ' ').trim();
    const placa = v => rotulo(v).replace(/ /g, '');
    const formatoPlaca = /^[a-z]{3}[0-9][a-z0-9][0-9]{2}$/;
    const nomes = {
        stipo: ['tipo', 'tipo de seguro', 'risco'], sveiculo: ['placa', 'placas', 'placa do veiculo'],
        sapolice: ['apolice', 'n apolice', 'no apolice', 'no da apolice', 'n da apolice', 'numero da apolice', 'numero apolice'],
        sseguradora: ['seguradora', 'companhia seguradora'], scorretora: ['corretora', 'corretor'],
        sinicio: ['inicio', 'inicio da vigencia', 'inicio de vigencia', 'vigencia inicial', 'data inicio', 'data de inicio'],
        svencimento: ['vencimento', 'fim', 'fim da vigencia', 'fim de vigencia', 'vigencia final', 'data vencimento', 'data de vencimento', 'termino da vigencia'],
        ssituacao: ['situacao', 'situacao da apolice', 'status'],
        smodelo: ['modelo', 'marca modelo', 'veiculo', 'descricao do veiculo'], sano: ['ano', 'ano modelo', 'ano fabricacao modelo'],
        sfipe: ['fipe', 'valor fipe', 'valor da fipe'], smateriais: ['danos materiais', 'dm', 'rcf dm'],
        scorporais: ['danos corporais', 'dc', 'rcf dc'], smorais: ['danos morais', 'rcf danos morais'],
        scarroceria: ['carroceria', 'valor carroceria'], svidros: ['vidros', 'cobertura vidros'], sguincho: ['guincho', 'guincho km', 'guincho limite ou km'],
        sgru: ['gru'], spremio: ['premio', 'premio liquido', 'valor do premio'], siof: ['iof', 'valor do iof']
    };
    const aliases = new Map(Object.entries(nomes).flatMap(([k, valores]) => valores.map(v => [v, k])));
    const campo = v => aliases.get(rotulo(v).replace(/ r$/, ''));
    const tipoRisco = v => {
        const s = rotulo(v);
        const segundo = /\b(?:segundo risco|2\s*(?:o )?risco)\b/.test(s);
        const principal = /\b(?:seguro principal|principal|primeiro risco|1\s*(?:o )?risco)\b/.test(s);
        return segundo === principal ? '' : segundo ? 'segundo' : 'principal';
    };
    function dataISO(v) {
        if (v instanceof Date) {
            if (!Number.isFinite(v.getTime())) return '';
            v = v.toISOString().slice(0, 10);
        } else if (typeof v === 'number') {
            if (!Number.isInteger(v) || v <= 60 || v > 2958465) return '';
            v = new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
        }
        const s = texto(v);
        const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
        const iso = br ? `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : s;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
        const d = new Date(iso + 'T00:00:00Z');
        return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : '';
    }
    const obrigatorios = { sseguradora: 'seguradora', sapolice: 'número da apólice', sinicio: 'início da vigência', svencimento: 'fim da vigência' };
    const metadados = new Set([...Object.keys(obrigatorios), 'scorretora', 'ssituacao']);
    function lerAbas(abas) {
        const linhas = [];
        for (const { nome, dados, primeiraLinha = 1 } of abas) {
            let colunas = null, contexto = {}, secao = tipoRisco(nome);
            const lerColunas = (row, mapa) => Object.fromEntries(mapa.map(([k, c]) => [k, row[c] ?? '']));
            dados.forEach((row, i) => {
                const preenchidas = row.filter(v => texto(v));
                if (!preenchidas.length) return;
                const titulo = preenchidas.length === 1 && tipoRisco(preenchidas[0]);
                if (titulo) { secao = titulo; colunas = null; contexto = {}; return; }
                const mapa = row.map((v, c) => [campo(v), c]).filter(([k]) => k);
                if (mapa.some(([k]) => k === 'sveiculo')) { colunas = mapa; return; }
                const bruto = colunas && lerColunas(row, colunas);
                const p = placa(bruto?.sveiculo);
                if (!formatoPlaca.test(p)) {
                    if (/^(subtotal|total|resumo)\b/.test(rotulo(preenchidas[0]))) { contexto = {}; return; }
                    const itens = mapa.filter(([k,c]) => metadados.has(k) && texto(row[c + 1]) && !campo(row[c + 1]));
                    if (itens.length && itens.length * 2 === preenchidas.length) {
                        const novos = Object.fromEntries(itens.map(([k,c]) => [k, row[c + 1]]));
                        if (Object.keys(obrigatorios).some(k => texto(novos[k]) && texto(contexto[k]) && texto(novos[k]) !== texto(contexto[k]))) contexto = {};
                        contexto = { ...contexto, ...novos };
                        return;
                    }
                    if (!bruto) return;
                }
                const valoresLinha = Object.fromEntries(Object.entries(bruto).filter(([,v]) => texto(v)));
                const cabDivergente = Object.keys(obrigatorios).some(k => texto(valoresLinha[k]) && texto(contexto[k]) && texto(valoresLinha[k]) !== texto(contexto[k]));
                const r = { ...(cabDivergente ? {} : contexto), ...valoresLinha };
                const explicito = texto(bruto.stipo);
                const tipoLinha = explicito ? tipoRisco(explicito) : secao;
                linhas.push({ aba: nome, linha: primeiraLinha + i, dados: r, tipo: secao && tipoLinha !== secao ? '' : tipoLinha });
            });
        }
        return linhas;
    }
    const textos = { smodelo: 120, sano: 16, sguincho: 80 };
    const valores = ['sfipe','smateriais','scorporais','smorais','scarroceria','svidros','sgru','spremio','siof'];
    const situacoes = new Map([['pendente','pendente'],['aprovada','aprovada'],['aprovado','aprovada'],['reprovada','reprovada'],['reprovado','reprovada'],['cancelada','cancelada'],['cancelado','cancelada']]);
    const chaveLinha = (r, seguros) => JSON.stringify([seguros.apolice(r), placa(r.sveiculo)]);
    function validar(linhas, veiculos, existentes, seguros) {
        const cadastro = new Map();
        for (const v of veiculos) {
            const p = placa(v.vplaca);
            if (p && !cadastro.has(p)) cadastro.set(p, v);
        }
        const apolices = new Map(), duplicados = new Set();
        for (const r of existentes) {
            if (r.stipo !== 'principal' && r.stipo !== 'segundo') continue;
            if (!apolices.has(seguros.apolice(r))) apolices.set(seguros.apolice(r), r);
            duplicados.add(chaveLinha(r, seguros));
        }
        return linhas.map(linha => {
            const d = linha.dados, erros = [];
            const r = { stipo: linha.tipo, sveiculo: texto(d.sveiculo), sseguradora: texto(d.sseguradora),
                scorretora: texto(d.scorretora), sapolice: texto(d.sapolice), sinicio: dataISO(d.sinicio),
                svencimento: dataISO(d.svencimento), ssituacao: situacoes.get(rotulo(d.ssituacao)) || '' };
            if (r.stipo !== 'principal' && r.stipo !== 'segundo') erros.push('Tipo de seguro não identificado');
            const p = placa(r.sveiculo), v = cadastro.get(p);
            if (!formatoPlaca.test(p)) erros.push('Placa ausente ou inválida');
            else if (!v) erros.push('Placa não cadastrada');
            else r.sveiculo = v.vplaca;
            for (const [k,l] of Object.entries(obrigatorios)) {
                if (!r[k]) erros.push(texto(d[k]) ? `${l}: valor inválido` : `${l}: não informado`);
            }
            if (r.sinicio && r.svencimento && r.sinicio > r.svencimento) erros.push('Início posterior ao fim da vigência');
            for (const [k,max] of Object.entries({ sseguradora:120, scorretora:120, sapolice:80 })) {
                if (r[k].length > max) erros.push(`${nomes[k][0]}: texto acima de ${max} caracteres`);
            }
            const id = chaveLinha(r, seguros);
            if (duplicados.has(id)) return { ...linha, registro: r, status: 'duplicada', erros: ['Placa já incluída nesta apólice'] };
            const cab = apolices.get(seguros.apolice(r));
            if (cab) {
                if (r.scorretora && chave(r.scorretora) !== chave(cab.scorretora) || r.ssituacao && r.ssituacao !== cab.ssituacao) {
                    erros.push('Corretora ou situação diverge dos dados da apólice');
                }
                for (const k of [...metadados]) r[k] = texto(cab[k]);
            }
            if (texto(d.ssituacao) && !situacoes.has(rotulo(d.ssituacao))) erros.push('Situação não reconhecida');
            for (const [k,max] of Object.entries(textos)) {
                if (r.stipo === 'segundo' && k !== 'smodelo') continue;
                r[k] = texto(d[k]) || (k === 'smodelo' ? texto(v?.vmodelo) : '');
                if (r[k].length > max) erros.push(`${nomes[k][0]}: texto acima de ${max} caracteres`);
            }
            for (const k of valores) {
                if (r.stipo === 'principal' && k === 'sgru') continue;
                if (r.stipo === 'segundo' && !['sgru','smorais','spremio','siof'].includes(k)) continue;
                const valor = d[k];
                if (typeof valor === 'number') {
                    const n = Math.round(valor * 100);
                    r[k] = valor >= 0 && Number.isSafeInteger(n) && n <= 999999999999 && Math.abs(valor * 100 - n) < 0.0002 ? n : NaN;
                } else {
                    r[k] = seguros.centavos(valor);
                }
                if (Number.isNaN(r[k])) erros.push(`${nomes[k][0]}: valor inválido`);
            }
            if (erros.length) return { ...linha, registro: r, status: 'invalida', erros };
            duplicados.add(id);
            if (!cab) apolices.set(seguros.apolice(r), r);
            return { ...linha, registro: r, status: 'nova', erros };
        });
    }
    async function lerArquivo(arquivo, x) {
        if (!x?.read) throw new Error('Leitor de Excel indisponível. Recarregue a página e tente novamente.');
        if (!/\.xlsx?$/i.test(arquivo.name)) throw new Error('Selecione uma planilha .xlsx ou .xls.');
        if (arquivo.size > 15 * 1024 * 1024) throw new Error('Selecione uma planilha de até 15 MB.');
        const livro = x.read(await arquivo.arrayBuffer(), { type: 'array', sheetRows: 5002 });
        if (livro.Workbook?.WBProps?.date1904) throw new Error('Salve uma cópia da planilha com o sistema de datas de 1900 antes de importar.');
        const linhas = lerAbas(livro.SheetNames.map(nome => {
            const aba = livro.Sheets[nome];
            const faixa = aba['!ref'] && x.utils.decode_range(aba['!ref']);
            const original = aba['!fullref'] && x.utils.decode_range(aba['!fullref']);
            if ((original || faixa)?.e.r >= 5000 || faixa?.e.c >= 100) throw new Error('Use até 5.000 linhas e 100 colunas por aba.');
            const dados = x.utils.sheet_to_json(aba, { header: 1, defval: '', blankrows: true, raw: true });
            // Mantém zeros à esquerda em números de apólice formatados no Excel.
            if (faixa) dados.forEach((row, i) => row.forEach((v, c) => {
                const cel = aba[x.utils.encode_cell({ r: faixa.s.r + i, c: faixa.s.c + c })];
                if (typeof v === 'number' && /^0\d+$/.test(cel?.w || '')) row[c] = cel.w;
            }));
            return { nome, dados, primeiraLinha: (faixa?.s.r ?? 0) + 1 };
        }));
        if (!linhas.length) throw new Error('Nenhuma linha de seguro encontrada. Confira se existe uma coluna Placa abaixo dos dados da apólice.');
        if (linhas.length > 5000) throw new Error('A planilha contém mais de 5.000 linhas de seguro. Divida em arquivos menores.');
        return linhas;
    }
    const esc = v => texto(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const dinheiro = v => Number.isFinite(v) ? moeda.format(v/100) : '—';
    const br = v => v ? v.split('-').reverse().join('/') : '—';
    const grupos = [['principal','Seguro principal'], ['segundo','2º risco'], ['', 'Tipo não identificado']];
    const estados = { nova: 'Nova', duplicada: 'Duplicada', invalida: 'Não importável' };
    function montar({ botao, painel, seguros, veiculos, lista, podeGravar, gravar, ocupado }) {
        painel.innerHTML = `<h5>Importação de seguros</h5>
            <p>Selecione o Excel para conferir as placas antes de salvar. O tipo pode vir da aba, do título da seção ou da coluna Tipo de seguro. Registros existentes e o Histórico não serão alterados.</p>
            <p class="small text-muted">Dados obrigatórios: placa cadastrada, seguradora, número da apólice e datas de início e fim da vigência. Se uma linha for bloqueada, corrija a planilha e selecione o arquivo novamente.</p>
            <label for="fmSeg_arquivo" class="form-label">Planilha de seguros (.xlsx ou .xls)</label>
            <input id="fmSeg_arquivo" type="file" accept=".xlsx,.xls" class="form-control">
            <p id="fmSeg_resumoImportacao" class="mt-2" role="status"></p>
            <div id="fmSeg_linhasImportacao"></div>
            <div class="fm-seg-acoes">
                <button type="button" id="fmSeg_revisarImportacao" class="btn btn-outline-secondary" hidden>Atualizar prévia</button>
                <button type="button" id="fmSeg_confirmarImportacao" class="btn btn-primary" hidden>Confirmar importação</button>
                <button type="button" id="fmSeg_fecharImportacao" class="btn btn-outline-secondary">Fechar prévia</button>
            </div>`;
        const buscar = id => painel.querySelector('#fmSeg_' + id);
        const arquivo = buscar('arquivo'), resumo = buscar('resumoImportacao'), tabela = buscar('linhasImportacao');
        const revisar = buscar('revisarImportacao'), confirmar = buscar('confirmarImportacao'), fechar = buscar('fecharImportacao');
        const paginas = new Map();
        let linhas = [], resultado = [], token = 0, emEnvio = false, enviado = false;
        function desenhar() {
            const n = resultado.filter(l => l.status === 'nova').length;
            confirmar.hidden = !resultado.length || enviado;
            confirmar.disabled = !n || emEnvio || enviado || !podeGravar();
            confirmar.textContent = n === 1 ? 'Importar 1 registro novo' : `Importar ${n} registros novos`;
            revisar.hidden = !linhas.length || enviado;
            revisar.disabled = emEnvio;
            tabela.innerHTML = grupos.map(([tipo, titulo]) => {
                const itens = resultado.filter(l => l.tipo === tipo);
                if (!itens.length) return '';
                const limite = 25, total = Math.ceil(itens.length / limite);
                const pagina = Math.min(paginas.get(tipo) || 1, total);
                const tr = itens.slice((pagina - 1) * limite, pagina * limite).map(l => {
                    const r = l.registro;
                    const rastro = `${esc(l.aba)} · linha ${l.linha}`;
                    const cab = [r.sseguradora, r.sapolice, r.scorretora].filter(Boolean).join(' · ');
                    const coberturas = ['sfipe','smateriais','scorporais','smorais','scarroceria','svidros','sguincho','sgru']
                        .filter(k => r[k] != null && r[k] !== '' && !Number.isNaN(r[k]))
                        .map(k => `${esc(nomes[k][0])}: ${k === 'sguincho' ? esc(r[k]) : dinheiro(r[k])}`).join(' · ');
                    return `<tr><td>${rastro}</td><td>${esc(r.sveiculo) || '—'}<br><small>${esc(r.smodelo)}</small></td><td>${esc(cab) || '—'}<br><small>${br(r.sinicio)} a ${br(r.svencimento)}${r.ssituacao ? ' · ' + esc(r.ssituacao) : ''}</small></td><td>${coberturas || '—'}</td><td>${dinheiro(r.spremio)}</td><td>${dinheiro(r.siof)}</td><td>${dinheiro(seguros.total(r))}</td><td>${estados[l.status]}${l.erros.length ? '<br><small>' + l.erros.map(esc).join('; ') + '</small>' : ''}</td></tr>`;
                }).join('');
                const paginar = total > 1 ? `<div class="fm-seg-acoes mb-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-seg-previa="${tipo}" data-pagina="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''}>Anterior</button><span>Página ${pagina} de ${total}</span><button type="button" class="btn btn-sm btn-outline-secondary" data-seg-previa="${tipo}" data-pagina="${pagina + 1}" ${pagina === total ? 'disabled' : ''}>Próxima</button></div>` : '';
                return `<section class="fm-seg-apolice"><h6>${titulo} (${itens.length})</h6>${paginar}<div class="table-responsive"><table class="table table-striped align-middle"><thead><tr>${['Origem','Placa / modelo','Apólice e vigência','Coberturas','Prêmio','IOF','Total','Validação'].map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${tr}</tbody></table></div></section>`;
            }).join('');
        }
        function revalidar(prefixo = '') {
            const pronto = podeGravar();
            resultado = pronto ? validar(linhas, veiculos(), lista(), seguros) : [];
            const contar = status => resultado.filter(l => l.status === status).length;
            const msg = pronto ? `${contar('nova')} nova(s) · ${contar('duplicada')} duplicada(s) · ${contar('invalida')} não importável(is). Somente os registros novos serão gravados.` : 'Aguarde o carregamento dos seguros e dos veículos, confirme que está conectado e clique em Atualizar prévia.';
            resumo.textContent = `${prefixo}${msg}`;
            desenhar();
        }
        botao.addEventListener('click', () => {
            painel.hidden = !painel.hidden && !emEnvio;
            botao.setAttribute('aria-expanded', String(!painel.hidden));
            if (!painel.hidden) arquivo.focus();
        });
        fechar.addEventListener('click', () => {
            if (emEnvio) return;
            token++; linhas = []; resultado = []; enviado = false; paginas.clear();
            arquivo.value = ''; resumo.textContent = ''; painel.hidden = true;
            botao.setAttribute('aria-expanded', 'false');
            desenhar(); botao.focus();
        });
        arquivo.addEventListener('change', async () => {
            const f = arquivo.files[0];
            if (!f || emEnvio) return;
            const atual = ++token;
            linhas = []; resultado = []; enviado = false; paginas.clear();
            desenhar(); resumo.textContent = 'Lendo planilha…';
            try {
                const lidas = await lerArquivo(f, root.XLSX);
                if (atual !== token) return;
                linhas = lidas;
                revalidar();
            } catch (erro) {
                if (atual !== token) return;
                resumo.textContent = erro?.message || 'Não foi possível ler a planilha.';
                arquivo.value = '';
            }
        });
        revisar.addEventListener('click', () => { if (!enviado && !emEnvio) revalidar(); });
        tabela.addEventListener('click', e => {
            const b = e.target.closest('[data-seg-previa]');
            if (!b) return;
            paginas.set(b.dataset.segPrevia, Number(b.dataset.pagina));
            desenhar();
            tabela.querySelector(`[data-seg-previa="${b.dataset.segPrevia}"]:not(:disabled)`)?.focus();
        });
        confirmar.addEventListener('click', async () => {
            if (emEnvio || enviado) return;
            if (ocupado() || !podeGravar()) { resumo.textContent = 'Aguarde a sincronização antes de importar.'; return; }
            const novos = resultado.filter(l => l.status === 'nova');
            if (!novos.length) return;
            const atual = token;
            const mensagem = (status, qtd) => {
                if (atual !== token) return;
                if (status === 'enviando') resumo.textContent = 'Gravando o lote no banco…';
                else if (status === 'confirmado') resumo.textContent = `${qtd} registro(s) importado(s) e confirmado(s) no banco. Confira nas abas de Seguros.`;
                else if (status === 'pendente') resumo.textContent = 'O lote aguarda a confirmação do banco. Não repita a importação; acompanhe o status da sincronização.';
                else if (status === 'erro' || status === 'fila') resumo.textContent = 'O banco não confirmou a importação. O lote pode estar na fila de sincronização; confira o status antes de tentar novamente.';
            };
            emEnvio = true;
            arquivo.disabled = fechar.disabled = true;
            desenhar();
            try {
                const retorno = await gravar(linhas, JSON.stringify(novos), mensagem);
                if (retorno.status === 'mudou' || retorno.status === 'sem-novos') revalidar('Os dados mudaram desde a última conferência. Revise a prévia novamente. ');
                else if (retorno.status === 'indisponivel') resumo.textContent = 'Aguarde a sincronização antes de importar.';
                else if (retorno.status === 'erro-preparo') resumo.textContent = 'Não foi possível preparar o lote. Nenhum registro foi adicionado.';
                else {
                    enviado = true;
                    mensagem(retorno.status, retorno.quantidade);
                }
            } catch (erro) {
                console.error(erro);
                enviado = true;
                mensagem('erro');
            } finally {
                emEnvio = false;
                arquivo.disabled = fechar.disabled = false;
                desenhar();
            }
        });
    }
    const api = { lerAbas, validar, lerArquivo, montar };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.FMImportarSeguros = api;
})(typeof window === 'undefined' ? globalThis : window);
