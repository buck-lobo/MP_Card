"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRegistrarPagamento = exports.userRegistrarGasto = exports.userListBillingCycles = exports.userListPagamentos = exports.userListGastos = exports.userGetOverview = exports.adminDelPagamento = exports.adminEditPagamento = exports.adminDelGasto = exports.adminEditGasto = exports.adminResumoFatura = exports.adminListPagamentos = exports.adminListGastos = exports.telegramWebhook = exports.adminUpdateUsuario = exports.adminGetUsuario = exports.adminSearchUsuarios = exports.userApplyRecurringGastos = exports.userDeleteRecurringGasto = exports.userUpsertRecurringGasto = exports.userCancelPagamento = exports.userEditPagamento = exports.userCancelGasto = exports.userEditGasto = exports.userListRecurringGastos = void 0;
const functions = __importStar(require("firebase-functions"));
const router_1 = require("./telegram/router");
const firebase_1 = require("./firebase");
const admin_1 = require("./admin");
const webappAuth_1 = require("./telegram/webappAuth");
const handlers_1 = require("./telegram/handlers");
const api_1 = require("./telegram/api");
function getBotToken() {
    var _a;
    const token = process.env.TELEGRAM_BOT_TOKEN || ((_a = functions.config().telegram) === null || _a === void 0 ? void 0 : _a.bot_token);
    if (!token) {
        throw new Error("TELEGRAM_BOT_TOKEN não configurado.");
    }
    return token;
}
async function writeAuditLog(entry) {
    try {
        const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await firebase_1.db
            .collection("audit_logs")
            .doc(id)
            .set(Object.assign({ id, created_at: new Date() }, entry));
    }
    catch (err) {
        console.error("Erro ao gravar audit log", err);
    }
}
const USER_EDIT_WINDOW_DAYS = 7;
function toJsDateAny(value) {
    if (!value) {
        return null;
    }
    try {
        if (value instanceof Date) {
            return value;
        }
        if (value && typeof value.toDate === "function") {
            return value.toDate();
        }
        if (typeof value === "string") {
            const d = new Date(value);
            if (!Number.isNaN(d.getTime())) {
                return d;
            }
        }
    }
    catch (_a) {
        return null;
    }
    return null;
}
function isWithinEditWindow(date) {
    if (!date) {
        return false;
    }
    const ms = Date.now() - date.getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    return days <= USER_EDIT_WINDOW_DAYS;
}
function parseCycleString(cycleRaw) {
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
    if (!Number.isFinite(mes) ||
        !Number.isFinite(ano) ||
        mes < 1 ||
        mes > 12 ||
        ano < 2000 ||
        ano > 2100) {
        return null;
    }
    return {
        mes,
        ano,
        cycle: `${String(mes).padStart(2, "0")}/${ano}`,
    };
}
function getDataCompraForCycle(mes, ano) {
    let prevMes = mes - 1;
    let prevAno = ano;
    if (prevMes < 1) {
        prevMes = 12;
        prevAno -= 1;
    }
    return new Date(prevAno, prevMes - 1, 10, 12, 0, 0);
}
exports.userListRecurringGastos = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
        });
        return;
    }
    try {
        const snap = await firebase_1.db
            .collection("gastos_recorrentes")
            .where("user_id", "==", ctx.userIdStr)
            .get();
        const itens = [];
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
    }
    catch (err) {
        console.error("Erro em userListRecurringGastos", err);
        res.status(500).json({ error: "Erro ao listar gastos recorrentes" });
    }
});
exports.userEditGasto = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
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
    const descricao = typeof descricaoRaw === "string" ? descricaoRaw.trim() : "";
    const categoria = typeof categoriaRaw === "string" ? categoriaRaw.trim() : "";
    let novoValorTotal = null;
    if (typeof novoValorRaw === "number") {
        novoValorTotal = novoValorRaw;
    }
    else if (typeof novoValorRaw === "string" && novoValorRaw.trim()) {
        novoValorTotal = Number(novoValorRaw.replace(",", "."));
    }
    let novasParcelas = null;
    if (novasParcelasRaw !== undefined &&
        novasParcelasRaw !== null &&
        novasParcelasRaw !== "") {
        if (typeof novasParcelasRaw === "number") {
            novasParcelas = novasParcelasRaw;
        }
        else {
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
        const docRef = firebase_1.db.collection("gastos").doc(gastoId);
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
        const updates = {
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
    }
    catch (err) {
        console.error("Erro em userEditGasto", err);
        res.status(500).json({ error: "Erro ao editar gasto" });
    }
});
exports.userCancelGasto = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
        });
        return;
    }
    const body = req.body || {};
    const gastoIdRaw = body.gastoId;
    const gastoId = typeof gastoIdRaw === "string" ? gastoIdRaw.trim() : "";
    if (!gastoId) {
        res.status(400).json({ error: "gastoId obrigatório" });
        return;
    }
    try {
        const docRef = firebase_1.db.collection("gastos").doc(gastoId);
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
                error: `Este gasto não pode mais ser cancelado (janela de ${USER_EDIT_WINDOW_DAYS} dias).`,
            });
            return;
        }
        await docRef.set({ ativo: false, atualizado_em: new Date() }, { merge: true });
        res.status(200).json({ ok: true, user_id: ctx.userIdStr, gastoId });
    }
    catch (err) {
        console.error("Erro em userCancelGasto", err);
        res.status(500).json({ error: "Erro ao cancelar gasto" });
    }
});
exports.userEditPagamento = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
        });
        return;
    }
    const body = req.body || {};
    const pagamentoIdRaw = body.pagamentoId;
    const novoValorRaw = body.novoValor;
    const descricaoRaw = body.descricao;
    const pagamentoId = typeof pagamentoIdRaw === "string" ? pagamentoIdRaw.trim() : "";
    const descricao = typeof descricaoRaw === "string" ? descricaoRaw.trim() : "";
    let novoValor = null;
    if (typeof novoValorRaw === "number") {
        novoValor = novoValorRaw;
    }
    else if (typeof novoValorRaw === "string" && novoValorRaw.trim()) {
        novoValor = Number(novoValorRaw.replace(",", "."));
    }
    if (!pagamentoId) {
        res.status(400).json({ error: "pagamentoId obrigatório" });
        return;
    }
    if (!descricao && novoValor === null) {
        res.status(400).json({ error: "Nenhuma alteração informada" });
        return;
    }
    if (novoValor !== null) {
        if (!Number.isFinite(novoValor) || novoValor <= 0) {
            res.status(400).json({ error: "novoValor inválido" });
            return;
        }
    }
    try {
        const docRef = firebase_1.db.collection("pagamentos").doc(pagamentoId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Pagamento não encontrado" });
            return;
        }
        const pagamento = snap.data() || {};
        if (String(pagamento.user_id || "") !== ctx.userIdStr) {
            res
                .status(403)
                .json({ error: "Sem permissão para alterar este pagamento" });
            return;
        }
        if (pagamento.cancelado) {
            res.status(400).json({ error: "Pagamento já está cancelado" });
            return;
        }
        const baseDate = toJsDateAny(pagamento.data_pagamento) || toJsDateAny(pagamento.criado_em);
        if (!isWithinEditWindow(baseDate)) {
            res.status(400).json({
                error: `Este pagamento não pode mais ser alterado (janela de ${USER_EDIT_WINDOW_DAYS} dias).`,
            });
            return;
        }
        const updates = { atualizado_em: new Date() };
        if (descricao) {
            updates.descricao = descricao;
        }
        if (novoValor != null) {
            updates.valor = Number(novoValor.toFixed(2));
        }
        await docRef.set(updates, { merge: true });
        res.status(200).json({
            ok: true,
            user_id: ctx.userIdStr,
            pagamentoId,
            descricao: descricao || (pagamento.descricao || "Pagamento"),
            valor: novoValor != null ? Number(novoValor.toFixed(2)) : Number(pagamento.valor || 0),
        });
    }
    catch (err) {
        console.error("Erro em userEditPagamento", err);
        res.status(500).json({ error: "Erro ao editar pagamento" });
    }
});
exports.userCancelPagamento = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
        });
        return;
    }
    const body = req.body || {};
    const pagamentoIdRaw = body.pagamentoId;
    const pagamentoId = typeof pagamentoIdRaw === "string" ? pagamentoIdRaw.trim() : "";
    if (!pagamentoId) {
        res.status(400).json({ error: "pagamentoId obrigatório" });
        return;
    }
    try {
        const docRef = firebase_1.db.collection("pagamentos").doc(pagamentoId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Pagamento não encontrado" });
            return;
        }
        const pagamento = snap.data() || {};
        if (String(pagamento.user_id || "") !== ctx.userIdStr) {
            res
                .status(403)
                .json({ error: "Sem permissão para alterar este pagamento" });
            return;
        }
        if (pagamento.cancelado) {
            res.status(400).json({ error: "Pagamento já está cancelado" });
            return;
        }
        const baseDate = toJsDateAny(pagamento.data_pagamento) || toJsDateAny(pagamento.criado_em);
        if (!isWithinEditWindow(baseDate)) {
            res.status(400).json({
                error: `Este pagamento não pode mais ser cancelado (janela de ${USER_EDIT_WINDOW_DAYS} dias).`,
            });
            return;
        }
        await docRef.set({ cancelado: true, atualizado_em: new Date() }, { merge: true });
        res.status(200).json({ ok: true, user_id: ctx.userIdStr, pagamentoId });
    }
    catch (err) {
        console.error("Erro em userCancelPagamento", err);
        res.status(500).json({ error: "Erro ao cancelar pagamento" });
    }
});
exports.userUpsertRecurringGasto = functions.https.onRequest(async (req, res) => {
    var _a;
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
        });
        return;
    }
    const body = req.body || {};
    const idRaw = body.id;
    const descricaoRaw = body.descricao;
    const valorRaw = body.valor;
    const ativoRaw = body.ativo;
    const categoriaRaw = body.categoria;
    const descricao = typeof descricaoRaw === "string" ? descricaoRaw.trim() : "";
    const categoria = typeof categoriaRaw === "string" ? categoriaRaw.trim() : "";
    let valor = Number.NaN;
    if (typeof valorRaw === "number") {
        valor = valorRaw;
    }
    else if (typeof valorRaw === "string") {
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
        const payload = {
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
        await firebase_1.db
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
            ativo: (_a = payload.ativo) !== null && _a !== void 0 ? _a : true,
        });
    }
    catch (err) {
        console.error("Erro em userUpsertRecurringGasto", err);
        res.status(500).json({ error: "Erro ao salvar gasto recorrente" });
    }
});
exports.userDeleteRecurringGasto = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
        });
        return;
    }
    const body = req.body || {};
    const idRaw = body.id;
    const id = typeof idRaw === "string" ? idRaw.trim() : "";
    if (!id) {
        res.status(400).json({ error: "id obrigatório" });
        return;
    }
    try {
        await firebase_1.db
            .collection("gastos_recorrentes")
            .doc(id)
            .set({ ativo: false, atualizado_em: new Date() }, { merge: true });
        res.status(200).json({ ok: true, user_id: ctx.userIdStr, id });
    }
    catch (err) {
        console.error("Erro em userDeleteRecurringGasto", err);
        res.status(500).json({ error: "Erro ao remover gasto recorrente" });
    }
});
exports.userApplyRecurringGastos = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
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
        const templatesSnap = await firebase_1.db
            .collection("gastos_recorrentes")
            .where("user_id", "==", ctx.userIdStr)
            .where("ativo", "==", true)
            .get();
        const templates = [];
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
            const docRef = firebase_1.db.collection("gastos").doc(gastoId);
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
            }
            catch (err) {
                const code = err === null || err === void 0 ? void 0 : err.code;
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
    }
    catch (err) {
        console.error("Erro em userApplyRecurringGastos", err);
        res.status(500).json({ error: "Erro ao aplicar gastos recorrentes" });
    }
});
function setWebAppCors(res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "x-telegram-init-data, content-type");
}
async function resolveTargetUserId(term) {
    const raw = (term || "").trim();
    if (!raw) {
        return null;
    }
    // Se for só dígitos, assumir que já é o ID Telegram
    if (/^\d+$/.test(raw)) {
        return raw;
    }
    let username = raw;
    if (username.startsWith("@")) {
        username = username.substring(1);
    }
    try {
        // 1) Tentar username exato em usuarios.username
        const byUsernameSnap = await firebase_1.db
            .collection("usuarios")
            .where("username", "==", username)
            .limit(1)
            .get();
        if (!byUsernameSnap.empty) {
            const doc = byUsernameSnap.docs[0];
            console.log("resolveTargetUserId: encontrado por username", username, "=>", doc.id);
            return doc.id;
        }
        // 2) Fallback: buscar por nome contendo termo (case-insensitive) em memoria
        const allUsersSnap = await firebase_1.db.collection("usuarios").get();
        const termLower = raw.toLowerCase();
        for (const doc of allUsersSnap.docs) {
            const data = doc.data();
            const name = String(data.name || "").toLowerCase();
            if (name.includes(termLower)) {
                console.log("resolveTargetUserId: encontrado por nome parcial", raw, "=>", doc.id);
                return doc.id;
            }
        }
    }
    catch (err) {
        console.error("Erro em resolveTargetUserId para termo", term, err);
    }
    return null;
}
async function verifyAdminFromRequest(req, res) {
    var _a;
    const initDataHeader = req.get("x-telegram-init-data") || "";
    const initDataBody = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.initData) === "string" ? req.body.initData : "";
    const initData = (initDataHeader || initDataBody).trim();
    if (!initData) {
        setWebAppCors(res);
        res.status(401).send("initData ausente");
        return null;
    }
    let user;
    try {
        const token = getBotToken();
        console.log("Validando initData...");
        console.log("- initData length:", initData.length);
        console.log("- initData preview:", initData.substring(0, 100) + "...");
        console.log("- bot token length:", token.length);
        console.log("- bot token (primeiros 10 chars):", token.substring(0, 10) + "...");
        user = (0, webappAuth_1.parseAndVerifyInitData)(initData, token);
        console.log("✅ initData válido para user:", user.id);
    }
    catch (err) {
        console.error("❌ Erro ao validar initData do WebApp:", err);
        console.error("- Mensagem:", err.message);
        setWebAppCors(res);
        res.status(401).send("initData inválido");
        return null;
    }
    if (!admin_1.ADMIN_USER_IDS.includes(String(user.id))) {
        setWebAppCors(res);
        res.status(403).send("Acesso restrito a administradores");
        return null;
    }
    return user;
}
async function getWebAppUserContext(req, res) {
    var _a, _b, _c;
    const initDataHeader = req.get("x-telegram-init-data") || "";
    const initDataBody = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.initData) === "string" ? req.body.initData : "";
    const initData = (initDataHeader || initDataBody).trim();
    if (!initData) {
        setWebAppCors(res);
        res.status(401).send("initData ausente");
        return null;
    }
    let webAppUser;
    try {
        const token = getBotToken();
        webAppUser = (0, webappAuth_1.parseAndVerifyInitData)(initData, token);
    }
    catch (err) {
        console.error("Erro ao validar initData do WebApp (usuário):", err);
        setWebAppCors(res);
        res.status(401).send("initData inválido");
        return null;
    }
    const userIdStr = String(webAppUser.id);
    const userRef = firebase_1.db.collection("usuarios").doc(userIdStr);
    try {
        await userRef.set({
            name: (_b = webAppUser.first_name) !== null && _b !== void 0 ? _b : "",
            username: (_c = webAppUser.username) !== null && _c !== void 0 ? _c : null,
            last_seen: new Date(),
            ativo: true,
            atualizado_em: new Date(),
        }, { merge: true });
    }
    catch (err) {
        console.error("Erro ao registrar/atualizar usuário do WebApp (usuário):", err);
    }
    let data = {};
    try {
        const snap = await userRef.get();
        data = snap.data() || {};
    }
    catch (err) {
        console.error("Erro ao ler dados do usuário do WebApp:", err);
    }
    const isAdmin = admin_1.ADMIN_USER_IDS.includes(userIdStr);
    let autorizado = data.autorizado === true || isAdmin;
    if (isAdmin && data.autorizado !== true) {
        try {
            await userRef.set({ autorizado: true }, { merge: true });
        }
        catch (err) {
            console.error("Erro ao marcar admin como autorizado para WebApp de usuário:", err);
        }
    }
    return {
        webAppUser,
        userIdStr,
        userRecord: data,
        isAdmin,
        autorizado,
    };
}
function parseBool(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const lower = value.toLowerCase().trim();
        if (lower === "true")
            return true;
        if (lower === "false")
            return false;
    }
    return null;
}
exports.adminSearchUsuarios = functions.https.onRequest(async (req, res) => {
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
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    setWebAppCors(res);
    const qRaw = req.query.q;
    const q = typeof qRaw === "string" ? qRaw.trim() : "";
    if (!q) {
        res.status(200).json({ results: [] });
        return;
    }
    let term = q;
    if (term.startsWith("@")) {
        term = term.substring(1);
    }
    try {
        const results = [];
        const seen = new Set();
        function pushUser(doc) {
            var _a;
            if (seen.has(doc.id)) {
                return;
            }
            seen.add(doc.id);
            const data = doc.data();
            results.push({
                id: doc.id,
                name: String(data.name || ""),
                username: (_a = data.username) !== null && _a !== void 0 ? _a : null,
            });
        }
        const byUsernameSnap = await firebase_1.db
            .collection("usuarios")
            .where("username", "==", term)
            .limit(5)
            .get();
        byUsernameSnap.forEach((doc) => {
            pushUser(doc);
        });
        if (results.length < 10) {
            const snapshot = await firebase_1.db
                .collection("usuarios")
                .where("ativo", "==", true)
                .limit(200)
                .get();
            const lower = term.toLowerCase();
            snapshot.forEach((doc) => {
                const data = doc.data();
                const name = String(data.name || "").toLowerCase();
                const username = String(data.username || "").toLowerCase();
                if (name.includes(lower) ||
                    username.includes(lower) ||
                    doc.id.includes(term)) {
                    pushUser(doc);
                }
            });
        }
        res.status(200).json({ results: results.slice(0, 20) });
    }
    catch (err) {
        console.error("Erro em adminSearchUsuarios", err);
        res.status(500).send("Erro ao buscar usuários");
    }
});
exports.adminGetUsuario = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
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
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    setWebAppCors(res);
    const userTermRaw = req.query.userId;
    const userTerm = typeof userTermRaw === "string" ? userTermRaw.trim() : "";
    if (!userTerm) {
        res.status(400).send("Parâmetro userId obrigatório");
        return;
    }
    const targetUserId = await resolveTargetUserId(userTerm);
    if (!targetUserId) {
        res.status(404).send("Usuário não encontrado");
        return;
    }
    try {
        const docRef = firebase_1.db.collection("usuarios").doc(targetUserId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(404).send("Usuário não encontrado");
            return;
        }
        const data = snap.data() || {};
        let solicitacaoAcesso = null;
        try {
            const solicitSnap = await firebase_1.db
                .collection("solicitacoes_acesso")
                .doc(targetUserId)
                .get();
            if (solicitSnap.exists) {
                const sdata = solicitSnap.data() || {};
                solicitacaoAcesso = {
                    status: (_a = sdata.status) !== null && _a !== void 0 ? _a : null,
                    solicitado_em: (_b = sdata.solicitado_em) !== null && _b !== void 0 ? _b : null,
                    atualizado_em: (_c = sdata.atualizado_em) !== null && _c !== void 0 ? _c : null,
                    aprovado_em: (_d = sdata.aprovado_em) !== null && _d !== void 0 ? _d : null,
                    aprovado_por: (_e = sdata.aprovado_por) !== null && _e !== void 0 ? _e : null,
                };
            }
        }
        catch (err) {
            console.error("Erro ao carregar solicitacao_acesso para adminGetUsuario", err);
        }
        res.status(200).json({
            admin_user_id: adminUser.id,
            user_id: targetUserId,
            dados: {
                id: targetUserId,
                name: String(data.name || ""),
                username: (_f = data.username) !== null && _f !== void 0 ? _f : null,
                ativo: data.ativo !== false,
                autorizado: !!data.autorizado,
                criado_em: (_g = data.criado_em) !== null && _g !== void 0 ? _g : null,
                last_seen: (_h = data.last_seen) !== null && _h !== void 0 ? _h : null,
                atualizado_em: (_j = data.atualizado_em) !== null && _j !== void 0 ? _j : null,
                solicitacao_acesso: solicitacaoAcesso,
            },
        });
    }
    catch (err) {
        console.error("Erro em adminGetUsuario", err);
        res.status(500).send("Erro ao obter usuário");
    }
});
exports.adminUpdateUsuario = functions.https.onRequest(async (req, res) => {
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
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    setWebAppCors(res);
    const body = req.body || {};
    const userTermRaw = body.userId;
    const userTerm = typeof userTermRaw === "string" ? userTermRaw.trim() : "";
    if (!userTerm) {
        res.status(400).json({ error: "userId obrigatório" });
        return;
    }
    const targetUserId = await resolveTargetUserId(userTerm);
    if (!targetUserId) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
    }
    const updates = {
        atualizado_em: new Date(),
    };
    if (typeof body.name === "string") {
        updates.name = body.name;
    }
    if ("username" in body) {
        if (body.username === null || body.username === "") {
            updates.username = null;
        }
        else if (typeof body.username === "string") {
            updates.username = body.username;
        }
    }
    const autorizadoParsed = parseBool(body.autorizado);
    if (autorizadoParsed !== null) {
        updates.autorizado = autorizadoParsed;
    }
    const ativoParsed = parseBool(body.ativo);
    if (ativoParsed !== null) {
        updates.ativo = ativoParsed;
    }
    try {
        await firebase_1.db.collection("usuarios").doc(targetUserId).set(updates, {
            merge: true,
        });
        if (autorizadoParsed === true) {
            try {
                const agora = new Date();
                await firebase_1.db
                    .collection("solicitacoes_acesso")
                    .doc(targetUserId)
                    .set({
                    user_id: targetUserId,
                    status: "approved",
                    aprovado_em: agora,
                    aprovado_por: String(adminUser.id),
                    atualizado_em: agora,
                }, { merge: true });
            }
            catch (err) {
                console.error("Erro ao atualizar solicitacao_acesso em adminUpdateUsuario", err);
            }
        }
        res.status(200).json({
            ok: true,
            admin_user_id: adminUser.id,
            user_id: targetUserId,
        });
    }
    catch (err) {
        console.error("Erro em adminUpdateUsuario", err);
        res.status(500).json({ error: "Erro ao atualizar usuário" });
    }
});

