# Manual do Frota Master

## Gestão da Frota › Lançamentos › Importar demonstrativo de rastreamento / telemetria

1. Na aba **Lançamentos**, no quadro "Importar demonstrativo de rastreamento / telemetria", escolha o PDF do demonstrativo (ex.: Omnilink).
2. O sistema lê linha por linha (equipamentos OMNILINK, OMNIDVR etc.), soma o **TOTAL** de cada linha por **placa** e mostra a prévia com:
   placa, motorista vinculado ao cadastro do veículo, competência do PDF, quantidade de itens e total.
3. O resumo compara a soma lida com o **TOTAIS** do PDF e avisa se houver diferença.
4. Placas sem cadastro aparecem como "Veículo não cadastrado" e não podem ser lançadas. Competências já lançadas para a placa aparecem como "Já lançado".
5. Ações na prévia: **Lançar**, **Editar** (valor, descrição e motorista) e **Excluir** por linha; **Lançar selecionados**, **Lançar todos**, **Excluir selecionados** e **Excluir todos**.
6. Cada lançamento entra como custo **Rastreamento / Telemetria** (fixo, realizado) no dia 1º da competência, e passa a compor o custo por veículo e da frota.
7. Depois de lançados, edite ou exclua os custos pela própria lista de Lançamentos, como qualquer outro custo.

### Rastreamento: competência e data
Na prévia do demonstrativo há os campos **Competência** e **Data do lançamento**. Ao escolher a competência, a data é preenchida automaticamente com o dia 1 daquele mês (pode ser alterada).

### Rastreamento: leitor de PDF de reserva
Se a pasta `vendor` não existir no site, o sistema baixa o leitor de PDF automaticamente pela internet.


## Gestão da Frota — cartões mais claros
- Os cartões mostram um **?** com a explicação da conta e o período usado.
- "Custo da frota" passou a se chamar **Custo total da frota**; "Custo dos lançamentos filtrados" passou a **Soma dos lançamentos (lista)**.
- Na aba Lançamentos aparece o quadro **De onde vem a diferença**, que mostra como a soma da lista chega ao custo total da frota (depreciação e pneus calculados).
- Nenhuma conta foi alterada; é só apresentação.
