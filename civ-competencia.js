(function (root) {
  'use strict';
  function normalizarCompetencia(valor) {
    var texto = String(valor || '').trim();
    var iso = texto.match(/^(\d{4})-(\d{1,2})$/);
    var br = texto.match(/^(\d{1,2})\/(\d{4})$/);
    var ano = iso ? iso[1] : br ? br[2] : '';
    var mes = iso ? Number(iso[2]) : br ? Number(br[1]) : 0;
    return ano && mes >= 1 && mes <= 12 ? ano + '-' + String(mes).padStart(2, '0') : '';
  }
  function dataDoCiv(registro) {
    var competencia = normalizarCompetencia(registro && registro.lecompetencia);
    return competencia ? competencia + '-01' : (registro && (registro.venciv || registro.vencipp)) || '';
  }
  function exibirCompetencia(valor) {
    var competencia = normalizarCompetencia(valor);
    return competencia ? competencia.slice(5, 7) + '/' + competencia.slice(0, 4) : '';
  }
  root.fmNormalizarCompetenciaCiv = normalizarCompetencia;
  root.fmDataCompetenciaCiv = dataDoCiv;
  root.fmExibirCompetenciaCiv = exibirCompetencia;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizarCompetencia: normalizarCompetencia, dataDoCiv: dataDoCiv, exibirCompetencia: exibirCompetencia };
  }
})(typeof window !== 'undefined' ? window : globalThis);