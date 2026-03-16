// NOSONAR
/* eslint-disable */
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
exports.adminMeta = exports.userRegistrarPagamento = exports.userRegistrarGasto = exports.userGetInvoiceStatus = exports.userListBillingCycles = exports.userListPagamentos = exports.userListGastos = exports.userRequestInvoicePdf = exports.userBootstrap = exports.userGetOverview = exports.adminDelPagamento = exports.adminEditPagamento = exports.adminDelGasto = exports.adminEditGasto = exports.adminGenerateInvoicePdf = exports.adminMarkInvoiceUploaded = exports.adminCreateInvoiceUploadUrl = exports.adminListInvoiceRequests = exports.adminSendMessage = exports.adminResumoFatura = exports.adminListPagamentos = exports.adminListGastos = exports.adminGetUserBundle = exports.telegramWebhook = exports.adminUpdateUsuario = exports.adminGetUsuario = exports.adminSearchUsuarios = exports.adminListUsuarios = exports.userApplyRecurringGastos = exports.userDeleteRecurringGasto = exports.userUpsertRecurringGasto = exports.userCancelPagamento = exports.userEditPagamento = exports.userCancelGasto = exports.userEditGasto = exports.userListRecurringGastos = void 0;
const functions = __importStar(require("firebase-functions"));
const router_1 = require("./telegram/router");
const firebase_1 = require("./firebase");
const admin_1 = require("./admin");
const webappAuth_1 = require("./telegram/webappAuth");
const handlers_1 = require("./telegram/handlers");
const api_1 = require("./telegram/api");
const firebaseAdmin = __importStar(require("firebase-admin"));
const fs_1 = require("fs");
const path_1 = require("path");
const PDFDocument = require("pdfkit");

try {
    if (!firebaseAdmin.apps || firebaseAdmin.apps.length === 0) {
        firebaseAdmin.initializeApp();
    }
}
catch (_a) {
    // ignore
}
const httpsWithSecrets = functions.runWith({ secrets: ["TELEGRAM_BOT_TOKEN"] }).https;

let cachedBotInfo = null;
let cachedBotInfoAtMs = 0;
async function getBotInfoSafe(token) {
    const now = Date.now();
    if (cachedBotInfo && now - cachedBotInfoAtMs < 60 * 60 * 1000) {
        return cachedBotInfo;
    }
    try {
        const me = await (0, api_1.callTelegram)(token, "getMe", {});
        cachedBotInfo = {
            id: me && me.id ? Number(me.id) : null,
            username: me && me.username ? String(me.username) : null,
        };
        cachedBotInfoAtMs = now;
        return cachedBotInfo;
    }
    catch (_a) {
        return null;
    }
}

function readChangelogSafe() {
    try {
        const changelogPath = (0, path_1.resolve)(__dirname, "../changelog.json");
        const raw = (0, fs_1.readFileSync)(changelogPath, "utf8");
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.items) ? parsed.items : [];
        return items.slice(0, 20);
    }
    catch (_a) {
        return [];
    }
}
function getBotToken() {
    const tokenRaw = process.env.TELEGRAM_BOT_TOKEN;
    if (!tokenRaw) {
        throw new Error("TELEGRAM_BOT_TOKEN não configurado.");
    }
    // Remove whitespace acidental (newline no Secret Manager, copy/paste, etc)
    const token = String(tokenRaw).trim().replace(/\s+/g, "");
    if (!token) {
        throw new Error("TELEGRAM_BOT_TOKEN está vazio após trim.");
    }
    return token;
}

