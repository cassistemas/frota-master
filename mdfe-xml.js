/* Leitura local do MDF-e: somente dados declarados no manifesto; não calcula frete. */
(function () {
  'use strict';
  function primeiro(raiz, nome) { return raiz && raiz.getElementsByTagName(nome)[0]; }
  function texto(raiz, nome) { var el = primeiro(raiz, nome); return el ? String(el.textContent || '').trim() : ''; }
  function filhos(raiz, nome) { return raiz ? Array.prototype.slice.call(raiz.getElementsByTagName(nome)) : []; }
  function local(nome, uf) { return nome ? nome + (uf ? '-' + uf : '') : ''; }
  function numero(v) { var n = Number(String(v || '').replace(',', '.')); return isFinite(n) && n >= 0 ? n : 0; }
  function ler(xml) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (primeiro(doc, 'parsererror')) return null;
    var info = primeiro(doc, 'infMDFe');
    if (!info) return null;
    var ide = primeiro(info, 'ide'), modal = primeiro(info, 'infModal'), tracao = primeiro(modal, 'veicTracao');
    var totais = primeiro(info, 'tot'), carga = primeiro(info, 'prodPred');
    var origens = filhos(info, 'infMunCarrega'), destinos = filhos(info, 'infMunDescarga'), condutores = filhos(info, 'condutor');
    var nomeOrigem = origens.length === 1 ? texto(origens[0], 'xMunCarrega') : '';
    var nomeDestino = destinos.length === 1 ? texto(destinos[0], 'xMunDescarga') : '';
    var unidade = texto(totais, 'cUnid'), quantidade = numero(texto(totais, 'qCarga'));
    var data = texto(ide, 'dhEmi').slice(0, 10), numeroDoc = texto(ide, 'nMDF'), serie = texto(ide, 'serie');
    var chave = String(info.getAttribute('Id') || '').replace(/^MDFe/i, '');
    return {
      documento: numeroDoc ? 'MDF-e ' + numeroDoc + (serie ? '/' + serie : '') : (chave ? 'MDF-e ' + chave : ''),
      chave: chave, data: data,
      origem: local(nomeOrigem, texto(ide, 'UFIni')),
      destino: local(nomeDestino, texto(ide, 'UFFim')),
      placa: texto(tracao, 'placa').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      motorista: condutores.length === 1 ? texto(condutores[0], 'xNome') : '',
      toneladas: quantidade ? (unidade === '01' ? quantidade / 1000 : unidade === '02' ? quantidade : null) : null,
      carga: texto(carga, 'xProd'), valorCarga: numero(texto(totais, 'vCarga')),
      quantidadeCtes: numero(texto(totais, 'qCTe')),
      quantidadeNfes: numero(texto(totais, 'qNFe')),
      multiplasOrigens: origens.length > 1, multiplosDestinos: destinos.length > 1, multiplosCondutores: condutores.length > 1
    };
  }
  window.FMMDFeXML = { ler: ler };
})();