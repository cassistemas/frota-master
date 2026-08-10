/* ============================================================
   REVISÕES KM
   Frota Master
============================================================ */

const REVISOES = {

    // A mensagem é preparada quando faltarem 4.000 km ou menos.
    alerta:4000,

    vencido:0

};

/*=============================================================
INICIALIZAÇÃO
=============================================================*/

function initRevisoes(){

    if(!db.revisoes)
        db.revisoes=[];

    carregarVeiculosRevisao();

}

/*=============================================================
CARREGA VEÍCULOS
=============================================================*/

function carregarVeiculosRevisao(){

    const select=document.getElementById("rveiculo");

    if(!select)
        return;

    select.innerHTML="<option value=''>Selecione...</option>";

    db.veiculos
    .sort((a,b)=>
        a.vplaca.localeCompare(b.vplaca)
    )
    .forEach(v=>{

        select.innerHTML+=`
        <option value="${v.vplaca}">
            ${v.vplaca} - ${v.vmodelo}
        </option>`;

    });

}

/*=============================================================
RETORNA VEÍCULO
=============================================================*/

function getVeiculoRevisao(){

    const placa=
    document.getElementById("rveiculo").value;

    return db.veiculos.find(v=>v.vplaca===placa);

}

/*=============================================================
ATUALIZA KM ATUAL
=============================================================*/

function atualizarKMAtualRevisao(){

    const veiculo=getVeiculoRevisao();

    if(!veiculo){

        document.getElementById("rkmatual").value="";

        return;

    }

    document.getElementById("rkmatual").value=
    Number(veiculo.vkm||0);

    calcularRevisao();

}

/*=============================================================
CALCULA REVISÃO
=============================================================*/

function calcularRevisao(){

    const atual=
    Number(
        document.getElementById("rkmatual").value
    )||0;

    const ultima=
    Number(
        document.getElementById("rkmultima").value
    )||0;

    const troca=
    Number(
        document.getElementById("rkm").value
    )||0;

    const proxima=
    ultima+troca;

    const faltante=
    proxima-atual;

    document.getElementById("rkmproxima").value=
    proxima;

    document.getElementById("rkmfaltante").value=
    faltante;

    const status = calcularStatusRevisao(faltante);

document.getElementById("rstatus").innerHTML =
'<span class="badge '+badgeStatusRevisao(status)+'">'+status+'</span>';

}

/*=====================================================
SALVAR REVISÃO
=====================================================*/

function salvarRevisao(){

    const idx=document.getElementById("r_idx").value;

    const obj={

        rveiculo:document.getElementById("rveiculo").value,

        rtipo:document.getElementById("rtipo").value,

        rdata:document.getElementById("rdata").value,

        robs: document.getElementById("robs").value,

        rkmatual:Number(
            document.getElementById("rkmatual").value
        )||0,

        rkmultima:Number(
            document.getElementById("rkmultima").value
        )||0,

        rkm:Number(
            document.getElementById("rkm").value
        )||0,

        rkmproxima:Number(
            document.getElementById("rkmproxima").value
        )||0,

        rkmfaltante:Number(
            document.getElementById("rkmfaltante").value
        )||0,

        rstatus:
        document.getElementById("rstatus").innerText,

        robs:
        document.getElementById("robs").value

    };

    if(obj.rveiculo==""){

        alert("Selecione um veículo.");

        return;

    }

    if(obj.rtipo==""){

        alert("Informe o serviço.");

        return;

    }

    if(obj.rkm<=0){

        alert("Informe a quilometragem.");

        return;

    }

    if(idx==""){

        db.revisoes.push(obj);

    }else{

        db.revisoes[idx]=obj;

    }

    salvarNuvem();

    limparFormularioRevisao();

    sincronizarRevisoes();

    renderRevisoes();

}

/*=====================================================
EDITAR REVISÃO
=====================================================*/