exports.adminListAccessRequests = functions.https.onRequest(async (req, res) => {
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
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    setWebAppCors(res);
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "pending";
    let limit = 30;
    const limitRaw = req.query.limit;
    if (typeof limitRaw === "string") {
        const parsed = Number.parseInt(limitRaw, 10);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
            limit = parsed;
        }
    }
    try {
        let query = firebase_1.db.collection("solicitacoes_acesso").limit(limit);
        if (status) {
            query = query.where("status", "==", status);
        }
        // Ordenar por solicitado_em (se existir) para priorizar os mais antigos.
        try {
            query = query.orderBy("solicitado_em", "asc");
        }
        catch (_a) {
            // Se não houver índice/orderBy disponível, seguimos sem ordenar.
        }
        const snap = await query.get();
        const items = [];
        for (const doc of snap.docs) {
            const data = doc.data() || {};
            const userId = doc.id;
            let user = null;
            try {
                const uSnap = await firebase_1.db.collection("usuarios").doc(userId).get();
                if (uSnap.exists) {
                    const udata = uSnap.data() || {};
                    user = {
                        id: userId,
                        name: String(udata.name || ""),
                        username: udata.username !== undefined ? udata.username : null,
                    };
                }
            }
            catch (err) {
                console.error("Erro ao carregar usuario para solicitacao_acesso", userId, err);
            }
            items.push({
                user_id: userId,
                status: data.status || null,
                solicitado_em: data.solicitado_em || null,
                atualizado_em: data.atualizado_em || null,
                aprovado_em: data.aprovado_em || null,
                aprovado_por: data.aprovado_por || null,
                user,
            });
        }
        res.status(200).json({
            ok: true,
            admin_user_id: adminUser.id,
            status,
            total: items.length,
            items,
        });
    }
    catch (err) {
        console.error("Erro em adminListAccessRequests", err);
        res.status(500).json({ error: "Erro ao listar solicitações de acesso" });
    }
});

exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    let token;
    try {
        token = getBotToken();
    }
    catch (err) {
        console.error("TELEGRAM_BOT_TOKEN não configurado.", err);
        res.status(500).send("Bot não configurado");
        return;
    }
    const update = req.body;
    try {
        await (0, router_1.handleUpdate)(update, token);
        res.status(200).send("OK");
    }
    catch (err) {
        console.error("Erro ao processar update do Telegram:", err);
        res.status(500).send("Erro interno");
    }
});
exports.adminListGastos = functions.https.onRequest(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "x-telegram-init-data, content-type");
        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.status(204).send("");
        return;
    }
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    const userTermRaw = req.query.userId;
    const userTerm = typeof userTermRaw === "string" ? userTermRaw.trim() : "";
    if (!userTerm) {
        res.status(400).send("Parâmetro userId obrigatório");
        return;
    }
    const targetUserId = await resolveTargetUserId(userTerm);
    if (!targetUserId) {
        res.status(404).send("Usuário não encontrado");
        return;
    }
    const limitRaw = req.query.limit;
    let limit = 500;
    if (typeof limitRaw === "string") {
        const parsed = Number.parseInt(limitRaw, 10);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000) {
            limit = parsed;
        }
    }
    res.set("Access-Control-Allow-Origin", "*");
    try {
        const snap = await firebase_1.db
            .collection("gastos")
            .where("user_id", "==", targetUserId)
            .where("ativo", "==", true)
            .get();
        const itens = [];
        snap.forEach((doc) => {
            const data = doc.data();
            const dataCompraRaw = data.data_compra;
            let dataCompraIso = null;
            const dataCompraAny = dataCompraRaw;
            if (dataCompraAny && typeof dataCompraAny.toDate === "function") {
                dataCompraIso = dataCompraAny.toDate().toISOString();
            }
            itens.push({
                id: data.id || doc.id,
                descricao: data.descricao || "",
                categoria: data.categoria || "",
                valor_total: Number(data.valor_total || data.valor_parcela || 0),
                parcelas_total: Number(data.parcelas_total || 1),
                valor_parcela: Number(data.valor_parcela || data.valor_total || 0),
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
            admin_user_id: adminUser.id,
            user_id: targetUserId,
            total: itens.length,
            itens: limited,
        });
    }
    catch (err) {
        console.error("Erro em adminListGastos", err);
        res.status(500).send("Erro ao listar gastos");
    }
});
exports.adminListPagamentos = functions.https.onRequest(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "x-telegram-init-data, content-type");
        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.status(204).send("");
        return;
    }
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    const userTermRaw = req.query.userId;
    const userTerm = typeof userTermRaw === "string" ? userTermRaw.trim() : "";
    if (!userTerm) {
        res.status(400).send("Parâmetro userId obrigatório");
        return;
    }
    const targetUserId = await resolveTargetUserId(userTerm);
    if (!targetUserId) {
        res.status(404).send("Usuário não encontrado");
        return;
    }
    const limitRaw = req.query.limit;
    let limit = 500;
    if (typeof limitRaw === "string") {
        const parsed = Number.parseInt(limitRaw, 10);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000) {
            limit = parsed;
        }
    }
    res.set("Access-Control-Allow-Origin", "*");
    try {
        const snap = await firebase_1.db
            .collection("pagamentos")
            .where("user_id", "==", targetUserId)
            .get();
        const itens = [];
        snap.forEach((doc) => {
            const data = doc.data() || {};
            if (data.cancelado) {
                return;
            }
            const dataPagRaw = data.data_pagamento;
            let dataPagIso = null;
            const dataPagAny = dataPagRaw;
            if (dataPagAny && typeof dataPagAny.toDate === "function") {
                dataPagIso = dataPagAny.toDate().toISOString();
            }
            itens.push({
                id: data.id || doc.id,
                descricao: data.descricao || "Pagamento",
                valor: Number(data.valor || 0),
                data_pagamento: dataPagIso,
                cancelado: !!data.cancelado,
            });
        });
        itens.sort((a, b) => {
            const ta = a.data_pagamento ? Date.parse(a.data_pagamento) : 0;
            const tb = b.data_pagamento ? Date.parse(b.data_pagamento) : 0;
            return tb - ta;
        });
        const limited = itens.slice(0, limit);
        res.status(200).json({
            admin_user_id: adminUser.id,
            user_id: targetUserId,
            total: itens.length,
            itens: limited,
        });
    }
    catch (err) {
        console.error("Erro em adminListPagamentos", err);
        res.status(500).send("Erro ao listar pagamentos");
    }
});
exports.adminResumoFatura = functions.https.onRequest(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "x-telegram-init-data, content-type");
        res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.status(204).send("");
        return;
    }
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    const userTermRaw = req.query.userId;
    const userTerm = typeof userTermRaw === "string" ? userTermRaw.trim() : "";
    if (!userTerm) {
        res.status(400).send("Parâmetro userId obrigatório");
        return;
    }
    const targetUserId = await resolveTargetUserId(userTerm);
    if (!targetUserId) {
        res.status(404).send("Usuário não encontrado");
        return;
    }
    const mesRaw = req.query.mes;
    const anoRaw = req.query.ano;
    const mes = typeof mesRaw === "string" ? Number.parseInt(mesRaw, 10) : Number.NaN;
    const ano = typeof anoRaw === "string" ? Number.parseInt(anoRaw, 10) : Number.NaN;
    if (!Number.isFinite(mes) || mes < 1 || mes > 12) {
        res.status(400).send("Parâmetro mes inválido");
        return;
    }
    if (!Number.isFinite(ano) || ano < 2000) {
        res.status(400).send("Parâmetro ano inválido");
        return;
    }
    res.set("Access-Control-Allow-Origin", "*");
    try {
        const { itens, totais } = await (0, handlers_1.obterExtratoConsumoUsuario)(targetUserId, mes, ano);
        const saldoAcumuladoBruto = await (0, handlers_1.calcularSaldoUsuarioAteMes)(targetUserId, mes, ano);
        const BASE_MES = 10;
        const BASE_ANO = 2025;
        let saldoAcumulado = saldoAcumuladoBruto;
        let saldoBase = 0;
        if (ano > BASE_ANO || (ano === BASE_ANO && mes > BASE_MES)) {
            saldoBase = await (0, handlers_1.calcularSaldoUsuarioAteMes)(targetUserId, BASE_MES, BASE_ANO);
            saldoAcumulado = Number((saldoAcumuladoBruto - saldoBase).toFixed(2));
        }
        res.status(200).json({
            admin_user_id: adminUser.id,
            user_id: targetUserId,
            mes,
            ano,
            totais: Object.assign(Object.assign({}, totais), { saldo_acumulado: saldoAcumulado, saldo_acumulado_bruto: saldoAcumuladoBruto, saldo_quitado_ate_base: saldoBase, base_mes: BASE_MES, base_ano: BASE_ANO }),
            total_itens: itens.length,
        });
    }
    catch (err) {
        console.error("Erro em adminResumoFatura", err);
        res.status(500).send("Erro ao obter resumo de fatura");
    }
});
exports.adminEditGasto = functions.https.onRequest(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "x-telegram-init-data, content-type");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    res.set("Access-Control-Allow-Origin", "*");
    const body = req.body || {};
    const gastoIdRaw = body.gastoId;
    const novoValorRaw = body.novoValorTotal;
    const novasParcelasRaw = body.novasParcelas;
    const gastoId = typeof gastoIdRaw === "string" ? gastoIdRaw.trim() : "";
    let novoValorTotal = Number.NaN;
    if (typeof novoValorRaw === "number") {
        novoValorTotal = novoValorRaw;
    }
    else if (typeof novoValorRaw === "string") {
        novoValorTotal = Number(novoValorRaw.replace(",", "."));
    }
    if (!gastoId) {
        res.status(400).json({ error: "gastoId obrigatório" });
        return;
    }
    if (!Number.isFinite(novoValorTotal) || novoValorTotal <= 0) {
        res.status(400).json({ error: "novoValorTotal inválido" });
        return;
    }
    let novasParcelas = null;
    if (novasParcelasRaw !== undefined &&
        novasParcelasRaw !== null &&
        novasParcelasRaw !== "") {
        if (typeof novasParcelasRaw === "number") {
            novasParcelas = novasParcelasRaw;
        }
        else {
            const parsed = Number.parseInt(String(novasParcelasRaw), 10);
            if (!Number.isNaN(parsed)) {
                novasParcelas = parsed;
            }
        }
        if (novasParcelas == null ||
            !Number.isFinite(novasParcelas) ||
            novasParcelas <= 0) {
            res.status(400).json({ error: "novasParcelas inválido" });
            return;
        }
        if (novasParcelas > 60) {
            res.status(400).json({ error: "Máximo de 60 parcelas permitido" });
            return;
        }
    }
    try {
        const docRef = firebase_1.db.collection("gastos").doc(gastoId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Gasto não encontrado" });
            return;
        }
        const gasto = snap.data() || {};
        const before = {
            valor_total: Number(gasto.valor_total || gasto.valor_parcela || 0),
            valor_parcela: Number(gasto.valor_parcela || 0),
            parcelas_total: Number(gasto.parcelas_total || 1),
            ativo: gasto.ativo === false ? false : true,
        };
        const parcelasAtuais = Number(gasto.parcelas_total || 1);
        const parcelas = novasParcelas != null ? novasParcelas : parcelasAtuais;
        const valorParcela = novoValorTotal / parcelas;
        await docRef.set({
            valor_total: Number(novoValorTotal.toFixed(2)),
            valor_parcela: Number(valorParcela.toFixed(2)),
            parcelas_total: parcelas,
            atualizado_em: new Date(),
        }, { merge: true });
        await writeAuditLog({
            actor_user_id: String(adminUser.id),
            action: "admin_edit_gasto",
            entity: "gasto",
            entity_id: gastoId,
            target_user_id: String(gasto.user_id || ""),
            before,
            after: {
                valor_total: Number(novoValorTotal.toFixed(2)),
                valor_parcela: Number(valorParcela.toFixed(2)),
                parcelas_total: parcelas,
                ativo: gasto.ativo === false ? false : true,
            },
        });
        res.status(200).json({
            ok: true,
            admin_user_id: adminUser.id,
            gastoId,
            descricao: gasto.descricao || "",
            valor_total: Number(novoValorTotal.toFixed(2)),
            valor_parcela: Number(valorParcela.toFixed(2)),
            parcelas_total: parcelas,
        });
    }
    catch (err) {
        console.error("Erro em adminEditGasto", err);
        res.status(500).json({ error: "Erro ao editar gasto" });
    }
});
exports.adminDelGasto = functions.https.onRequest(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "x-telegram-init-data, content-type");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    res.set("Access-Control-Allow-Origin", "*");
    const body = req.body || {};
    const gastoIdRaw = body.gastoId;
    const gastoId = typeof gastoIdRaw === "string" ? gastoIdRaw.trim() : "";
    if (!gastoId) {
        res.status(400).json({ error: "gastoId obrigatório" });
        return;
    }
    try {
        const docRef = firebase_1.db.collection("gastos").doc(gastoId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Gasto não encontrado" });
            return;
        }
        const gasto = snap.data() || {};
        if (gasto.ativo === false) {
            res.status(400).json({ error: "Gasto já está inativo" });
            return;
        }
        const before = {
            ativo: gasto.ativo === false ? false : true,
            valor_total: Number(gasto.valor_total || gasto.valor_parcela || 0),
        };
        await docRef.set({
            ativo: false,
            atualizado_em: new Date(),
        }, { merge: true });
        await writeAuditLog({
            actor_user_id: String(adminUser.id),
            action: "admin_del_gasto",
            entity: "gasto",
            entity_id: gastoId,
            target_user_id: String(gasto.user_id || ""),
            before,
            after: Object.assign(Object.assign({}, before), { ativo: false }),
        });
        res.status(200).json({
            ok: true,
            admin_user_id: adminUser.id,
            gastoId,
            descricao: gasto.descricao || "",
            valor_total: Number(gasto.valor_total || gasto.valor_parcela || 0),
        });
    }
    catch (err) {
        console.error("Erro em adminDelGasto", err);
        res.status(500).json({ error: "Erro ao inativar gasto" });
    }
});
exports.adminEditPagamento = functions.https.onRequest(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "x-telegram-init-data, content-type");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    res.set("Access-Control-Allow-Origin", "*");
    const body = req.body || {};
    const pagamentoIdRaw = body.pagamentoId;
    const novoValorRaw = body.novoValor;
    const pagamentoId = typeof pagamentoIdRaw === "string" ? pagamentoIdRaw.trim() : "";
    let novoValor = Number.NaN;
    if (typeof novoValorRaw === "number") {
        novoValor = novoValorRaw;
    }
    else if (typeof novoValorRaw === "string") {
        novoValor = Number(novoValorRaw.replace(",", "."));
    }
    if (!pagamentoId) {
        res.status(400).json({ error: "pagamentoId obrigatório" });
        return;
    }
    if (!Number.isFinite(novoValor) || novoValor <= 0) {
        res.status(400).json({ error: "novoValor inválido" });
        return;
    }
    try {
        const docRef = firebase_1.db.collection("pagamentos").doc(pagamentoId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Pagamento não encontrado" });
            return;
        }
        const pagamento = snap.data();
        if (!pagamento) {
            res.status(500).json({ error: "Dados do pagamento inválidos" });
            return;
        }
        if (pagamento.cancelado) {
            res
                .status(400)
                .json({ error: "Não é possível editar um pagamento cancelado" });
            return;
        }
        const before = {
            valor: Number(pagamento.valor || 0),
            cancelado: pagamento.cancelado ? true : false,
        };
        await docRef.set({
            valor: Number(novoValor.toFixed(2)),
            atualizado_em: new Date(),
        }, { merge: true });
        await writeAuditLog({
            actor_user_id: String(adminUser.id),
            action: "admin_edit_pagamento",
            entity: "pagamento",
            entity_id: pagamentoId,
            target_user_id: String(pagamento.user_id || ""),
            before,
            after: { valor: Number(novoValor.toFixed(2)), cancelado: false },
        });
        res.status(200).json({
            ok: true,
            admin_user_id: adminUser.id,
            pagamentoId,
            descricao: pagamento.descricao || "Pagamento",
            valor: Number(novoValor.toFixed(2)),
        });
    }
    catch (err) {
        console.error("Erro em adminEditPagamento", err);
        res.status(500).json({ error: "Erro ao editar pagamento" });
    }
});
exports.adminDelPagamento = functions.https.onRequest(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "x-telegram-init-data, content-type");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const adminUser = await verifyAdminFromRequest(req, res);
    if (!adminUser) {
        return;
    }
    res.set("Access-Control-Allow-Origin", "*");
    const body = req.body || {};
    const pagamentoIdRaw = body.pagamentoId;
    const pagamentoId = typeof pagamentoIdRaw === "string" ? pagamentoIdRaw.trim() : "";
    if (!pagamentoId) {
        res.status(400).json({ error: "pagamentoId obrigatório" });
        return;
    }
    try {
        const docRef = firebase_1.db.collection("pagamentos").doc(pagamentoId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Pagamento não encontrado" });
            return;
        }
        const pagamento = snap.data() || {};
        if (pagamento.cancelado) {
            res.status(400).json({ error: "Pagamento já está cancelado" });
            return;
        }
        const before = {
            valor: Number(pagamento.valor || 0),
            cancelado: pagamento.cancelado ? true : false,
        };
        await docRef.set({
            cancelado: true,
            atualizado_em: new Date(),
        }, { merge: true });
        await writeAuditLog({
            actor_user_id: String(adminUser.id),
            action: "admin_del_pagamento",
            entity: "pagamento",
            entity_id: pagamentoId,
            target_user_id: String(pagamento.user_id || ""),
            before,
            after: Object.assign(Object.assign({}, before), { cancelado: true }),
        });
        res.status(200).json({
            ok: true,
            admin_user_id: adminUser.id,
            pagamentoId,
            descricao: pagamento.descricao || "Pagamento",
            valor: Number(pagamento.valor || 0),
        });
    }
    catch (err) {
        console.error("Erro em adminDelPagamento", err);
        res.status(500).json({ error: "Erro ao cancelar pagamento" });
    }
});
exports.userGetOverview = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
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
        let solicitacaoAcesso = null;
        try {
            const solicitSnap = await firebase_1.db
                .collection("solicitacoes_acesso")
                .doc(ctx.userIdStr)
                .get();
            if (solicitSnap.exists) {
                const sdata = solicitSnap.data() || {};
                solicitacaoAcesso = {
                    status: sdata.status || null,
                    solicitado_em: sdata.solicitado_em || null,
                    atualizado_em: sdata.atualizado_em || null,
                    aprovado_em: sdata.aprovado_em || null,
                    aprovado_por: sdata.aprovado_por || null,
                };
            }
        }
        catch (err) {
            console.error("Erro ao carregar solicitacao_acesso para userGetOverview", err);
        }
        res.status(403).json({
            autorizado: false,
            isAdmin: ctx.isAdmin,
            user_id: ctx.userIdStr,
            solicitacao_acesso: solicitacaoAcesso,
            error: "Seu acesso ainda não foi liberado. Peça a liberação no mini app ou aguarde um administrador aprovar.",
        });
        return;
    }
    const agora = new Date();
    let mesRef = agora.getMonth() + 1;
    let anoRef = agora.getFullYear();
    const mesRaw = req.query.mes;
    const anoRaw = req.query.ano;
    if (typeof mesRaw === "string" && typeof anoRaw === "string") {
        const mesParsed = Number.parseInt(mesRaw, 10);
        const anoParsed = Number.parseInt(anoRaw, 10);
        if (Number.isFinite(mesParsed) &&
            mesParsed >= 1 &&
            mesParsed <= 12 &&
            Number.isFinite(anoParsed) &&
            anoParsed >= 2000 &&
            anoParsed <= 2100) {
            mesRef = mesParsed;
            anoRef = anoParsed;
        }
    }
    try {
        const saldoAcumuladoBruto = await (0, handlers_1.calcularSaldoUsuarioAteMes)(ctx.userIdStr, mesRef, anoRef);
        const { itens, totais } = await (0, handlers_1.obterExtratoConsumoUsuario)(ctx.userIdStr, mesRef, anoRef);
        const BASE_MES = 10;
        const BASE_ANO = 2025;
        let saldoAcumulado = saldoAcumuladoBruto;
        let saldoBase = 0;
        if (anoRef > BASE_ANO || (anoRef === BASE_ANO && mesRef > BASE_MES)) {
            saldoBase = await (0, handlers_1.calcularSaldoUsuarioAteMes)(ctx.userIdStr, BASE_MES, BASE_ANO);
            saldoAcumulado = Number((saldoAcumuladoBruto - saldoBase).toFixed(2));
        }
        const totaisComAcumulado = Object.assign(Object.assign({}, totais), { saldo_acumulado: saldoAcumulado, saldo_acumulado_bruto: saldoAcumuladoBruto, saldo_quitado_ate_base: saldoBase, base_mes: BASE_MES, base_ano: BASE_ANO });
        const itensJson = itens.map((item) => {
            const raw = item.data;
            let iso = null;
            try {
                if (raw instanceof Date) {
                    iso = raw.toISOString();
                }
                else if (raw && typeof raw.toDate === "function") {
                    const d = raw.toDate();
                    iso = d.toISOString();
                }
            }
            catch (_a) {
                iso = null;
            }
            return {
                data: iso,
                descricao: item.descricao || "",
                valor: Number(item.valor || 0),
                tipo: item.tipo || "",
                meta: item.meta || {},
            };
        });
        res.status(200).json({
            ok: true,
            autorizado: true,
            isAdmin: ctx.isAdmin,
            user_id: ctx.userIdStr,
            user_name: (_c = (_b = (_a = ctx.userRecord) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : ctx.webAppUser.first_name) !== null && _c !== void 0 ? _c : "",
            username: (_f = (_e = (_d = ctx.userRecord) === null || _d === void 0 ? void 0 : _d.username) !== null && _e !== void 0 ? _e : ctx.webAppUser.username) !== null && _f !== void 0 ? _f : null,
            mes_ref: mesRef,
            ano_ref: anoRef,
            saldo_atual: saldoAcumulado,
            saldo_atual_bruto: saldoAcumuladoBruto,
            extrato_atual: {
                totais: totaisComAcumulado,
                itens: itensJson,
            },
        });
    }
    catch (err) {
        console.error("Erro em userGetOverview", err);
        res
            .status(500)
            .json({ error: "Erro ao carregar resumo do usuário" });
    }
});

