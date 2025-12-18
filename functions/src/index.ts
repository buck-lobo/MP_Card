import * as functions from "firebase-functions";
import { Request, Response } from "firebase-functions";
import { handleUpdate } from "./telegram/router";
import { db } from "./firebase";
import { ADMIN_USER_IDS } from "./admin";
import { parseAndVerifyInitData, WebAppUser } from "./telegram/webappAuth";
import {
  obterExtratoConsumoUsuario,
  calcularSaldoUsuarioAteMes,
} from "./telegram/handlers";

declare function setWebAppCors(res: Response): void;
declare function parseBool(value: unknown): boolean | null;
declare function resolveTargetUserId(term: string): Promise<string | null>;
declare function verifyAdminFromRequest(req: Request, res: Response): Promise<WebAppUser | null>;
declare function getWebAppUserContext(
  req: Request,
  res: Response
): Promise<{
  userIdStr: string;
  autorizado: boolean;
  isAdmin: boolean;
  webAppUser: any;
  userRecord?: any;
} | null>;

function getBotToken(): string {
  const token =
    process.env.TELEGRAM_BOT_TOKEN || functions.config().telegram?.bot_token;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN não configurado.");
  }

  return token;
}

const USER_EDIT_WINDOW_DAYS = 7;

function toJsDateAny(value: any): Date | null {
  if (!value) {
    return null;
  }
  try {
    if (value instanceof Date) {
      return value;
    }
    if (value && typeof value.toDate === "function") {
      return value.toDate() as Date;
    }
    if (typeof value === "string") {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function isWithinEditWindow(date: Date | null): boolean {
  if (!date) {
    return false;
  }
  const ms = Date.now() - date.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  return days <= USER_EDIT_WINDOW_DAYS;
}

function parseCycleString(
  cycleRaw: unknown
): { mes: number; ano: number; cycle: string } | null {
  const cycle = typeof cycleRaw === "string" ? cycleRaw.trim() : "";
  if (!cycle) {
    return null;
  }
  const parts = cycle.split("/");
  if (parts.length !== 2) {
    return null;
  }
  const mes = Number.parseInt(parts[0], 10);
  const ano = Number.parseInt(parts[1], 10);
  if (
    !Number.isFinite(mes) ||
    !Number.isFinite(ano) ||
    mes < 1 ||
    mes > 12 ||
    ano < 2000 ||
    ano > 2100
  ) {
    return null;
  }
  return {
    mes,
    ano,
    cycle: `${String(mes).padStart(2, "0")}/${ano}`,
  };
}

function getDataCompraForCycle(mes: number, ano: number): Date {
  let prevMes = mes - 1;
  let prevAno = ano;
  if (prevMes < 1) {
    prevMes = 12;
    prevAno -= 1;
  }
  return new Date(prevAno, prevMes - 1, 10, 12, 0, 0);
}

export const userListRecurringGastos = functions.https.onRequest(
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      setWebAppCors(res);
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const ctx = await getWebAppUserContext(req, res);
    if (!ctx) {
      return;
    }

    setWebAppCors(res);

    if (!ctx.autorizado) {
      res.status(403).json({
        autorizado: false,
        user_id: ctx.userIdStr,
        error:
          "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
      });
      return;
    }

    try {
      const snap = await db
        .collection("gastos_recorrentes")
        .where("user_id", "==", ctx.userIdStr)
        .get();

      const itens: any[] = [];
      snap.forEach((doc) => {
        const data = doc.data() || {};
        itens.push({
          id: data.id || doc.id,
          descricao: data.descricao || "",
          categoria: data.categoria || "",
          valor_total: Number(data.valor_total || 0),
          ativo: data.ativo !== false,
          criado_em: data.criado_em || null,
          atualizado_em: data.atualizado_em || null,
        });
      });

      itens.sort((a, b) => {
        const da = String(a.descricao || "").toLowerCase();
        const dbb = String(b.descricao || "").toLowerCase();
        return da.localeCompare(dbb);
      });

      res.status(200).json({
        ok: true,
        user_id: ctx.userIdStr,
        itens,
      });
    } catch (err) {
      console.error("Erro em userListRecurringGastos", err);
      res.status(500).json({ error: "Erro ao listar gastos recorrentes" });
    }
  }
);

export const userEditGasto = functions.https.onRequest(
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      setWebAppCors(res);
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const ctx = await getWebAppUserContext(req, res);
    if (!ctx) {
      return;
    }

    setWebAppCors(res);

    if (!ctx.autorizado) {
      res.status(403).json({
        autorizado: false,
        user_id: ctx.userIdStr,
        error:
          "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
      });
      return;
    }

    const body = req.body || {};
    const gastoIdRaw = body.gastoId;
    const novoValorRaw = body.novoValorTotal;
    const novasParcelasRaw = body.novasParcelas;
    const descricaoRaw = body.descricao;
    const categoriaRaw = body.categoria;

    const gastoId = typeof gastoIdRaw === "string" ? gastoIdRaw.trim() : "";
    const descricao =
      typeof descricaoRaw === "string" ? descricaoRaw.trim() : "";
    const categoria =
      typeof categoriaRaw === "string" ? categoriaRaw.trim() : "";

    let novoValorTotal: number | null = null;
    if (typeof novoValorRaw === "number") {
      novoValorTotal = novoValorRaw;
    } else if (typeof novoValorRaw === "string" && novoValorRaw.trim()) {
      novoValorTotal = Number(novoValorRaw.replace(",", "."));
    }

    let novasParcelas: number | null = null;
    if (
      novasParcelasRaw !== undefined &&
      novasParcelasRaw !== null &&
      novasParcelasRaw !== ""
    ) {
      if (typeof novasParcelasRaw === "number") {
        novasParcelas = novasParcelasRaw;
      } else {
        const parsed = Number.parseInt(String(novasParcelasRaw), 10);
        if (!Number.isNaN(parsed)) {
          novasParcelas = parsed;
        }
      }
    }

    if (!gastoId) {
      res.status(400).json({ error: "gastoId obrigatório" });
      return;
    }

    if (!descricao && !categoria && novoValorTotal === null && novasParcelas === null) {
      res.status(400).json({ error: "Nenhuma alteração informada" });
      return;
    }

    if (categoria && categoria.length > 50) {
      res.status(400).json({ error: "categoria muito longa (máx 50)" });
      return;
    }

    if (novoValorTotal !== null) {
      if (!Number.isFinite(novoValorTotal) || novoValorTotal <= 0) {
        res.status(400).json({ error: "novoValorTotal inválido" });
        return;
      }
    }

    if (novasParcelas !== null) {
      if (!Number.isFinite(novasParcelas) || novasParcelas <= 0) {
        res.status(400).json({ error: "novasParcelas inválido" });
        return;
      }
      if (novasParcelas > 60) {
        res.status(400).json({ error: "Máximo de 60 parcelas permitido" });
        return;
      }
    }

    try {
      const docRef = db.collection("gastos").doc(gastoId);
      const snap = await docRef.get();
      if (!snap.exists) {
        res.status(404).json({ error: "Gasto não encontrado" });
        return;
      }

      const gasto = snap.data() || {};
      if (String(gasto.user_id || "") !== ctx.userIdStr) {
        res.status(403).json({ error: "Sem permissão para alterar este gasto" });
        return;
      }

      if (gasto.ativo === false) {
        res.status(400).json({ error: "Gasto já está inativo" });
        return;
      }

      const baseDate = toJsDateAny(gasto.data_compra) || toJsDateAny(gasto.criado_em);
      if (!isWithinEditWindow(baseDate)) {
        res.status(400).json({
          error: `Este gasto não pode mais ser alterado (janela de ${USER_EDIT_WINDOW_DAYS} dias).`,
        });
        return;
      }

      const parcelasAtuais = Number(gasto.parcelas_total || 1);
      const parcelasFinal = novasParcelas != null ? novasParcelas : parcelasAtuais;

      const valorTotalAtual = Number(gasto.valor_total || gasto.valor_parcela || 0);
      const valorTotalFinal = novoValorTotal != null ? novoValorTotal : valorTotalAtual;

      const valorParcelaFinal = valorTotalFinal / parcelasFinal;

      const updates: any = {
        atualizado_em: new Date(),
      };
      if (descricao) {
        updates.descricao = descricao;
      }
      if (categoria) {
        updates.categoria = categoria;
      }
      if (novoValorTotal != null || novasParcelas != null) {
        updates.valor_total = Number(valorTotalFinal.toFixed(2));
        updates.valor_parcela = Number(valorParcelaFinal.toFixed(2));
        updates.parcelas_total = parcelasFinal;
      }

      await docRef.set(updates, { merge: true });

      res.status(200).json({
        ok: true,
        user_id: ctx.userIdStr,
        gastoId,
        descricao: descricao || (gasto.descricao || ""),
        categoria: categoria || (gasto.categoria || ""),
        valor_total: Number(valorTotalFinal.toFixed(2)),
        valor_parcela: Number(valorParcelaFinal.toFixed(2)),
        parcelas_total: parcelasFinal,
      });
    } catch (err) {
      console.error("Erro em userEditGasto", err);
      res.status(500).json({ error: "Erro ao editar gasto" });
    }
  }
);

export const userUpsertRecurringGasto = functions.https.onRequest(
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      setWebAppCors(res);
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const ctx = await getWebAppUserContext(req, res);
    if (!ctx) {
      return;
    }

    setWebAppCors(res);

    if (!ctx.autorizado) {
      res.status(403).json({
        autorizado: false,
        user_id: ctx.userIdStr,
        error:
          "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
      });
      return;
    }

    const body = req.body || {};
    const idRaw = body.id;
    const descricaoRaw = body.descricao;
    const valorRaw = body.valor;
    const ativoRaw = body.ativo;
    const categoriaRaw = body.categoria;

    const descricao =
      typeof descricaoRaw === "string" ? descricaoRaw.trim() : "";

    const categoria =
      typeof categoriaRaw === "string" ? categoriaRaw.trim() : "";

    let valor: number = Number.NaN;
    if (typeof valorRaw === "number") {
      valor = valorRaw;
    } else if (typeof valorRaw === "string") {
      valor = Number(valorRaw.replace(",", "."));
    }

    const ativo = parseBool(ativoRaw);

    if (!descricao) {
      res.status(400).json({ error: "Descrição obrigatória" });
      return;
    }

    if (categoria && categoria.length > 50) {
      res.status(400).json({ error: "categoria muito longa (máx 50)" });
      return;
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      res.status(400).json({ error: "Valor inválido" });
      return;
    }

    const now = new Date();
    const providedId = typeof idRaw === "string" ? idRaw.trim() : "";
    const id = providedId || `rg_${ctx.userIdStr}_${Math.floor(Date.now() / 1000)}`;

    try {
      const payload: any = {
        id,
        user_id: ctx.userIdStr,
        descricao,
        ...(categoria ? { categoria } : {}),
        valor_total: Number(Number(valor).toFixed(2)),
        atualizado_em: now,
      };
      if (ativo !== null) {
        payload.ativo = ativo;
      }
      if (!providedId) {
        payload.criado_em = now;
        payload.ativo = ativo === null ? true : ativo;
      }

      await db
        .collection("gastos_recorrentes")
        .doc(id)
        .set(payload, { merge: true });

      res.status(200).json({
        ok: true,
        user_id: ctx.userIdStr,
        id,
        descricao,
        categoria: payload.categoria || "",
        valor_total: payload.valor_total,
        ativo: payload.ativo ?? true,
      });
    } catch (err) {
      console.error("Erro em userUpsertRecurringGasto", err);
      res.status(500).json({ error: "Erro ao salvar gasto recorrente" });
    }
  }
);