function editarRevisao(i){

    const r = db.revisoes[i];

    if(!r) return;

    document.getElementById("r_idx").value = i;

    document.getElementById("rveiculo").value = r.rveiculo;

    document.getElementById("rtipo").value = r.rtipo;

    document.getElementById("rdata").value = r.rdata || "";

    document.getElementById("rkmatual").value = r.rkmatual;

    document.getElementById("rkmultima").value = r.rkmultima;

    document.getElementById("rkm").value = r.rkm;

    document.getElementById("rkmproxima").value = r.rkmproxima;

    document.getElementById("rkmfaltante").value = r.rkmfaltante;

    const status = r.rstatus || "Em Dia";

    document.getElementById("rstatus").innerHTML =
        '<span class="badge ' +
        badgeStatusRevisao(status) +
        '">' +
        status +
        '</span>';

    document.getElementById("robs").value = r.robs || "";

    if(document.getElementById("rvalor"))
        document.getElementById("rvalor").value = r.rvalor || "";

    if(document.getElementById("roficina"))
        document.getElementById("roficina").value = r.roficina || "";

    if(document.getElementById("rresponsavel"))
        document.getElementById("rresponsavel").value = r.rresponsavel || "";

    document.getElementById("btn_cancel_revisoes").style.display = "inline-block";

    window.scrollTo({
        top:0,
        behavior:"smooth"
    });

}

/*=====================================================
EXCLUIR REVISÃO
=====================================================*/

function excluirRevisao(i){

    if(!confirm("Excluir esta revisão?"))
        return;

    db.revisoes.splice(i,1);

    salvarNuvem();

    sincronizarRevisoes();

    renderRevisoes();

}

/*=====================================================
LIMPA FORMULÁRIO
=====================================================*/

function limparFormularioRevisao(){

    document.getElementById("r_idx").value="";

    document.getElementById("rveiculo").value="";

    document.getElementById("rtipo").value="";

    document.getElementById("rkmatual").value="";

    document.getElementById("rkmultima").value="";

    document.getElementById("rkm").value="";

    document.getElementById("rkmproxima").value="";

    document.getElementById("rkmfaltante").value="";

    document.getElementById("rdata").value = "";

    document.getElementById("rstatus").value="";

    document.getElementById("robs").value="";

}

/*=============================================================
STATUS
=============================================================*/

function calcularStatusRevisao(km){

    if(km<=0)
        return "Vencida";

    if(km<=REVISOES.alerta)
        return "Atenção";

    return "Em Dia";

}

/*=============================================================
COR DO STATUS
=============================================================*/

function badgeStatusRevisao(status){

    switch(status){

        case "Vencida":

            return "bg-danger";

        case "Urgente":

            return "bg-dark";

        case "Atenção":

            return "bg-warning text-dark";

        default:

            return "bg-success";

    }

}

/*=============================================================
VEÍCULO VENDIDO?  (revisões de veículos vendidos são ignoradas)
=============================================================*/

function revisaoVeiculoAtivo(revisao){

    const veiculo = db.veiculos.find(
        v => v.vplaca === revisao.rveiculo
    );

    if(!veiculo) return false;

    return (veiculo.vstatus || "").toUpperCase() !== "VENDIDO";

}

/*=============================================================
SINCRONIZA TODAS AS REVISÕES
=============================================================*/

function sincronizarRevisoes(){

    if(!db.revisoes) return;

    db.revisoes.forEach(r=>{

        if(!revisaoVeiculoAtivo(r)) return;

        atualizarRevisao(r);

    });

}

/*=====================================================
ATUALIZA UMA REVISÃO
=====================================================*/

function atualizarRevisao(revisao){

    const veiculo = db.veiculos.find(
        v => v.vplaca === revisao.rveiculo
    );

    if(!veiculo) return;

    revisao.rkmatual = Number(veiculo.vkm || 0);

    revisao.rkmproxima =
        Number(revisao.rkmultima || 0) +
        Number(revisao.rkm || 0);

    revisao.rkmfaltante =
        revisao.rkmproxima -
        revisao.rkmatual;

    revisao.rstatus =
        calcularStatusRevisao(revisao.rkmfaltante);

}

/*=============================================================
ATUALIZA APÓS ALTERAÇÃO DO KM
=============================================================*/

function atualizarRevisoesAutomatico(){

    sincronizarRevisoes();

    salvarNuvem();

    renderModulo("revisoes");

}

/*=============================================================
ALERTA MANUAL DE WHATSAPP PARA MOTORISTA ATIVO

Não existe envio automático ou chamada de API. O usuário decide
quando enviar e o botão abre o WhatsApp com a mensagem preenchida.
=============================================================*/

