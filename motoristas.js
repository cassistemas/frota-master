function diasRestantes(data){

    if(!data) return null;

    const hoje=new Date();

    hoje.setHours(0,0,0,0);

    const venc=new Date(data);

    venc.setHours(0,0,0,0);

    return Math.ceil(

        (venc-hoje)/(1000*60*60*24)

    );

}

function obterAlertasMotoristas(){

    let alertas=[];

    db.motoristas.forEach(m=>{

        const diasCNH=diasRestantes(m.motVencCnh);

        if(diasCNH!==null){

            if(diasCNH<0){

                alertas.push({
                    tipo:"CNH",
                    texto:`${m.motNome} - CNH vencida`,
                    classe:"alerta-vencido"
                });

            }

            else if(diasCNH<=40){

                alertas.push({
                    tipo:"CNH",
                    texto:`${m.motNome} - CNH vence em ${diasCNH} dias`,
                    classe:"alerta-atencao"
                });

            }

        }

        const diasTox=diasRestantes(m.motVencTox);

        if(diasTox!==null){

            if(diasTox<0){

                alertas.push({
                    tipo:"TOX",
                    texto:`${m.motNome} - Toxicológico vencido`,
                    classe:"alerta-vencido"
                });

            }

            else if(diasTox<=40){

                alertas.push({
                    tipo:"TOX",
                    texto:`${m.motNome} - Toxicológico vence em ${diasTox} dias`,
                    classe:"alerta-atencao"
                });

            }

        }

    });

    return alertas;

}

function atualizarDashboardMotoristas(){

    const alertas = obterAlertasMotoristas();

    dashboard.alertasMotoristas = alertas;

    atualizarCardsDashboard();

}

function renderMotoristas() {

    const dados = getDadosPaginados('motoristas');
    const corpoTabela = document.getElementById('listaMotoristas');

    corpoTabela.innerHTML = '';

    dados.forEach((m) => {

        const realIndex = db.motoristas.indexOf(m);

        const horario =
            (m.motInicio && m.motFim)
                ? `${m.motInicio} às ${m.motFim}`
                : "--";

        const status = m.motStatus || "Ativo";

        const corStatus =
            status === "Inativo"
                ? '<span class="badge bg-danger">Inativo</span>'
                : '<span class="badge bg-success">Ativo</span>';

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${m.motNome || '--'}</td>
            <td>${m.motCpf || '--'}</td>
            <td>${m.motCnh || '--'}</td>
            <td>${m.motTel || '--'}</td>
            <td>${formatarDataBR(m.motVencCnh)}</td>
            <td>${formatarDataBR(m.motVencTox)}</td>
            <td>${horario}</td>
            <td>${corStatus}</td>
            <td>
                <button class="btn-edit" onclick="editar('motoristas',${realIndex})">✎</button>
                <button class="btn-del" onclick="deletar('motoristas',${realIndex})">✕</button>
            </td>
        `;

        corpoTabela.appendChild(tr);
    });

    renderPaginacao('motoristas', 'paginacaoMotoristas');
}
