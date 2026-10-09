(function (root) {
  'use strict';
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function normal(v) { return texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function numero(v) {
    if (typeof v === 'number') return v;
    var s = texto(v).replace(/R\$|\s/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return Number(s);
  }
  function data(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') { var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return dt.toISOString().slice(0, 10); }
    var s = texto(v), m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) s = m[3] + '-' + m[2] + '-' + m[1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    var d = new Date(s + 'T12:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : '';
  }
  function tipo(v) {
    var n = normal(v);
    if (/ARLA/.test(n)) return 'Arla32';
    if (/S500/.test(n)) return 'Diesel S500';
    if (/S10/.test(n)) return 'Diesel S10';
    if (/GASOLINA/.test(n)) return 'Gasolina';
    return '';
  }
  function assinatura(x) { return [normal(x.posto), normal(x.cnpj), x.data, normal(x.placa), x.km, normal(x.produto), x.litros, x.valorLitro, x.totalCentavos].join('|'); }
  function ler(rows, aba) {
    var h = rows.findIndex(function (r) { return r.some(function (v) { return normal(v) === 'NOMEPOSTO'; }) && r.some(function (v) { return normal(v) === 'PLACA'; }); });
    if (h < 0) return [];
    var headers = rows[h].map(normal), c = function (nome) { return headers.indexOf(nome); };
    var ci = c('COMBUSTIVEL'), ai = c('ARLA32');
    if (ci < 0 || ai < 0) throw new Error('Faltam as colunas de Combustível e ARLA 32.');
    var out = [], vistos = new Set();
    rows.slice(h + 1).forEach(function (r, i) {
      // Totais e linhas de fórmulas vazias não são abastecimentos.
      if (!texto(r[c('NOMEPOSTO')]) && !texto(r[c('DATA')]) && !texto(r[c('PLACA')])) return;
      var base = { posto: texto(r[c('NOMEPOSTO')]), cnpj: texto(r[c('CNPJPOSTO')]), data: data(r[c('DATA')]), placa: texto(r[c('PLACA')]), km: texto(r[c('KM')]) === '' ? '' : numero(r[c('KM')]), aba: aba || '', linha: h + i + 2, totalConjuntoOriginal: numero(r[c('VALORTOTALDIESELARLA')]) };
      [ci, ai].forEach(function (col) {
        var litros = numero(r[col + 1]), preco = numero(r[col + 2]), total = numero(r[col + 3]), produto = texto(r[col]);
        if (!produto && !(litros > 0) && !(total > 0)) return;
        // Texto de ARLA repetido na primeira coluna sem volume não cria outro item.
        if (!(litros > 0) && !(total > 0)) return;
        var x = Object.assign({}, base, { colunaProduto: col === ci ? 'combustivel' : 'arla', produto: produto, tipo: tipo(produto), litros: litros, valorLitro: preco, totalCentavos: Number.isFinite(total) ? Math.round(total * 100) : NaN });
        x.original = Object.assign({}, x);
        x.referencia = assinatura(x);
        if (vistos.has(x.referencia)) return;
        vistos.add(x.referencia); out.push(x);
      });
    });
    return out;
  }
  function veiculo(x, veiculos) { return (veiculos || []).find(function (v) { return normal(v.vplaca) === normal(x.placa) && normal(v.vstatus) !== 'VENDIDO'; }); }
  function erro(x, veiculos) {
    if (!data(x.data)) return 'Informe a data';
    if (!x.placa || !veiculo(x, veiculos)) return 'Vincule um veículo cadastrado';
    if (!Number.isFinite(numero(x.km)) || numero(x.km) <= 0) return 'Informe o KM';
    if (!x.posto) return 'Informe o posto';
    if (['Gasolina', 'Diesel S500', 'Diesel S10', 'Arla32'].indexOf(x.tipo) < 0) return 'Produto não reconhecido como combustível/ARLA';
    if (!(numero(x.litros) > 0) || !(numero(x.valorLitro) > 0)) return 'Confira litros e preço';
    var calc = Math.round(numero(x.litros) * numero(x.valorLitro) * 100);
    if (!(x.totalCentavos > 0) || Math.abs(calc - x.totalCentavos) > 1) return 'Total diverge de litros × preço';
    return '';
  }
  function igual(x, r) {
    if (r.cimportacaoReferencia === x.referencia) return true;
    return normal(r.cveiculo) === normal(x.placa) && r.cdata === x.data && r.ctipo === x.tipo &&
      Math.abs(numero(r.clitros) - numero(x.litros)) < 0.000001 &&
      Math.abs(numero(r.cvalorlitro) - numero(x.valorLitro)) < 0.000001 &&
      Number(r.ckm || 0) === Number(x.km || 0) && normal(r.cposto) === normal(x.posto);
  }
  function dataBr(v) { var d = data(v); return d ? d.slice(8,10) + '/' + d.slice(5,7) + '/' + d.slice(0,4) : texto(v); }
  function competencia(v) { return data(v).slice(0,7); }
  function competenciaBr(v) { var c = competencia(v); return c ? c.slice(5,7) + '/' + c.slice(0,4) : '—'; }
  function agrupar(itens) {
    var grupos = new Map();
    itens.forEach(function(x) { var k = JSON.stringify([x.aba,x.linha]); if (!grupos.has(k)) grupos.set(k,[]); grupos.get(k).push(x); });
    return Array.from(grupos.values());
  }
  root.FMCombustivelPlanilhaDados = { ler: ler, numero: numero, data: data, tipo: tipo, normal: normal, veiculo: veiculo, erro: erro, igual: igual, dataBr: dataBr, competencia: competencia, competenciaBr: competenciaBr, agrupar: agrupar };
})(typeof window === 'undefined' ? globalThis : window);