async function sendTelegramTextMessage(token, chatId, text) {
    const chatIdStr = String(chatId || "").trim();
    if (!chatIdStr) {
        throw new Error("chatId inválido");
    }
    const msg = String(text || "").trim();
    if (!msg) {
        throw new Error("Mensagem vazia");
    }
    const safeText = msg.length > 3500 ? msg.slice(0, 3500) + "…" : msg;
    const payload = {
        chat_id: chatIdStr,
        text: safeText,
    };
    return await (0, api_1.callTelegram)(token, "sendMessage", payload);
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
exports.userListRecurringGastos = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userEditGasto = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userCancelGasto = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userEditPagamento = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userCancelPagamento = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userUpsertRecurringGasto = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userDeleteRecurringGasto = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userApplyRecurringGastos = httpsWithSecrets.onRequest(async (req, res) => {
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
        // Não logar token nem trechos do initData (sensível). Mantém apenas metadados mínimos.
        console.log("Validando initData (admin) - length:", initData.length);
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
    const actorUserIdStr = String(webAppUser.id);
    const isAdmin = admin_1.ADMIN_USER_IDS.includes(actorUserIdStr);
    const body = req.body || {};
    const targetFromBody = typeof body.targetUserId === "string" ? body.targetUserId : "";
    const targetFromBodyLegacy = typeof body.userId === "string" ? body.userId : "";
    const query = req.query || {};
    const targetFromQuery = typeof query.targetUserId === "string" ? query.targetUserId : "";
    const targetFromQueryLegacy = typeof query.userId === "string" ? query.userId : "";
    const targetTerm = (targetFromBody || targetFromBodyLegacy || targetFromQuery || targetFromQueryLegacy || "").trim();
    let userIdStr = actorUserIdStr;
    if (isAdmin && targetTerm) {
        const resolvedTarget = await resolveTargetUserId(targetTerm);
        if (!resolvedTarget) {
            setWebAppCors(res);
            res.status(404).json({ error: "Usuário alvo não encontrado." });
            return null;
        }
        userIdStr = resolvedTarget;
        if (userIdStr !== actorUserIdStr) {
            console.log("getWebAppUserContext: admin impersonation", {
                actor_user_id: actorUserIdStr,
                target_user_id: userIdStr,
            });
        }
    }
    const actorUserRef = firebase_1.db.collection("usuarios").doc(actorUserIdStr);
    try {
        await actorUserRef.set({
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
    const userRef = firebase_1.db.collection("usuarios").doc(userIdStr);
    let data = {};
    try {
        const snap = await userRef.get();
        if (!snap.exists && userIdStr !== actorUserIdStr) {
            setWebAppCors(res);
            res.status(404).json({ error: "Usuário alvo não encontrado." });
            return null;
        }
        data = snap.data() || {};
    }
    catch (err) {
        console.error("Erro ao ler dados do usuário do WebApp:", err);
    }
    let autorizado = data.autorizado === true || isAdmin;
    if (isAdmin && userIdStr !== actorUserIdStr) {
        autorizado = true;
    }
    if (isAdmin && userIdStr === actorUserIdStr && data.autorizado !== true) {
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
        actorUserIdStr,
        impersonating: userIdStr !== actorUserIdStr,
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
exports.adminSearchUsuarios = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.adminListUsuarios = httpsWithSecrets.onRequest(async (req, res) => {
    var _a;
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
    const limitRaw = req.query.limit;
    const cursorRaw = req.query.cursor;
    let limit = 120;
    if (typeof limitRaw === "string") {
        const parsed = Number.parseInt(limitRaw, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            limit = Math.min(parsed, 300);
        }
    }
    const cursor = typeof cursorRaw === "string" && cursorRaw.trim()
        ? cursorRaw.trim()
        : null;
    try {
        let query = firebase_1.db
            .collection("usuarios")
            .orderBy(firebaseAdmin.firestore.FieldPath.documentId())
            .limit(limit);
        if (cursor) {
            query = query.startAfter(cursor);
        }
        const snap = await query.get();
        const items = [];
        snap.forEach((doc) => {
            var _a;
            const data = doc.data() || {};
            items.push({
                id: doc.id,
                name: String(data.name || ""),
                username: (_a = data.username) !== null && _a !== void 0 ? _a : null,
                ativo: data.ativo !== false,
                autorizado: data.autorizado === true,
                last_seen: data.last_seen || null,
            });
        });
        const last = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
        const nextCursor = snap.size >= limit ? (_a = last === null || last === void 0 ? void 0 : last.id) !== null && _a !== void 0 ? _a : null : null;
        res.status(200).json({
            items,
            nextCursor,
            count: items.length,
        });
    }
    catch (err) {
        console.error("Erro em adminListUsuarios", err);
        res.status(500).send("Erro ao listar usuários");
    }
});
exports.adminGetUsuario = httpsWithSecrets.onRequest(async (req, res) => {
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
                invoice_pdf_enabled: data.invoice_pdf_enabled === true,
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

exports.adminGetUserBundle = httpsWithSecrets.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
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
        const userDocRef = firebase_1.db.collection("usuarios").doc(targetUserId);
        const solicitRef = firebase_1.db.collection("solicitacoes_acesso").doc(targetUserId);
        const gastosQuery = firebase_1.db
            .collection("gastos")
            .where("user_id", "==", targetUserId)
            .where("ativo", "==", true)
            .orderBy("data_compra", "desc")
            .limit(limit);
        const pagamentosFetchLimit = Math.min(3000, Math.max(limit * 3, limit));
        const pagamentosQuery = firebase_1.db
            .collection("pagamentos")
            .where("user_id", "==", targetUserId)
            .orderBy("data_pagamento", "desc")
            .limit(pagamentosFetchLimit);
        const [userSnap, solicitSnap, gastosSnap, pagamentosSnap] = await Promise.all([
            userDocRef.get(),
            solicitRef.get(),
            gastosQuery.get(),
            pagamentosQuery.get(),
        ]);
        if (!userSnap.exists) {
            res.status(404).send("Usuário não encontrado");
            return;
        }
        const userData = userSnap.data() || {};
        let solicitacaoAcesso = null;
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
        const gastos = [];
        gastosSnap.forEach((doc) => {
            const data = doc.data() || {};
            const dataCompraRaw = data.data_compra;
            let dataCompraIso = null;
            const dataCompraAny = dataCompraRaw;
            if (dataCompraAny && typeof dataCompraAny.toDate === "function") {
                dataCompraIso = dataCompraAny.toDate().toISOString();
            }
            else if (dataCompraRaw instanceof Date) {
                dataCompraIso = dataCompraRaw.toISOString();
            }
            gastos.push({
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
        const pagamentosAll = [];
        pagamentosSnap.forEach((doc) => {
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
            else if (dataPagRaw instanceof Date) {
                dataPagIso = dataPagRaw.toISOString();
            }
            pagamentosAll.push({
                id: data.id || doc.id,
                descricao: data.descricao || "Pagamento",
                valor: Number(data.valor || 0),
                data_pagamento: dataPagIso,
                cancelado: !!data.cancelado,
            });
        });
        const pagamentos = pagamentosAll.slice(0, limit);
        res.status(200).json({
            ok: true,
            admin_user_id: String(adminUser.id),
            user_id: targetUserId,
            usuario: {
                admin_user_id: adminUser.id,
                user_id: targetUserId,
                dados: {
                    id: targetUserId,
                    name: String(userData.name || ""),
                    username: (_f = userData.username) !== null && _f !== void 0 ? _f : null,
                    ativo: userData.ativo !== false,
                    autorizado: !!userData.autorizado,
                    invoice_pdf_enabled: userData.invoice_pdf_enabled === true,
                    criado_em: userData.criado_em || null,
                    atualizado_em: userData.atualizado_em || null,
                    solicitacao_acesso: solicitacaoAcesso,
                },
            },
            gastos: {
                total: gastos.length,
                itens: gastos,
            },
            pagamentos: {
                total: pagamentosAll.length,
                itens: pagamentos,
            },
        });
    }
    catch (err) {
        console.error("Erro em adminGetUserBundle", err);
        res.status(500).send("Erro ao carregar dados do usuário");
    }
});

exports.adminSendMessage = httpsWithSecrets.onRequest(async (req, res) => {
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
    const messageRaw = body.message;
    const message = typeof messageRaw === "string" ? messageRaw.trim() : "";
    if (!userTerm) {
        res.status(400).json({ error: "userId obrigatório" });
        return;
    }
    if (!message) {
        res.status(400).json({ error: "Mensagem obrigatória" });
        return;
    }
    const targetUserId = await resolveTargetUserId(userTerm);
    if (!targetUserId) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
    }
    try {
        const token = getBotToken();
        const result = await sendTelegramTextMessage(token, targetUserId, message);
        await writeAuditLog({
            actor_user_id: String(adminUser.id),
            action: "admin_send_message",
            entity: "telegram_message",
            entity_id: result && result.message_id ? String(result.message_id) : null,
            target_user_id: String(targetUserId),
            before: null,
            after: {
                message_preview: message.slice(0, 80),
            },
        });
        res.status(200).json({
            ok: true,
            admin_user_id: String(adminUser.id),
            user_id: String(targetUserId),
            telegram_message_id: result && result.message_id ? result.message_id : null,
        });
    }
    catch (err) {
        console.error("Erro em adminSendMessage", err);
        res.status(500).json({ error: "Erro ao enviar mensagem" });
    }
});
exports.adminUpdateUsuario = httpsWithSecrets.onRequest(async (req, res) => {
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
    const invoiceParsed = parseBool(body.invoice_pdf_enabled);
    if (invoiceParsed !== null) {
        updates.invoice_pdf_enabled = invoiceParsed;
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

exports.adminListAccessRequests = httpsWithSecrets.onRequest(async (req, res) => {
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
        // Ordenação em memória (evita índice composto no Firestore).
        // Se solicitado_em não existir, mantém no fim.
        items.sort((a, b) => {
            const ad = a.solicitado_em && typeof a.solicitado_em.toDate === "function"
                ? a.solicitado_em.toDate().getTime()
                : a.solicitado_em instanceof Date
                    ? a.solicitado_em.getTime()
                    : typeof a.solicitado_em === "string"
                        ? new Date(a.solicitado_em).getTime()
                        : NaN;
            const bd = b.solicitado_em && typeof b.solicitado_em.toDate === "function"
                ? b.solicitado_em.toDate().getTime()
                : b.solicitado_em instanceof Date
                    ? b.solicitado_em.getTime()
                    : typeof b.solicitado_em === "string"
                        ? new Date(b.solicitado_em).getTime()
                        : NaN;
            const aNum = Number.isFinite(ad) ? ad : Number.POSITIVE_INFINITY;
            const bNum = Number.isFinite(bd) ? bd : Number.POSITIVE_INFINITY;
            return aNum - bNum;
        });
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

exports.adminMeta = httpsWithSecrets.onRequest(async (req, res) => {
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
    let backendVersion = "unknown";
    try {
        // lib/index.js está em /workspace/lib, então ../package.json aponta para /workspace/package.json (functions/package.json)
        const pkg = require("../package.json");
        if (pkg && typeof pkg.version === "string") {
            backendVersion = pkg.version;
        }
    }
    catch (_a) {
        backendVersion = "unknown";
    }
    let bot = null;
    try {
        const token = getBotToken();
        bot = await getBotInfoSafe(token);
    }
    catch (_b) {
        bot = null;
    }
    const changelogItems = readChangelogSafe();
    res.status(200).json({
        ok: true,
        admin_user_id: String(adminUser.id),
        versions: {
            backend: backendVersion,
        },
        bot,
        changelog: {
            items: changelogItems,
        },
        server_time: new Date().toISOString(),
    });
});

exports.telegramWebhook = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.adminListGastos = httpsWithSecrets.onRequest(async (req, res) => {
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
            .orderBy("data_compra", "desc")
            .limit(limit)
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
            else if (dataCompraRaw instanceof Date) {
                dataCompraIso = dataCompraRaw.toISOString();
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
        res.status(200).json({
            admin_user_id: adminUser.id,
            user_id: targetUserId,
            total: itens.length,
            itens,
        });
    }
    catch (err) {
        console.error("Erro em adminListGastos", err);
        res.status(500).send("Erro ao listar gastos");
    }
});
exports.adminListPagamentos = httpsWithSecrets.onRequest(async (req, res) => {
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
        const fetchLimit = Math.min(3000, Math.max(limit * 3, limit));
        const snap = await firebase_1.db
            .collection("pagamentos")
            .where("user_id", "==", targetUserId)
            .orderBy("data_pagamento", "desc")
            .limit(fetchLimit)
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
            else if (dataPagRaw instanceof Date) {
                dataPagIso = dataPagRaw.toISOString();
            }
            itens.push({
                id: data.id || doc.id,
                descricao: data.descricao || "Pagamento",
                valor: Number(data.valor || 0),
                data_pagamento: dataPagIso,
                cancelado: !!data.cancelado,
            });
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
exports.adminResumoFatura = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.adminEditGasto = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.adminDelGasto = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.adminEditPagamento = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.adminDelPagamento = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userGetOverview = httpsWithSecrets.onRequest(async (req, res) => {
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
            features: {
                invoice_pdf_request: !!(ctx.userRecord && ctx.userRecord.invoice_pdf_enabled === true),
            },
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

exports.userBootstrap = httpsWithSecrets.onRequest(async (req, res) => {
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
            console.error("Erro ao carregar solicitacao_acesso para userBootstrap", err);
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

    const gastosLimitRaw = req.query.gastosLimit;
    let gastosLimit = 100;
    if (typeof gastosLimitRaw === "string") {
        const parsed = Number.parseInt(gastosLimitRaw, 10);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
            gastosLimit = parsed;
        }
    }
    const pagamentosLimitRaw = req.query.pagamentosLimit;
    let pagamentosLimit = 100;
    if (typeof pagamentosLimitRaw === "string") {
        const parsed = Number.parseInt(pagamentosLimitRaw, 10);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
            pagamentosLimit = parsed;
        }
    }

    try {
        const userId = ctx.userIdStr;

        const overviewPromise = (async () => {
            const saldoAcumuladoBruto = await (0, handlers_1.calcularSaldoUsuarioAteMes)(userId, mesRef, anoRef);
            const { itens, totais } = await (0, handlers_1.obterExtratoConsumoUsuario)(userId, mesRef, anoRef);
            const BASE_MES = 10;
            const BASE_ANO = 2025;
            let saldoAcumulado = saldoAcumuladoBruto;
            let saldoBase = 0;
            if (anoRef > BASE_ANO || (anoRef === BASE_ANO && mesRef > BASE_MES)) {
                saldoBase = await (0, handlers_1.calcularSaldoUsuarioAteMes)(userId, BASE_MES, BASE_ANO);
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
            return {
                ok: true,
                autorizado: true,
                isAdmin: ctx.isAdmin,
                user_id: ctx.userIdStr,
                features: {
                    invoice_pdf_request: !!(ctx.userRecord && ctx.userRecord.invoice_pdf_enabled === true),
                },
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
            };
        })();

        const gastosPromise = firebase_1.db
            .collection("gastos")
            .where("user_id", "==", userId)
            .where("ativo", "==", true)
            .orderBy("data_compra", "desc")
            .limit(gastosLimit)
            .get();

        const pagamentosFetchLimit = Math.min(300, Math.max(pagamentosLimit * 3, pagamentosLimit));
        const pagamentosPromise = firebase_1.db
            .collection("pagamentos")
            .where("user_id", "==", userId)
            .orderBy("data_pagamento", "desc")
            .limit(pagamentosFetchLimit)
            .get();

        const cyclesGastosPromise = firebase_1.db
            .collection("gastos")
            .where("user_id", "==", userId)
            .where("ativo", "==", true)
            .select("data_compra", "parcelas_total")
            .get();

        const cyclesPagamentosPromise = firebase_1.db
            .collection("pagamentos")
            .where("user_id", "==", userId)
            .select("data_pagamento", "cancelado")
            .get();

        const [overview, gastosSnap, pagamentosSnap, gastosCyclesSnap, pagamentosCyclesSnap] = await Promise.all([
            overviewPromise,
            gastosPromise,
            pagamentosPromise,
            cyclesGastosPromise,
            cyclesPagamentosPromise,
        ]);

        const gastosItens = [];
        gastosSnap.forEach((doc) => {
            const data = doc.data() || {};
            const dataCompraRaw = data.data_compra;
            let dataCompraIso = null;
            const dataCompraAny = dataCompraRaw;
            if (dataCompraAny && typeof dataCompraAny.toDate === "function") {
                dataCompraIso = dataCompraAny.toDate().toISOString();
            }
            else if (dataCompraRaw instanceof Date) {
                dataCompraIso = dataCompraRaw.toISOString();
            }
            gastosItens.push({
                id: data.id || doc.id,
                descricao: data.descricao || "",
                valor_total: Number(data.valor_total || data.valor_parcela || 0),
                parcelas_total: Number(data.parcelas_total || 1),
                valor_parcela: Number(data.valor_parcela || data.valor_total || 0),
                data_compra: dataCompraIso,
                ativo: data.ativo !== false,
            });
        });

        const pagamentosAll = [];
        pagamentosSnap.forEach((doc) => {
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
            else if (dataPagRaw instanceof Date) {
                dataPagIso = dataPagRaw.toISOString();
            }
            pagamentosAll.push({
                id: data.id || doc.id,
                descricao: data.descricao || "Pagamento",
                valor: Number(data.valor || 0),
                data_pagamento: dataPagIso,
                cancelado: !!data.cancelado,
            });
        });
        const pagamentosItens = pagamentosAll.slice(0, pagamentosLimit);

        const cyclesSet = new Set();
        gastosCyclesSnap.forEach((doc) => {
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
        pagamentosCyclesSnap.forEach((doc) => {
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

        res.status(200).json(Object.assign(Object.assign({}, overview), { bootstrap: {
                gastos: {
                    total: gastosItens.length,
                    itens: gastosItens,
                },
                pagamentos: {
                    total: pagamentosAll.length,
                    itens: pagamentosItens,
                },
                cycles,
            } }));
    }
    catch (err) {
        console.error("Erro em userBootstrap", err);
        res.status(500).json({ error: "Erro ao carregar bootstrap do usuário" });
    }
});

exports.userRequestAccess = httpsWithSecrets.onRequest(async (req, res) => {
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

function makeInvoiceRequestId(userId, cycle) {
    const uid = String(userId || "").trim();
    const c = String(cycle || "").trim().replace("/", "-");
    return `inv_${uid}_${c}`;
}
function formatMoneyBRL(value) {
    const n = Number(value || 0);
    const fixed = Number.isFinite(n) ? n.toFixed(2) : "0.00";
    return `R$ ${fixed.replace(".", ",")}`;
}
function toIsoDate(value) {
    if (!value) {
        return null;
    }
    try {
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (value && typeof value.toDate === "function") {
            return value.toDate().toISOString();
        }
        if (typeof value === "string") {
            const d = new Date(value);
            if (!Number.isNaN(d.getTime())) {
                return d.toISOString();
            }
        }
    }
    catch (_a) {
        return null;
    }
    return null;
}

exports.userRequestInvoicePdf = httpsWithSecrets.onRequest(async (req, res) => {
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
            error: "Seu acesso ainda não foi liberado.",
        });
        return;
    }
    const enabled = !!(ctx.userRecord && ctx.userRecord.invoice_pdf_enabled === true);
    if (!enabled) {
        res.status(403).json({
            ok: false,
            user_id: ctx.userIdStr,
            error: "Seu usuário não está habilitado para solicitar fatura em PDF.",
        });
        return;
    }
    const body = req.body || {};
    const cycleRaw = body.cycle;
    const cycleParsed = parseCycleString(cycleRaw);
    if (!cycleParsed) {
        res.status(400).json({ error: "cycle obrigatório (formato MM/AAAA)" });
        return;
    }
    const { mes, ano, cycle } = cycleParsed;
    const requestId = makeInvoiceRequestId(ctx.userIdStr, cycle);
    try {
        const now = new Date();
        const docRef = firebase_1.db.collection("invoice_requests").doc(requestId);
        const snap = await docRef.get();
        const existing = snap.exists ? (snap.data() || {}) : null;
        const existingStatus = existing ? String(existing.status || "").toLowerCase() : "";
        if (existingStatus && existingStatus !== "rejected") {
            res.status(200).json({
                ok: true,
                user_id: ctx.userIdStr,
                request_id: requestId,
                cycle,
                status: existingStatus,
                message: "Solicitação já registrada. Aguarde.",
            });
            return;
        }
        await docRef.set({
            id: requestId,
            user_id: ctx.userIdStr,
            cycle,
            mes,
            ano,
            status: "pending",
            requested_at: now,
            updated_at: now,
            user_name: (ctx.userRecord && ctx.userRecord.name) ? String(ctx.userRecord.name) : String(ctx.webAppUser.first_name || ""),
            username: (ctx.userRecord && ctx.userRecord.username) ? String(ctx.userRecord.username) : (ctx.webAppUser.username ? String(ctx.webAppUser.username) : null),
        }, { merge: true });

        await writeAuditLog({
            actor_user_id: ctx.userIdStr,
            action: "user_request_invoice_pdf",
            entity: "invoice_request",
            entity_id: requestId,
            target_user_id: ctx.userIdStr,
            before: existing ? { status: existing.status || null } : null,
            after: { status: "pending", cycle },
        });

        // Push profissional no celular do admin: mensagem do bot no Telegram (gera notificação nativa).
        try {
            const token = getBotToken();
            const name = (ctx.userRecord && ctx.userRecord.name) ? String(ctx.userRecord.name) : String(ctx.webAppUser.first_name || "Usuário");
            const uname = (ctx.userRecord && ctx.userRecord.username) ? `@${String(ctx.userRecord.username)}` : (ctx.webAppUser.username ? `@${String(ctx.webAppUser.username)}` : "");
            const text = `Solicitação de fatura PDF\nUsuário: ${name} ${uname}\nID: ${ctx.userIdStr}\nCiclo: ${cycle}`;
            const admins = Array.isArray(admin_1.ADMIN_USER_IDS) ? admin_1.ADMIN_USER_IDS : [];
            for (const adminId of admins) {
                try {
                    await sendTelegramTextMessage(token, String(adminId), text);
                }
                catch (err) {
                    console.error("Falha ao notificar admin sobre invoice", err);
                }
            }
        }
        catch (err) {
            console.error("Falha ao preparar notificação Telegram para invoice", err);
        }

        res.status(200).json({
            ok: true,
            user_id: ctx.userIdStr,
            request_id: requestId,
            cycle,
            status: "pending",
            message: "Aguarde, sua fatura está sendo gerada e em breve estará disponível para download.",
        });
    }
    catch (err) {
        console.error("Erro em userRequestInvoicePdf", err);
        res.status(500).json({ error: "Erro ao solicitar fatura" });
    }
});

exports.userGetInvoiceStatus = httpsWithSecrets.onRequest(async (req, res) => {
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
        res.status(403).json({ autorizado: false, user_id: ctx.userIdStr, error: "Acesso não liberado." });
        return;
    }
    const cycleRaw = req.query.cycle;
    const cycleParsed = parseCycleString(cycleRaw);
    if (!cycleParsed) {
        res.status(400).json({ error: "cycle obrigatório (formato MM/AAAA)" });
        return;
    }
    const { cycle } = cycleParsed;
    const requestId = makeInvoiceRequestId(ctx.userIdStr, cycle);
    try {
        const docRef = firebase_1.db.collection("invoice_requests").doc(requestId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(200).json({ ok: true, user_id: ctx.userIdStr, cycle, status: "none" });
            return;
        }
        const data = snap.data() || {};
        const status = String(data.status || "pending").toLowerCase();
        const storagePath = data.storage_path ? String(data.storage_path) : null;
        let downloadUrl = null;
        if (status === "ready" && storagePath) {
            try {
                const bucket = firebaseAdmin.storage().bucket();
                const file = bucket.file(storagePath);
                const expires = Date.now() + 60 * 60 * 1000;
                const urls = await file.getSignedUrl({ action: "read", expires });
                downloadUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
            }
            catch (err) {
                console.error("Erro ao gerar signed url de invoice", err);
                downloadUrl = null;
            }
        }
        res.status(200).json({
            ok: true,
            user_id: ctx.userIdStr,
            cycle,
            status,
            request: {
                id: data.id || requestId,
                cycle: data.cycle || cycle,
                status,
                updated_at: data.updated_at || null,
                fulfill_mode: data.fulfill_mode || null,
            },
            download_url: downloadUrl,
        });
    }
    catch (err) {
        console.error("Erro em userGetInvoiceStatus", err);
        res.status(500).json({ error: "Erro ao carregar status da fatura" });
    }
});

exports.adminListInvoiceRequests = httpsWithSecrets.onRequest(async (req, res) => {
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
    const status = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "pending";
    let limit = 50;
    const limitRaw = req.query.limit;
    if (typeof limitRaw === "string") {
        const parsed = Number.parseInt(limitRaw, 10);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 200) {
            limit = parsed;
        }
    }
    try {
        let query = firebase_1.db.collection("invoice_requests").limit(Math.min(200, limit * 3));
        if (status && status !== "all") {
            query = query.where("status", "==", status);
        }
        const snap = await query.get();
        const items = [];
        snap.forEach((doc) => {
            const data = doc.data() || {};
            const updatedIso = toIsoDate(data.updated_at);
            const requestedIso = toIsoDate(data.requested_at);
            items.push({
                id: data.id || doc.id,
                user_id: data.user_id || null,
                user_name: data.user_name || "",
                username: data.username || null,
                cycle: data.cycle || null,
                status: data.status || "pending",
                requested_at: requestedIso,
                updated_at: updatedIso,
                fulfill_mode: data.fulfill_mode || null,
                storage_path: data.storage_path || null,
                file_name: data.file_name || null,
            });
        });
        items.sort((a, b) => {
            const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return tb - ta;
        });
        res.status(200).json({ ok: true, admin_user_id: String(adminUser.id), items: items.slice(0, limit) });
    }
    catch (err) {
        console.error("Erro em adminListInvoiceRequests", err);
        res.status(500).json({ error: "Erro ao listar solicitações de fatura" });
    }
});

exports.adminCreateInvoiceUploadUrl = httpsWithSecrets.onRequest(async (req, res) => {
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
    const cycleParsed = parseCycleString(body.cycle);
    if (!userTerm) {
        res.status(400).json({ error: "userId obrigatório" });
        return;
    }
    if (!cycleParsed) {
        res.status(400).json({ error: "cycle obrigatório (MM/AAAA)" });
        return;
    }
    const targetUserId = await resolveTargetUserId(userTerm);
    if (!targetUserId) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
    }
    const { cycle, mes, ano } = cycleParsed;
    const requestId = makeInvoiceRequestId(targetUserId, cycle);
    try {
        const now = new Date();
        const bucket = firebaseAdmin.storage().bucket();
        const storagePath = `invoices/${targetUserId}/${String(ano)}-${String(mes).padStart(2, "0")}/upload_${Date.now()}.pdf`;
        const file = bucket.file(storagePath);
        const expires = Date.now() + 15 * 60 * 1000;
        const urls = await file.getSignedUrl({
            action: "write",
            expires,
            contentType: "application/pdf",
        });
        const uploadUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : null;
        if (!uploadUrl) {
            res.status(500).json({ error: "Falha ao gerar URL de upload" });
            return;
        }
        await firebase_1.db.collection("invoice_requests").doc(requestId).set({
            id: requestId,
            user_id: targetUserId,
            cycle,
            mes,
            ano,
            status: "uploading",
            updated_at: now,
            fulfill_mode: "uploaded",
            fulfilled_by: String(adminUser.id),
            storage_path: storagePath,
            file_name: `fatura_${cycle.replace("/", "-")}.pdf`,
        }, { merge: true });
        await writeAuditLog({
            actor_user_id: String(adminUser.id),
            action: "admin_create_invoice_upload_url",
            entity: "invoice_request",
            entity_id: requestId,
            target_user_id: String(targetUserId),
            before: null,
            after: { status: "uploading", cycle, storage_path: storagePath },
        });
        res.status(200).json({
            ok: true,
            admin_user_id: String(adminUser.id),
            user_id: String(targetUserId),
            request_id: requestId,
            cycle,
            upload_url: uploadUrl,
            storage_path: storagePath,
            expires_at_ms: expires,
        });
    }
    catch (err) {
        console.error("Erro em adminCreateInvoiceUploadUrl", err);
        res.status(500).json({ error: "Erro ao preparar upload" });
    }
});

exports.adminMarkInvoiceUploaded = httpsWithSecrets.onRequest(async (req, res) => {
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
    const requestIdRaw = body.requestId;
    const requestId = typeof requestIdRaw === "string" ? requestIdRaw.trim() : "";
    if (!requestId) {
        res.status(400).json({ error: "requestId obrigatório" });
        return;
    }
    try {
        const docRef = firebase_1.db.collection("invoice_requests").doc(requestId);
        const snap = await docRef.get();
        if (!snap.exists) {
            res.status(404).json({ error: "Solicitação não encontrada" });
            return;
        }
        const data = snap.data() || {};
        const storagePath = data.storage_path ? String(data.storage_path) : "";
        if (!storagePath) {
            res.status(400).json({ error: "storage_path não encontrado para esta solicitação" });
            return;
        }
        try {
            const bucket = firebaseAdmin.storage().bucket();
            const file = bucket.file(storagePath);
            const existsArr = await file.exists();
            const exists = Array.isArray(existsArr) && existsArr.length > 0 ? !!existsArr[0] : false;
            if (!exists) {
                res.status(400).json({ error: "Arquivo ainda não foi encontrado no Storage. Refaça o upload." });
                return;
            }
        }
        catch (err) {
            console.error("Erro ao verificar arquivo no Storage", err);
        }
        const now = new Date();
        await docRef.set({
            status: "ready",
            updated_at: now,
            fulfilled_at: now,
            fulfilled_by: String(adminUser.id),
            fulfill_mode: data.fulfill_mode || "uploaded",
        }, { merge: true });
        await writeAuditLog({
            actor_user_id: String(adminUser.id),
            action: "admin_mark_invoice_uploaded",
            entity: "invoice_request",
            entity_id: requestId,
            target_user_id: String(data.user_id || ""),
            before: { status: data.status || null },
            after: { status: "ready" },
        });
        res.status(200).json({ ok: true, request_id: requestId, status: "ready" });
    }
    catch (err) {
        console.error("Erro em adminMarkInvoiceUploaded", err);
        res.status(500).json({ error: "Erro ao finalizar upload" });
    }
});

exports.adminGenerateInvoicePdf = httpsWithSecrets.onRequest(async (req, res) => {
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
    const cycleParsed = parseCycleString(body.cycle);
    if (!userTerm) {
        res.status(400).json({ error: "userId obrigatório" });
        return;
    }
    if (!cycleParsed) {
        res.status(400).json({ error: "cycle obrigatório (MM/AAAA)" });
        return;
    }
    const targetUserId = await resolveTargetUserId(userTerm);
    if (!targetUserId) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
    }
    const { cycle, mes, ano } = cycleParsed;
    const requestId = makeInvoiceRequestId(targetUserId, cycle);
    try {
        const now = new Date();
        await firebase_1.db.collection("invoice_requests").doc(requestId).set({
            id: requestId,
            user_id: targetUserId,
            cycle,
            mes,
            ano,
            status: "generating",
            updated_at: now,
            fulfill_mode: "generated",
            fulfilled_by: String(adminUser.id),
        }, { merge: true });

        const userSnap = await firebase_1.db.collection("usuarios").doc(targetUserId).get();
        const userData = userSnap.exists ? (userSnap.data() || {}) : {};
        const userName = String(userData.name || "");
        const username = userData.username ? String(userData.username) : null;

        const extrato = await (0, handlers_1.obterExtratoConsumoUsuario)(targetUserId, mes, ano);
        const itens = Array.isArray(extrato.itens) ? extrato.itens : [];
        const totais = extrato.totais || {};

        const pdfBuffer = await new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: "A4", margin: 40 });
                const chunks = [];
                doc.on("data", (c) => chunks.push(c));
                doc.on("end", () => resolve(Buffer.concat(chunks)));
                doc.on("error", (e) => reject(e));

                doc.fontSize(18).text(`Fatura (ciclo ${cycle})`, { align: "center" });
                doc.moveDown(0.5);
                doc.fontSize(11).text(`Usuário: ${userName || "-"}${username ? ` (@${username})` : ""}`);
                doc.text(`User ID: ${targetUserId}`);
                doc.text(`Gerado em: ${new Date().toISOString()}`);
                doc.moveDown();

                doc.fontSize(12).text("Lançamentos", { underline: true });
                doc.moveDown(0.5);

                doc.fontSize(10);
                for (const item of itens) {
                    const iso = toIsoDate(item.data);
                    const date = iso ? iso.slice(0, 10) : "-";
                    const desc = String(item.descricao || "").replace(/\s+/g, " ").trim();
                    const tipo = String(item.tipo || "").toUpperCase();
                    const valor = formatMoneyBRL(item.valor || 0);
                    doc.text(`${date}  ${tipo.padEnd(10, " ")}  ${valor}  ${desc}`);
                }
                doc.moveDown();

                doc.fontSize(12).text("Totais", { underline: true });
                doc.moveDown(0.5);
                doc.fontSize(11);
                if (totais) {
                    if (typeof totais.parcelas_mes !== "undefined") {
                        doc.text(`Parcelas no mês: ${formatMoneyBRL(totais.parcelas_mes)}`);
                    }
                    if (typeof totais.pagamentos_mes !== "undefined") {
                        doc.text(`Pagamentos no mês: ${formatMoneyBRL(totais.pagamentos_mes)}`);
                    }
                    if (typeof totais.saldo_mes !== "undefined") {
                        doc.text(`Saldo do mês: ${formatMoneyBRL(totais.saldo_mes)}`);
                    }
                    if (typeof totais.saldo_acumulado !== "undefined") {
                        doc.text(`Saldo acumulado: ${formatMoneyBRL(totais.saldo_acumulado)}`);
                    }
                }
                doc.end();
            }
            catch (e) {
                reject(e);
            }
        });

        const bucket = firebaseAdmin.storage().bucket();
        const storagePath = `invoices/${targetUserId}/${String(ano)}-${String(mes).padStart(2, "0")}/generated_${Date.now()}.pdf`;
        await bucket.file(storagePath).save(pdfBuffer, {
            contentType: "application/pdf",
            resumable: false,
            metadata: {
                cacheControl: "private, max-age=0, no-cache",
            },
        });

        const updatedAt = new Date();
        await firebase_1.db.collection("invoice_requests").doc(requestId).set({
            status: "ready",
            updated_at: updatedAt,
            fulfilled_at: updatedAt,
            fulfill_mode: "generated",
            fulfilled_by: String(adminUser.id),
            storage_path: storagePath,
            file_name: `fatura_${cycle.replace("/", "-")}.pdf`,
        }, { merge: true });

        await writeAuditLog({
            actor_user_id: String(adminUser.id),
            action: "admin_generate_invoice_pdf",
            entity: "invoice_request",
            entity_id: requestId,
            target_user_id: String(targetUserId),
            before: null,
            after: { status: "ready", storage_path: storagePath },
        });

        res.status(200).json({
            ok: true,
            admin_user_id: String(adminUser.id),
            user_id: String(targetUserId),
            request_id: requestId,
            cycle,
            status: "ready",
        });
    }
    catch (err) {
        console.error("Erro em adminGenerateInvoicePdf", err);
        res.status(500).json({ error: "Erro ao gerar fatura PDF" });
    }
});

exports.userListGastos = httpsWithSecrets.onRequest(async (req, res) => {
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
            .orderBy("data_compra", "desc")
            .limit(limit)
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
            else if (dataCompraRaw instanceof Date) {
                dataCompraIso = dataCompraRaw.toISOString();
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
        res.status(200).json({
            ok: true,
            user_id: ctx.userIdStr,
            total: itens.length,
            itens,
        });
    }
    catch (err) {
        console.error("Erro em userListGastos", err);
        res.status(500).json({ error: "Erro ao listar gastos" });
    }
});
exports.userListPagamentos = httpsWithSecrets.onRequest(async (req, res) => {
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
        const fetchLimit = Math.min(300, Math.max(limit * 3, limit));
        const snap = await firebase_1.db
            .collection("pagamentos")
            .where("user_id", "==", ctx.userIdStr)
            .orderBy("data_pagamento", "desc")
            .limit(fetchLimit)
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
            else if (dataPagRaw instanceof Date) {
                dataPagIso = dataPagRaw.toISOString();
            }
            itens.push({
                id: data.id || doc.id,
                descricao: data.descricao || "Pagamento",
                valor: Number(data.valor || 0),
                data_pagamento: dataPagIso,
                cancelado: !!data.cancelado,
            });
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
exports.userListBillingCycles = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userRegistrarGasto = httpsWithSecrets.onRequest(async (req, res) => {
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
exports.userRegistrarPagamento = httpsWithSecrets.onRequest(async (req, res) => {
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
        const cicloPagamento = (0, handlers_1.getFaturaCycleFromDate)(agora);
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
            mes: cicloPagamento.mes,
            ano: cicloPagamento.ano,
            criado_em: agora,
            atualizado_em: agora,
        });
        const mesRef = cicloPagamento.mes;
        const anoRef = cicloPagamento.ano;
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