exports.userRequestAccess = functions.https.onRequest(async (req, res) => {
    var _a;
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
    if (ctx.autorizado) {
        res.status(200).json({
            ok: true,
            user_id: ctx.userIdStr,
            status: "approved",
            message: "Seu acesso já está liberado.",
        });
        return;
    }
    try {
        const agora = new Date();
        const docRef = firebase_1.db.collection("solicitacoes_acesso").doc(ctx.userIdStr);
        const snap = await docRef.get();
        const existing = snap.exists ? (snap.data() || {}) : null;
        const existingStatus = existing
            ? String((_a = existing.status) !== null && _a !== void 0 ? _a : "").toLowerCase()
            : "";
        if (existingStatus === "approved") {
            res.status(200).json({
                ok: true,
                user_id: ctx.userIdStr,
                status: "approved",
                message: "Seu acesso já está liberado.",
            });
            return;
        }
        await docRef.set({
            user_id: ctx.userIdStr,
            status: "pending",
            solicitado_em: existing && existing.solicitado_em ? existing.solicitado_em : agora,
            atualizado_em: agora,
        }, { merge: true });
        await writeAuditLog({
            actor_user_id: ctx.userIdStr,
            action: "user_request_access",
            entity: "solicitacao_acesso",
            entity_id: ctx.userIdStr,
            target_user_id: ctx.userIdStr,
            before: existing ? { status: existing.status || null } : null,
            after: { status: "pending" },
        });
        res.status(200).json({
            ok: true,
            user_id: ctx.userIdStr,
            status: "pending",
            message: "Seu pedido de liberação foi enviado. Assim que for aprovado, volte a abrir o mini app.",
        });
    }
    catch (err) {
        console.error("Erro em userRequestAccess", err);
        res.status(500).json({ error: "Erro ao solicitar liberação de acesso" });
    }
});