function textoNormalizado(valor){

    return String(valor || "")
        .trim()
        .toLocaleLowerCase("pt-BR");

}

function motoristaAtivoDaRevisao(revisao){

    const veiculo = db.veiculos.find(
        v => textoNormalizado(v.vplaca) === textoNormalizado(revisao.rveiculo)
    );

    if(!veiculo) return { veiculo:null, motorista:null };

    const statusVeiculo = String(veiculo.vstatus || "").toUpperCase();

    if(statusVeiculo !== "ATIVO")
        return { veiculo, motorista:null };

    const nome = textoNormalizado(veiculo.vmotorista);

    const motorista = (db.motoristas || []).find(m =>
        textoNormalizado(m.motNome) === nome &&
        String(m.motStatus || "").toUpperCase() === "ATIVO"
    );

    return { veiculo, motorista: motorista || null };

}

function telefoneWhatsApp(valor){

    let telefone = String(valor || "").replace(/\D/g, "");

    if(telefone.length === 10 || telefone.length === 11)
        telefone = "55" + telefone;

    return telefone;

}

function mensagemWhatsAppRevisao(revisao, veiculo, motorista){

    const faltam = Math.max(0, Number(revisao.rkmfaltante || 0));

    return [
        `Olá, ${motorista.motNome || "motorista"}!`,
        "",
        `A revisão do veículo ${veiculo.vplaca || revisao.rveiculo}${veiculo.vmodelo ? ` (${veiculo.vmodelo})` : ""} está próxima.`,
        `Serviço: ${revisao.rtipo || "Revisão"}.`,
        `Faltam ${faltam.toLocaleString("pt-BR")} km para a manutenção.`,
        `Próxima revisão em ${Number(revisao.rkmproxima || 0).toLocaleString("pt-BR")} km.`,
        "",
        "Favor programar a parada para manutenção."
    ].join("\n");

}

function dadosAlertaWhatsAppRevisao(revisao){

    const vinculo = motoristaAtivoDaRevisao(revisao);

    if(!vinculo.veiculo || !vinculo.motorista){
        return {
            ...vinculo,
            telefone:"",
            mensagem:"",
            situacao:"sem-motorista"
        };
    }

    const telefone = telefoneWhatsApp(vinculo.motorista.motTel);

    return {
        ...vinculo,
        telefone,
        mensagem: mensagemWhatsAppRevisao(
            revisao,
            vinculo.veiculo,
            vinculo.motorista
        ),
        situacao: telefone ? "pendente" : "sem-telefone"
    };

}

function enviarAlertaRevisaoWhatsApp(indice){

    const revisao = db.revisoes[indice];

    if(!revisao) return;

    atualizarRevisao(revisao);

    const alerta = dadosAlertaWhatsAppRevisao(revisao);

    if(!alerta.motorista){
        alert("Não há motorista vinculado e ativo no veículo e no cadastro de motoristas.");
        return;
    }

    if(!alerta.telefone){
        alert(`O motorista ${alerta.motorista.motNome || ""} não possui telefone válido cadastrado.`);
        return;
    }

    const url = `https://wa.me/${alerta.telefone}?text=${encodeURIComponent(alerta.mensagem)}`;
    const janela = window.open(url, "_blank", "noopener,noreferrer");

    if(!janela){
        alert("O navegador bloqueou a abertura do WhatsApp. Permita pop-ups e tente novamente.");
        return;
    }

    revisao.whatsappAlertaStatus = "link-aberto";
    revisao.whatsappAlertaEnviadoEm = new Date().toISOString();
    salvarNuvem();
    renderRevisoes();

}

function statusWhatsAppRevisao(revisao){

    const alerta = dadosAlertaWhatsAppRevisao(revisao);

    if(alerta.situacao === "sem-motorista")
        return '<span class="badge bg-secondary">Sem motorista ativo</span>';

    if(alerta.situacao === "sem-telefone")
        return '<span class="badge bg-secondary">Sem telefone</span>';

    if(revisao.whatsappAlertaStatus === "link-aberto")
        return '<span class="badge bg-success">Link aberto</span>';

    return '<span class="badge bg-warning text-dark">Pendente</span>';

}

