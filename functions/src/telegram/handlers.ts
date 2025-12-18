import { sendMessage, answerCallbackQuery } from "./api";
import { db } from "../firebase";
import { ADMIN_USER_IDS } from "../admin";

// Código de acesso simples para liberar usuários (pode ser alterado futuramente ou movido para config/env)
const ACCESS_CODE = "MP_ACCESS_2025";

// URL do MiniApp / Painel WebApp (usada para usuários e administradores)
const WEBAPP_URL = "https://bot-cartao-credito.web.app/?v=2025-12-03-1";

// Helpers para manter o modelo de dados próximo ao bot Python
async function registerUser(user: any): Promise<void> {
  const userRef = db.collection("usuarios").doc(String(user.id));
  const agora = new Date();

  try {
    const snap = await userRef.get();
    const exists = snap.exists;

    const baseData: any = {
      name: user.first_name ?? "",
      username: user.username ?? null,
      last_seen: agora,
      ativo: true,
    };

    if (!exists) {
      // Primeiro registro do usuário: define criado_em e atualizado_em.
      baseData.criado_em = agora;
      baseData.atualizado_em = agora;
    }

    await userRef.set(baseData, { merge: true });
  } catch (err) {
    console.error("Erro ao registrar/atualizar usuário (registerUser)", err);
  }
}
const ESTADO_NORMAL = "normal";
const ESTADO_AGUARDANDO_GASTO = "aguardando_gasto";
const ESTADO_AGUARDANDO_PAGAMENTO = "aguardando_pagamento";

function isAdmin(user: any): boolean {
  const userId = user?.id;
  if (userId === undefined || userId === null) {
    return false;
  }
  return ADMIN_USER_IDS.includes(String(userId));
}

export async function ensureUserAuthorized(
  user: any,
  token: string,
  chatId: number
): Promise<boolean> {
  const userIdRaw = user?.id;
  if (userIdRaw === undefined || userIdRaw === null) {
    await sendMessage(
      token,
      chatId,
      "Não foi possível identificar seu usuário no Telegram."
    );
    return false;
  }

  const userIdStr = String(userIdRaw);
  const userRef = db.collection("usuarios").doc(userIdStr);

  // Garantir registro básico e atualizar apenas o last_seen.
  await registerUser(user);

  const snap = await userRef.get();
  const data = (snap.data() as any) || {};

  // Admin sempre é considerado autorizado; se ainda não estiver marcado, gravar.
  if (isAdmin(user)) {
    if (!data.autorizado) {
      await userRef.set({ autorizado: true }, { merge: true });
    }
    return true;
  }

  if (data.autorizado === true) {
    return true;
  }

  await sendMessage(
    token,
    chatId,
    "⚠️ Seu acesso ainda não foi liberado para o mini app.\n\n" +
      "Abra o mini app do cartão pelo Telegram e toque em \"Pedir liberação de acesso\" ou aguarde um administrador liberar seu acesso pelo painel."
  );
  return false;
}

async function getUserState(
  userId: string | number
): Promise<string | null> {
  try {
    const snap = await db
      .collection("user_states")
      .doc(String(userId))
      .get();
    const data = snap.data();
    return (data && (data.estado as string)) || null;
  } catch (err) {
    console.error("Erro ao obter estado do usuário", userId, err);
    return null;
  }
}

