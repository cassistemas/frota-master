# Conferência v96 — 29/10/2026

## Conferido com dados isolados
- Abertura e navegação dos 23 módulos do menu, incluindo Manual.
- Abertura das 12 abas da Gestão da Frota, sem erros de execução observados.
- Cadastro em lote dos pneus 60 a 70 na TRP-2H05, usando valores de teste: R$ 1.000,00 cada.
- Resultado: 11 pneus, 11 saídas de estoque, 11 manutenções vinculadas, 11 eventos de instalação e 11 pré-lançamentos.
- Pneus por KM: placa visível, 11 ativos, investimento R$ 11.000,00 e custo previsto R$ 0,11/km com vida útil de teste de 100.000 km por pneu.
- Confirmação conjunta: 11 custos totalizando R$ 11.000,00. Repetir a sincronização não criou cópias.

## Correção
A confirmação conjunta tratava pneus diferentes com a mesma placa, data e valor como um lançamento repetido. Agora mantém cada origem integrada distinta e o vínculo digital da saída de estoque no custo confirmado. A mesma origem continua bloqueada contra repetição.

## Limites
- Nenhum cadastro real foi acessado ou alterado. Firebase foi substituído por respostas isoladas e o acesso às gravações reais foi bloqueado no navegador de teste.
- Foram conferidas abertura e navegação gerais; não foram testados todos os salvamentos, importações, permissões e relatórios de todos os módulos.
- Testes automatizados: 50 aprovados de 51. Continua falhando o teste de importação de combustível com KM maior (esperava 14.884; recebeu 10.000). Essa parte não foi alterada nesta correção.
- Os pré-lançamentos antigos já marcados como confirmados incorretamente não foram recriados automaticamente, para evitar cobrança duplicada sem conferir os dados reais.
- Possíveis riscos de históricos legados, alteração de valor após saída do estoque e falha no meio de um lote foram identificados por leitura do código, mas não reproduzidos nem alterados nesta etapa.

## Aplicação no domínio próprio
Enviar os arquivos desta versão ao GitHub e atualizar a página com Ctrl+F5. A correção está no sistema estático, sem necessidade de publicar o servidor de leitura de cupons.