export const userApplyRecurringGastos = functions.https.onRequest(
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      setWebAppCors(res);
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const ctx = await getWebAppUserContext(req, res);
    if (!ctx) {
      return;
    }

    setWebAppCors(res);

    if (!ctx.autorizado) {
      res.status(403).json({
        autorizado: false,
        user_id: ctx.userIdStr,
        error:
          "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
      });
      return;
    }

    const body = req.body || {};
    const parsed = parseCycleString(body.cycle);
    if (!parsed) {
      res.status(400).json({ error: "cycle inválido. Use MM/AAAA" });
      return;
    }

    try {
      const templatesSnap = await db
        .collection("gastos_recorrentes")
        .where("user_id", "==", ctx.userIdStr)
        .where("ativo", "==", true)
        .get();

      const templates: any[] = [];
      templatesSnap.forEach((doc) => {
        const data = doc.data() || {};
        templates.push({
          id: data.id || doc.id,
          descricao: data.descricao || "",
          valor_total: Number(data.valor_total || 0),
          categoria: data.categoria || "",
        });
      });

      const dataCompra = getDataCompraForCycle(parsed.mes, parsed.ano);
      const now = new Date();
      let created = 0;
      let skipped = 0;

      for (const tpl of templates) {
        const tplId = String(tpl.id || "").trim();
        const descricao = String(tpl.descricao || "").trim();
        const valorTotal = Number(tpl.valor_total || 0);
        const categoria = String(tpl.categoria || "").trim();
        if (!tplId || !descricao || !Number.isFinite(valorTotal) || valorTotal <= 0) {
          skipped += 1;
          continue;
        }

        const gastoId = `rec_${ctx.userIdStr}_${tplId}_${parsed.cycle.replace("/", "_")}`;
        const docRef = db.collection("gastos").doc(gastoId);

        const payload = {
          id: gastoId,
          user_id: ctx.userIdStr,
          descricao,
          ...(categoria ? { categoria } : {}),
          valor_total: Number(valorTotal.toFixed(2)),
          valor_parcela: Number(valorTotal.toFixed(2)),
          parcelas_total: 1,
          parcelas_pagas: 0,
          data_compra: dataCompra,
          ativo: true,
          mes_inicio: dataCompra.getMonth() + 1,
          ano_inicio: dataCompra.getFullYear(),
          criado_em: now,
          atualizado_em: now,
          origem: "recorrente",
          recorrente_id: tplId,
          ciclo_aplicado: parsed.cycle,
        };

        try {
          await docRef.create(payload);
          created += 1;
        } catch (err: any) {
          const code = err?.code;
          if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS") {
            skipped += 1;
            continue;
          }
          console.error("Erro ao criar gasto recorrente", err);
          throw err;
        }
      }

      res.status(200).json({
        ok: true,
        user_id: ctx.userIdStr,
        cycle: parsed.cycle,
        total_templates: templates.length,
        created,
        skipped,
      });
    } catch (err) {
      console.error("Erro em userApplyRecurringGastos", err);
      res.status(500).json({ error: "Erro ao aplicar gastos recorrentes" });
    }
  }
);