async function setUserState(
  userId: string | number,
  estado: string | null
): Promise<void> {
  const ref = db.collection("user_states").doc(String(userId));
  try {
    if (!estado) {
      await ref.delete().catch(() => undefined);
    } else {
      await ref.set(
        {
          estado,
          updated_at: new Date(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error("Erro ao definir estado do usuário", userId, err);
  }
}

function toJsDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw.toDate === "function") {
    return raw.toDate();
  }
  if (typeof raw === "number") {
    return new Date(raw);
  }
  return null;
}

function efetivoInicioFatura(
  mesInicio: number,
  anoInicio: number,
  diaCompra: number | null,
  fechamentoDia = 9
): { mes: number; ano: number } {
  let mesEfetivo = Number(mesInicio);
  let anoEfetivo = Number(anoInicio);
  if (diaCompra != null && diaCompra > fechamentoDia) {
    if (mesEfetivo === 12) {
      mesEfetivo = 1;
      anoEfetivo += 1;
    } else {
      mesEfetivo += 1;
    }
  }
  return { mes: mesEfetivo, ano: anoEfetivo };
}

function calcularParcelasVencidas(
  gasto: any,
  mesReferencia: number,
  anoReferencia: number,
  fechamentoDia = 9
): number {
  const dataCompra = toJsDate(gasto.data_compra);
  const diaCompra = dataCompra ? dataCompra.getDate() : null;

  const mesInicio = Number(gasto.mes_inicio);
  const anoInicio = Number(gasto.ano_inicio);
  const { mes: mesEfetivo, ano: anoEfetivo } = efetivoInicioFatura(
    mesInicio,
    anoInicio,
    diaCompra,
    fechamentoDia
  );

  const mesesPassados =
    (anoReferencia - anoEfetivo) * 12 + (mesReferencia - mesEfetivo) + 1;
  const totalParcelas = Number(gasto.parcelas_total || 1);
  return Math.min(Math.max(0, mesesPassados), totalParcelas);
}

export async function calcularSaldoUsuarioAteMes(
  userId: string | number,
  mesRef: number,
  anoRef: number,
  fechamentoDia = 9
): Promise<number> {
  const userIdStr = String(userId);

  try {
    let totalGastosDevidos = 0;
    const gastosSnap = await db
      .collection("gastos")
      .where("user_id", "==", userIdStr)
      .where("ativo", "==", true)
      .get();

    gastosSnap.forEach((doc) => {
      const gasto = doc.data();
      const parcelasDevidas = calcularParcelasVencidas(
        gasto,
        mesRef,
        anoRef,
        fechamentoDia
      );
      const valorParcela = Number(gasto.valor_parcela || 0);
      totalGastosDevidos += valorParcela * parcelasDevidas;
    });

    let totalPagamentos = 0;
    const pagamentosSnap = await db
      .collection("pagamentos")
      .where("user_id", "==", userIdStr)
      .get();

    pagamentosSnap.forEach((doc) => {
      const pagamento = doc.data() as any;
      if (pagamento.cancelado) {
        return;
      }

      const mesPag = Number(pagamento.mes);
      const anoPag = Number(pagamento.ano);

      if (
        !Number.isFinite(mesPag) ||
        !Number.isFinite(anoPag) ||
        anoPag < anoRef ||
        (anoPag === anoRef && mesPag <= mesRef)
      ) {
        totalPagamentos += Number(pagamento.valor || 0);
      }
    });

    const saldo = totalGastosDevidos - totalPagamentos;
    return Number(saldo.toFixed(2));
  } catch (err) {
    console.error("Erro ao calcular saldo do usuário até mês", userId, err);
    return 0;
  }
}

async function calcularSaldoUsuario(userId: string | number): Promise<number> {
  const agora = new Date();
  const mesRef = agora.getMonth() + 1;
  const anoRef = agora.getFullYear();
  return calcularSaldoUsuarioAteMes(userId, mesRef, anoRef);
}

export async function obterExtratoConsumoUsuario(
  userId: string | number,
  mesReferencia: number,
  anoReferencia: number
): Promise<{ itens: any[]; totais: any }> {
  const userIdStr = String(userId);
  const itens: any[] = [];
  const totais: any = {
    mes_fatura: mesReferencia,
    ano_fatura: anoReferencia,
    parcelas_mes: 0,
    pagamentos_mes: 0,
    saldo_mes: 0,
  };

  const refIndex = anoReferencia * 12 + (mesReferencia - 1);

  try {
    const gastosSnap = await db
      .collection("gastos")
      .where("user_id", "==", userIdStr)
      .where("ativo", "==", true)
      .get();

    const gastos: any[] = [];
    gastosSnap.forEach((doc) => {
      gastos.push(doc.data());
    });

    for (const gasto of gastos) {
      const dataCompra = toJsDate(gasto.data_compra) || new Date();
      const diaCompra = dataCompra.getDate();
      const mesInicio = Number(gasto.mes_inicio || dataCompra.getMonth() + 1);
      const anoInicio = Number(gasto.ano_inicio || dataCompra.getFullYear());
      const totalParcelas = Number(gasto.parcelas_total || 1);
      const valorParcela = Number(gasto.valor_parcela || 0);

      if (!Number.isFinite(valorParcela) || valorParcela <= 0) {
        continue;
      }

      const { mes: mesEfetivo, ano: anoEfetivo } = efetivoInicioFatura(
        mesInicio,
        anoInicio,
        diaCompra
      );
      const startIndex = anoEfetivo * 12 + (mesEfetivo - 1);
      const diff = refIndex - startIndex;

      if (diff < 0 || diff >= totalParcelas) {
        continue;
      }

      const parcelaNum = diff + 1;

      itens.push({
        data: dataCompra,
        descricao: gasto.descricao || "",
        valor: valorParcela,
        tipo: "Parcela",
        meta: {
          parcela_num: parcelaNum,
          parcelas_total: totalParcelas,
          categoria: gasto.categoria || "",
        },
      });

      totais.parcelas_mes += valorParcela;
    }

    const pagamentosSnap = await db
      .collection("pagamentos")
      .where("user_id", "==", userIdStr)
      .where("mes", "==", mesReferencia)
      .where("ano", "==", anoReferencia)
      .get();

    pagamentosSnap.forEach((doc) => {
      const pagamento = doc.data();
      if (pagamento.cancelado) {
        return;
      }
      const valor = Number(pagamento.valor || 0);
      if (!Number.isFinite(valor) || valor <= 0) {
        return;
      }
      const dataPagamento =
        toJsDate(pagamento.data_pagamento) ||
        new Date(anoReferencia, mesReferencia - 1, 1);

      itens.push({
        data: dataPagamento,
        descricao: pagamento.descricao || "Pagamento",
        valor,
        tipo: "Pagamento",
        meta: {},
      });

      totais.pagamentos_mes += valor;
    });

    itens.sort((a, b) => {
      const da = toJsDate(a.data);
      const dbb = toJsDate(b.data);
      const ta = da ? da.getTime() : 0;
      const tb = dbb ? dbb.getTime() : 0;
      return ta - tb;
    });

    totais.saldo_mes = Number(
      (totais.parcelas_mes - totais.pagamentos_mes).toFixed(2)
    );
  } catch (err) {
    console.error("Erro ao obter extrato do usuário", userId, err);
  }

  return { itens, totais };
}

function formatarValorBRL(valor: number): string {
  if (!Number.isFinite(valor)) {
    valor = 0;
  }
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function montarTextoExtrato(
  itens: any[],
  totais: any,
  mesReferencia: number,
  anoReferencia: number
): string {
  const mesExibicao = Number(totais.mes_fatura || mesReferencia || 0);
  const anoExibicao = Number(totais.ano_fatura || anoReferencia || 0);

  const linhas: string[] = [];
  const pagamentosMes = Number(totais.pagamentos_mes || 0);

  const cicloStr = `${String(mesExibicao).padStart(2, "0")}/${anoExibicao}`;

  const titulo =
    pagamentosMes > 0
      ? `📜 <b>Extrato fechado do ciclo ${cicloStr}</b>`
      : `🧾 <b>Fatura do ciclo ${cicloStr} (aberta)</b>`;

  let mesInicio = mesExibicao - 1;
  let anoInicio = anoExibicao;
  if (mesInicio < 1) {
    mesInicio = 12;
    anoInicio -= 1;
  }
  const inicioStr = `${String(10).padStart(2, "0")}/${String(
    mesInicio
  ).padStart(2, "0")}/${anoInicio}`;
  const fimStr = `${String(9).padStart(2, "0")}/${String(
    mesExibicao
  ).padStart(2, "0")}/${anoExibicao}`;

  linhas.push(titulo, `Período: ${inicioStr} a ${fimStr}`);

  if (pagamentosMes > 0) {
    linhas.push(
      "",
      "Este extrato mostra as parcelas/gastos e pagamentos que caíram neste ciclo de fatura. Não é o saldo geral do cartão."
    );
  } else {
    linhas.push(
      "",
      "Esta fatura mostra apenas as parcelas/gastos deste ciclo de fatura. Não é o saldo geral do cartão."
    );
  }

  if (!itens || itens.length === 0) {
    linhas.push("Não há movimentações neste período.");
  } else {
    for (const item of itens) {
      const dataItem =
        toJsDate(item.data) || new Date(anoExibicao, mesExibicao - 1, 1);
      const dataStr = `${String(dataItem.getDate()).padStart(2, "0")}/${String(
        dataItem.getMonth() + 1
      ).padStart(2, "0")}`;
      const descricao = (item.descricao || "").trim() || "(sem descrição)";
      const valorStr = formatarValorBRL(Number(item.valor || 0));
      const tipoItem = item.tipo;
      const meta = item.meta || {};

      if (tipoItem === "Parcela" || tipoItem === "Gasto") {
        const numParcela = meta.parcela_num;
        const totalParcelas = meta.parcelas_total;
        const marcadorParcela =
          numParcela && totalParcelas
            ? ` (${numParcela}/${Number(totalParcelas)})`
            : "";
        linhas.push(
          `• ${dataStr} — ${descricao}${marcadorParcela} — ${valorStr}`
        );
      } else {
        linhas.push(
          `• ${dataStr} — <b>${descricao}</b> — ${valorStr}`
        );
      }
    }
  }

  linhas.push(
    "\n<b>Totais do Período</b>",
    `Gastos/Parcelas: ${formatarValorBRL(
      Number(totais.parcelas_mes || 0)
    )}`
  );

  if (pagamentosMes > 0) {
    linhas.push(
      `Pagamentos: -${formatarValorBRL(pagamentosMes)}`
    );
  }

  linhas.push(
    `<b>Saldo do Período:</b> ${formatarValorBRL(
      Number(totais.saldo_mes || 0)
    )}`
  );

  return linhas.join("\n");
}

function buildMainMenuKeyboard(): any {
  return {
    inline_keyboard: [
      [
        { text: "💳 Adicionar Gasto", callback_data: "menu_adicionar_gasto" },
        { text: "💰 Registrar Pagamento", callback_data: "menu_pagamento" },
      ],
      [
        { text: "📊 Meu Saldo", callback_data: "menu_meu_saldo" },
        { text: "📋 Meus Gastos", callback_data: "menu_meus_gastos" },
      ],
      [
        { text: "🧾 Fatura do ciclo atual", callback_data: "menu_fatura_atual" },
        { text: "💸 Meus Pagamentos", callback_data: "menu_meus_pagamentos" },
      ],
      [
        { text: "📜 Extrato do mês", callback_data: "menu_extrato_mes" },
      ],
      [{ text: "❓ Ajuda", callback_data: "menu_ajuda" }],
    ],
  };
}

export async function handleCommandStart(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  await registerUser(user);
  await setUserState(user.id, ESTADO_NORMAL);

  const text =
    `💳 Olá ${user.first_name || ""}! Bem-vindo ao Bot de Controle de Cartão de Crédito!\n\n` +
    "🎯 Funcionalidades:\n" +
    "• Registrar gastos com descrição e parcelas\n" +
    "• Acompanhar saldo devedor\n" +
    "• Registrar pagamentos\n" +
    "• Ver fatura mensal e extratos\n\n" +
    "✨ A forma recomendada de uso agora é pelo MiniApp do cartão dentro do Telegram.\n" +
    "Abra o MiniApp para registrar gastos, pagamentos e ver seus saldos.\n\n" +
    "Enquanto isso, você ainda pode usar os botões abaixo ou os comandos /gasto, /pagamento, /saldo.";

  const keyboard = buildMainMenuKeyboard();
  if (keyboard && Array.isArray(keyboard.inline_keyboard)) {
    keyboard.inline_keyboard.unshift([
      {
        text: "📱 Abrir MiniApp",
        web_app: { url: WEBAPP_URL },
      },
    ]);
  }

  await sendMessage(token, chatId, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

export async function handleCommandHelp(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const text =
    "Comandos disponíveis:\n" +
    "/start - iniciar o bot\n" +
    "/help - esta ajuda\n" +
    "/gasto <descrição> <valor> [parcelas]\n" +
    "/pagamento <valor> [descrição]\n" +
    "/saldo - ver saldo geral (todas as parcelas vencidas menos os pagamentos)\n" +
    "/extrato [mes ano] - extrato do ciclo de fatura (10/mes-1 a 09/mes)\n\n" +
    "📊 Meu Saldo: mostra o saldo geral do cartão (todas as faturas já vencidas)\n" +
    "🧾 Fatura do ciclo atual / 📜 Extrato do mês: mostram apenas o que aconteceu no ciclo de fatura selecionado.\n\n" +
    "✨ Dica: para uma experiência mais completa, use o MiniApp do cartão dentro do Telegram em vez de depender apenas dos comandos de texto.";

  await sendMessage(token, chatId, text);
}

export async function handleCommandCodigo(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  await sendMessage(
    token,
    chatId,
    "O fluxo de código de acesso foi desativado.\n\n" +
      "Agora, para liberar seu acesso, abra o mini app do cartão no Telegram e toque em \"Pedir liberação de acesso\". " +
      "Se já tiver feito o pedido, aguarde um administrador aprovar seu acesso pelo painel."
  );
}

export async function handleCommandAdminPainel(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  if (!isAdmin(user)) {
    await sendMessage(token, chatId, "Acesso restrito a administradores.");
    return;
  }

  const texto =
    "🛠 <b>Painel Admin WebApp</b>\n\n" +
    "Use o botão abaixo para abrir o painel administrador do cartão dentro do Telegram.";

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🛠 Abrir Painel Admin",
          web_app: { url: WEBAPP_URL },
        },
      ],
    ],
  };

  await sendMessage(token, chatId, texto, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

export async function handleMessageText(
  message: any,
  token: string
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;
  const text: string = (message.text ?? "").trim();

  await registerUser(user);
  const estado = await getUserState(user.id);

  if (estado === ESTADO_AGUARDANDO_GASTO) {
    const args = text.split(/\s+/).filter((p) => p.length > 0);
    await handleCommandGasto(message, token, args);
    await setUserState(user.id, ESTADO_NORMAL);
    return;
  }

  if (estado === ESTADO_AGUARDANDO_PAGAMENTO) {
    const args = text.split(/\s+/).filter((p) => p.length > 0);
    await handleCommandPagamento(message, token, args);
    await setUserState(user.id, ESTADO_NORMAL);
    return;
  }

  const texto =
    "👋 Use o menu abaixo para registrar gastos, pagamentos ou ver seu saldo.";

  await sendMessage(token, chatId, texto, {
    parse_mode: "HTML",
    reply_markup: buildMainMenuKeyboard(),
  });
}

export async function handleCallbackQuery(
  callbackQuery: any,
  token: string
): Promise<void> {
  const chatId = callbackQuery.message.chat.id;
  const data: string = callbackQuery.data;
  const user = callbackQuery.from;

  const autorizado = await ensureUserAuthorized(user, token, chatId);
  if (!autorizado) {
    await answerCallbackQuery(token, callbackQuery.id);
    return;
  }

  await registerUser(user);

  if (data === "menu_principal") {
    await setUserState(user.id, ESTADO_NORMAL);
    const texto =
      "💳 <b>Menu Principal</b>\n\nEscolha uma opção abaixo:";
    await sendMessage(token, chatId, texto, {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(),
    });
  } else if (data === "menu_meu_saldo") {
    await setUserState(user.id, ESTADO_NORMAL);
    const fakeMessage = { chat: callbackQuery.message.chat, from: user };
    await handleCommandSaldo(fakeMessage, token, []);
  } else if (data === "menu_adicionar_gasto") {
    await setUserState(user.id, ESTADO_AGUARDANDO_GASTO);
    const texto =
      "✍️ Envie uma mensagem com o gasto neste formato:\n\n" +
      "<code>&lt;descrição&gt; &lt;valor&gt; [parcelas]</code>\n\n" +
      "Exemplos:\n" +
      "• <code>Almoço 25.50</code>\n" +
      "• <code>Notebook 1200.00 12</code>";
    await sendMessage(token, chatId, texto, { parse_mode: "HTML" });
  } else if (data === "menu_pagamento") {
    await setUserState(user.id, ESTADO_AGUARDANDO_PAGAMENTO);
    const texto =
      "✍️ Envie uma mensagem com o pagamento neste formato:\n\n" +
      "<code>&lt;valor&gt; [descrição]</code>\n\n" +
      "Exemplos:\n" +
      "• <code>150.00</code>\n" +
      "• <code>200.50 Pagamento fatura março</code>";
    await sendMessage(token, chatId, texto, { parse_mode: "HTML" });
  } else if (data === "menu_meus_gastos") {
    await setUserState(user.id, ESTADO_NORMAL);
    const userIdStr = String(user.id);
    try {
      const snap = await db
        .collection("gastos")
        .where("user_id", "==", userIdStr)
        .where("ativo", "==", true)
        .get();

      const gastos: any[] = [];
      snap.forEach((doc) => {
        gastos.push(doc.data());
      });

      gastos.sort((a, b) => {
        const da = toJsDate(a.data_compra);
        const dbb = toJsDate(b.data_compra);
        const ta = da ? da.getTime() : 0;
        const tb = dbb ? dbb.getTime() : 0;
        return tb - ta;
      });

      const top = gastos.slice(0, 10);

      if (top.length === 0) {
        await sendMessage(
          token,
          chatId,
          "Você ainda não registrou gastos.",
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "💳 Adicionar Gasto",
                    callback_data: "menu_adicionar_gasto",
                  },
                ],
                [
                  {
                    text: "🔙 Menu Principal",
                    callback_data: "menu_principal",
                  },
                ],
              ],
            },
          }
        );
      } else {
        const linhas: string[] = [];
        linhas.push("📋 <b>Seus últimos gastos</b>\n");
        for (const gasto of top) {
          const dataCompra =
            toJsDate(gasto.data_compra) || new Date();
          const dataStr = `${String(dataCompra.getDate()).padStart(
            2,
            "0"
          )}/${String(dataCompra.getMonth() + 1).padStart(2, "0")}`;
          const descricao =
            (gasto.descricao || "").trim() || "(sem descrição)";
          const valorTotal = Number(
            gasto.valor_total || gasto.valor_parcela || 0
          );
          const parcelasTotal = Number(gasto.parcelas_total || 1);
          const valorParcela = Number(
            gasto.valor_parcela || valorTotal
          );
          let infoParcelas = "";
          if (parcelasTotal > 1) {
            infoParcelas = ` — ${parcelasTotal}x de ${formatarValorBRL(
              valorParcela
            )}`;
          }
          linhas.push(
            `• ${dataStr} — ${descricao} — ${formatarValorBRL(
              valorTotal
            )}${infoParcelas}`
          );
        }

        const textoLista = linhas.join("\n");
        const keyboard = {
          inline_keyboard: [
            [
              {
                text: "💳 Adicionar Gasto",
                callback_data: "menu_adicionar_gasto",
              },
            ],
            [
              {
                text: "🔙 Menu Principal",
                callback_data: "menu_principal",
              },
            ],
          ],
        };

        await sendMessage(token, chatId, textoLista, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      }
    } catch (err) {
      console.error("Erro ao listar gastos do usuário", err);
      await sendMessage(
        token,
        chatId,
        "❌ <b>Erro ao listar seus gastos.</b>\n\nTente novamente mais tarde.",
        { parse_mode: "HTML" }
      );
    }
  } else if (data === "menu_meus_pagamentos") {
    await setUserState(user.id, ESTADO_NORMAL);
    const userIdStr = String(user.id);
    try {
      const snap = await db
        .collection("pagamentos")
        .where("user_id", "==", userIdStr)
        .get();

      const pagamentos: any[] = [];
      snap.forEach((doc) => {
        const pagamento = doc.data();
        if (pagamento.cancelado) {
          return;
        }
        pagamentos.push(pagamento);
      });

      pagamentos.sort((a, b) => {
        const da = toJsDate(a.data_pagamento);
        const dbb = toJsDate(b.data_pagamento);
        const ta = da ? da.getTime() : 0;
        const tb = dbb ? dbb.getTime() : 0;
        return tb - ta;
      });

      const top = pagamentos.slice(0, 10);

      if (top.length === 0) {
        await sendMessage(
          token,
          chatId,
          "Você ainda não registrou pagamentos.",
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "💰 Registrar Pagamento",
                    callback_data: "menu_pagamento",
                  },
                ],
                [
                  {
                    text: "🔙 Menu Principal",
                    callback_data: "menu_principal",
                  },
                ],
              ],
            },
          }
        );
      } else {
        const linhas: string[] = [];
        let totalPago = 0;
        linhas.push("💰 <b>Seus últimos pagamentos</b>\n");
        for (const pagamento of top) {
          const dataPag =
            toJsDate(pagamento.data_pagamento) || new Date();
          const dataStr = `${String(dataPag.getDate()).padStart(
            2,
            "0"
          )}/${String(dataPag.getMonth() + 1).padStart(2, "0")}`;
          const descricao =
            (pagamento.descricao || "").trim() || "Pagamento";
          const valor = Number(pagamento.valor || 0);
          totalPago += valor;
          linhas.push(
            `• ${dataStr} — ${descricao} — ${formatarValorBRL(valor)}`
          );
        }

        linhas.push(
          `\nTotal listado: ${formatarValorBRL(totalPago)}`
        );

        const textoLista = linhas.join("\n");
        const keyboard = {
          inline_keyboard: [
            [
              {
                text: "💰 Registrar Pagamento",
                callback_data: "menu_pagamento",
              },
            ],
            [
              {
                text: "🔙 Menu Principal",
                callback_data: "menu_principal",
              },
            ],
          ],
        };

        await sendMessage(token, chatId, textoLista, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      }
    } catch (err) {
      console.error("Erro ao listar pagamentos do usuário", err);
      await sendMessage(
        token,
        chatId,
        "❌ <b>Erro ao listar seus pagamentos.</b>\n\nTente novamente mais tarde.",
        { parse_mode: "HTML" }
      );
    }
  } else if (
    data === "menu_fatura_atual" ||
    data === "menu_extrato_mes"
  ) {
    await setUserState(user.id, ESTADO_NORMAL);
    const agora = new Date();
    const mesRef = agora.getMonth() + 1;
    const anoRef = agora.getFullYear();
    const { itens, totais } = await obterExtratoConsumoUsuario(
      user.id,
      mesRef,
      anoRef
    );
    const textoExtrato = montarTextoExtrato(
      itens,
      totais,
      mesRef,
      anoRef
    );

    const keyboard = {
      inline_keyboard: [
        [
          { text: "📋 Meus Gastos", callback_data: "menu_meus_gastos" },
        ],
        [
          {
            text: "💰 Meus Pagamentos",
            callback_data: "menu_meus_pagamentos",
          },
        ],
        [
          { text: "🔙 Menu Principal", callback_data: "menu_principal" },
        ],
      ],
    };

    await sendMessage(token, chatId, textoExtrato, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else if (data === "menu_ajuda") {
    const fakeMessage = { chat: callbackQuery.message.chat, from: user };
    await handleCommandHelp(fakeMessage, token, []);
  } else {
    const texto =
      "⚠️ Esta opção de menu ainda está sendo migrada. Use os comandos /gasto, /pagamento, /saldo ou o menu principal.";
    await sendMessage(token, chatId, texto, {
      parse_mode: "HTML",
      reply_markup: buildMainMenuKeyboard(),
    });
  }

  await answerCallbackQuery(token, callbackQuery.id);
}
export async function handleCommandGasto(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  await registerUser(user);

  if (!args || args.length < 2) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "💳 Usar Menu Otimizado",
            callback_data: "menu_adicionar_gasto",
          },
        ],
        [
          { text: "🔙 Menu Principal", callback_data: "menu_principal" },
        ],
      ],
    };

    const texto =
      "❌ <b>Uso incorreto!</b>\n\n" +
      "<b>Formato:</b> <code>/gasto &lt;descrição&gt; &lt;valor&gt; [parcelas]</code>\n\n" +
      "<b>Exemplos:</b>\n" +
      "• <code>/gasto Almoço 25.50</code>\n" +
      "• <code>/gasto Notebook 1200.00 12</code>\n\n" +
      "💡 <b>Dica:</b> Use o menu otimizado para uma experiência melhor!";

    await sendMessage(token, chatId, texto, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    return;
  }

  const textoArgs = args.join(" ");
  const partes = textoArgs.trim().split(/\s+/);

  if (partes.length < 2) {
    await sendMessage(
      token,
      chatId,
      "❌ <b>Formato incorreto!</b><br><br>" +
        "Use: <code>&lt;descrição&gt; &lt;valor&gt; [parcelas]</code><br><br>" +
        "<b>Exemplos:</b> <code>Almoço 25.50</code> ou <code>Notebook 1200.00 12</code>",
      { parse_mode: "HTML" }
    );
    return;
  }

  try {
    const len = partes.length;
    const valorStr = len > 2 ? partes[len - 2] : partes[len - 1];
    const valor = Number(valorStr.replace(",", "."));

    if (!Number.isFinite(valor)) {
      await sendMessage(
        token,
        chatId,
        "❌ <b>Erro nos dados informados!</b>\n\n" +
          "Verifique se o valor está correto e as parcelas são um número inteiro.\n\n" +
          "<b>Formato:</b> <descrição> <valor> [parcelas]",
        { parse_mode: "HTML" }
      );
      return;
    }

    let parcelas = 1;
    let descricao: string;

    if (len > 2) {
      const possivelParcelasStr = partes[len - 1];
      const possivelParcelas = Number.parseInt(possivelParcelasStr, 10);
      if (!Number.isNaN(possivelParcelas)) {
        parcelas = possivelParcelas < 1 ? 1 : possivelParcelas;
        descricao = partes.slice(0, len - 2).join(" ");
      } else {
        descricao = partes.slice(0, len - 1).join(" ");
        parcelas = 1;
      }
    } else {
      descricao = partes.slice(0, len - 1).join(" ");
      parcelas = 1;
    }

    if (valor <= 0) {
      await sendMessage(
        token,
        chatId,
        "❌ <b>Valor deve ser maior que zero!</b>",
        { parse_mode: "HTML" }
      );
      return;
    }

    if (parcelas > 60) {
      await sendMessage(
        token,
        chatId,
        "❌ <b>Máximo de 60 parcelas permitido!</b>",
        { parse_mode: "HTML" }
      );
      return;
    }

    const agora = new Date();
    const userIdStr = String(user.id);
    const gastoId = `${userIdStr}_${Math.floor(Date.now() / 1000)}`;
    const valorTotal = Number(valor);
    const valorParcela = valorTotal / parcelas;

    await db
      .collection("gastos")
      .doc(gastoId)
      .set({
        id: gastoId,
        user_id: userIdStr,
        descricao: descricao,
        valor_total: Number(valorTotal.toFixed(2)),
        valor_parcela: Number(valorParcela.toFixed(2)),
        parcelas_total: parcelas,
        parcelas_pagas: 0,
        data_compra: agora,
        ativo: true,
        mes_inicio: agora.getMonth() + 1,
        ano_inicio: agora.getFullYear(),
        criado_em: agora,
        atualizado_em: agora,
      });

    const keyboard = {
      inline_keyboard: [
        [
          { text: "💳 Adicionar Outro", callback_data: "menu_adicionar_gasto" },
        ],
        [{ text: "📊 Ver Saldo", callback_data: "menu_meu_saldo" }],
        [{ text: "🔙 Menu Principal", callback_data: "menu_principal" }],
      ],
    };

    const dataStr = `${String(agora.getDate()).padStart(2, "0")}/${String(
      agora.getMonth() + 1
    ).padStart(2, "0")}/${agora.getFullYear()}`;

    let textoConfirmacao: string;
    if (parcelas === 1) {
      textoConfirmacao =
        "✅ <b>Gasto registrado com sucesso!</b>\n\n" +
        `📝 <b>Descrição:</b> ${descricao}\n` +
        `💰 <b>Valor:</b> R$ ${valorTotal.toFixed(2)} (à vista)\n` +
        `📅 <b>Data:</b> ${dataStr}\n` +
        "☁️ <b>Salvo no Firebase</b>";
    } else {
      textoConfirmacao =
        "✅ <b>Gasto registrado com sucesso!</b>\n\n" +
        `📝 <b>Descrição:</b> ${descricao}\n` +
        `💰 <b>Valor total:</b> R$ ${valorTotal.toFixed(2)}\n` +
        `📊 <b>Parcelas:</b> ${parcelas}x R$ ${valorParcela
          .toFixed(2)
          .toString()}\n` +
        `📅 <b>Data:</b> ${dataStr}\n` +
        "☁️ <b>Salvo no Firebase</b>";
    }

    await sendMessage(token, chatId, textoConfirmacao, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } catch (err) {
    console.error("Erro ao processar gasto", err);
    await sendMessage(
      token,
      chatId,
      "❌ <b>Erro interno!</b>\n\nTente novamente em alguns instantes.",
      { parse_mode: "HTML" }
    );
  }
}

