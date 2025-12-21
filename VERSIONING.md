# Gerenciamento de Versão

Este projeto utiliza um sistema automatizado para garantir que todas as versões dos pacotes estejam sincronizadas.

## Como funciona

1. **Script de Atualização**: O arquivo `scripts/update-versions.js` é responsável por sincronizar as versões em todos os arquivos `package.json` do projeto.

2. **Git Hook**: Um hook `pre-commit` garante que todas as versões estejam sincronizadas antes de cada commit.

3. **Fluxo de Trabalho**:
   - Ao fazer um commit, o hook é acionado automaticamente
   - O script verifica se todas as versões estão sincronizadas
   - Se necessário, ele atualiza automaticamente as versões desatualizadas
   - O commit é interrompido para que você revise as alterações
   - Faça um novo commit para incluir as atualizações de versão

## Como atualizar a versão

1. Atualize a versão no `package.json` do diretório raiz
2. Faça um commit com a mensagem indicando a atualização de versão
3. O hook garantirá que todas as outras versões sejam atualizadas automaticamente

## Estrutura de Versão

O projeto segue o versionamento semântico (SemVer): `MAJOR.MINOR.PATCH`

- **MAJOR**: Mudanças incompatíveis com versões anteriores
- **MINOR**: Novas funcionalidades compatíveis com versões anteriores
- **PATCH**: Correções de bugs compatíveis com versões anteriores
