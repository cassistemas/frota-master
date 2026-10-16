/* Parsing only: no records, writes or projections. */
(function () {
  'use strict';
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function norm(v) { return texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
  function cents(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : NaN;
    var s = texto(v).replace(/R\$|\s/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return /^-?\d+(?:\.\d+)?$/.test(s) ? Math.round(Number(s) * 100) : NaN;
  }
  function date(v) {
    if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().slice(0,10);
    if (typeof v === 'number' && window.XLSX) {
      var d = window.XLSX.SSF.parse_date_code(v);
      if (d) v = d.y + '-' + String(d.m).padStart(2,'0') + '-' + String(d.d).padStart(2,'0');
    }
    var s = texto(v), m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) s = m[3] + '-' + m[2] + '-' + m[1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    var dt = new Date(s + 'T12:00:00Z');
    return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0,10) === s ? s : '';
  }
  function monthEnd(s) { var d = new Date(s + 'T12:00:00Z'); return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).toISOString().slice(0,10); }
  function finame(lines) {
    var full = lines.join('\n');
    if (!/SALDO\s+DEVEDOR/i.test(full) || !/VALOR\s+PRESTA[CÇ][AÃ]O/i.test(full)) return null;
    var head = full.split(/VENCIMENTO/i)[0], contract = (head.match(/\b\d{7,}\b/) || [''])[0];
    var rows = [], current = null, total = NaN, summary = false;
    function flush() {
      if (!current) return;
      var amounts = current.text.match(/\b\d[\d.]*,\d{2}\b(?!\d)/g) || [];
      var amount = amounts.length >= 3 ? cents(amounts[amounts.length-1]) : NaN;
      rows.push({data:date(current.date),cents:amount,descricao:'FINAME' + (contract ? ' contrato '+contract : '') + ' · Vencimento '+current.date + (current.parcela ? ' · Parcela '+current.parcela : ''),placa:'',referencia:'finame|'+contract+'|'+current.date,linha:current.line,erro:Number.isSafeInteger(amount)&&amount>0?'':'Valor da prestação não reconhecido'});
      current = null;
    }
    lines.forEach(function (line,i) {
      var s = texto(line), m = s.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.*)$/);
      if (/^TOTAL\b/i.test(s)) { flush(); summary=true; }
      if (summary) { var ns=s.match(/\b\d[\d.]*,\d{2}\b(?!\d)/g)||[]; if(ns.length)total=cents(ns[ns.length-1]); return; }
      if (m) { flush(); current={date:m[1],text:m[2],parcela:(m[2].match(/^(\d{3})\s/)||['',''])[1],line:i+1}; }
      else if (current && /^[\d.,\s]+$/.test(s)) current.text += ' '+s;
    });
    flush();
    return {itens:rows,contrato:contract,total:total,soma:rows.reduce(function(s,r){return s+(Number.isSafeInteger(r.cents)?r.cents:0);},0)};
  }
  function mapped(rows, start, map, source) {
    return rows.slice(start).map(function (row,k) {
      if (!row.some(function(c){return texto(c);})) return null;
      var desc = texto(row[map.descricao]), dt=date(row[map.data]), value=cents(row[map.valor]);
      if (/^(TOTAL|SUBTOTAL|TOTAIS)(\b|$)/.test(norm(desc)) || row.some(function(c){return /^(TOTAL|SUBTOTAL|TOTAIS)$/.test(norm(c));})) return null;
      return {data:dt,cents:value,descricao:desc || 'Custo importado',placa:map.placa>=0?texto(row[map.placa]):'',referencia:source+'|'+(start+k+1),linha:start+k+1,erro:''};
    }).filter(Boolean);
  }
  window.FMFixosDados={cents:cents,date:date,monthEnd:monthEnd,finame:finame,mapped:mapped,norm:norm};
})();