export async function handleCommandPagamento(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  await registerUser(user);

  if (!args || args.length < 1) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "💰 Usar Menu Otimizado", callback_data: "menu_pagamento" },
        ],
        [
          { text: "🔙 Menu Principal", callback_data: "menu_principal" },
        ],
      ],
    };

    const texto =
      "❌ <b>Uso incorreto!</b>\n\n" +
      "<b>Formato:</b> <code>/pagamento &lt;valor&gt; [descrição]</code>\n\n" +
      "<b>Exemplos:</b>\n" +
      "• <code>/pagamento 150.00</code>\n" +
      "• <code>/pagamento 200.50 Pagamento fatura março</code>\n\n" +
      "💡 <b>Dica:</b> Use o menu otimizado para uma experiência melhor!";

    await sendMessage(token, chatId, texto, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    return;
  }

  const textoArgs = args.join(" ");
  const partes = textoArgs.trim().split(/\s+/);

  try {
    const valorStr = partes[0];
    const valor = Number(valorStr.replace(",", "."));

    if (!Number.isFinite(valor) || valor <= 0) {
      await sendMessage(
        token,
        chatId,
        "❌ <b>Valor inválido!</b>\n\nUse apenas números.\n\n<b>Exemplos válidos:</b>\n• <code>100</code>\n• <code>150.50</code>",
        { parse_mode: "HTML" }
      );
      return;
    }

    const descricao =
      partes.length > 1 ? partes.slice(1).join(" ") : "Pagamento";

    const agora = new Date();
    const userIdStr = String(user.id);
    const pagamentoId = `pag_${userIdStr}_${Math.floor(Date.now() / 1000)}`;

    await db
      .collection("pagamentos")
      .doc(pagamentoId)
      .set({
        id: pagamentoId,
        user_id: userIdStr,
        valor: Number(valor.toFixed(2)),
        descricao: descricao,
        data_pagamento: agora,
        mes: agora.getMonth() + 1,
        ano: agora.getFullYear(),
        criado_em: agora,
        atualizado_em: agora,
      });

    const saldoDepois = await calcularSaldoUsuario(user.id);

    let emojiSaldo: string;
    let textoSaldo: string;
    if (saldoDepois > 0) {
      emojiSaldo = "🔴";
      textoSaldo = `Saldo devedor: R$ ${saldoDepois.toFixed(2)}`;
    } else if (saldoDepois < 0) {
      emojiSaldo = "💚";
      textoSaldo = `Crédito: R$ ${Math.abs(saldoDepois).toFixed(2)}`;
    } else {
      emojiSaldo = "⚖️";
      textoSaldo = "Conta quitada!";
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "💰 Registrar Outro", callback_data: "menu_pagamento" }],
        [{ text: "📊 Ver Saldo", callback_data: "menu_meu_saldo" }],
        [{ text: "🔙 Menu Principal", callback_data: "menu_principal" }],
      ],
    };

    const dataStr = `${String(agora.getDate()).padStart(2, "0")}/${String(
      agora.getMonth() + 1
    ).padStart(2, "0")}/${agora.getFullYear()}`;

    const textoConfirmacao =
      "✅ <b>Pagamento registrado com sucesso!</b>\n\n" +
      `💰 <b>Valor pago:</b> R$ ${valor.toFixed(2)}\n` +
      `📝 <b>Descrição:</b> ${descricao}\n` +
      `📅 <b>Data:</b> ${dataStr}\n\n` +
      `${emojiSaldo} <b>${textoSaldo}</b>\n` +
      "☁️ <b>Salvo no Firebase</b>";

    await sendMessage(token, chatId, textoConfirmacao, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } catch (err) {
    console.error("Erro ao processar pagamento", err);
    await sendMessage(
      token,
      chatId,
      "❌ <b>Erro interno!</b>\n\nTente novamente em alguns instantes.",
      { parse_mode: "HTML" }
    );
  }
}