export const userListGastos = functions.https.onRequest(
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      setWebAppCors(res);
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.status(204).send("");
      return;
    }

    if (req.method !== "GET") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const ctx = await getWebAppUserContext(req, res);
    if (!ctx) {
      return;
    }

    setWebAppCors(res);

    if (!ctx.autorizado) {
      res.status(403).json({
        autorizado: false,
        user_id: ctx.userIdStr,
        error:
          "Seu acesso ainda não foi liberado. Peça para um administrador liberar seu usuário pelo mini app.",
      });
      return;
    }

    const limitRaw = req.query.limit;
    let limit = 20;
    if (typeof limitRaw === "string") {
      const parsed = Number.parseInt(limitRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
        limit = parsed;
      }
    }

    try {
      const snap = await db
        .collection("gastos")
        .where("user_id", "==", ctx.userIdStr)
        .where("ativo", "==", true)
        .get();

      const itens: any[] = [];
      snap.forEach((doc) => {
        const data = doc.data() || {};
        const dataCompraRaw = data.data_compra;
        let dataCompraIso: string | null = null;
        const dataCompraAny: any = dataCompraRaw;
        if (dataCompraAny && typeof dataCompraAny.toDate === "function") {
          dataCompraIso = dataCompraAny.toDate().toISOString();
        }

        itens.push({
          id: data.id || doc.id,
          descricao: data.descricao || "",
          categoria: data.categoria || "",
          valor_total: Number(data.valor_total || data.valor_parcela || 0),
          parcelas_total: Number(data.parcelas_total || 1),
          valor_parcela: Number(
            data.valor_parcela || data.valor_total || 0
          ),
          data_compra: dataCompraIso,
          ativo: data.ativo !== false,
        });
      });

      itens.sort((a, b) => {
        const ta = a.data_compra ? Date.parse(a.data_compra) : 0;
        const tb = b.data_compra ? Date.parse(b.data_compra) : 0;
        return tb - ta;
      });

      const limited = itens.slice(0, limit);

      res.status(200).json({
        ok: true,
        user_id: ctx.userIdStr,
        total: itens.length,
        itens: limited,
      });
    } catch (err) {
      console.error("Erro em userListGastos", err);
      res.status(500).json({ error: "Erro ao listar gastos" });
    }
  }
);