/*=============================================================
UTILITÁRIO
=============================================================*/

function numero(valor){

    return Number(valor||0);

}

/*=====================================================
DASHBOARD REVISÕES
=====================================================*/

function atualizarDashboardRevisoes(){

    if(!db.revisoes) return;

    let vencidas=0;
    let atencao=0;
    let emdia=0;

    db.revisoes.forEach(r=>{

        if(!revisaoVeiculoAtivo(r)) return;

        atualizarRevisao(r);

        switch(r.rstatus){

            case "Vencida":
                vencidas++;
            break;

            case "Atenção":
                atencao++;
            break;

            default:
                emdia++;

        }

    });

    if(document.getElementById("dashRevVencidas"))
        document.getElementById("dashRevVencidas").innerHTML=vencidas;

    if(document.getElementById("dashRevAtencao"))
        document.getElementById("dashRevAtencao").innerHTML=atencao;

    if(document.getElementById("dashRevEmDia"))
        document.getElementById("dashRevEmDia").innerHTML=emdia;

}

/*=========================================================
RENDERIZA REVISÕES
=========================================================*/

function renderRevisoes(){

    sincronizarRevisoes();

    let lista = db.revisoes.filter(r => revisaoVeiculoAtivo(r));

    lista.sort((a,b)=>{

        const ordem={

            "Vencida":0,

            "Urgente":1,

            "Atenção":2,

            "Em Dia":3

        };

        return ordem[a.rstatus]-ordem[b.rstatus];

    });

    document.getElementById("listaRevisoes").innerHTML =

    lista.map(r=>{

        let indice=db.revisoes.indexOf(r);

        return`

<tr>

<td>

${r.rveiculo}

</td>

<td>

${r.rtipo}

</td>

<td class="text-end">

${Number(r.rkmatual||0).toLocaleString("pt-BR")} km

</td>

<td class="text-end">

${Number(r.rkmultima||0).toLocaleString("pt-BR")}

</td>

<td class="text-end">

${Number(r.rkm||0).toLocaleString("pt-BR")}

</td>

<td class="text-end">

${Number(r.rkmproxima||0).toLocaleString("pt-BR")}

</td>

<td class="text-end">

<b>

${Number(r.rkmfaltante||0).toLocaleString("pt-BR")}

</b>

</td>

<td>

<span class="badge ${badgeStatusRevisao(r.rstatus)}">

${r.rstatus}

</span>

</td>

<td>

${r.rdata
    ? formatarDataBR(r.rdata)
    : "--"}

</td>

<td style="min-width:150px;">

${Number(r.rkmfaltante || 0) <= REVISOES.alerta
    ? `${statusWhatsAppRevisao(r)}
        <button
            class="btn btn-success btn-sm mt-1"
            onclick="enviarAlertaRevisaoWhatsApp(${indice})">
            WhatsApp
        </button>`
    : '<span class="text-muted">Não necessário</span>'}

</td>

<td style="max-width:250px; white-space:normal;">

${r.robs || "--"}

</td>

<td>

<button
class="btn-edit"
onclick="editarRevisao(${indice})">

✎

</button>

<button
class="btn-del"
onclick="excluirRevisao(${indice})">

✕

</button>

</td>
`;

}).join("");

    atualizarDashboardRevisoes();

}

function getAlertasRevisoes(){

    let alertas = [];

    db.revisoes.forEach(r=>{

        if(!revisaoVeiculoAtivo(r)) return;

        atualizarRevisao(r);

        const faltam = Number(r.rkmfaltante || 0);

        if(faltam <= 0){

            alertas.push({
                tipo:"Revisão Vencida",
                veiculo:r.rveiculo,
                descricao:r.rtipo,
                status:"VENCIDA",
                cor:"danger",
                prioridade:1
            });

        }else if(faltam <= REVISOES.alerta){

            alertas.push({
                tipo:"Revisão Próxima",
                veiculo:r.rveiculo,
                descricao:`${r.rtipo} (faltam ${faltam.toLocaleString("pt-BR")} km)`,
                status:"ATENÇÃO",
                cor:"warning",
                prioridade:2
            });

        }

    });

    return alertas;

}
