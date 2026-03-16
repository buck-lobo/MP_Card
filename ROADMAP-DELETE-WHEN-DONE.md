# Roadmap (fonte de verdade) — EXCLUIR ao concluir

Este documento é o backlog oficial e deve ser apagado quando todos os itens estiverem concluídos.

## Regras
- Prioridade: Segurança/Confiabilidade > Correção de build/deploy > Observabilidade > Features.
- Cada item tem critério de aceite (AC) e “Definição de pronto”.
- Não iniciar itens fora deste arquivo.

---

## P0 — Segurança e controle de acesso (bloqueadores)

### P0.1 — Telegram WebApp: validar `initData` com fail-closed
**Problema:** validação atual permite assinatura inválida (“modo inseguro”) e loga dados sensíveis.

**Ações**
- Remover logs de parâmetros/hash/data_check_string.
- Se assinatura inválida: retornar erro e não prosseguir.
- Garantir que as Functions que dependem do token usam `TELEGRAM_BOT_TOKEN` via Secret.

**AC**
- `parseAndVerifyInitData` rejeita assinatura inválida.
- Nenhum log imprime `initData`, hash, ou token.
- Deploy continua funcionando via `firebase deploy`.

### P0.2 — Admin WebApp: remover admin hardcoded do cliente
**Problema:** `ADMIN_WEBAPP_USER_IDS` hardcoded no frontend.

**Status:** concluído.

**Ações**
- Remover hardcode.
- Servidor define admin/autorizado (Firestore) e o frontend só consome.

**AC**
- Nenhuma lista de admin embutida no build do frontend.

---

## P1 — Performance (latência e custo) — PRIORIDADE 1

### P1.0 — Otimização global de consultas e carregamento
**Problema:** abertura do MiniApp e consultas do painel admin estão lentas (muitas leituras e ordenação em memória).

**Ações**
- Trocar endpoints de listagem para usar `orderBy + limit` no Firestore (evitar `get()` + sort em memória).
- Deduplicar leituras no `userGetOverview`/`adminResumoFatura` (reusar snapshots/caching curto para evitar buscar gastos/pagamentos duas vezes).
- Adicionar medições simples de latência por endpoint (tempo total, tempo Firestore) para priorizar próximos passos.
- (Opcional) Endpoint “bundle/boot” para reduzir roundtrips na abertura e no painel admin.
- (Opcional) Paginação/cursor para admin (evitar carregar 500+ itens quando não necessário).

**AC**
- Abertura do MiniApp (carregar dados do usuário) fica visivelmente mais rápida.
- Consultar usuário no painel admin fica visivelmente mais rápida.
- Nenhum endpoint de listagem faz `get()` sem `limit` para coleções potencialmente grandes.
- Sem regressão funcional (mesmos dados exibidos).

## P2 — Build/Deploy (consistência e repetibilidade)

### P2.1 — Unificar saída das Functions (`lib` vs `lib2`)
**Problema:** `tsconfig` gera `lib2/`, mas deploy usa `lib/index.js`. Isso é risco de deploy do código errado.

**Status:** concluído.

**Ações**
- Escolher saída única (`lib/` recomendado).
- Ajustar `tsconfig.json` (`outDir`), `package.json` (`main`), e `predeploy` para compilar sempre.
- Remover/aposentar diretório redundante.

**Notas de implementação**
- `functions/lib2/` foi removido.
- `npm --prefix functions run build` faz typecheck do TS e valida que `functions/lib/index.js` (entrypoint do deploy) existe e está consistente.

**AC**
- `npm --prefix functions run build` compila e produz o `main` usado pelo Firebase.
- `firebase deploy --dry-run` e `firebase deploy` passam.

### P2.2 — Versionamento: exigir bump apenas com mudanças relevantes
**Status:** parcialmente implementado.

**AC**
- Deploy não falha se só houver mudanças irrelevantes.
- Deploy falha se houver mudanças em `functions/`, `admin-webapp/`, `scripts/`, `firebase.json` sem bump.

---

## P2 — QA/Qualidade

### P2.1 — Testes de integração das Functions (Emulator Suite)
**Ações**
- Adicionar harness de testes (Jest/Vitest) para endpoints HTTP básicos.
- Rodar em CI local.

**AC**
- Um teste mínimo valida CORS/401/403 para endpoints admin.

### P2.2 — Lint/format e typecheck
**Ações**
- ESLint + config mínima.
- `npm run lint` e `npm run typecheck`.

---

## P3 — Observabilidade e Operação

### P3.1 — Logs estruturados + correlação
**Ações**
- Padronizar logs sem dados sensíveis.
- `requestId` por requisição.

### P3.2 — Redis (Python): padronizar TLS e healthcheck
**Ações**
- Documentar `rediss://` quando provider exigir.
- Métrica/log “Redis ativo” no startup.

---

## Done
(Excluir este arquivo quando tudo acima estiver concluído.)
