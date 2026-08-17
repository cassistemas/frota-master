# Atualização do módulo de férias

Esta versão adiciona ao módulo de férias:

- quantidade de dias de férias;
- data final calculada a partir do início e da quantidade de dias;
- data de retorno calculada automaticamente como o dia seguinte ao final;
- sincronização nos dois sentidos: alterar a data final ou o retorno recalcula os demais campos;
- tolerância configurável de sobreposição de dias;
- bloqueio de férias para qualquer motorista quando a sobreposição ultrapassa a tolerância;
- dias e data de retorno na tabela e no relatório de férias.

## Atualização

Substitua os arquivos do sistema pelos arquivos desta pasta, mantendo a configuração do Firebase já utilizada pelo sistema.

Os arquivos alterados são:

- `index.html`
- `pro-ui.css`

A configuração de tolerância fica no documento `frota/ferias` do Firestore, em `configuracoes.toleranciaSobreposicaoDias`. O valor padrão é `0`, que bloqueia qualquer dia coincidente.