export const userRegistrarGasto = functions.https.onRequest(
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      setWebAppCors(res);
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const ctx = await getWebAppUserContext(req, res);
    if (!ctx) {
      return;
    }

    setWebAppCors(res);

    if (!ctx.autorizado) {
      res.status(403).json({
        autorizado: false,
        user_id: ctx.userIdStr,
        error:
          "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
      });
      return;
    }

    const body = req.body || {};
    const descricaoRaw = body.descricao;
    const valorRaw = body.valor;
    const parcelasRaw = body.parcelas;
    const categoriaRaw = body.categoria;

    const descricao =
      typeof descricaoRaw === "string" ? descricaoRaw.trim() : "";

    const categoria =
      typeof categoriaRaw === "string" ? categoriaRaw.trim() : "";

    let valor: number = Number.NaN;
    if (typeof valorRaw === "number") {
      valor = valorRaw;
    } else if (typeof valorRaw === "string") {
      valor = Number(valorRaw.replace(",", "."));
    }

    let parcelas = 1;
    if (
      typeof parcelasRaw !== "undefined" &&
      parcelasRaw !== null &&
      parcelasRaw !== ""
    ) {
      if (typeof parcelasRaw === "number") {
        parcelas = parcelasRaw;
      } else {
        const parsed = Number.parseInt(String(parcelasRaw), 10);
        if (!Number.isNaN(parsed)) {
          parcelas = parsed;
        }
      }
    }

    if (!descricao) {
      res.status(400).json({ error: "Descrição obrigatória" });
      return;
    }

    if (categoria && categoria.length > 50) {
      res.status(400).json({ error: "categoria muito longa (máx 50)" });
      return;
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      res.status(400).json({ error: "Valor inválido" });
      return;
    }

    if (!Number.isFinite(parcelas) || parcelas <= 0) {
      res.status(400).json({ error: "Parcelas inválidas" });
      return;
    }

    if (parcelas > 60) {
      res.status(400).json({ error: "Máximo de 60 parcelas permitido" });
      return;
    }

    try {
      const agora = new Date();
      const gastoId = `${ctx.userIdStr}_${Math.floor(
        Date.now() / 1000
      )}`;
      const valorTotal = Number(valor);
      const valorParcela = valorTotal / parcelas;

      await db
        .collection("gastos")
        .doc(gastoId)
        .set({
          id: gastoId,
          user_id: ctx.userIdStr,
          descricao,
          ...(categoria ? { categoria } : {}),
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

      res.status(200).json({
        ok: true,
        user_id: ctx.userIdStr,
        gastoId,
        descricao,
        categoria,
        valor_total: Number(valorTotal.toFixed(2)),
        valor_parcela: Number(valorParcela.toFixed(2)),
        parcelas_total: parcelas,
      });
    } catch (err) {
      console.error("Erro em userRegistrarGasto", err);
      res.status(500).json({ error: "Erro ao registrar gasto" });
    }
  }
);

export const userRegistrarPagamento = functions.https.onRequest(
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      setWebAppCors(res);
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const ctx = await getWebAppUserContext(req, res);
    if (!ctx) {
      return;
    }

    setWebAppCors(res);

    if (!ctx.autorizado) {
      res.status(403).json({
        autorizado: false,
        user_id: ctx.userIdStr,
        error:
          "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
      });
      return;
    }

    const body = req.body || {};
    const valorRaw = body.valor;
    const descricaoRaw = body.descricao;

    let valor: number = Number.NaN;
    if (typeof valorRaw === "number") {
      valor = valorRaw;
    } else if (typeof valorRaw === "string") {
      valor = Number(valorRaw.replace(",", "."));
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      res.status(400).json({ error: "Valor inválido" });
      return;
    }

    const descricao =
      typeof descricaoRaw === "string" && descricaoRaw.trim()
        ? descricaoRaw.trim()
        : "Pagamento";

    try {
      const agora = new Date();
      const pagamentoId = `pag_${ctx.userIdStr}_${Math.floor(
        Date.now() / 1000
      )}`;

      const valorFinal = Number(valor.toFixed(2));

      await db
        .collection("pagamentos")
        .doc(pagamentoId)
        .set({
          id: pagamentoId,
          user_id: ctx.userIdStr,
          valor: valorFinal,
          descricao,
          data_pagamento: agora,
          mes: agora.getMonth() + 1,
          ano: agora.getFullYear(),
          criado_em: agora,
          atualizado_em: agora,
        });

      const mesRef = agora.getMonth() + 1;
      const anoRef = agora.getFullYear();
      const saldoDepois = await calcularSaldoUsuarioAteMes(
        ctx.userIdStr,
        mesRef,
        anoRef
      );

      res.status(200).json({
        ok: true,
        user_id: ctx.userIdStr,
        pagamentoId,
        descricao,
        valor: valorFinal,
        saldo_atual: saldoDepois,
      });
    } catch (err) {
      console.error("Erro em userRegistrarPagamento", err);
      res.status(500).json({ error: "Erro ao registrar pagamento" });
    }
  }
);
