# Changelog

## 1.0.6 — 2026-02-23
- Sessão Telegram (`initData`): validação com janela principal + fallback estendido para reduzir falsos expirados sem remover validação de assinatura
- Painel web: mensagens de erro de sessão mais claras e consistentes
- UI/UX: padronização de botões para formato retangular com leve arredondamento e tamanhos consistentes por grupo

## 1.0.5 — 2026-02-23
- Painel web: melhoria no tratamento de sessão Telegram (`initData`) com mensagens amigáveis para sessão expirada/inválida
- Painel admin: carregamento de usuários e busca com header de autenticação mais resiliente
- UI/UX: cabeçalho, badges, navegação e tabs reformulados para visual mais profissional e legibilidade mobile

## 1.0.4 — 2026-02-23
- Painel admin: adicionados botões visíveis para registrar `Novo gasto` e `Novo pagamento` para o usuário selecionado
- Fluxo admin acting-as-user: operações `user*` recebem `targetUserId` no painel admin para lançar/editar/cancelar em nome do usuário
- Governança de release: validação obrigatória no pre-push para exigir `CHANGELOG.md` e incremento de versão em mudanças de sistema

## 1.0.3 — 2025-12-21
- Validação do `initData` via `@tma.js/init-data-node`
- Painel admin: verificação de admin usando `adminMeta` (mais robusto)
- Solicitações de acesso: listagem sem depender de índice composto do Firestore

## 1.0.2 — 2025-12-21
- Migração de TELEGRAM_BOT_TOKEN para Secret Manager (Functions)
- Hardening da validação do initData (Telegram WebApp)
- Scripts PowerShell para sincronizar `.env` -> Firebase Secret
- Predeploy sincroniza versões (raiz/admin-webapp/functions)