export async function handleCommandSaldo(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  await registerUser(user);
  const saldoAtual = await calcularSaldoUsuario(user.id);

  let emoji = "";
  let status = "";
  let textoStatus = "";

  if (saldoAtual > 0) {
    emoji = "🔴";
    status = "devedor";
    textoStatus = `Você deve R$ ${saldoAtual.toFixed(2)}`;
  } else if (saldoAtual < 0) {
    emoji = "💚";
    status = "credor";
    textoStatus = `Você tem crédito de R$ ${Math.abs(saldoAtual).toFixed(2)}`;
  } else {
    emoji = "⚖️";
    status = "quitado";
    textoStatus = "Você está em dia!";
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "💰 Registrar Pagamento", callback_data: "menu_pagamento" }],
      [{ text: "🔙 Menu Principal", callback_data: "menu_principal" }],
    ],
  };

  const texto =
    `${emoji} <b>${user.first_name}</b>, seu saldo geral é:\n\n` +
    `📊 <b>${textoStatus}</b>\n\n` +
    "Este valor soma todas as parcelas já vencidas de faturas passadas e do mês atual, menos os pagamentos que você já registrou.\n\n" +
    `Status: ${status.charAt(0).toUpperCase()}${status.slice(1)}\n` +
    "☁️ Dados sincronizados com Firebase";

  await sendMessage(token, chatId, texto, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

export async function handleCommandExtrato(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  await registerUser(user);

  const agora = new Date();
  let mesRef = agora.getMonth() + 1;
  let anoRef = agora.getFullYear();

  if (args && args.length > 0) {
    if (args.length === 2 && args.every((a) => /^\d+$/.test(a))) {
      mesRef = Number.parseInt(args[0], 10);
      anoRef = Number.parseInt(args[1], 10);
      if (
        !Number.isFinite(mesRef) ||
        mesRef < 1 ||
        mesRef > 12 ||
        !Number.isFinite(anoRef) ||
        anoRef < 2000
      ) {
        await sendMessage(
          token,
          chatId,
          "Use: /extrato [mes ano]\nEx.: /extrato 9 2025"
        );
        return;
      }
    } else {
      await sendMessage(
        token,
        chatId,
        "Use: /extrato [mes ano]\nEx.: /extrato 9 2025"
      );
      return;
    }
  }

  const { itens, totais } = await obterExtratoConsumoUsuario(
    user.id,
    mesRef,
    anoRef
  );
  const textoExtrato = montarTextoExtrato(
    itens,
    totais,
    mesRef,
    anoRef
  );

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🔙 Menu Principal",
          callback_data: "menu_principal",
        },
      ],
    ],
  };

  await sendMessage(token, chatId, textoExtrato, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

export async function handleCommandAdminGastos(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  if (!isAdmin(user)) {
    await sendMessage(token, chatId, "Acesso restrito a administradores.");
    return;
  }

  await sendMessage(
    token,
    chatId,
    "As funções administrativas agora estão disponíveis apenas no Painel Admin WebApp.\n\nUse /admin_painel para abrir o painel."
  );

  await handleCommandAdminPainel(message, token, args);
}

export async function handleCommandAdminPagamentos(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  if (!isAdmin(user)) {
    await sendMessage(token, chatId, "Acesso restrito a administradores.");
    return;
  }

  await sendMessage(
    token,
    chatId,
    "As funções administrativas agora estão disponíveis apenas no Painel Admin WebApp.\n\nUse /admin_painel para abrir o painel."
  );

  await handleCommandAdminPainel(message, token, args);
}

export async function handleCommandAdminEditGasto(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  if (!isAdmin(user)) {
    await sendMessage(token, chatId, "Acesso restrito a administradores.");
    return;
  }

  await sendMessage(
    token,
    chatId,
    "As funções administrativas agora estão disponíveis apenas no Painel Admin WebApp.\n\nUse /admin_painel para abrir o painel."
  );

  await handleCommandAdminPainel(message, token, args);
}

export async function handleCommandAdminEditPagamento(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  if (!isAdmin(user)) {
    await sendMessage(token, chatId, "Acesso restrito a administradores.");
    return;
  }

  await sendMessage(
    token,
    chatId,
    "As funções administrativas agora estão disponíveis apenas no Painel Admin WebApp.\n\nUse /admin_painel para abrir o painel."
  );

  await handleCommandAdminPainel(message, token, args);
}

export async function handleCommandAdminDelGasto(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  if (!isAdmin(user)) {
    await sendMessage(token, chatId, "Acesso restrito a administradores.");
    return;
  }

  await sendMessage(
    token,
    chatId,
    "As funções administrativas agora estão disponíveis apenas no Painel Admin WebApp.\n\nUse /admin_painel para abrir o painel."
  );

  await handleCommandAdminPainel(message, token, args);
}

export async function handleCommandAdminDelPagamento(
  message: any,
  token: string,
  args: string[]
): Promise<void> {
  const chatId = message.chat.id;
  const user = message.from;

  if (!isAdmin(user)) {
    await sendMessage(token, chatId, "Acesso restrito a administradores.");
    return;
  }

  await sendMessage(
    token,
    chatId,
    "As funções administrativas agora estão disponíveis apenas no Painel Admin WebApp.\n\nUse /admin_painel para abrir o painel."
  );

  await handleCommandAdminPainel(message, token, args);
}

