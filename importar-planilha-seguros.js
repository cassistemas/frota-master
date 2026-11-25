(function (root) {
    'use strict';
    const texto = v => String(v == null ? '' : v).trim();
    const chave = v => texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
    const rotulo = v => chave(v).replace(/[^a-z0-9]+/g, ' ').trim();
    const placa = v => rotulo(v).replace(/ /g, '');
    const formatoPlaca = /^[a-z]{3}[0-9][a-z0-9][0-9]{2}$/;
    const nomes = {
        stipo: ['tipo de seguro', 'tipo', 'risco', 'tipo de risco'], sveiculo: ['placa', 'placas', 'placa do veiculo', 'placa veiculo'],
        sapolice: ['apolice', 'n apolice', 'no apolice', 'no da apolice', 'n da apolice', 'numero da apolice', 'numero apolice', 'apolice n', 'apolice no'],
        sseguradora: ['seguradora', 'companhia seguradora', 'cia seguradora'], scorretora: ['corretora', 'corretor', 'corretora de seguros'],
        sinicio: ['inicio da vigencia', 'inicio', 'inicio de vigencia', 'vigencia inicio', 'vigencia inicial', 'vigencia de', 'data inicio', 'data de inicio', 'data inicial'],
        svencimento: ['fim da vigencia', 'vencimento', 'fim', 'fim de vigencia', 'vigencia fim', 'vigencia final', 'vigencia ate', 'data vencimento', 'data de vencimento', 'termino da vigencia', 'vigencia termino', 'data final', 'termino'],
        vigencia: ['vigencia', 'periodo de vigencia', 'vigencia da apolice'],
        ssituacao: ['situacao', 'situacao da apolice', 'status'],
        smodelo: ['modelo', 'marca modelo', 'veiculo', 'descricao do veiculo'], sano: ['ano', 'ano modelo', 'ano fabricacao modelo', 'ano fab mod'],
        sfipe: ['fipe', 'valor fipe', 'valor da fipe', 'tabela fipe'], smateriais: ['danos materiais', 'dm', 'rcf dm', 'rcf danos materiais'],
        scorporais: ['danos corporais', 'dc', 'rcf dc', 'rcf danos corporais'], smorais: ['danos morais', 'rcf danos morais', 'rcf dmo', 'dmo'],
        scarroceria: ['carroceria', 'valor carroceria'], svidros: ['vidros', 'cobertura vidros'], sguincho: ['guincho', 'guincho km', 'guincho limite ou km'],
        sgru: ['gru', 'valor gru', 'valor da gru'], spremio: ['premio', 'premio liquido', 'valor do premio', 'valor premio liquido'],
        siof: ['iof', 'valor do iof', 'valor iof'], totalExcel: ['total', 'valor total', 'premio total', 'premio bruto', 'total do premio', 'premio iof', 'premio mais iof']
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
    const padraoData = '(\\d{1,2}/\\d{1,2}/\\d{4}|\\d{4}-\\d{2}-\\d{2})';
    const padraoVigencia = new RegExp(`^(?:de\\s+)?${padraoData}\\s*(?:a|até|[-–—])\\s*${padraoData}$`, 'i');
    function expandirVigencia(d) {
        if (!texto(d.vigencia)) return d;
        const { vigencia, ...campos } = d;
        const partes = padraoVigencia.exec(texto(vigencia));
        return { sinicio: partes ? partes[1] : vigencia, ...(partes ? { svencimento: partes[2] } : {}), ...campos };
    }
    function mesmoMetadado(k, a, b) {
        if (k === 'sinicio' || k === 'svencimento') {
            const data = dataISO(a);
            if (data) return data === dataISO(b);
        }
        return chave(a) === chave(b);
    }
    // Keep the Excel captions and coordinates independent of the normalized insurance fields.
    function layoutExcel(dados, mesclas, inicio, fim, mapa) {
        const ativos = new Set(mapa.map(([, c]) => c));
        for (let i = inicio; i <= fim; i++) dados[i].forEach((v, c) => {
            if (!texto(v)) return;
            const m = mesclas.find(({ s, e }) => s.r === i && s.c === c && e.r <= fim);
            for (let j = c; j <= (m?.e.c ?? c); j++) ativos.add(j);
        });
        const inicioColuna = Math.min(...ativos), fimColuna = Math.max(...ativos);
        const indices = Array.from({ length: fimColuna - inicioColuna + 1 }, (_, i) => inicioColuna + i);
        const cab = [];
        const ocupadas = new Set();
        for (let i = inicio; i <= fim; i++) {
            cab.push(indices.flatMap(c => {
                if (ocupadas.has(`${i}:${c}`)) return [];
                const m = mesclas.find(({ s, e }) => s.r === i && s.c === c && e.r <= fim);
                const largura = m ? indices.filter(j => j >= c && j <= m.e.c).length : 1;
                const altura = m ? m.e.r - i + 1 : 1;
                for (let r = i; r < i + altura; r++) for (const j of indices.filter(j => j >= c && j <= (m?.e.c ?? c))) {
                    if (r !== i || j !== c) ocupadas.add(`${r}:${j}`);
                }
                return [{ texto: texto(dados[i][c]), largura, altura }];
            }));
        }
        const campos = indices.map(c => mapa.find(([, j]) => j === c)?.[0] || '');
        const ocorrencias = new Map();
        const chaves = indices.map(c => {
            const nomes = [];
            for (let i = inicio; i <= fim; i++) {
                const m = mesclas.find(({ s, e }) => s.r >= inicio && e.r <= fim && s.r <= i && e.r >= i && s.c <= c && e.c >= c);
                const nome = chave(m ? dados[m.s.r][m.s.c] : dados[i][c]);
                if (nome && nomes[nomes.length - 1] !== nome) nomes.push(nome);
            }
            const nome = nomes.join(' / ') || `coluna ${c + 1}`;
            const n = (ocorrencias.get(nome) || 0) + 1;
            ocorrencias.set(nome, n);
            return `${nome} #${n}`;
        });
        return { indices, campos, cab, chaves };
    }
    function lerAbas(abas, receberLayout) {
        const linhas = [];
        for (const { nome, dados, exibicao = dados, primeiraLinha = 1, mesclas = [] } of abas) {
            let colunas = null, layout = null, contexto = {}, secao = tipoRisco(nome);
            const cabecalhos = dados.map(row => [...row]);
            const verticais = dados.map(() => []), depoisDaMescla = dados.map(() => []);
            for (const { s, e } of mesclas) {
                const v = dados[s.r]?.[s.c];
                if (!texto(v) || !dados[e.r]) continue;
                depoisDaMescla[s.r][s.c] = e.c + 1;
                for (let c = s.c + 1; c <= e.c; c++) cabecalhos[s.r][c] = v;
                for (let i = s.r + 1; i <= e.r; i++) verticais[i][s.c] = v;
            }
            const mapaDe = row => row.map((v, c) => [campo(v), c]).filter(([k]) => k);
            // Colunas repetidas mantêm o próprio conteúdo na grade sem sobrescrever o cadastro.
            const mapearCampos = pares => {
                const vistos = new Set();
                return pares.slice().sort((a, b) => a[1] - b[1]).filter(([k]) => {
                    if (vistos.has(k)) return false;
                    vistos.add(k);
                    return true;
                });
            };
            const resumo = v => /^(subtotal|total|totais|resumo)\b/.test(rotulo(v));
            for (let i = 0; i < dados.length; i++) {
                const row = dados[i], preenchidas = row.filter(v => texto(v));
                if (!preenchidas.length) continue;
                const titulo = preenchidas.length === 1 && tipoRisco(preenchidas[0]);
                if (titulo) { secao = titulo; colunas = layout = null; contexto = {}; continue; }
                const mapa = mapaDe(row);
                const proxima = dados[i + 1];
                const dupla = proxima && proxima.map((v, c) => {
                    const pai = cabecalhos[i][c];
                    return [texto(v) && (campo(`${texto(pai)} ${texto(v)}`) || campo(v)), c];
                }).filter(([k]) => k);
                const temPlaca = mapa.some(([k]) => k === 'sveiculo');
                const temSubcoluna = dupla?.some(([k, c]) => k !== campo(proxima[c]));
                const placaProxima = (dupla?.find(([k]) => k === 'sveiculo') || mapa.find(([k]) => k === 'sveiculo'))?.[1];
                const mesclaCabecalho = mesclas.some(({ s, e }) => s.r === i && (e.r === i && e.c > s.c || e.r === i + 1));
                // Não confundir a primeira linha de dados com uma sublinha de cabeçalho.
                const complementar = dupla?.some(([k]) => k !== 'sveiculo') && !formatoPlaca.test(placa(proxima[placaProxima])) &&
                    (mesclaCabecalho || proxima.every((v, c) => !texto(v) || dupla.some(([, j]) => j === c)));
                if (complementar && (temPlaca || (temSubcoluna && dupla.some(([k]) => k === 'sveiculo')))) {
                    colunas = mapearCampos([...mapa.filter(([, c]) => !texto(proxima[c])), ...dupla]);
                    layout = layoutExcel(exibicao, mesclas, i, i + 1, colunas);
                    if (secao) receberLayout?.(secao, layout);
                    i++; continue;
                }
                if (temPlaca) {
                    colunas = mapearCampos(mapa);
                    layout = layoutExcel(exibicao, mesclas, i, i, colunas);
                    if (secao) receberLayout?.(secao, layout);
                    continue;
                }
                const cPlaca = colunas?.find(([k]) => k === 'sveiculo')?.[1];
                if (!formatoPlaca.test(placa(row[cPlaca]))) {
                    if (resumo(preenchidas[0]) || resumo(row[cPlaca])) { contexto = {}; continue; }
                    const pares = row.reduce((out, v, c) => {
                        const separado = /^([^:]+):\s*(.+)$/.exec(texto(v));
                        const k = campo(separado?.[1] || v);
                        const valor = separado?.[2] ?? row[depoisDaMescla[i][c] ?? c + 1];
                        if ((metadados.has(k) || k === 'vigencia') && texto(valor) && !campo(valor)) out.push([k, valor, separado ? 1 : 2]);
                        return out;
                    }, []);
                    if (pares.length && pares.reduce((n, par) => n + par[2], 0) === preenchidas.length) {
                        const novos = expandirVigencia(Object.fromEntries(pares.map(([k, v]) => [k, v])));
                        if (Object.keys(obrigatorios).some(k => texto(novos[k]) && texto(contexto[k]) && !mesmoMetadado(k, novos[k], contexto[k]))) contexto = {};
                        contexto = { ...contexto, ...novos };
                        continue;
                    }
                    if (!colunas || !colunas.some(([, c]) => texto(row[c]))) continue;
                }
                const valoresLinha = {};
                for (const [k, c] of colunas) {
                    const herdavel = metadados.has(k) || k === 'stipo' || k === 'vigencia';
                    const v = texto(row[c]) ? row[c] : herdavel ? verticais[i][c] : '';
                    if (texto(v)) valoresLinha[k] = v;
                }
                const valoresExpandidos = expandirVigencia(valoresLinha);
                const cabDivergente = Object.keys(obrigatorios).some(k => texto(valoresExpandidos[k]) && texto(contexto[k]) && !mesmoMetadado(k, valoresExpandidos[k], contexto[k]));
                const r = { ...(cabDivergente ? {} : contexto), ...valoresExpandidos };
                const explicito = texto(r.stipo);
                const tipoLinha = explicito ? tipoRisco(explicito) : secao;
                const tipo = secao && tipoLinha !== secao ? '' : tipoLinha;
                if (tipo && !secao) receberLayout?.(tipo, layout);
                const celulas = layout.indices.map((c, j) => {
                    const k = layout.campos[j];
                    const valor = exibicao[i][c];
                    return texto(valor) ? texto(valor) : (metadados.has(k) || k === 'vigencia' || k === 'stipo') ? texto(r[k]) : '';
                });
                linhas.push({ aba: nome, linha: primeiraLinha + i, dados: r, tipo, layout, celulas });
            }
        }
        return linhas;
    }
    const textos = { smodelo: 120, sano: 16, sguincho: 80 };
    const valores = ['sfipe','smateriais','scorporais','smorais','scarroceria','svidros','sgru','spremio','siof'];
    const situacoes = new Map([['pendente','pendente'],['aprovada','aprovada'],['aprovado','aprovada'],['reprovada','reprovada'],['reprovado','reprovada'],['cancelada','cancelada'],['cancelado','cancelada']]);
    const rotulosCampos = {
        sveiculo: 'Placa', sseguradora: 'Seguradora', sapolice: 'Nº da apólice', scorretora: 'Corretora',
        sinicio: 'Início da vigência', svencimento: 'Fim da vigência', ssituacao: 'Situação da apólice',
        smodelo: 'Modelo', sano: 'Ano / modelo', sguincho: 'Guincho', sfipe: 'FIPE',
        smateriais: 'Danos materiais', scorporais: 'Danos corporais', smorais: 'Danos morais',
        scarroceria: 'Carroceria', svidros: 'Vidros', sgru: 'GRU', spremio: 'Prêmio', siof: 'IOF'
    };
    const rotuloCampo = k => rotulosCampos[k];
    const camposDoRisco = (tipo, k) => tipo === 'segundo' ? ['smodelo','sgru','smorais','spremio','siof'].includes(k) : k !== 'sgru';
    const chaveLinha = (r, seguros) => JSON.stringify([seguros.apolice(r), placa(r.sveiculo)]);
    function lerCentavos(valor, seguros) {
        if (typeof valor !== 'number') return seguros.centavos(valor);
        const n = Math.round(valor * 100);
        return valor >= 0 && Number.isSafeInteger(n) && n <= 999999999999 && Math.abs(valor * 100 - n) < 0.0002 ? n : NaN;
    }
    function totalCalculado(r, seguros) {
        return [r.spremio, r.siof].some(Number.isNaN) ? NaN : seguros.total(r);
    }
    function comparar(d, r, salvo, seguros) {
        const diferentes = [];
        for (const k of ['scorretora','ssituacao', ...Object.keys(textos), ...valores]) {
            if (!texto(d[k]) || r[k] === undefined) continue;
            const antes = salvo[k], depois = r[k];
            const igual = valores.includes(k) ? (antes ?? null) === depois : chave(antes) === chave(depois);
            if (!igual) diferentes.push(`${rotuloCampo(k)}: ${valores.includes(k) ? dinheiro(depois) : texto(depois) || '—'} × ${valores.includes(k) ? dinheiro(antes) : texto(antes) || '—'}`);
        }
        const a = totalCalculado(r, seguros), b = totalCalculado(salvo, seguros);
        if ((texto(d.spremio) || texto(d.siof)) && Number.isFinite(a) && a !== b) diferentes.push(`Prêmio + IOF: ${dinheiro(a)} × ${dinheiro(b)}`);
        return diferentes;
    }
    function validar(linhas, veiculos, existentes, seguros) {
        const cadastro = new Map();
        for (const v of veiculos) {
            const p = placa(v.vplaca);
            if (p && !cadastro.has(p)) cadastro.set(p, v);
        }
        const apolices = new Map(), duplicados = new Map();
        for (const r of existentes) {
            if (r.stipo !== 'principal' && r.stipo !== 'segundo') continue;
            if (!apolices.has(seguros.apolice(r))) apolices.set(seguros.apolice(r), r);
            duplicados.set(chaveLinha(r, seguros), { registro: r, banco: true });
        }
        return linhas.map((linha, indice) => {
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
            if (texto(d.ssituacao) && !situacoes.has(rotulo(d.ssituacao))) erros.push('Situação não reconhecida');
            for (const [k,max] of Object.entries(textos)) {
                if (!camposDoRisco(r.stipo, k)) continue;
                r[k] = texto(d[k]) || (k === 'smodelo' ? texto(v?.vmodelo) : '');
                if (r[k].length > max) erros.push(`${nomes[k][0]}: texto acima de ${max} caracteres`);
            }
            for (const k of valores) {
                if (!camposDoRisco(r.stipo, k)) continue;
                r[k] = lerCentavos(d[k], seguros);
                if (Number.isNaN(r[k])) erros.push(`${nomes[k][0]}: valor inválido`);
            }
            const avisos = [], totalExcel = lerCentavos(d.totalExcel, seguros), calculado = totalCalculado(r, seguros);
            if (r.stipo === 'principal' || r.stipo === 'segundo') {
                const semCampo = [...Object.keys(textos), ...valores]
                    .filter(k => texto(d[k]) && !camposDoRisco(r.stipo, k));
                if (semCampo.length) avisos.push(`Este tipo de seguro não grava: ${semCampo.map(k => `${rotuloCampo(k)} (${texto(d[k])})`).join(', ')}.`);
            }
            if (Number.isNaN(totalExcel)) avisos.push('Total do Excel inválido');
            else if (totalExcel != null && calculado !== totalExcel && !Number.isNaN(calculado)) {
                avisos.push('Total do Excel difere de Prêmio + IOF. O sistema usa Prêmio + IOF.');
            }
            const chaveApolice = seguros.apolice(r), id = chaveLinha(r, seguros), duplicada = duplicados.get(id);
            const item = { ...linha, indice, registro: r, totalExcel, calculado, avisos, erros };
            if (duplicada) {
                erros.unshift(duplicada.banco ? 'Placa já incluída nesta apólice no sistema' : 'Placa repetida nesta apólice na planilha');
                const diferencas = comparar(d, r, duplicada.registro, seguros);
                if (diferencas.length) avisos.push(`${duplicada.banco ? 'Excel/Prévia × Sistema' : 'Prévia × Primeira linha'}: ${diferencas.join('; ')}`);
                return { ...item, status: 'duplicada' };
            }
            const cab = apolices.get(chaveApolice);
            if (cab) {
                if (r.scorretora && chave(r.scorretora) !== chave(cab.scorretora) || r.ssituacao && r.ssituacao !== cab.ssituacao) {
                    erros.push('Corretora ou situação diverge dos dados da apólice');
                }
                for (const k of metadados) r[k] = texto(cab[k]);
            }
            if (erros.length) return { ...item, status: 'invalida' };
            duplicados.set(id, { registro: r, banco: false });
            if (!cab) apolices.set(chaveApolice, r);
            return { ...item, status: 'nova' };
        });
    }
    async function lerArquivo(arquivo, x, receberLivro, somenteLayout = false, receberModelos) {
        if (!x?.read) throw new Error('Leitor de Excel indisponível. Recarregue a página e tente novamente.');
        if (!/\.xlsx?$/i.test(arquivo.name)) throw new Error('Selecione uma planilha .xlsx ou .xls.');
        if (arquivo.size > 15 * 1024 * 1024) throw new Error('Selecione uma planilha de até 15 MB.');
        const livro = x.read(await arquivo.arrayBuffer(), { type: 'array', sheetRows: 5002, cellHTML: false, cellStyles: true });
        const abas = livro.SheetNames.map(nome => {
            const aba = livro.Sheets[nome];
            const faixa = aba['!ref'] && x.utils.decode_range(aba['!ref']);
            const original = aba['!fullref'] && x.utils.decode_range(aba['!fullref']);
            if ((original || faixa)?.e.r >= 5000 || faixa?.e.c >= 100) throw new Error('Use até 5.000 linhas e 100 colunas por aba.');
            const range = faixa && { s: { r: faixa.s.r, c: 0 }, e: faixa.e };
            const dados = x.utils.sheet_to_json(aba, { header: 1, defval: '', blankrows: true, raw: true, range });
            // Mantém zeros à esquerda em números de apólice formatados no Excel.
            if (faixa) dados.forEach((row, i) => row.forEach((v, c) => {
                const cel = aba[x.utils.encode_cell({ r: faixa.s.r + i, c })];
                if (typeof v === 'number' && /^0\d+$/.test(cel?.w || '')) row[c] = cel.w;
            }));
            const deslocar = p => ({ r: p.r - (faixa?.s.r ?? 0), c: p.c });
            const mesclas = (aba['!merges'] || []).map(({ s, e }) => ({ s: deslocar(s), e: deslocar(e) }))
                .filter(({ s, e }) => s.r >= 0 && s.c >= 0 && e.r < dados.length && e.c < 100);
            const fundos = new Map();
            const exibicao = receberLivro && faixa ? dados.map((row, i) => row.map((v, c) => {
                const cel = aba[x.utils.encode_cell({ r: faixa.s.r + i, c })];
                const cor = cel?.s?.fgColor?.rgb;
                if (cel?.s?.patternType === 'solid' && typeof cor === 'string' && /^(?:[a-f\d]{2})?[a-f\d]{6}$/i.test(cor)) {
                    fundos.set(i * 100 + c, cor.slice(-6));
                }
                return cel?.w ?? v;
            })) : dados;
            const larguras = (aba['!cols'] || []).slice(0, 100).map(c => c?.wpx ?? (c?.wch ?? c?.width) * 7);
            const alturas = dados.map((_, i) => {
                const r = aba['!rows']?.[(faixa?.s.r ?? 0) + i];
                return r?.hpx ?? r?.hpt * 4 / 3;
            });
            return { nome, dados, exibicao, primeiraLinha: (faixa?.s.r ?? 0) + 1, mesclas, larguras, alturas, fundos };
        });
        if (receberLivro) receberLivro(abas);
        const layouts = {};
        const linhas = lerAbas(abas, (tipo, layout) => {
            const lista = layouts[tipo] ||= [];
            if (!lista.some(l => JSON.stringify(l.cab) === JSON.stringify(layout.cab))) lista.push(layout);
        });
        if (somenteLayout) return layouts;
        if (livro.Workbook?.WBProps?.date1904) throw new Error('Salve uma cópia da planilha com o sistema de datas de 1900 antes de importar.');
        if (linhas.length > 5000) throw new Error('A planilha contém mais de 5.000 linhas de seguro. Divida em arquivos menores.');
        receberModelos?.(layouts);
        if (!linhas.length) throw new Error(Object.keys(layouts).length
            ? 'O modelo da tabela foi carregado. Não há linhas de seguro para importar neste arquivo.'
            : 'Nenhuma linha de seguro encontrada. Confira se existe uma coluna Placa abaixo dos dados da apólice.');
        return linhas;
    }
    const esc = v => texto(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const dinheiro = v => Number.isFinite(v) ? moeda.format(v/100) : '—';
    const br = v => v ? v.split('-').reverse().join('/') : '—';
    function modeloPadrao(colunas) {
        return { campos: colunas.map(([k]) => k), chaves: [], cab: [colunas.map(([, l]) => ({ texto: l, largura: 1, altura: 1 }))] };
    }
    function gradeTrabalho(layout, corpo, extras = '', rodape = '') {
        const cab = layout.cab.map((row, i) => `<tr>${row.map(c => {
            const largura = Number.isInteger(c.largura) && c.largura > 1 && c.largura <= layout.campos.length ? c.largura : 1;
            const altura = Number.isInteger(c.altura) && c.altura > 1 && c.altura <= layout.cab.length - i ? c.altura : 1;
            return `<th scope="${largura > 1 ? 'colgroup' : 'col'}"${largura > 1 ? ` colspan="${largura}"` : ''}${altura > 1 ? ` rowspan="${altura}"` : ''}>${esc(c.texto)}</th>`;
        }).join('')}${i === 0 ? extras : ''}</tr>`).join('');
        return `<div class="table-responsive" role="region" tabindex="0" aria-label="Tabela de seguros"><table class="table align-middle fm-seg-tabela-planilha"><thead>${cab}</thead><tbody>${corpo}</tbody>${rodape}</table></div>`;
    }
    const monetario = k => valores.includes(k) || k === 'totalExcel' || k === 'total';
    function valorTrabalho(k, r, celula = '', emRevisao = false) {
        if (!k || k === 'totalExcel' && texto(celula)) return texto(celula) || '—';
        if (k === 'vigencia') return r.sinicio || r.svencimento ? `${br(r.sinicio)} a ${br(r.svencimento)}` : texto(celula) || '—';
        if (k === 'stipo') return grupos.find(([id]) => id === r.stipo)?.[1] || texto(celula) || '—';
        if (k === 'sinicio' || k === 'svencimento') return r[k] ? br(r[k]) : texto(celula) || '—';
        if (k === 'total' || k === 'totalExcel') return dinheiro(r.spremio == null && r.siof == null ? null : (r.spremio || 0) + (r.siof || 0));
        if (monetario(k)) return Number.isFinite(r[k]) ? dinheiro(r[k]) : emRevisao || r[k] === undefined ? texto(celula) || '—' : '—';
        if (k === 'ssituacao') return r[k] ? r[k].charAt(0).toUpperCase() + r[k].slice(1) : emRevisao ? texto(celula) || '—' : '—';
        return texto(r[k]) || (emRevisao || r[k] === undefined ? texto(celula) : '') || '—';
    }
    function celulasTrabalho(layout, r, origem, emRevisao) {
        return layout.campos.map((k, j) => {
            const i = Array.isArray(origem?.layout?.chaves) ? origem.layout.chaves.indexOf(layout.chaves[j]) : -1;
            return `<td${monetario(k) ? ' class="fm-seg-valor"' : ''}>${esc(valorTrabalho(k, r, i < 0 ? '' : origem.celulas?.[i], emRevisao))}</td>`;
        }).join('');
    }
    function gradeOriginal(aba, pagina, limite = 30) {
        const dados = aba.exibicao;
        const total = Math.max(1, Math.ceil(dados.length / limite));
        const inicio = (pagina - 1) * limite, fim = Math.min(inicio + limite, dados.length);
        const largura = dados.reduce((n, row) => Math.max(n, row.length), 0);
        if (!largura || !dados.length) return { total, html: '<p class="mb-2">Aba sem células preenchidas.</p>' };
        const dimensao = (n, min, max) => Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : 0;
        const medidas = Array.from({ length: largura }, (_, c) => dimensao(aba.larguras?.[c], 32, 600));
        const colunas = medidas.some(Boolean) ? [48, ...medidas.map(n => n || 96)] : [];
        const larguraTabela = colunas.length ? ` style="width:${colunas.reduce((a, b) => a + b, 0)}px"` : '';
        const colgroup = colunas.length ? `<colgroup>${colunas.map(n => `<col style="width:${n}px">`).join('')}</colgroup>` : '';
        const letra = c => c < 26 ? String.fromCharCode(65 + c) : letra(Math.floor(c / 26) - 1) + letra(c % 26);
        const mescladas = new Map();
        for (const { s, e } of aba.mesclas) {
            const topo = Math.max(inicio, s.r), base = Math.min(fim - 1, e.r);
            if (base < topo || s.c >= largura) continue;
            const direita = Math.min(e.c, largura - 1);
            for (let r = topo; r <= base; r++) for (let c = s.c; c <= direita; c++) mescladas.set(r * largura + c, null);
            mescladas.set(topo * largura + s.c, { rows: base - topo + 1, cols: direita - s.c + 1, origem: s.r });
        }
        const estiloCelula = (r, c) => {
            const cor = aba.fundos?.get(r * 100 + c);
            if (!cor) return '';
            const canais = [0, 2, 4].map(i => parseInt(cor.slice(i, i + 2), 16) / 255)
                .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
            const luminosidade = .2126 * canais[0] + .7152 * canais[1] + .0722 * canais[2];
            return ` style="background-color:#${cor};color:${luminosidade > .179 ? '#000' : '#fff'}"`;
        };
        const cab = Array.from({ length: largura }, (_, c) => `<th scope="col">${letra(c)}</th>`).join('');
        const linhas = dados.slice(inicio, fim).map((row, j) => {
            const r = inicio + j;
            const celulas = Array.from({ length: largura }, (_, c) => {
                const m = mescladas.get(r * largura + c);
                if (m === null) return '';
                const estilo = estiloCelula(m?.origem ?? r, c);
                return m ? `<td rowspan="${m.rows}" colspan="${m.cols}"${estilo}>${esc(dados[m.origem]?.[c])}</td>` : `<td${estilo}>${esc(row[c])}</td>`;
            }).join('');
            const altura = dimensao(aba.alturas?.[r], 20, 240);
            return `<tr${altura ? ` style="height:${altura}px"` : ''}><th scope="row">${aba.primeiraLinha + r}</th>${celulas}</tr>`;
        }).join('');
        return { total, html: `<div class="fm-seg-grade-rolagem" tabindex="0" role="region" aria-label="Planilha: ${esc(aba.nome)}"><table class="fm-seg-grade${colunas.length ? ' fm-seg-grade-medida' : ''}"${larguraTabela}>${colgroup}<thead><tr><th scope="col" aria-label="Linha"></th>${cab}</tr></thead><tbody>${linhas}</tbody></table></div>` };
    }
    function conferirTotais(resultado, salvos, seguros) {
        const existentes = new Map(salvos.map(r => [chaveLinha(r, seguros), r]));
        const grupos = new Map();
        for (const l of resultado) {
            const r = l.registro;
            const k = JSON.stringify([l.aba, seguros.apolice(r)]);
            if (!grupos.has(k)) grupos.set(k, { aba: l.aba, apolice: r.sapolice, seguradora: r.sseguradora,
                tipo: l.tipo, inicio: r.sinicio, fim: r.svencimento, linhas: 0, gravadas: 0, excel: 0, sistema: 0,
                semTotal: 0, semTotalSistema: 0, repetidas: 0, calculadas: 0, ids: new Set() });
            const g = grupos.get(k), id = chaveLinha(r, seguros);
            const total = Number.isFinite(l.totalExcel) ? l.totalExcel : l.calculado;
            g.linhas++;
            if (Number.isFinite(total)) {
                g.excel += total;
                if (!Number.isFinite(l.totalExcel)) g.calculadas++;
            } else g.semTotal++;
            if (g.ids.has(id)) { g.repetidas++; continue; }
            g.ids.add(id);
            const salvo = existentes.get(id);
            if (salvo && l.tipo) {
                g.gravadas++;
                const totalSalvo = seguros.total(salvo);
                if (Number.isFinite(totalSalvo)) g.sistema += totalSalvo;
                else g.semTotalSistema++;
            }
        }
        return [...grupos.values()];
    }
    const grupos = [['principal','Seguro principal'], ['segundo','2º risco'], ['', 'Tipo não identificado']];
    const estados = { nova: 'Nova', duplicada: 'Duplicada', invalida: 'Não importável' };
    const camposEdicao = ['sveiculo','sseguradora','sapolice','scorretora','sinicio','svencimento','ssituacao', ...Object.keys(textos), ...valores];
    const selecionadasValidas = (resultado, indices) => {
        const marcadas = new Set(indices);
        return resultado.filter(l => l.status === 'nova' && marcadas.has(l.indice));
    };
    function montar({ botao, painel, resultado: tabelaSalva, seguros, veiculos, lista, podeGravar, gravar, ocupado, receberModelos }) {
        painel.innerHTML = `<h5>Importação de seguros</h5>
            <p>Selecione a <strong>FROTA.xlsx</strong> para preencher as colunas da tabela de Seguros. Revise e selecione as linhas que deseja gravar. A importação não sobrescreve registros existentes nem altera o Histórico.</p>
            <div id="fmSeg_areaArquivo" class="fm-seg-area-arquivo">
                <label for="fmSeg_arquivo" class="form-label fw-semibold">Selecione ou arraste a planilha de seguros (.xlsx ou .xls)</label>
                <input id="fmSeg_arquivo" type="file" accept=".xlsx,.xls" class="form-control" aria-describedby="fmSeg_nomeArquivo">
                <div id="fmSeg_nomeArquivo" class="small mt-2" hidden></div>
            </div>
            <p class="small text-muted mt-2">Use <strong>Editar</strong> para corrigir uma linha sem gravar no banco. São obrigatórios: placa cadastrada, seguradora, número da apólice e datas de início e fim da vigência.</p>
            <details id="fmSeg_abasOriginais" class="fm-seg-planilha" hidden>
                <summary>Abas originais do Excel</summary>
                <p class="small mb-2">Confira as células na ordem do arquivo. As edições na prévia não modificam esta visualização nem o Excel.</p>
                <div id="fmSeg_guiaOriginais" class="fm-seg-abas" role="group" aria-label="Abas do Excel"></div>
                <div id="fmSeg_gradeOriginal"></div>
            </details>
            <p id="fmSeg_resumoImportacao" class="mt-2" role="status"></p>
            <details id="fmSeg_conferenciaTotais" class="fm-seg-planilha" hidden>
                <summary>Conferência de placas e totais por aba e apólice</summary>
                <div id="fmSeg_quadrosTotais"></div>
            </details>
            <div id="fmSeg_selecaoImportacao" class="fm-seg-acoes mb-2" hidden>
                <button type="button" id="fmSeg_marcarImportacao" class="btn btn-sm btn-outline-primary">Selecionar todos</button>
                <button type="button" id="fmSeg_limparImportacao" class="btn btn-sm btn-outline-secondary">Desmarcar todos</button>
                <span id="fmSeg_qtdImportacao" role="status"></span>
            </div>
            <div id="fmSeg_edicaoImportacao" hidden></div>
            <div id="fmSeg_linhasImportacao"></div>
            <div class="fm-seg-acoes">
                <button type="button" id="fmSeg_revisarImportacao" class="btn btn-outline-secondary" hidden>Atualizar prévia</button>
                <button type="button" id="fmSeg_confirmarImportacao" class="btn btn-primary" hidden>Confirmar importação</button>
                <button type="button" id="fmSeg_fecharImportacao" class="btn btn-outline-secondary">Fechar prévia</button>
            </div>`;
        const buscar = id => painel.querySelector('#fmSeg_' + id);
        const arquivo = buscar('arquivo'), resumo = buscar('resumoImportacao'), tabela = buscar('linhasImportacao');
        const nomeArquivo = buscar('nomeArquivo');
        const revisar = buscar('revisarImportacao'), confirmar = buscar('confirmarImportacao'), fechar = buscar('fecharImportacao');
        const selecao = buscar('selecaoImportacao'), quantidade = buscar('qtdImportacao');
        const marcar = buscar('marcarImportacao'), desmarcar = buscar('limparImportacao'), editor = buscar('edicaoImportacao');
        const originais = buscar('abasOriginais'), guias = buscar('guiaOriginais'), grade = buscar('gradeOriginal');
        const conferencia = buscar('conferenciaTotais'), quadros = buscar('quadrosTotais');
        const paginas = new Map(), selecionadas = new Set();
        let linhas = [], resultado = [], token = 0, emEnvio = false, enviado = false, editando = null;
        let abasOriginais = [], abaOriginal = 0, paginaOriginal = 1;
        const bloqueado = () => emEnvio || enviado || editando !== null;
        const origem = l => `${esc(l.aba)} · linha ${l.linha}`;
        function mostrarOriginal(foco) {
            originais.hidden = !abasOriginais.length;
            if (originais.hidden) { guias.innerHTML = grade.innerHTML = ''; return; }
            guias.innerHTML = abasOriginais.map((a, i) => `<button type="button" class="btn btn-sm btn-outline-primary" data-seg-original="${i}" aria-pressed="${i === abaOriginal}">${esc(a.nome)}</button>`).join('');
            const { total, html } = gradeOriginal(abasOriginais[abaOriginal], paginaOriginal);
            grade.innerHTML = html + (total > 1 ? `<div class="fm-seg-acoes"><button type="button" class="btn btn-sm btn-outline-secondary" data-seg-passo="-1" ${paginaOriginal <= 1 ? 'disabled' : ''}>Anterior</button><span tabindex="-1" data-seg-pagina-original>Página ${paginaOriginal} de ${total}</span><button type="button" class="btn btn-sm btn-outline-secondary" data-seg-passo="1" ${paginaOriginal >= total ? 'disabled' : ''}>Próxima</button></div>` : '');
            if (foco === 'aba') guias.querySelector(`[data-seg-original="${abaOriginal}"]`)?.focus();
            if (foco === 'pagina') grade.querySelector('[data-seg-pagina-original]')?.focus();
        }
        function mostrarTotais(abrir = false) {
            const grupos = conferirTotais(resultado, lista(), seguros);
            conferencia.hidden = !grupos.length;
            if (conferencia.hidden) { quadros.innerHTML = ''; return; }
            const corpo = grupos.map(g => {
                const comp = g.gravadas === g.linhas && !g.semTotal && !g.semTotalSistema && !g.calculadas;
                const titulo = [g.apolice, g.seguradora, g.tipo === 'principal' ? 'Seguro principal' : g.tipo === 'segundo' ? '2º risco' : 'Tipo não identificado'].filter(Boolean).map(esc).join(' · ');
                const alertas = [g.repetidas && `${g.repetidas} duplicada(s) no Excel`, g.semTotal && `${g.semTotal} sem valor na prévia`, g.calculadas && `${g.calculadas} com valor de Prêmio + IOF da prévia`, g.semTotalSistema && `${g.semTotalSistema} sem valor cadastrado`].filter(Boolean);
                return `<tr><td>${esc(g.aba)}</td><td>${titulo}<br><small>${br(g.inicio)} a ${br(g.fim)}</small></td><td>${g.gravadas} de ${g.linhas}</td><td>${g.semTotal === g.linhas ? '—' : dinheiro(g.excel)}</td><td>${g.gravadas > g.semTotalSistema ? dinheiro(g.sistema) : '—'}</td><td>${comp ? dinheiro(g.excel - g.sistema) : '—'}</td><td>${esc(alertas.join(' · ')) || '—'}</td></tr>`;
            }).join('');
            quadros.innerHTML = `<p class="small mb-2">O comparativo soma as linhas reconhecidas, não as linhas de subtotal. A diferença só é exibida quando todas as linhas têm total no Excel e correspondência com valor no sistema.</p><div class="table-responsive"><table class="table align-middle"><thead><tr>${['Aba do Excel','Apólice','Linhas no sistema / prévia','Total Excel / prévia','Total no sistema','Diferença','Observações'].map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table></div>`;
            if (abrir) conferencia.open = true;
        }
        guias.addEventListener('click', e => {
            const b = e.target.closest('[data-seg-original]');
            if (!b) return;
            abaOriginal = Number(b.dataset.segOriginal);
            paginaOriginal = 1;
            mostrarOriginal('aba');
        });
        grade.addEventListener('click', e => {
            const b = e.target.closest('[data-seg-passo]');
            if (!b || b.disabled) return;
            paginaOriginal += Number(b.dataset.segPasso);
            mostrarOriginal('pagina');
        });
        function atualizarControles() {
            const total = resultado.filter(l => l.status === 'nova').length;
            const n = selecionadas.size;
            selecao.hidden = !resultado.length || enviado;
            quantidade.textContent = `${n} de ${total} registro(s) novo(s) selecionado(s) · todas as páginas`;
            marcar.disabled = bloqueado() || total === n;
            desmarcar.disabled = bloqueado() || !n;
            confirmar.hidden = !resultado.length || enviado;
            confirmar.disabled = !n || bloqueado() || !podeGravar();
            confirmar.textContent = n ? `Confirmar importação (${n})` : 'Confirmar importação';
            revisar.hidden = !linhas.length || enviado;
            revisar.disabled = bloqueado();
            arquivo.disabled = fechar.disabled = emEnvio || editando !== null;
        }
        function desenhar() {
            atualizarControles();
            if (tabelaSalva) tabelaSalva.hidden = !painel.hidden && resultado.length > 0 && !enviado;
            tabela.innerHTML = enviado ? '' : grupos.map(([tipo, titulo]) => {
                const itens = resultado.filter(l => l.tipo === tipo);
                if (!itens.length) return '';
                const limite = 25, total = Math.ceil(itens.length / limite);
                const pagina = Math.min(paginas.get(tipo) || 1, total);
                paginas.set(tipo, pagina);
                const grades = new Map();
                for (const l of itens.slice((pagina - 1) * limite, pagina * limite)) {
                    const layout = l.layout || modeloPadrao([['sveiculo', 'Placa']]);
                    const id = JSON.stringify(layout.cab);
                    if (!grades.has(id)) grades.set(id, { layout, linhas: [] });
                    const r = l.registro, rastro = origem(l);
                    const cab = [r.sseguradora, r.sapolice, r.scorretora].filter(Boolean).join(' · ');
                    const inelegivel = l.status !== 'nova' || bloqueado();
                    grades.get(id).linhas.push(`<tr>${celulasTrabalho(layout, r, l, true)}
                        <td><input type="checkbox" class="form-check-input" data-seg-selecionar="${l.indice}" aria-label="Selecionar ${esc(r.sveiculo)} — ${rastro}" ${selecionadas.has(l.indice) ? 'checked' : ''} ${inelegivel ? 'disabled' : ''}>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-seg-editar-previa="${l.indice}" aria-label="Editar ${esc(r.sveiculo)} — ${rastro}" ${bloqueado() ? 'disabled' : ''}>Editar</button></td>
                        <td class="fm-seg-previa-detalhe"><strong>${estados[l.status]}</strong><div class="small">${rastro}${l.editada ? ' · Editada na prévia' : ''}<br>${esc(cab) || '—'} · ${br(r.sinicio)} a ${br(r.svencimento)}</div>${[...l.erros, ...l.avisos].map(aviso => `<div class="small">${esc(aviso)}</div>`).join('')}</td></tr>`);
                }
                const paginar = total > 1 ? `<div class="fm-seg-acoes mb-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-seg-previa="${tipo}" data-pagina="${pagina - 1}" ${pagina === 1 || bloqueado() ? 'disabled' : ''}>Anterior</button><span>Página ${pagina} de ${total}</span><button type="button" class="btn btn-sm btn-outline-secondary" data-seg-previa="${tipo}" data-pagina="${pagina + 1}" ${pagina === total || bloqueado() ? 'disabled' : ''}>Próxima</button></div>` : '';
                const tabelas = [...grades.values()].map(({ layout, linhas }) => gradeTrabalho(layout, linhas.join(''), `<th scope="col" rowspan="${layout.cab.length}">Ações</th><th scope="col" rowspan="${layout.cab.length}">Validação da importação</th>`)).join('');
                return `<section class="fm-seg-apolice" data-seg-grupo="${tipo}"><h6 tabindex="-1">${titulo} (${itens.length})</h6>${paginar}${tabelas}</section>`;
            }).join('');
        }
        function abrirEditor(l) {
            editando = l.indice;
            const d = linhas[l.indice].dados;
            const opcoes = grupos.map(([tipo, titulo]) => `<option value="${tipo}" ${l.tipo === tipo ? 'selected' : ''}>${titulo}</option>`).join('');
            const data = k => k === 'sinicio' || k === 'svencimento';
            const campos = camposEdicao.map(k => {
                const valor = data(k) ? dataISO(d[k]) || d[k] : d[k];
                return `<label data-seg-campo="${k}">${esc(rotuloCampo(k))}${data(k) ? ' (dia/mês/ano ou ano-mês-dia)' : ''}<input name="${k}" class="form-control" value="${esc(valor)}" ${valores.includes(k) ? 'inputmode="decimal"' : ''}></label>`;
            }).join('');
            editor.innerHTML = `<form class="border rounded p-3 mb-3" aria-labelledby="fmSeg_tituloEdicaoImportacao">
                <h6 id="fmSeg_tituloEdicaoImportacao">Editar linha da prévia</h6><p>${origem(l)} · O total original do Excel não será alterado.</p>
                <div class="fm-seg-grid"><label>Tipo de seguro<select name="stipo" class="form-select">${opcoes}</select></label>${campos}</div>
                <div class="fm-seg-acoes"><button type="submit" class="btn btn-sm btn-primary">Salvar edição</button><button type="button" class="btn btn-sm btn-outline-secondary" data-seg-cancelar>Cancelar edição</button></div></form>`;
            editor.hidden = false;
            ajustarEditor();
            desenhar();
            editor.querySelector('[name="sveiculo"]').focus();
        }
        function ajustarEditor() {
            const tipo = editor.querySelector('[name="stipo"]').value;
            editor.querySelectorAll('[data-seg-campo]').forEach(label => {
                const k = label.dataset.segCampo;
                label.hidden = (k in textos || valores.includes(k)) && tipo && !camposDoRisco(tipo, k);
            });
        }
        function fecharEditor(salvar) {
            if (editando === null) return;
            const i = editando;
            if (salvar) {
                const form = editor.querySelector('form');
                const tipo = form.elements.namedItem('stipo').value;
                const dados = { ...linhas[i].dados };
                for (const k of camposEdicao) {
                    const input = form.elements.namedItem(k);
                    if (input.value !== input.defaultValue) dados[k] = input.value;
                }
                linhas[i] = { ...linhas[i], dados, tipo, editada: true };
            }
            editando = null;
            editor.hidden = true;
            editor.innerHTML = '';
            if (salvar) {
                revalidar('Edição salva na prévia. ');
                const l = resultado.find(item => item.indice === i);
                if (l) {
                    const grupo = resultado.filter(item => item.tipo === l.tipo);
                    paginas.set(l.tipo, Math.floor(grupo.indexOf(l) / 25) + 1);
                    desenhar();
                }
            } else desenhar();
            (tabela.querySelector(`[data-seg-editar-previa="${i}"]`) || revisar).focus();
        }
        function revalidar(prefixo = '') {
            const pronto = podeGravar();
            resultado = pronto ? validar(linhas, veiculos(), lista(), seguros) : [];
            if (pronto) {
                const validas = new Set(selecionadasValidas(resultado, selecionadas).map(l => l.indice));
                for (const i of selecionadas) if (!validas.has(i)) selecionadas.delete(i);
            }
            const contar = status => resultado.filter(l => l.status === status).length;
            const msg = pronto ? `${contar('nova')} nova(s) · ${contar('duplicada')} duplicada(s) · ${contar('invalida')} não importável(is). Marque os registros que deseja importar.` : 'Aguarde o carregamento dos seguros e dos veículos, confirme que está conectado e clique em Atualizar prévia.';
            resumo.textContent = `${prefixo}${msg}`;
            mostrarTotais();
            desenhar();
        }
        botao.addEventListener('click', () => {
            if (emEnvio || editando !== null) return;
            painel.hidden = !painel.hidden;
            botao.setAttribute('aria-expanded', String(!painel.hidden));
            desenhar();
            if (!painel.hidden) arquivo.focus();
        });
        function limparPrevia() {
            linhas = []; resultado = []; enviado = false; paginas.clear(); selecionadas.clear();
            abasOriginais = []; abaOriginal = 0; paginaOriginal = 1;
            nomeArquivo.hidden = true;
            nomeArquivo.textContent = '';
            originais.open = conferencia.open = false;
            mostrarOriginal(); mostrarTotais();
        }
        fechar.addEventListener('click', () => {
            if (emEnvio || editando !== null) return;
            token++; limparPrevia();
            arquivo.value = ''; resumo.textContent = ''; painel.hidden = true;
            botao.setAttribute('aria-expanded', 'false');
            desenhar(); botao.focus();
        });
        async function carregar(f) {
            if (!f || emEnvio || editando !== null) return;
            const atual = ++token;
            limparPrevia();
            nomeArquivo.textContent = `Arquivo em conferência: ${f.name}`;
            nomeArquivo.hidden = false;
            desenhar(); resumo.textContent = 'Lendo planilha…';
            try {
                const lidas = await lerArquivo(f, root.XLSX, abas => {
                    if (atual !== token) return;
                    abasOriginais = abas;
                    mostrarOriginal();
                }, false, modelos => {
                    if (atual === token) receberModelos?.(modelos);
                });
                if (atual !== token) return;
                linhas = lidas;
                revalidar();
            } catch (erro) {
                if (atual !== token) return;
                resumo.textContent = erro?.message || 'Não foi possível ler a planilha.';
            } finally {
                if (atual === token) arquivo.value = '';
            }
        }
        arquivo.addEventListener('change', () => carregar(arquivo.files[0]));
        const area = buscar('areaArquivo');
        area.addEventListener('dragover', e => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = arquivo.disabled ? 'none' : 'copy';
            if (!arquivo.disabled) area.classList.add('fm-seg-arrastando');
        });
        area.addEventListener('dragleave', e => {
            if (!e.relatedTarget || !area.contains(e.relatedTarget)) area.classList.remove('fm-seg-arrastando');
        });
        area.addEventListener('drop', e => {
            e.preventDefault();
            area.classList.remove('fm-seg-arrastando');
            const arquivos = e.dataTransfer?.files;
            if (!arquivo.disabled && arquivos?.length === 1) return carregar(arquivos[0]);
        });
        revisar.addEventListener('click', () => { if (!bloqueado()) revalidar(); });
        marcar.addEventListener('click', () => {
            if (bloqueado()) return;
            for (const l of resultado) if (l.status === 'nova') selecionadas.add(l.indice);
            desenhar();
            if (!desmarcar.disabled) desmarcar.focus();
        });
        desmarcar.addEventListener('click', () => {
            if (bloqueado()) return;
            selecionadas.clear(); desenhar();
            if (!marcar.disabled) marcar.focus();
        });
        editor.addEventListener('change', e => { if (e.target.name === 'stipo') ajustarEditor(); });
        editor.addEventListener('click', e => { if (e.target.closest('[data-seg-cancelar]')) fecharEditor(false); });
        editor.addEventListener('submit', e => { e.preventDefault(); fecharEditor(true); });
        tabela.addEventListener('change', e => {
            const input = e.target.closest('[data-seg-selecionar]');
            if (!input || bloqueado()) return;
            const i = Number(input.dataset.segSelecionar);
            if (resultado[i]?.status !== 'nova') return;
            if (input.checked) selecionadas.add(i); else selecionadas.delete(i);
            atualizarControles();
        });
        tabela.addEventListener('click', e => {
            if (bloqueado()) return;
            const editar = e.target.closest('[data-seg-editar-previa]');
            if (editar) {
                const l = resultado[Number(editar.dataset.segEditarPrevia)];
                if (l) abrirEditor(l);
                return;
            }
            const b = e.target.closest('[data-seg-previa]');
            if (!b) return;
            const tipo = b.dataset.segPrevia;
            paginas.set(tipo, Number(b.dataset.pagina));
            desenhar();
            tabela.querySelector(`[data-seg-grupo="${tipo}"] h6`)?.focus();
        });
        confirmar.addEventListener('click', async () => {
            if (bloqueado()) return;
            if (ocupado() || !podeGravar()) { resumo.textContent = 'Aguarde a sincronização antes de importar.'; return; }
            const novos = selecionadasValidas(resultado, selecionadas);
            if (!novos.length) return;
            const atual = token;
            const mensagem = (status, qtd) => {
                if (atual !== token) return;
                if (status === 'enviando') resumo.textContent = 'Gravando o lote no banco…';
                else if (status === 'confirmado') {
                    resumo.textContent = `${qtd} registro(s) importado(s) e confirmado(s) no banco. Confira os totais abaixo e as apólices nas abas de Seguros.`;
                    mostrarTotais(true);
                }
                else if (status === 'pendente') resumo.textContent = 'O lote aguarda a confirmação do banco. Não repita a importação; acompanhe o status da sincronização.';
                else if (status === 'erro' || status === 'fila') resumo.textContent = 'O banco não confirmou a importação. O lote pode estar na fila de sincronização; confira o status antes de tentar novamente.';
            };
            emEnvio = true;
            arquivo.disabled = fechar.disabled = true;
            desenhar();
            try {
                const retorno = await gravar(linhas, novos.map(l => l.indice), JSON.stringify(novos), mensagem);
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
    const lerModelo = (arquivo, x) => lerArquivo(arquivo, x, null, true);
    const api = { lerAbas, validar, selecionadasValidas, lerArquivo, lerModelo, montar, modeloPadrao, gradeTrabalho, celulasTrabalho };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.FMImportarSeguros = api;
})(typeof window === 'undefined' ? globalThis : window);