exports.userListGastos = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Peça para um administrador liberar seu usuário pelo mini app.",
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
        const snap = await firebase_1.db
            .collection("gastos")
            .where("user_id", "==", ctx.userIdStr)
            .where("ativo", "==", true)
            .get();
        const itens = [];
        snap.forEach((doc) => {
            const data = doc.data() || {};
            const dataCompraRaw = data.data_compra;
            let dataCompraIso = null;
            const dataCompraAny = dataCompraRaw;
            if (dataCompraAny && typeof dataCompraAny.toDate === "function") {
                dataCompraIso = dataCompraAny.toDate().toISOString();
            }
            itens.push({
                id: data.id || doc.id,
                descricao: data.descricao || "",
                valor_total: Number(data.valor_total || data.valor_parcela || 0),
                parcelas_total: Number(data.parcelas_total || 1),
                valor_parcela: Number(data.valor_parcela || data.valor_total || 0),
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
    }
    catch (err) {
        console.error("Erro em userListGastos", err);
        res.status(500).json({ error: "Erro ao listar gastos" });
    }
});
exports.userListPagamentos = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
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
        const snap = await firebase_1.db
            .collection("pagamentos")
            .where("user_id", "==", ctx.userIdStr)
            .get();
        const itens = [];
        snap.forEach((doc) => {
            const data = doc.data() || {};
            if (data.cancelado) {
                return;
            }
            const dataPagRaw = data.data_pagamento;
            let dataPagIso = null;
            const dataPagAny = dataPagRaw;
            if (dataPagAny && typeof dataPagAny.toDate === "function") {
                dataPagIso = dataPagAny.toDate().toISOString();
            }
            itens.push({
                id: data.id || doc.id,
                descricao: data.descricao || "Pagamento",
                valor: Number(data.valor || 0),
                data_pagamento: dataPagIso,
                cancelado: !!data.cancelado,
            });
        });
        itens.sort((a, b) => {
            const ta = a.data_pagamento ? Date.parse(a.data_pagamento) : 0;
            const tb = b.data_pagamento ? Date.parse(b.data_pagamento) : 0;
            return tb - ta;
        });
        const limited = itens.slice(0, limit);
        res.status(200).json({
            ok: true,
            user_id: ctx.userIdStr,
            total: itens.length,
            itens: limited,
        });
    }
    catch (err) {
        console.error("Erro em userListPagamentos", err);
        res.status(500).json({ error: "Erro ao listar pagamentos" });
    }
});
exports.userListBillingCycles = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
        });
        return;
    }
    try {
        const userId = ctx.userIdStr;
        const [gastosSnap, pagamentosSnap] = await Promise.all([
            firebase_1.db
                .collection("gastos")
                .where("user_id", "==", userId)
                .where("ativo", "==", true)
                .get(),
            firebase_1.db.collection("pagamentos").where("user_id", "==", userId).get(),
        ]);
        const cyclesSet = new Set();
        gastosSnap.forEach((doc) => {
            var _a;
            const data = doc.data() || {};
            const dataCompraRaw = data.data_compra;
            let dataCompra = null;
            const anyCompra = dataCompraRaw;
            if (anyCompra && typeof anyCompra.toDate === "function") {
                dataCompra = anyCompra.toDate();
            }
            else if (dataCompraRaw instanceof Date) {
                dataCompra = dataCompraRaw;
            }
            if (!dataCompra) {
                return;
            }
            const day = dataCompra.getDate();
            let month = dataCompra.getMonth() + 1;
            let year = dataCompra.getFullYear();
            if (day > 9) {
                month += 1;
                if (month > 12) {
                    month = 1;
                    year += 1;
                }
            }
            let totalParcelas = Number((_a = data.parcelas_total) !== null && _a !== void 0 ? _a : 1);
            if (!Number.isFinite(totalParcelas) || totalParcelas < 1) {
                totalParcelas = 1;
            }
            for (let i = 0; i < totalParcelas; i += 1) {
                const mIndex = month + i;
                const y = year + Math.floor((mIndex - 1) / 12);
                const m = ((mIndex - 1) % 12) + 1;
                const ciclo = `${String(m).padStart(2, "0")}/${y}`;
                cyclesSet.add(ciclo);
            }
        });
        pagamentosSnap.forEach((doc) => {
            const data = doc.data() || {};
            if (data.cancelado) {
                return;
            }
            const dataPagRaw = data.data_pagamento;
            let dataPag = null;
            const anyPag = dataPagRaw;
            if (anyPag && typeof anyPag.toDate === "function") {
                dataPag = anyPag.toDate();
            }
            else if (dataPagRaw instanceof Date) {
                dataPag = dataPagRaw;
            }
            if (!dataPag) {
                return;
            }
            const day = dataPag.getDate();
            let month = dataPag.getMonth() + 1;
            let year = dataPag.getFullYear();
            if (day >= 10) {
                month += 1;
                if (month > 12) {
                    month = 1;
                    year += 1;
                }
            }
            const ciclo = `${String(month).padStart(2, "0")}/${year}`;
            cyclesSet.add(ciclo);
        });
        let allCycles = Array.from(cyclesSet);
        allCycles = allCycles.filter((cycle) => {
            const [mStr, yStr] = cycle.split("/");
            const m = Number(mStr);
            const y = Number(yStr);
            return Number.isFinite(m) && Number.isFinite(y) && m >= 1 && m <= 12;
        });
        allCycles.sort((a, b) => {
            const [maStr, yaStr] = a.split("/");
            const [mbStr, ybStr] = b.split("/");
            const ma = Number(maStr);
            const ya = Number(yaStr);
            const mb = Number(mbStr);
            const yb = Number(ybStr);
            const ia = ya * 12 + ma;
            const ib = yb * 12 + mb;
            return ib - ia;
        });
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const maxIndex = currentYear * 12 + currentMonth + 1;
        const limitedCycles = allCycles.filter((cycle) => {
            const [mStr, yStr] = cycle.split("/");
            const m = Number(mStr);
            const y = Number(yStr);
            if (!Number.isFinite(m) || !Number.isFinite(y)) {
                return false;
            }
            const idx = y * 12 + m;
            return idx <= maxIndex;
        });
        const cycles = limitedCycles.length > 0 ? limitedCycles : allCycles;
        if (cycles.length === 0) {
            const now = new Date();
            const day = now.getDate();
            let month = now.getMonth() + 1;
            let year = now.getFullYear();
            if (day >= 10) {
                month += 1;
                if (month > 12) {
                    month = 1;
                    year += 1;
                }
            }
            const currentCycle = `${String(month).padStart(2, "0")}/${year}`;
            let prevMonth = month - 1;
            let prevYear = year;
            if (prevMonth < 1) {
                prevMonth = 12;
                prevYear -= 1;
            }
            const prevCycle = `${String(prevMonth).padStart(2, "0")}/${prevYear}`;
            res.status(200).json({
                ok: true,
                user_id: ctx.userIdStr,
                cycles: [currentCycle, prevCycle],
            });
            return;
        }
        res.status(200).json({
            ok: true,
            user_id: ctx.userIdStr,
            cycles,
        });
    }
    catch (err) {
        console.error("Erro em userListBillingCycles", err);
        res.status(500).json({ error: "Erro ao listar ciclos" });
    }
});
exports.userRegistrarGasto = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
        });
        return;
    }
    const body = req.body || {};
    const descricaoRaw = body.descricao;
    const valorRaw = body.valor;
    const parcelasRaw = body.parcelas;
    const categoriaRaw = body.categoria;
    const descricao = typeof descricaoRaw === "string" ? descricaoRaw.trim() : "";
    const categoria = typeof categoriaRaw === "string" ? categoriaRaw.trim() : "";
    let valor = Number.NaN;
    if (typeof valorRaw === "number") {
        valor = valorRaw;
    }
    else if (typeof valorRaw === "string") {
        valor = Number(valorRaw.replace(",", "."));
    }
    let parcelas = 1;
    if (typeof parcelasRaw !== "undefined" &&
        parcelasRaw !== null &&
        parcelasRaw !== "") {
        if (typeof parcelasRaw === "number") {
            parcelas = parcelasRaw;
        }
        else {
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
        const gastoId = `${ctx.userIdStr}_${Math.floor(Date.now() / 1000)}`;
        const valorTotal = Number(valor);
        const valorParcela = valorTotal / parcelas;
        await firebase_1.db
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
    }
    catch (err) {
        console.error("Erro em userRegistrarGasto", err);
        res.status(500).json({ error: "Erro ao registrar gasto" });
    }
});
exports.userRegistrarPagamento = functions.https.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado. Use o código de acesso no bot para liberar seu usuário.",
        });
        return;
    }
    const body = req.body || {};
    const valorRaw = body.valor;
    const descricaoRaw = body.descricao;
    let valor = Number.NaN;
    if (typeof valorRaw === "number") {
        valor = valorRaw;
    }
    else if (typeof valorRaw === "string") {
        valor = Number(valorRaw.replace(",", "."));
    }
    if (!Number.isFinite(valor) || valor <= 0) {
        res.status(400).json({ error: "Valor inválido" });
        return;
    }
    const descricao = typeof descricaoRaw === "string" && descricaoRaw.trim()
        ? descricaoRaw.trim()
        : "Pagamento";
    try {
        const agora = new Date();
        const pagamentoId = `pag_${ctx.userIdStr}_${Math.floor(Date.now() / 1000)}`;
        const valorFinal = Number(valor.toFixed(2));
        await firebase_1.db
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
        const saldoDepois = await (0, handlers_1.calcularSaldoUsuarioAteMes)(ctx.userIdStr, mesRef, anoRef);
        res.status(200).json({
            ok: true,
            user_id: ctx.userIdStr,
            pagamentoId,
            descricao,
            valor: valorFinal,
            saldo_atual: saldoDepois,
        });
    }
    catch (err) {
        console.error("Erro em userRegistrarPagamento", err);
        res.status(500).json({ error: "Erro ao registrar pagamento" });
    }
});
exports.telegramDailyNotifications = functions.pubsub
    .schedule("0 9 * * *")
    .timeZone("America/Sao_Paulo")
    .onRun(async () => {
    const token = getBotToken();
    const WEBAPP_URL = "https://bot-cartao-credito.web.app/?v=2025-12-03-1";
    const now = new Date();
    const dateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
    const dia = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
    }).format(now));
    const mes = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        month: "2-digit",
    }).format(now));
    const ano = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
    }).format(now));
    const shouldSendVencimento = dia === 8 || dia === 9;
    const shouldSendRecorrentes = dia === 10;
    if (!shouldSendVencimento && !shouldSendRecorrentes) {
        return null;
    }
    const usersSnap = await firebase_1.db
        .collection("usuarios")
        .where("autorizado", "==", true)
        .where("ativo", "==", true)
        .get();
    const docs = usersSnap.docs;
    const chunkSize = 10;
    for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (doc) => {
            const userIdStr = String(doc.id);
            const data = doc.data() || {};
            if (data.notificacoes_ativas === false) {
                return;
            }
            if (String(data.notificacoes_last_daily_key || "") === dateKey) {
                return;
            }
            try {
                let recurringCount = 0;
                if (shouldSendRecorrentes) {
                    const recSnap = await firebase_1.db
                        .collection("gastos_recorrentes")
                        .where("user_id", "==", userIdStr)
                        .where("ativo", "==", true)
                        .get();
                    recurringCount = recSnap.size;
                }
                if (shouldSendRecorrentes && recurringCount <= 0) {
                    // Evitar ruído: só notificar recorrentes no dia 10 se houver pelo menos 1.
                    return;
                }

                const saldo = shouldSendVencimento
                    ? await (0, handlers_1.calcularSaldoUsuarioAteMes)(userIdStr, mes, ano)
                    : await (0, handlers_1.calcularSaldoUsuarioAteMes)(userIdStr, mes, ano);
                const saldoNum = Number(saldo || 0);
                const saldoIsValidPositive = Number.isFinite(saldoNum) && saldoNum > 0;

                if (shouldSendVencimento && !saldoIsValidPositive) {
                    // Se não há saldo positivo, não precisa de lembrete de vencimento.
                    return;
                }

                const title = shouldSendVencimento
                    ? dia === 9
                        ? "📌 Lembrete: vencimento hoje"
                        : "📌 Lembrete: vencimento amanhã"
                    : "📌 Lembrete de recorrentes";

                const vencText = shouldSendVencimento
                    ? dia === 9
                        ? "Hoje é dia 9 (vencimento do ciclo)."
                        : "Amanhã é dia 9 (vencimento do ciclo)."
                    : "";

                const saldoText = saldoIsValidPositive
                    ? `\n\nSaldo atual: <b>${saldoNum.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                    })}</b>`
                    : "";

                const recurringText = shouldSendRecorrentes
                    ? `\n\nVocê tem ${recurringCount} gasto(s) recorrente(s) cadastrado(s). Se quiser, aplique as recorrências no MiniApp.`
                    : "";

                const texto = `${title}${vencText ? `\n\n${vencText}` : ""}${saldoText}${recurringText}`;
                await (0, api_1.sendMessage)(token, Number(userIdStr), texto, {
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [[{ text: "📱 Abrir MiniApp", web_app: { url: WEBAPP_URL } }]],
                    },
                });
                await firebase_1.db
                    .collection("usuarios")
                    .doc(userIdStr)
                    .set({ notificacoes_last_daily_key: dateKey, notificacoes_last_daily_sent_at: now }, { merge: true });
            }
            catch (err) {
                console.error("Erro ao enviar notificação diária", userIdStr, err);
            }
        }));
    }
    return null;
});
//# sourceMappingURL=index.js.map