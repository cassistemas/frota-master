/* ==========================================================
   FROTA MASTER - REGRAS DAS SOLICITAÇÕES DE RESERVA
   Só leitura: confere período, veículo disponível e conflito.
   Não grava nada. Usado pela página de reserva e pela aprovação.
   ========================================================== */
(function (raiz) {
  "use strict";

  function placaNorm(p) { return String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

  function instante(data, hora) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || "")) || !/^\d{2}:\d{2}$/.test(String(hora || ""))) return null;
    var d = new Date(data + "T" + hora);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // Mesma regra do módulo Saída de Veículos: só veículos com status Ativo.
  function veiculoDisponivel(v) {
    return !!(v && v.vplaca && String(v.vstatus || "Ativo") === "Ativo");
  }

  function cruza(ini, fim, ini2, fim2) {
    return ini2 !== null && fim2 !== null && ini < fim2 && fim > ini2;
  }

  // Retorna a mensagem do primeiro problema ou "" quando a solicitação pode seguir.
  function validarSolicitacao(sol, ctx) {
    ctx = ctx || {};
    var agora = typeof ctx.agora === "number" ? ctx.agora : Date.now();
    if (!sol || !sol.placa) return "Escolha o veículo.";
    var ini = instante(sol.dataSaida, sol.horaSaida);
    var fim = instante(sol.dataChegada, sol.horaChegada);
    if (ini === null) return "Informe a data e a hora de saída.";
    if (fim === null) return "Informe a data e a hora de chegada.";
    if (fim <= ini) return "A data/hora de chegada deve ser maior que a data/hora de saída.";
    if (!ctx.ignorarPassado && ini < agora - 5 * 60000) return "A saída não pode ser no passado.";
    if (!String(sol.destino || "").trim()) return "Informe o destino.";

    var alvo = placaNorm(sol.placa);
    var veic = (ctx.veiculos || []).find(function (v) { return placaNorm(v && v.vplaca) === alvo; });
    if (!veic) return "Veículo não encontrado no cadastro.";
    if (!veiculoDisponivel(veic)) return "Este veículo está " + (veic.vstatus || "indisponível") + " e não pode ser reservado.";

    var saida = (ctx.saidas || []).some(function (s) {
      if (!s || placaNorm(s.svveiculo) !== alvo || s.svreserva !== "Reservado") return false;
      return cruza(ini, fim, instante(s.svdataSaida, s.svhoraSaida), instante(s.svdataChegada, s.svhoraChegada));
    });
    if (saida) return "Este veículo já possui uma reserva neste período.";

    var outra = (ctx.solicitacoes || []).some(function (o) {
      if (!o || o.id === sol.id || placaNorm(o.placa) !== alvo) return false;
      if (o.status !== "Pendente" && o.status !== "Aprovada") return false;
      return cruza(ini, fim, instante(o.dataSaida, o.horaSaida), instante(o.dataChegada, o.horaChegada));
    });
    if (outra) return "Já existe outra solicitação para este veículo neste período.";
    return "";
  }

  function dataBR(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso || ""); }

  // O solicitante nunca edita nem exclui solicitações.
  function validarAcao(sol, uid, acao) {
    return "As solicitações não podem ser editadas nem excluídas pelo solicitante. Fale com o administrador.";
  }

  // Administrador: editar/excluir somente antes de confirmar a devolução.
  function validarAcaoAdmin(sol, admin, acao) {
    if (!admin) return "Somente o administrador pode editar ou excluir solicitações.";
    if (acao !== "editar" && acao !== "excluir") return "Ação inválida.";
    if (!sol) return "Solicitação não encontrada.";
    if (sol.status !== "Devolução informada") return "Só é possível editar ou excluir antes de confirmar a devolução.";
    return "";
  }

  // Devolução informada pelo motorista: horários reais e KM final.
  function validarDevolucao(dev, ctx) {
    ctx = ctx || {};
    var agora = typeof ctx.agora === "number" ? ctx.agora : Date.now();
    var ini = instante(dev && dev.dataSaidaReal, dev && dev.horaSaidaReal);
    var fim = instante(dev && dev.dataDevolucao, dev && dev.horaDevolucao);
    if (ini === null) return "Informe a data e a hora em que saiu com o veículo.";
    if (fim === null) return "Informe a data e a hora da devolução.";
    if (fim < ini) return "A devolução deve ser depois da saída.";
    if (fim > agora + 5 * 60000) return "A devolução não pode ser no futuro.";
    var km = Number(String(dev.kmFinal || "").replace(/\D/g, ""));
    if (km && ctx.kmAtual && km < Number(ctx.kmAtual)) return "O KM final não pode ser menor que o KM atual do veículo (" + ctx.kmAtual + ").";
    if (ctx.exigirEndereco && !String(dev.enderecoDevolucao || "").trim() && !(dev.latitude && dev.longitude)) return "Falta o endereço da devolução.";
    return "";
  }

  function linkWhatsApp(numero, sol, titulo) {
    var dig = String(numero || "").replace(/\D/g, "");
    if (dig.length < 10) return "";
    if (dig.length <= 11) dig = "55" + dig;
    var txt = (titulo || "Nova solicitação de reserva de veículo (aguarda aprovação)") + "\n" +
      "Solicitante: " + (sol.solicitante || "") + "\n" +
      "Veículo: " + (sol.placa || "") + "\n" +
      "Saída: " + dataBR(sol.dataSaida) + " " + (sol.horaSaida || "") + "\n" +
      "Chegada: " + dataBR(sol.dataChegada) + " " + (sol.horaChegada || "") + "\n" +
      "Destino: " + (sol.destino || "") +
      (sol.motivo ? "\nMotivo: " + sol.motivo : "") +
      (sol.dataDevolucao ? "\nSaída real: " + dataBR(sol.dataSaidaReal) + " " + (sol.horaSaidaReal || "") + "\nDevolução: " + dataBR(sol.dataDevolucao) + " " + (sol.horaDevolucao || "") + (sol.kmFinal ? "\nKM final: " + sol.kmFinal : "") + (sol.enderecoDevolucao ? "\nEndereço: " + sol.enderecoDevolucao : "") : "");
    return "https://wa.me/" + dig + "?text=" + encodeURIComponent(txt);
  }

  var api = { validarAcao: validarAcao, validarAcaoAdmin: validarAcaoAdmin, validarSolicitacao: validarSolicitacao, validarDevolucao: validarDevolucao, veiculoDisponivel: veiculoDisponivel, linkWhatsApp: linkWhatsApp, placaNorm: placaNorm, dataBR: dataBR };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (raiz) raiz.FMReservasRegras = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));
