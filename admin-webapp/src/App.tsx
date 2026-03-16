// NOSONAR
/** biome-ignore-all lint: arquivo legado grande; regras de lint refinadas serão tratadas em refactor dedicado */
/* eslint-disable */
import React, { useEffect, useState } from "react";
import "./index.css";
import packageJson from "../package.json";

const APP_VERSION = packageJson.version || "dev";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
  };
  ready: () => void;
};

type AdminUserDetails = {
  id: string | number;
  name?: string;
  username?: string | null;
  ativo?: boolean;
  autorizado?: boolean;
  invoice_pdf_enabled?: boolean;
  criado_em?: any;
  last_seen?: any;
  atualizado_em?: any;
  solicitacao_acesso?: {
    status: string | null;
    solicitado_em?: any;
    atualizado_em?: any;
    aprovado_em?: any;
    aprovado_por?: string | null;
  } | null;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

function SectionHeader({
  title,
  subtitle,
}: Readonly<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}>) {
  return (
    <>
      <strong>{title}</strong>
      {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
    </>
  );
}

function BillingCycleSelect({
  value,
  options,
  onChange,
}: Readonly<{
  value: string;
  options: string[];
  onChange: (next: string) => void;
}>) {
  return (
    <label>
      Ciclo de fatura:{" "}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((cycle) => (
          <option key={cycle} value={cycle}>
            {cycle}
          </option>
        ))}
      </select>
    </label>
  );
}

function getCycleFromIsoDate(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  let month = d.getMonth() + 1;
  let year = d.getFullYear();
  const day = d.getDate();
  if (day >= 10) {
    month += 1;
    if (month > 12) {
      month -= 12;
      year += 1;
    }
  }
  return `${String(month).padStart(2, "0")}/${year}`;
}

function getGastoCycles(g: any): string[] {
  const iso = g?.data_compra as string | null | undefined;
  if (!iso) {
    return [];
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return [];
  }

  const day = d.getDate();
  let month = d.getMonth() + 1;
  let year = d.getFullYear();

  if (day > 9) {
    month += 1;
    if (month > 12) {
      month -= 12;
      year += 1;
    }
  }

  let totalParcelas = Number(g?.parcelas_total ?? 1);
  if (!Number.isFinite(totalParcelas) || totalParcelas < 1) {
    totalParcelas = 1;
  }

  const cycles: string[] = [];
  for (let i = 0; i < totalParcelas; i += 1) {
    const mIndex = month + i;
    const y = year + Math.floor((mIndex - 1) / 12);
    const m = ((mIndex - 1) % 12) + 1;
    cycles.push(`${String(m).padStart(2, "0")}/${y}`);
  }

  return cycles;
}

function gastoPertenceAoCiclo(g: any, ciclo: string | null): boolean {
  if (!ciclo) {
    return true;
  }
  const cycles = getGastoCycles(g);
  return cycles.includes(ciclo);
}

function getSaldoAcumuladoInfo(valor: number): {
  label: string;
  color: string;
} {
  if (!Number.isFinite(valor) || Math.abs(valor) < 0.005) {
    return {
      label: "Saldo zerado até este ciclo",
      color: "#e5e7eb",
    };
  }

  if (valor > 0) {
    return {
      label: "Saldo devedor acumulado até este ciclo",
      color: "#f97373",
    };
  }

  return {
    label: "Crédito acumulado até este ciclo",
    color: "#60a5fa",
  };
}

function formatDateTime(value: any): string {
  if (!value) {
    return "-";
  }
  try {
    if (typeof value === "string") {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString();
      }
    }
    if (value && typeof value.toDate === "function") {
      const d = value.toDate() as Date;
      return d.toLocaleString();
    }
    if (value instanceof Date) {
      return value.toLocaleString();
    }
  } catch {
    return "-";
  }
  return "-";
}

function formatCurrencyBRL(valor: number): string {
  if (!Number.isFinite(valor)) {
    valor = 0;
  }
  const abs = Math.abs(valor);
  return `R$ ${abs.toFixed(2).replace(".", ",")}`;
}

function formatDateIsoToBR(iso: string | null | undefined): string {
  if (!iso) {
    return "-";
  }
  const base = iso.slice(0, 10);
  const parts = base.split("-");
  if (parts.length !== 3) {
    return base;
  }
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function csvEscape(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  const s = String(value);
  const needsQuotes = /[",\n\r;]/.test(s);
  const escaped = s.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsv(rows: any[][]): string {
  return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
}

function downloadTextFile(
  filename: string,
  content: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getTelegramInitData(webApp: TelegramWebApp | null): string {
  const liveInitData = (globalThis as any).Telegram?.WebApp?.initData;
  if (typeof liveInitData === "string" && liveInitData.trim()) {
    return liveInitData.trim();
  }
  return typeof webApp?.initData === "string" ? webApp.initData.trim() : "";
}

function normalizeApiErrorMessage(raw: unknown, fallback: string): string {
  const rawMessage = typeof raw === "string" ? raw.trim() : "";
  let message = rawMessage;
  if (message.startsWith("{") && message.endsWith("}")) {
    try {
      const parsed = JSON.parse(message);
      if (typeof parsed?.error === "string" && parsed.error.trim()) {
        message = parsed.error.trim();
      }
    } catch {
      // noop
    }
  }

  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    normalized.includes("initdata invalido") ||
    normalized.includes("assinatura de initdata invalida") ||
    normalized.includes("initdata ausente") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return "Sessão do Telegram inválida ou expirada. Feche e reabra este painel pelo botão do bot no Telegram.";
  }
  return message || fallback;
}

function withInitDataQuery(url: string, initData: string): string {
  if (!initData) {
    return url;
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}initData=${encodeURIComponent(initData)}`;
}

type LooseMap = Record<string, any>;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: componente legado grande
function App() { // NOSONAR
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [gastos, setGastos] = useState<any[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [billingCycles, setBillingCycles] = useState<string[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string | null>(null);
  const [cycleSummary, setCycleSummary] = useState<{
    parcelas_mes: number;
    pagamentos_mes: number;
    saldo_mes: number;
    saldo_acumulado: number;
    saldo_acumulado_bruto: number;
    saldo_quitado_ate_base: number;
    base_mes: number;
    base_ano: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [selectedGastoId, setSelectedGastoId] = useState<string | null>(null);
  const [editGastoValorTotal, setEditGastoValorTotal] = useState<string>("");
  const [editGastoParcelas, setEditGastoParcelas] = useState<string>("");
  const [selectedPagamentoId, setSelectedPagamentoId] = useState<string | null>(
    null,
  );
  const [editPagamentoValor, setEditPagamentoValor] = useState<string>("");
  const [userSuggestions, setUserSuggestions] = useState<
    { id: string; name: string; username: string | null }[]
  >([]);
  const [infoDialog, setInfoDialog] = useState<
    null | "saldo_ciclo" | "saldo_acumulado"
  >(null);
  const [userDetails, setUserDetails] = useState<AdminUserDetails | null>(null);
  const [editUserName, setEditUserName] = useState<string>("");
  const [editUserUsername, setEditUserUsername] = useState<string>("");
  const [editUserAtivo, setEditUserAtivo] = useState<boolean>(true);
  const [editUserAutorizado, setEditUserAutorizado] = useState<boolean>(false);
  const [editUserInvoicePdfEnabled, setEditUserInvoicePdfEnabled] =
    useState<boolean>(false);
  const [adminMessageText, setAdminMessageText] = useState<string>("");
  const [adminMessageSending, setAdminMessageSending] =
    useState<boolean>(false);
  const [adminMessageResult, setAdminMessageResult] = useState<string | null>(
    null,
  );
  const [userActionMessage, setUserActionMessage] = useState<string | null>(
    null,
  );
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryReloadToken, setSummaryReloadToken] = useState(0);
  const [userOverview, setUserOverview] = useState<LooseMap | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userReloadToken, setUserReloadToken] = useState(0);
  const [userPanelError, setUserPanelError] = useState<string | null>(null);
  const [userPanelMessage, setUserPanelMessage] = useState<string | null>(null);
  const [userGastoDescricao, setUserGastoDescricao] = useState<string>("");
  const [userGastoValor, setUserGastoValor] = useState<string>("");
  const [userGastoParcelas, setUserGastoParcelas] = useState<string>("");
  const [userGastoCategoria, setUserGastoCategoria] = useState<string>("");
  const [userPagamentoValor, setUserPagamentoValor] = useState<string>("");
  const [userPagamentoDescricao, setUserPagamentoDescricao] =
    useState<string>("");
  const [userBillingCycles, setUserBillingCycles] = useState<string[]>([]);
  const [userSelectedCycle, setUserSelectedCycle] = useState<string | null>(
    null,
  );
  const [userInvoiceStatus, setUserInvoiceStatus] = useState<LooseMap | null>(
    null,
  );
  const [userInvoiceLoading, setUserInvoiceLoading] = useState<boolean>(false);
  const [userInvoiceMessage, setUserInvoiceMessage] = useState<string | null>(
    null,
  );
  const [userInvoiceError, setUserInvoiceError] = useState<string | null>(null);
  const [userRecurringGastos, setUserRecurringGastos] = useState<any[]>([]);
  const [userRecurringLoading, setUserRecurringLoading] = useState(false);
  const [userRecurringError, setUserRecurringError] = useState<string | null>(
    null,
  );
  const [userRecurringReloadToken, setUserRecurringReloadToken] = useState(0);
  const [selectedRecurringId, setSelectedRecurringId] = useState<string | null>(
    null,
  );
  const [recurringDescricao, setRecurringDescricao] = useState<string>("");
  const [recurringValor, setRecurringValor] = useState<string>("");
  const [recurringCategoria, setRecurringCategoria] = useState<string>("");
  const [recurringMessage, setRecurringMessage] = useState<string | null>(null);
  const [userGastosList, setUserGastosList] = useState<any[]>([]);
  const [userPagamentosList, setUserPagamentosList] = useState<any[]>([]);
  const [userLancamentosLoading, setUserLancamentosLoading] = useState(false);
  const [userLancamentosError, setUserLancamentosError] = useState<
    string | null
  >(null);
  const [adminInvoiceRequests, setAdminInvoiceRequests] = useState<any[]>([]);
  const [adminInvoiceRequestsLoading, setAdminInvoiceRequestsLoading] =
    useState<boolean>(false);
  const [adminInvoiceRequestsError, setAdminInvoiceRequestsError] = useState<
    string | null
  >(null);
  const [adminInvoiceRequestsMessage, setAdminInvoiceRequestsMessage] =
    useState<string | null>(null);
  const [adminInvoiceRequestsReloadToken, setAdminInvoiceRequestsReloadToken] =
    useState<number>(0);
  const [selectedUserGasto, setSelectedUserGasto] = useState<LooseMap | null>(
    null,
  );
  const [userEditGastoDescricao, setUserEditGastoDescricao] =
    useState<string>("");
  const [userEditGastoValor, setUserEditGastoValor] = useState<string>("");
  const [userEditGastoParcelas, setUserEditGastoParcelas] =
    useState<string>("");
  const [userEditGastoCategoria, setUserEditGastoCategoria] =
    useState<string>("");
  const [selectedUserPagamento, setSelectedUserPagamento] =
    useState<LooseMap | null>(null);
  const [userEditPagamentoDescricao, setUserEditPagamentoDescricao] =
    useState<string>("");
  const [userEditPagamentoValor, setUserEditPagamentoValor] =
    useState<string>("");
  const [userShowAllExtrato, setUserShowAllExtrato] = useState(false);
  const [userShowAllGastos, setUserShowAllGastos] = useState(false);
  const [userShowAllPagamentos, setUserShowAllPagamentos] = useState(false);
  const [userExtratoFilter, setUserExtratoFilter] = useState<
    "all" | "gastos" | "pagamentos"
  >("all");
  const [userPrevTotals, setUserPrevTotals] = useState<LooseMap | null>(null);
  const [userOverviewCache, setUserOverviewCache] = useState<
    Record<string, any>
  >({});
  const [userRequestingAccess, setUserRequestingAccess] = useState(false);
  const [adminAccessRequests, setAdminAccessRequests] = useState<any[]>([]);
  const [adminAccessRequestsLoading, setAdminAccessRequestsLoading] =
    useState(false);
  const [adminAccessRequestsError, setAdminAccessRequestsError] = useState<
    string | null
  >(null);
  const [adminAccessRequestsReloadToken, setAdminAccessRequestsReloadToken] =
    useState(0);
  const [adminAccessRequestsFilter, setAdminAccessRequestsFilter] = useState<
    "pending" | "approved" | "all"
  >("pending");
  const [adminAccessRequestsSearch, setAdminAccessRequestsSearch] =
    useState<string>("");
  const [adminAllUsers, setAdminAllUsers] = useState<
    { id: string; name: string; username: string | null; ativo: boolean; autorizado: boolean }[]
  >([]);
  const [adminAllUsersLoading, setAdminAllUsersLoading] = useState(false);
  const [adminAllUsersError, setAdminAllUsersError] = useState<string | null>(
    null,
  );
  const [adminAllUsersSearch, setAdminAllUsersSearch] = useState<string>("");
  const [adminAllUsersCursor, setAdminAllUsersCursor] = useState<string | null>(
    null,
  );
  const [adminAllUsersHasMore, setAdminAllUsersHasMore] = useState(true);
  const [activePanel, setActivePanel] = useState<"user" | "admin">("user");
  const [userPage, setUserPage] = useState<
    "overview" | "recorrentes" | "gastos" | "pagamentos" | "extrato"
  >("overview");
  const [adminPage, setAdminPage] = useState<
    "requests" | "workspace" | "system"
  >("requests");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminActiveTab, setAdminActiveTab] = useState<
    "overview" | "lancamentos" | "pagamentos" | "faturas" | "config"
  >("overview");
  const [userActiveForm, setUserActiveForm] = useState<
    | null
    | "gasto"
    | "pagamento"
    | "recorrente"
    | "edit_gasto"
    | "edit_pagamento"
  >(null);

  const [adminMeta, setAdminMeta] = useState<LooseMap | null>(null);
  const [adminMetaLoading, setAdminMetaLoading] = useState(false);
  const [adminMetaError, setAdminMetaError] = useState<string | null>(null);
  const [adminMetaFetchedAt, setAdminMetaFetchedAt] = useState<number>(0);
  const [telegramContextWarning, setTelegramContextWarning] = useState<
    string | null
  >(null);

  useEffect(() => {
    const wa = (globalThis as any).Telegram?.WebApp as
      | TelegramWebApp
      | undefined;
    if (wa) {
      setWebApp(wa);
      if (wa.initDataUnsafe?.user) {
        setUser(wa.initDataUnsafe.user);
      }
      if (!getTelegramInitData(wa)) {
        setTelegramContextWarning(
          "Abra este painel pelo botão do bot no Telegram para autenticar sua sessão.",
        );
      } else {
        setTelegramContextWarning(null);
      }
      wa.ready();
    } else {
      setTelegramContextWarning(
        "Contexto Telegram WebApp não detectado. Algumas ações reais ficarão indisponíveis fora do Telegram.",
      );
    }
  }, []);

  const functionsBaseUrl =
    "https://us-central1-bot-cartao-credito.cloudfunctions.net";

  function getAdminActingTargetUserId(): string | null {
    if (!isAdmin || activePanel !== "admin") {
      return null;
    }
    const target = targetUserId.trim();
    return target ? target : null;
  }

  function withAdminTargetBody(body: Record<string, any>): Record<string, any> {
    const target = getAdminActingTargetUserId();
    if (!target) {
      return body;
    }
    return {
      ...body,
      targetUserId: target,
    };
  }

  function withAdminTargetUrl(url: string): string {
    const target = getAdminActingTargetUserId();
    if (!target) {
      return url;
    }
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}targetUserId=${encodeURIComponent(target)}`;
  }

  async function refreshAdminTargetAfterMutation(
    preferredTab?: "overview" | "lancamentos" | "pagamentos" | "faturas" | "config",
  ): Promise<void> {
    const target = targetUserId.trim();
    if (!isAdmin || activePanel !== "admin" || !target) {
      return;
    }
    const tabToRestore = preferredTab ?? adminActiveTab;
    await loadAdminUserDataById(target);
    setAdminActiveTab(tabToRestore);
  }

  async function fetchAdminMeta(opts?: { silent?: boolean }) {
    const initData = getTelegramInitData(webApp);
    if (!initData) {
      setAdminMeta(null);
      setAdminMetaFetchedAt(0);
      setAdminMetaError(null);
      setTelegramContextWarning(
        "Abra este painel pelo botão do bot no Telegram para autenticar sua sessão.",
      );
      return null;
    }

    const silent = Boolean(opts?.silent);
    if (!silent) {
      setAdminMetaLoading(true);
    }
    setAdminMetaError(null);

    try {
      const resp = await fetch(`${functionsBaseUrl}/adminMeta`, {
        headers: {
          "x-telegram-init-data": initData,
        },
      });

      if (resp.ok) {
        const data = await resp.json();
        setAdminMeta(data);
        setAdminMetaFetchedAt(Date.now());
        setIsAdmin(true);
        setTelegramContextWarning(null);
        return data;
      }

      // 401/403: definitivamente não-admin.
      if (resp.status === 401 || resp.status === 403) {
        setIsAdmin(false);
        setAdminMeta(null);
        setAdminMetaFetchedAt(0);
        setAdminMetaError(
          normalizeApiErrorMessage(
            `HTTP ${resp.status}`,
            "Sessão inválida para operações administrativas.",
          ),
        );
        setTelegramContextWarning(
          "Sessão do Telegram inválida ou expirada. Reabra o Mini App pelo bot.",
        );
        return null;
      }

      // Outras falhas: não derruba o estado de admin (evita falso-negativo por erro transitório).
      setAdminMetaError(
        `Erro ao carregar metadados do backend (HTTP ${resp.status}).`,
      );
      return null;
    } catch (err: any) {
      setAdminMetaError(
        normalizeApiErrorMessage(
          err?.message,
          "Erro ao carregar metadados do backend.",
        ),
      );
      return null;
    } finally {
      if (!silent) {
        setAdminMetaLoading(false);
      }
    }
  }

  useEffect(() => {
    // 1) Detecta admin cedo (sem depender de outras queries) e já aproveita a resposta.
    // Faz silent=true para não “piscar” loading fora da aba Configuração.
    fetchAdminMeta({ silent: true });
  }, [webApp?.initData]);

  useEffect(() => {
    // 2) Quando entrar na página Sistema, faz refresh se estiver vazio ou “stale”.
    if (!isAdmin || activePanel !== "admin" || adminPage !== "system") {
      return;
    }
    const ttlMs = 60_000;
    const stale =
      !adminMeta ||
      !adminMetaFetchedAt ||
      Date.now() - adminMetaFetchedAt > ttlMs;
    if (!stale) {
      return;
    }
    fetchAdminMeta();
  }, [
    isAdmin,
    activePanel,
    adminPage,
    adminActiveTab,
    adminMeta,
    adminMetaFetchedAt,
    webApp?.initData,
  ]);

  async function handleAdminApproveAccess(userId: string, openAfter?: boolean) {
    setError(null);
    setActionMessage(null);

    if (!webApp?.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais.",
      );
      return;
    }

    const confirmed = globalThis.confirm(
      `Aprovar acesso do usuário ${userId}? (Isso marcará o usuário como autorizado)`,
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/adminUpdateUsuario`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify({ userId, autorizado: true }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setError(data?.error || "Erro ao aprovar acesso.");
        return;
      }

      setActionMessage("Acesso liberado com sucesso.");
      setAdminAccessRequestsReloadToken((t) => t + 1);
      if (adminAccessRequestsFilter === "pending") {
        setAdminAccessRequests((current) =>
          current.filter((item: any) => String(item?.user_id || "") !== userId),
        );
      }

      if (openAfter) {
        setTargetUserId(userId);
        await loadAdminUserDataById(userId);
      }
    } catch (err: any) {
      console.error("Erro ao aprovar acesso", err);
      setError(err?.message || "Erro ao aprovar acesso.");
    } finally {
      setSaving(false);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fluxo administrativo com muitos ramos
  async function loadAdminUserDataById(userId: string) { // NOSONAR
    setAdminPage("workspace");
    setError(null);
    setActionMessage(null);
    setGastos([]);
    setPagamentos([]);
    setBillingCycles([]);
    setSelectedCycle(null);
    setCycleSummary(null);
    setSelectedGastoId(null);
    setSelectedPagamentoId(null);
    setEditGastoValorTotal("");
    setEditGastoParcelas("");
    setEditPagamentoValor("");
    setUserDetails(null);
    setEditUserName("");
    setEditUserUsername("");
    setEditUserAtivo(true);
    setEditUserAutorizado(false);
    setEditUserInvoicePdfEnabled(false);
    setAdminMessageText("");
    setAdminMessageResult(null);
    setUserSuggestions([]);

    const normalized = userId.trim();
    if (!normalized) {
      setError("Informe o ID do usuário alvo.");
      return;
    }

    const initData = getTelegramInitData(webApp);
    if (!initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para carregar dados reais.",
      );
      return;
    }

    setLoading(true);
    try {
      const headers: HeadersInit = {
        "x-telegram-init-data": initData,
      };

      const bundleResp = await fetch(
        withInitDataQuery(
          `${functionsBaseUrl}/adminGetUserBundle?userId=${encodeURIComponent(
            normalized,
          )}&limit=500`,
          initData,
        ),
        { headers },
      );

      let bundleJson: any = null;
      try {
        bundleJson = await bundleResp.json();
      } catch {
        bundleJson = null;
      }

      if (!bundleResp.ok) {
        throw new Error(
          normalizeApiErrorMessage(
            bundleJson?.error,
            `Erro ao carregar dados do usuário (${bundleResp.status}).`,
          ),
        );
      }

      const newGastos = Array.isArray(bundleJson?.gastos?.itens)
        ? bundleJson.gastos.itens
        : [];
      const newPagamentos = Array.isArray(bundleJson?.pagamentos?.itens)
        ? bundleJson.pagamentos.itens
        : [];

      setGastos(newGastos);
      setPagamentos(newPagamentos);

      const usuarioJson = bundleJson?.usuario;
      if (usuarioJson?.dados) {
        const dados = usuarioJson.dados;
        setUserDetails(dados);
        setEditUserName(String(dados.name || ""));
        setEditUserUsername(dados.username ?? "");
        setEditUserAtivo(dados.ativo !== false);
        setEditUserAutorizado(!!dados.autorizado);
        setEditUserInvoicePdfEnabled(!!dados.invoice_pdf_enabled);
      } else {
        setUserDetails(null);
      }

      const cyclesSet = new Set<string>();
      newGastos.forEach((g: any) => {
        const gastoCycles = getGastoCycles(g);
        gastoCycles.forEach((ciclo) => cyclesSet.add(ciclo));
      });
      newPagamentos.forEach((p: any) => {
        const ciclo = getCycleFromIsoDate(p.data_pagamento);
        if (ciclo) {
          cyclesSet.add(ciclo);
        }
      });

      const allCycles = Array.from(cyclesSet).sort((a, b) => {
        const [ma, ya] = a.split("/").map(Number);
        const [mb, yb] = b.split("/").map(Number);
        return yb * 12 + mb - (ya * 12 + ma);
      });

      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const maxIndex = currentYear * 12 + currentMonth + 1;

      const limitedCycles = allCycles.filter((cycle) => {
        const [m, y] = cycle.split("/").map(Number);
        if (!m || !y) {
          return false;
        }
        const idx = y * 12 + m;
        return idx <= maxIndex;
      });

      const cycles = limitedCycles.length > 0 ? limitedCycles : allCycles;
      setBillingCycles(cycles);

      if (cycles.length > 0) {
        const diaVencimento = 10;
        const hojeDia = now.getDate();
        let alvoMes = currentMonth;
        let alvoAno = currentYear;
        if (hojeDia >= diaVencimento + 1) {
          alvoMes += 1;
          if (alvoMes > 12) {
            alvoMes -= 12;
            alvoAno += 1;
          }
        }
        const alvoCiclo = `${String(alvoMes).padStart(2, "0")}/${alvoAno}`;
        if (cycles.includes(alvoCiclo)) {
          setSelectedCycle(alvoCiclo);
        } else {
          setSelectedCycle(cycles[0]);
        }
      }

      setAdminActiveTab("lancamentos");
    } catch (err: any) {
      console.error(err);
      setError(normalizeApiErrorMessage(err?.message, "Erro ao carregar dados."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Otimização: agora carregamos gastos/pagamentos via `userBootstrap`.
    // Mantemos este effect como no-op para evitar chamadas duplicadas.
    setUserLancamentosLoading(false);
    setUserLancamentosError(null);
  }, [webApp, userOverview]);

  useEffect(() => {
    setUserShowAllGastos(false);
    setUserShowAllPagamentos(false);
    setUserShowAllExtrato(false);
  }, [userSelectedCycle]);

  function clearUserOverviewCacheForCycle(cycle: string | null): void {
    if (!cycle) {
      return;
    }
    setUserOverviewCache((prev: Record<string, any>) => {
      const next = { ...prev };
      delete next[cycle];
      return next;
    });
  }

  function handleSelectUserGastoForEdit(item: any): void {
    setSelectedUserGasto(item);
    setUserEditGastoDescricao(String(item?.descricao || ""));
    setUserEditGastoCategoria(String(item?.categoria || ""));
    const valorTotal = Number(item?.valor_total || 0);
    setUserEditGastoValor(
      Number.isFinite(valorTotal) && valorTotal > 0
        ? valorTotal.toFixed(2).replace(".", ",")
        : "",
    );
    const parcelas = Number(item?.parcelas_total || 1);
    setUserEditGastoParcelas(
      Number.isFinite(parcelas) && parcelas > 1 ? String(parcelas) : "",
    );
    setUserLancamentosError(null);
    setUserActiveForm("edit_gasto");
  }

  function handleSelectUserPagamentoForEdit(item: any): void {
    setSelectedUserPagamento(item);
    setUserEditPagamentoDescricao(String(item?.descricao || "Pagamento"));
    const valor = Number(item?.valor || 0);
    setUserEditPagamentoValor(
      Number.isFinite(valor) && valor > 0
        ? valor.toFixed(2).replace(".", ",")
        : "",
    );
    setUserLancamentosError(null);
    setUserActiveForm("edit_pagamento");
  }

  async function handleUserSaveGastoEdit(event: React.FormEvent) {
    event.preventDefault();
    setUserLancamentosError(null);
    setUserPanelMessage(null);

    if (!selectedUserGasto?.id) {
      setUserLancamentosError("Selecione um gasto.");
      return;
    }

    if (!webApp?.initData) {
      setUserLancamentosError(
        "Este mini app deve ser aberto dentro do Telegram para editar lançamentos de verdade.",
      );
      return;
    }

    const descricao = userEditGastoDescricao.trim();
    const categoria = userEditGastoCategoria.trim();
    const valorStr = userEditGastoValor.trim().replace(",", ".");
    const parcelasStr = userEditGastoParcelas.trim();

    const body: any = {
      gastoId: String(selectedUserGasto.id),
    };
    if (descricao) {
      body.descricao = descricao;
    }
    if (categoria) {
      body.categoria = categoria;
    }
    if (valorStr) {
      body.novoValorTotal = valorStr;
    }
    if (parcelasStr) {
      const parsed = Number.parseInt(parcelasStr, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        body.novasParcelas = parsed;
      }
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/userEditGasto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(withAdminTargetBody(body)),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setUserLancamentosError(data?.error || "Erro ao editar gasto.");
        return;
      }

      setUserPanelMessage("Gasto atualizado.");
      clearUserOverviewCacheForCycle(userSelectedCycle);
      setUserReloadToken((token) => token + 1);
      setUserActiveForm(null);
      setSelectedUserGasto(null);
      await refreshAdminTargetAfterMutation("lancamentos");
    } catch (err: any) {
      console.error("Erro ao editar gasto", err);
      setUserLancamentosError(err?.message || "Erro ao editar gasto.");
    } finally {
      setSaving(false);
    }
  }

  function handleExportAdminGastosCsv(): void {
    if (!targetUserId || filteredGastos.length === 0) {
      setError("Nenhum gasto para exportar.");
      return;
    }
    const cycle = selectedCycle ? selectedCycle.replace("/", "-") : "all";
    const rows: any[][] = [
      [
        "id",
        "user_id",
        "descricao",
        "categoria",
        "data_compra",
        "valor_total",
        "valor_parcela",
        "parcelas_total",
        "mes_inicio",
        "ano_inicio",
        "ativo",
      ],
      ...filteredGastos.map((g) => [
        g.id || "",
        g.user_id || targetUserId,
        g.descricao || "",
        g.categoria || "",
        g.data_compra || "",
        Number(g.valor_total || 0),
        Number(g.valor_parcela || 0),
        Number(g.parcelas_total || 1),
        Number(g.mes_inicio || ""),
        Number(g.ano_inicio || ""),
        g.ativo === false ? "false" : "true",
      ]),
    ];
    const csv = toCsv(rows);
    downloadTextFile(
      `gastos_${targetUserId}_${cycle}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  function handleExportAdminPagamentosCsv(): void {
    if (!targetUserId || filteredPagamentos.length === 0) {
      setError("Nenhum pagamento para exportar.");
      return;
    }
    const cycle = selectedCycle ? selectedCycle.replace("/", "-") : "all";
    const rows: any[][] = [
      [
        "id",
        "user_id",
        "descricao",
        "data_pagamento",
        "valor",
        "mes",
        "ano",
        "cancelado",
      ],
      ...filteredPagamentos.map((p) => [
        p.id || "",
        p.user_id || targetUserId,
        p.descricao || "Pagamento",
        p.data_pagamento || "",
        Number(p.valor || 0),
        Number(p.mes || ""),
        Number(p.ano || ""),
        p.cancelado ? "true" : "false",
      ]),
    ];
    const csv = toCsv(rows);
    downloadTextFile(
      `pagamentos_${targetUserId}_${cycle}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  function handleExportAdminValidationReportCsv(): void {
    if (!targetUserId) {
      setError("Selecione um usuário para exportar o relatório.");
      return;
    }

    const cycle = selectedCycle ? selectedCycle.replace("/", "-") : "all";
    const nowIso = new Date().toISOString();
    const userName = String(userDetails?.name || "");
    const username = String(userDetails?.username || "");

    const rows: any[][] = [
      ["section", "field", "value"],
      ["meta", "generated_at", nowIso],
      ["meta", "user_id", targetUserId],
      ["meta", "user_name", userName],
      ["meta", "username", username],
      ["meta", "cycle", selectedCycle || ""],
      [
        "summary",
        "parcelas_mes",
        Number(cycleSummary?.parcelas_mes || 0).toFixed(2),
      ],
      [
        "summary",
        "pagamentos_mes",
        Number(cycleSummary?.pagamentos_mes || 0).toFixed(2),
      ],
      ["summary", "saldo_mes", Number(cycleSummary?.saldo_mes || 0).toFixed(2)],
      [
        "summary",
        "saldo_acumulado",
        Number(cycleSummary?.saldo_acumulado || 0).toFixed(2),
      ],
      ["summary", "gastos_count", String(filteredGastos.length)],
      ["summary", "pagamentos_count", String(filteredPagamentos.length)],
      ["", "", ""],
      [
        "gastos",
        "id",
        "descricao",
        "categoria",
        "data_compra",
        "valor_total",
        "valor_parcela",
        "parcelas_total",
      ],
      ...filteredGastos.map((g) => [
        "gastos",
        g.id || "",
        g.descricao || "",
        g.categoria || "",
        g.data_compra || "",
        Number(g.valor_total || 0).toFixed(2),
        Number(g.valor_parcela || 0).toFixed(2),
        Number(g.parcelas_total || 1),
      ]),
      ["", "", ""],
      [
        "pagamentos",
        "id",
        "descricao",
        "data_pagamento",
        "valor",
        "mes",
        "ano",
      ],
      ...filteredPagamentos.map((p) => [
        "pagamentos",
        p.id || "",
        p.descricao || "Pagamento",
        p.data_pagamento || "",
        Number(p.valor || 0).toFixed(2),
        Number(p.mes || ""),
        Number(p.ano || ""),
      ]),
    ];

    const csv = toCsv(rows);
    downloadTextFile(
      `relatorio_validacao_${targetUserId}_${cycle}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  async function handleUserCancelGasto() {
    setUserLancamentosError(null);
    setUserPanelMessage(null);

    if (!selectedUserGasto?.id) {
      return;
    }

    if (!webApp?.initData) {
      setUserLancamentosError(
        "Este mini app deve ser aberto dentro do Telegram para cancelar lançamentos de verdade.",
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja cancelar (inativar) este gasto?",
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/userCancelGasto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(
          withAdminTargetBody({ gastoId: String(selectedUserGasto.id) }),
        ),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setUserLancamentosError(data?.error || "Erro ao cancelar gasto.");
        return;
      }

      setUserPanelMessage("Gasto cancelado.");
      clearUserOverviewCacheForCycle(userSelectedCycle);
      setUserReloadToken((token) => token + 1);
      setUserActiveForm(null);
      setSelectedUserGasto(null);
      await refreshAdminTargetAfterMutation("lancamentos");
    } catch (err: any) {
      console.error("Erro ao cancelar gasto", err);
      setUserLancamentosError(err?.message || "Erro ao cancelar gasto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUserSavePagamentoEdit(event: React.FormEvent) {
    event.preventDefault();
    setUserLancamentosError(null);
    setUserPanelMessage(null);

    if (!selectedUserPagamento?.id) {
      setUserLancamentosError("Selecione um pagamento.");
      return;
    }

    if (!webApp?.initData) {
      setUserLancamentosError(
        "Este mini app deve ser aberto dentro do Telegram para editar lançamentos de verdade.",
      );
      return;
    }

    const descricao = userEditPagamentoDescricao.trim();
    const valorStr = userEditPagamentoValor.trim().replace(",", ".");

    const body: any = {
      pagamentoId: String(selectedUserPagamento.id),
    };
    if (descricao) {
      body.descricao = descricao;
    }
    if (valorStr) {
      body.novoValor = valorStr;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/userEditPagamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(withAdminTargetBody(body)),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setUserLancamentosError(data?.error || "Erro ao editar pagamento.");
        return;
      }

      setUserPanelMessage("Pagamento atualizado.");
      clearUserOverviewCacheForCycle(userSelectedCycle);
      setUserReloadToken((token) => token + 1);
      setUserActiveForm(null);
      setSelectedUserPagamento(null);
      await refreshAdminTargetAfterMutation("pagamentos");
    } catch (err: any) {
      console.error("Erro ao editar pagamento", err);
      setUserLancamentosError(err?.message || "Erro ao editar pagamento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUserCancelPagamento() {
    setUserLancamentosError(null);
    setUserPanelMessage(null);

    if (!selectedUserPagamento?.id) {
      return;
    }

    if (!webApp?.initData) {
      setUserLancamentosError(
        "Este mini app deve ser aberto dentro do Telegram para cancelar lançamentos de verdade.",
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja cancelar este pagamento?",
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/userCancelPagamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(
          withAdminTargetBody({ pagamentoId: String(selectedUserPagamento.id) }),
        ),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setUserLancamentosError(data?.error || "Erro ao cancelar pagamento.");
        return;
      }

      setUserPanelMessage("Pagamento cancelado.");
      clearUserOverviewCacheForCycle(userSelectedCycle);
      setUserReloadToken((token) => token + 1);
      setUserActiveForm(null);
      setSelectedUserPagamento(null);
      await refreshAdminTargetAfterMutation("pagamentos");
    } catch (err: any) {
      console.error("Erro ao cancelar pagamento", err);
      setUserLancamentosError(err?.message || "Erro ao cancelar pagamento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUserRequestAccess() {
    if (!webApp?.initData) {
      return;
    }

    setUserRequestingAccess(true);
    setUserPanelError(null);
    setUserPanelMessage(null);

    try {
      const headers: HeadersInit = {
        "x-telegram-init-data": webApp?.initData ?? "",
        "Content-Type": "application/json",
      };

      const resp = await fetch(`${functionsBaseUrl}/userRequestAccess`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setUserPanelError(
          data?.error || "Erro ao enviar pedido de liberação de acesso.",
        );
        return;
      }

      setUserPanelMessage(
        data?.message ||
          "Seu pedido de liberação foi enviado. Assim que for aprovado, volte a abrir o mini app.",
      );
      setUserReloadToken((token) => token + 1);
    } catch (err: any) {
      console.error("Erro em handleUserRequestAccess", err);
      setUserPanelError(
        err?.message || "Erro ao enviar pedido de liberação de acesso.",
      );
    } finally {
      setUserRequestingAccess(false);
    }
  }

  useEffect(() => {
    async function fetchUserRecurringGastos() {
      if (!webApp?.initData) {
        setUserRecurringGastos([]);
        return;
      }

      if (userOverview?.autorizado === false) {
        setUserRecurringGastos([]);
        return;
      }

      setUserRecurringLoading(true);
      setUserRecurringError(null);
      try {
        const headers: HeadersInit = {
          "x-telegram-init-data": webApp?.initData ?? "",
        };

        const resp = await fetch(
          withAdminTargetUrl(`${functionsBaseUrl}/userListRecurringGastos`),
          { headers },
        );

        let data: any = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }

        if (!resp.ok) {
          setUserRecurringGastos([]);
          setUserRecurringError(
            data?.error || "Erro ao carregar gastos recorrentes.",
          );
          return;
        }

        const itens = Array.isArray(data?.itens) ? data.itens : [];
        setUserRecurringGastos(itens);
      } catch (err: any) {
        console.error("Erro ao carregar gastos recorrentes", err);
        setUserRecurringGastos([]);
        setUserRecurringError(
          err?.message || "Erro ao carregar gastos recorrentes.",
        );
      } finally {
        setUserRecurringLoading(false);
      }
    }

    fetchUserRecurringGastos();
  }, [webApp, functionsBaseUrl, userRecurringReloadToken, userOverview]);

  useEffect(() => {
    async function applyRecurringToSelectedCycle() {
      if (!webApp?.initData) {
        return;
      }

      if (!userSelectedCycle) {
        return;
      }

      if (userOverview?.autorizado === false) {
        return;
      }

      setRecurringMessage(null);
      try {
        const resp = await fetch(
          `${functionsBaseUrl}/userApplyRecurringGastos`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-telegram-init-data": webApp?.initData ?? "",
            },
            body: JSON.stringify(
              withAdminTargetBody({ cycle: userSelectedCycle }),
            ),
          },
        );

        let data: any = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }

        if (!resp.ok) {
          return;
        }

        const created = Number(data?.created || 0);
        if (Number.isFinite(created) && created > 0) {
          setRecurringMessage(
            `Adicionamos ${created} gasto(s) recorrente(s) neste ciclo.`,
          );
          setUserOverviewCache((prev: Record<string, any>) => {
            const next = { ...prev };
            delete next[userSelectedCycle];
            return next;
          });
          setUserReloadToken((token: number) => token + 1);
        }
      } catch (err) {
        console.error("Erro ao aplicar gastos recorrentes", err);
      }
    }

    applyRecurringToSelectedCycle();
  }, [webApp, functionsBaseUrl, userSelectedCycle, userOverview]);

  function handleSelectRecurring(item: any) {
    const id = typeof item?.id === "string" ? item.id : "";
    setSelectedRecurringId(id || null);
    setRecurringDescricao(String(item?.descricao || ""));
    setRecurringCategoria(String(item?.categoria || ""));
    const valor = Number(item?.valor_total || 0);
    if (Number.isFinite(valor) && valor > 0) {
      setRecurringValor(valor.toFixed(2).replace(".", ","));
    } else {
      setRecurringValor("");
    }
    setUserRecurringError(null);
    setUserPanelError(null);
    setUserPanelMessage(null);
    setUserActiveForm("recorrente");
  }

  async function handleSaveRecurringGasto(event: React.FormEvent) {
    event.preventDefault();
    setUserRecurringError(null);

    if (!webApp?.initData) {
      setUserRecurringError(
        "Este mini app deve ser aberto dentro do Telegram para registrar dados de verdade.",
      );
      return;
    }

    const descricao = recurringDescricao.trim();
    const categoria = recurringCategoria.trim();
    const valorStr = recurringValor.trim().replace(",", ".");
    if (!descricao) {
      setUserRecurringError("Informe uma descrição.");
      return;
    }

    if (!valorStr) {
      setUserRecurringError("Informe um valor.");
      return;
    }

    const valorNum = Number(valorStr);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setUserRecurringError("Valor inválido.");
      return;
    }

    setSaving(true);
    try {
      const body: any = {
        descricao,
        ...(categoria ? { categoria } : {}),
        valor: valorStr,
      };
      if (selectedRecurringId) {
        body.id = selectedRecurringId;
      }

      const resp = await fetch(`${functionsBaseUrl}/userUpsertRecurringGasto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(withAdminTargetBody(body)),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setUserRecurringError(
          data?.error || "Erro ao salvar gasto recorrente.",
        );
        return;
      }

      setRecurringMessage(
        selectedRecurringId
          ? "Gasto recorrente atualizado."
          : "Gasto recorrente criado.",
      );

      setSelectedRecurringId(null);
      setRecurringDescricao("");
      setRecurringValor("");
      setRecurringCategoria("");
      setUserActiveForm(null);
      setUserRecurringReloadToken((token: number) => token + 1);
    } catch (err: any) {
      console.error("Erro ao salvar gasto recorrente", err);
      setUserRecurringError(err?.message || "Erro ao salvar gasto recorrente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRecurringGasto() {
    setUserRecurringError(null);

    if (!selectedRecurringId) {
      return;
    }

    if (!webApp?.initData) {
      setUserRecurringError(
        "Este mini app deve ser aberto dentro do Telegram para registrar dados de verdade.",
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja desativar este gasto recorrente?",
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/userDeleteRecurringGasto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(withAdminTargetBody({ id: selectedRecurringId })),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setUserRecurringError(
          data?.error || "Erro ao desativar gasto recorrente.",
        );
        return;
      }

      setRecurringMessage("Gasto recorrente desativado.");
      setSelectedRecurringId(null);
      setRecurringDescricao("");
      setRecurringValor("");
      setRecurringCategoria("");
      setUserActiveForm(null);
      setUserRecurringReloadToken((token: number) => token + 1);
    } catch (err: any) {
      console.error("Erro ao desativar gasto recorrente", err);
      setUserRecurringError(
        err?.message || "Erro ao desativar gasto recorrente.",
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fluxo de bootstrap com cache e fallback
    async function fetchUserOverview() { // NOSONAR
      if (!webApp?.initData) {
        setUserOverview(null);
        return;
      }

      const cacheKey = userSelectedCycle || "__current__";
      const cached = userOverviewCache[cacheKey];

      if (cached) {
        setUserOverview(cached);
      }

      setUserLoading(!cached);
      setUserPanelError(null);
      setUserPanelMessage(null);

      try {
        const headers: HeadersInit = {
          "x-telegram-init-data": webApp?.initData ?? "",
        };

        let url = `${functionsBaseUrl}/userBootstrap`;
        if (userSelectedCycle) {
          const [mesStr, anoStr] = userSelectedCycle.split("/");
          const mes = Number.parseInt(mesStr, 10);
          const ano = Number.parseInt(anoStr, 10);
          if (Number.isFinite(mes) && Number.isFinite(ano)) {
            url += `?mes=${mes}&ano=${ano}`;
          }
        }
        url = withAdminTargetUrl(url);

        const resp = await fetch(url, {
          headers,
        });

        let data: any = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }

        if (!resp.ok) {
          if (resp.status === 403 && data?.autorizado === false) {
            setUserOverview({
              autorizado: false,
              error:
                data.error ||
                "Seu acesso ainda não foi liberado para este mini app.",
              isAdmin: data.isAdmin ?? false,
              user_id: data.user_id ?? (user ? String(user.id) : null),
              solicitacao_acesso: data.solicitacao_acesso ?? null,
            });

            setUserGastosList([]);
            setUserPagamentosList([]);
            setUserBillingCycles([]);
            return;
          }

          setUserOverview(null);
          setUserPanelError(
            data?.error || "Erro ao carregar o resumo da sua conta.",
          );
          return;
        }

        setUserOverview(data);

        const bootstrap = data?.bootstrap;
        if (bootstrap) {
          const gastosItens = Array.isArray(bootstrap?.gastos?.itens)
            ? bootstrap.gastos.itens
            : [];
          const pagamentosItens = Array.isArray(bootstrap?.pagamentos?.itens)
            ? bootstrap.pagamentos.itens
            : [];
          const cycles = Array.isArray(bootstrap?.cycles)
            ? bootstrap.cycles
            : [];

          setUserGastosList(gastosItens);
          setUserPagamentosList(pagamentosItens);
          setUserBillingCycles(cycles);

          if (cycles.length > 0 && !userSelectedCycle) {
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();
            const diaVencimento = 10;
            const hojeDia = now.getDate();

            let alvoMes = currentMonth;
            let alvoAno = currentYear;

            if (hojeDia >= diaVencimento + 1) {
              alvoMes += 1;
              if (alvoMes > 12) {
                alvoMes -= 12;
                alvoAno += 1;
              }
            }

            const alvoCiclo = `${String(alvoMes).padStart(2, "0")}/${alvoAno}`;
            if (cycles.includes(alvoCiclo)) {
              setUserSelectedCycle(alvoCiclo);
            } else {
              setUserSelectedCycle(cycles[0]);
            }
          }
        }

        setUserOverviewCache((prev) => ({
          ...prev,
          [cacheKey]: data,
        }));
      } catch (err: any) {
        console.error("Erro ao carregar resumo do usuário", err);
        setUserPanelError(
          err?.message || "Erro ao carregar o resumo da sua conta.",
        );
      } finally {
        setUserLoading(false);
      }
    }

    fetchUserOverview();
  }, [webApp, functionsBaseUrl, userReloadToken, user, userSelectedCycle]);

  useEffect(() => {
    async function fetchAdminAccessRequests() {
      if (
        !isAdmin ||
        activePanel !== "admin" ||
        adminPage !== "requests" ||
        !webApp?.initData
      ) {
        setAdminAccessRequests([]);
        return;
      }

      setAdminAccessRequestsLoading(true);
      setAdminAccessRequestsError(null);
      try {
        const headers: HeadersInit = {
          "x-telegram-init-data": webApp?.initData ?? "",
        };

        const statusQuery =
          adminAccessRequestsFilter === "all"
            ? ""
            : `status=${encodeURIComponent(adminAccessRequestsFilter)}&`;
        const resp = await fetch(
          `${functionsBaseUrl}/adminListAccessRequests?${statusQuery}limit=50`,
          { headers },
        );

        let data: any = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }

        if (!resp.ok) {
          setAdminAccessRequests([]);
          setAdminAccessRequestsError(
            data?.error || "Erro ao carregar solicitações pendentes.",
          );
          return;
        }

        const items = Array.isArray(data?.items) ? data.items : [];
        setAdminAccessRequests(items);
      } catch (err: any) {
        console.error("Erro ao carregar solicitações pendentes", err);
        setAdminAccessRequests([]);
        setAdminAccessRequestsError(
          err?.message || "Erro ao carregar solicitações pendentes.",
        );
      } finally {
        setAdminAccessRequestsLoading(false);
      }
    }

    fetchAdminAccessRequests();
  }, [
    isAdmin,
    activePanel,
    adminPage,
    webApp,
    functionsBaseUrl,
    adminAccessRequestsReloadToken,
    adminAccessRequestsFilter,
  ]);

  useEffect(() => {
    async function fetchAdminInvoiceRequests() {
      if (
        !isAdmin ||
        activePanel !== "admin" ||
        adminPage !== "workspace" ||
        adminActiveTab !== "faturas" ||
        !webApp?.initData
      ) {
        setAdminInvoiceRequests([]);
        return;
      }

      setAdminInvoiceRequestsLoading(true);
      setAdminInvoiceRequestsError(null);
      setAdminInvoiceRequestsMessage(null);
      try {
        const headers: HeadersInit = {
          "x-telegram-init-data": webApp?.initData ?? "",
        };
        const resp = await fetch(
          `${functionsBaseUrl}/adminListInvoiceRequests?status=pending&limit=50`,
          { headers },
        );

        let data: any = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }

        if (!resp.ok) {
          setAdminInvoiceRequests([]);
          setAdminInvoiceRequestsError(
            data?.error || "Erro ao carregar solicitações de fatura.",
          );
          return;
        }

        const items = Array.isArray(data?.items) ? data.items : [];
        setAdminInvoiceRequests(items);
      } catch (err: any) {
        console.error("Erro ao carregar solicitações de fatura", err);
        setAdminInvoiceRequests([]);
        setAdminInvoiceRequestsError(
          err?.message || "Erro ao carregar solicitações de fatura.",
        );
      } finally {
        setAdminInvoiceRequestsLoading(false);
      }
    }

    fetchAdminInvoiceRequests();
  }, [
    isAdmin,
    activePanel,
    adminPage,
    adminActiveTab,
    webApp,
    functionsBaseUrl,
    adminInvoiceRequestsReloadToken,
  ]);

  useEffect(() => {
    async function fetchUserPrevTotals() {
      if (!webApp?.initData) {
        setUserPrevTotals(null);
        return;
      }

      if (!userOverview || userOverview.autorizado === false) {
        setUserPrevTotals(null);
        return;
      }

      const mesRef = userOverview.mes_ref;
      const anoRef = userOverview.ano_ref;
      if (!mesRef || !anoRef) {
        setUserPrevTotals(null);
        return;
      }

      let prevMes = mesRef - 1;
      let prevAno = anoRef;
      if (prevMes < 1) {
        prevMes = 12;
        prevAno -= 1;
      }

      if (prevAno < 2000) {
        setUserPrevTotals(null);
        return;
      }

      try {
        const headers: HeadersInit = {
          "x-telegram-init-data": webApp?.initData ?? "",
        };
        const urlPrev = withAdminTargetUrl(
          `${functionsBaseUrl}/userGetOverview?mes=${prevMes}&ano=${prevAno}`,
        );
        const respPrev = await fetch(urlPrev, { headers });

        if (!respPrev.ok) {
          setUserPrevTotals(null);
          return;
        }

        let dataPrev: any = null;
        try {
          dataPrev = await respPrev.json();
        } catch {
          dataPrev = null;
        }

        const prev = dataPrev?.extrato_atual?.totais ?? null;

        setUserPrevTotals(prev);
      } catch (err) {
        console.error("Erro ao carregar totais do ciclo anterior", err);
        setUserPrevTotals(null);
      }
    }

    fetchUserPrevTotals();
  }, [webApp, functionsBaseUrl, userOverview]);

  useEffect(() => {
    async function fetchUserBillingCycles() {
      // Otimização: ciclos agora vêm no `userBootstrap`.
      return;
    }

    fetchUserBillingCycles();
  }, [webApp, functionsBaseUrl, userReloadToken]);

  useEffect(() => {
    async function fetchResumo() {
      if (!selectedCycle || !webApp?.initData || !targetUserId) {
        setCycleSummary(null);
        return;
      }

      setSummaryLoading(true);
      try {
        const [mesStr, anoStr] = selectedCycle.split("/");
        const mes = Number.parseInt(mesStr, 10);
        const ano = Number.parseInt(anoStr, 10);
        if (!Number.isFinite(mes) || !Number.isFinite(ano)) {
          setCycleSummary(null);
          return;
        }

        const headers: HeadersInit = {
          "x-telegram-init-data": webApp?.initData ?? "",
        };

        const resp = await fetch(
          `${functionsBaseUrl}/adminResumoFatura?userId=${encodeURIComponent(
            targetUserId.trim(),
          )}&mes=${mes}&ano=${ano}`,
          { headers },
        );

        if (!resp.ok) {
          setCycleSummary(null);
          return;
        }

        const data = await resp.json();
        const totais = data?.totais || {};
        const saldoAcumulado = Number(
          (totais.saldo_acumulado ?? totais.saldo_mes) || 0,
        );
        setCycleSummary({
          parcelas_mes: Number(totais.parcelas_mes || 0),
          pagamentos_mes: Number(totais.pagamentos_mes || 0),
          saldo_mes: Number(totais.saldo_mes || 0),
          saldo_acumulado: saldoAcumulado,
          saldo_acumulado_bruto: Number(
            (totais.saldo_acumulado_bruto ?? saldoAcumulado) || 0,
          ),
          saldo_quitado_ate_base: Number(totais.saldo_quitado_ate_base || 0),
          base_mes: Number(totais.base_mes || 0),
          base_ano: Number(totais.base_ano || 0),
        });
      } catch (err) {
        console.error("Erro ao carregar resumo de fatura", err);
        setCycleSummary(null);
      } finally {
        setSummaryLoading(false);
      }
    }

    fetchResumo();
  }, [
    selectedCycle,
    webApp,
    targetUserId,
    functionsBaseUrl,
    summaryReloadToken,
  ]);

  async function handleTargetUserChange(value: string) {
    setTargetUserId(value);
    setError(null);
    setActionMessage(null);
    setUserDetails(null);

    const term = value.trim();

    const initData = getTelegramInitData(webApp);
    if (!initData) {
      setUserSuggestions([]);
      return;
    }

    try {
      const headers: HeadersInit = {
        "x-telegram-init-data": initData,
      };

      const resp = await fetch(
        withInitDataQuery(
          `${functionsBaseUrl}/adminSearchUsuarios?q=${encodeURIComponent(term)}`,
          initData,
        ),
        { headers },
      );

      if (!resp.ok) {
        setUserSuggestions([]);
        return;
      }

      const data = await resp.json();
      const results = Array.isArray(data.results) ? data.results : [];

      setUserSuggestions(
        results.map((u: any) => ({
          id: String(u.id),
          name: String(u.name || ""),
          username: u.username ?? null,
        })),
      );
    } catch (err) {
      console.error("Erro ao buscar usuários", err);
      setUserSuggestions([]);
    }
  }

  async function loadAdminAllUsers(opts?: { reset?: boolean }) {
    const reset = Boolean(opts?.reset);
    const initData = getTelegramInitData(webApp);
    if (!initData) {
      setAdminAllUsersError(
        "Abra este painel dentro do Telegram para carregar a lista real de usuários.",
      );
      return;
    }
    if (!reset && !adminAllUsersHasMore) {
      return;
    }

    const cursorToUse = reset ? null : adminAllUsersCursor;

    setAdminAllUsersLoading(true);
    setAdminAllUsersError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "120");
      if (cursorToUse) {
        params.set("cursor", cursorToUse);
      }

      const resp = await fetch(
        withInitDataQuery(
          `${functionsBaseUrl}/adminListUsuarios?${params.toString()}`,
          initData,
        ),
        {
          headers: {
            "x-telegram-init-data": initData,
          },
        },
      );

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        if (resp.status === 401 || resp.status === 403) {
          setTelegramContextWarning(
            "Sessão do Telegram inválida ou expirada. Reabra o Mini App pelo bot.",
          );
        }
        throw new Error(
          normalizeApiErrorMessage(
            body,
            `Erro ao listar usuários (HTTP ${resp.status}).`,
          ),
        );
      }

      const data = await resp.json().catch(() => null);
      const items = Array.isArray(data?.items) ? data.items : [];
      const parsed = items.map((u: any) => ({
        id: String(u?.id || ""),
        name: String(u?.name || ""),
        username: u?.username ?? null,
        ativo: u?.ativo !== false,
        autorizado: u?.autorizado === true,
      }));

      setAdminAllUsers((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((u) => u.id));
        const merged = [...base];
        parsed.forEach((u: {
          id: string;
          name: string;
          username: string | null;
          ativo: boolean;
          autorizado: boolean;
        }) => {
          if (!u.id || seen.has(u.id)) {
            return;
          }
          seen.add(u.id);
          merged.push(u);
        });
        return merged;
      });

      const nextCursorRaw = data?.nextCursor;
      const nextCursor =
        typeof nextCursorRaw === "string" && nextCursorRaw.trim()
          ? nextCursorRaw.trim()
          : null;
      setAdminAllUsersCursor(nextCursor);
      setAdminAllUsersHasMore(Boolean(nextCursor));
    } catch (err: any) {
      console.error("Erro ao carregar lista de usuários", err);
      setAdminAllUsersError(
        normalizeApiErrorMessage(err?.message, "Erro ao carregar usuários."),
      );
    } finally {
      setAdminAllUsersLoading(false);
    }
  }

  useEffect(() => {
    if (
      !isAdmin ||
      activePanel !== "admin" ||
      adminPage !== "workspace" ||
      !webApp?.initData
    ) {
      return;
    }
    if (adminAllUsers.length > 0 || adminAllUsersLoading) {
      return;
    }
    void loadAdminAllUsers({ reset: true });
  }, [isAdmin, activePanel, adminPage, webApp?.initData]);

  function handleSelectUserSuggestion(userInfo: {
    id: string;
    name: string;
    username: string | null;
  }) {
    setTargetUserId(userInfo.id);
    setUserSuggestions([]);
  }

  async function handleSaveUsuario(event: React.FormEvent) {
    event.preventDefault();
    setError(null); // NOSONAR
    setUserActionMessage(null);

    const currentUserId = userDetails?.id;
    if (!currentUserId) {
      setError("Nenhum usuário carregado.");
      return;
    }

    if (!webApp?.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais.",
      );
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/adminUpdateUsuario`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify({
          userId: String(currentUserId),
          name: editUserName,
          username: editUserUsername.trim() || null,
          ativo: editUserAtivo,
          autorizado: editUserAutorizado,
          invoice_pdf_enabled: editUserInvoicePdfEnabled,
        }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setError(data?.error || "Erro ao atualizar usuário.");
        return;
      }

      setUserDetails((current) =>
        current
          ? {
              ...current,
              name: editUserName,
              username: editUserUsername.trim() || null,
              ativo: editUserAtivo,
              autorizado: editUserAutorizado,
              invoice_pdf_enabled: editUserInvoicePdfEnabled,
            }
          : current,
      );

      setUserActionMessage("Dados do usuário atualizados com sucesso.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro ao atualizar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdminSendMessage(event: React.FormEvent) {
    event.preventDefault(); // NOSONAR
    setError(null);
    setAdminMessageResult(null); // NOSONAR

    const currentUserId = userDetails?.id;
    if (!currentUserId) {
      setError("Nenhum usuário carregado.");
      return;
    }

    if (!webApp?.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais.",
      );
      return;
    }

    const message = adminMessageText.trim();
    if (!message) {
      setAdminMessageResult("Digite uma mensagem antes de enviar.");
      return;
    }

    setAdminMessageSending(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/adminSendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify({
          userId: String(currentUserId),
          message,
        }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setAdminMessageResult(
          data?.error || "Erro ao enviar mensagem para o usuário.",
        );
        return;
      }

      setAdminMessageText("");
      setAdminMessageResult("Mensagem enviada com sucesso via Telegram.");
    } catch (err: any) {
      console.error("Erro ao enviar mensagem", err);
      setAdminMessageResult(err?.message || "Erro ao enviar mensagem.");
    } finally {
      setAdminMessageSending(false);
    }
  }

  async function handleLoadData(event: React.FormEvent) {
    event.preventDefault();
    await loadAdminUserDataById(targetUserId);
  }

  function handleSelectGasto(g: any) {
    setSelectedGastoId(g.id);
    setEditGastoValorTotal(Number(g.valor_total || 0).toFixed(2));
    setEditGastoParcelas(String(g.parcelas_total || 1));
    setActionMessage(null);
    setError(null);
  }

  function handleSelectPagamento(p: any) {
    setSelectedPagamentoId(p.id);
    setEditPagamentoValor(Number(p.valor || 0).toFixed(2));
    setActionMessage(null);
    setError(null);
  }

  async function handleSaveGasto(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setActionMessage(null);

    if (!selectedGastoId) {
      setError("Selecione um gasto na lista.");
      return;
    }

    if (!webApp?.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais.",
      );
      return;
    }

    const body: any = {
      gastoId: selectedGastoId,
      novoValorTotal: editGastoValorTotal,
    };

    const parcelasLimpo = editGastoParcelas.trim();
    if (parcelasLimpo) {
      body.novasParcelas = parcelasLimpo;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/adminEditGasto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(body),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data?.error || "Erro ao editar gasto.");
        return;
      }

      setGastos((current) =>
        current.map((g) =>
          g.id === selectedGastoId
            ? {
                ...g,
                valor_total: data.valor_total,
                valor_parcela: data.valor_parcela,
                parcelas_total: data.parcelas_total,
              }
            : g,
        ),
      );

      setSummaryReloadToken((token) => token + 1);
      setActionMessage("Gasto atualizado com sucesso.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro ao editar gasto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGasto() {
    setError(null);
    setActionMessage(null);

    if (!selectedGastoId) {
      setError("Selecione um gasto na lista.");
      return;
    }

    if (!webApp?.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais.",
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja inativar este gasto?",
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/adminDelGasto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify({ gastoId: selectedGastoId }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data?.error || "Erro ao inativar gasto.");
        return;
      }

      setGastos((current) => current.filter((g) => g.id !== selectedGastoId));
      setSelectedGastoId(null);
      setEditGastoValorTotal("");
      setEditGastoParcelas("");

      setSummaryReloadToken((token) => token + 1);
      setActionMessage("Gasto inativado com sucesso.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro ao inativar gasto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePagamento(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setActionMessage(null);

    if (!selectedPagamentoId) {
      setError("Selecione um pagamento na lista.");
      return;
    }

    if (!webApp?.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais.",
      );
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/adminEditPagamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify({
          pagamentoId: selectedPagamentoId,
          novoValor: editPagamentoValor,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data?.error || "Erro ao editar pagamento.");
        return;
      }

      setPagamentos((current) =>
        current.map((p) =>
          p.id === selectedPagamentoId
            ? {
                ...p,
                valor: data.valor,
              }
            : p,
        ),
      );

      setSummaryReloadToken((token) => token + 1);
      setActionMessage("Pagamento atualizado com sucesso.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro ao editar pagamento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePagamento() {
    setError(null);
    setActionMessage(null);

    if (!selectedPagamentoId) {
      setError("Selecione um pagamento na lista.");
      return;
    }

    if (!webApp?.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais.",
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja cancelar este pagamento?",
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/adminDelPagamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify({ pagamentoId: selectedPagamentoId }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data?.error || "Erro ao cancelar pagamento.");
        return;
      }

      setPagamentos((current) =>
        current.filter((p) => p.id !== selectedPagamentoId),
      );
      setSelectedPagamentoId(null);
      setEditPagamentoValor("");

      setSummaryReloadToken((token) => token + 1);
      setActionMessage("Pagamento cancelado com sucesso.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro ao cancelar pagamento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUserRegistrarGasto(event: React.FormEvent) {
    event.preventDefault();
    setUserPanelError(null);
    setUserPanelMessage(null);

    if (!webApp?.initData) {
      setUserPanelError(
        "Este mini app deve ser aberto dentro do Telegram para registrar gastos de verdade.",
      );
      return;
    }

    const descricao = userGastoDescricao.trim();
    const categoria = userGastoCategoria.trim();
    const valorStr = userGastoValor.trim().replace(",", ".");
    const parcelasStr = userGastoParcelas.trim();

    if (!descricao) {
      setUserPanelError("Informe uma descrição para o gasto.");
      return;
    }

    if (!valorStr) {
      setUserPanelError("Informe o valor do gasto.");
      return;
    }

    const valorNum = Number(valorStr);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setUserPanelError("Valor do gasto inválido.");
      return;
    }

    let parcelas: number | null = null;
    if (parcelasStr) {
      const parsed = Number.parseInt(parcelasStr, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setUserPanelError("Quantidade de parcelas inválida.");
        return;
      }
      parcelas = parsed;
    }

    const body: any = {
      descricao,
      valor: valorStr,
    };
    if (categoria) {
      body.categoria = categoria;
    }
    if (parcelas !== null) {
      body.parcelas = parcelas;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/userRegistrarGasto`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(withAdminTargetBody(body)),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setUserPanelError(data?.error || "Erro ao registrar gasto.");
        return;
      }

      setUserPanelMessage("Gasto registrado com sucesso.");
      setUserGastoDescricao("");
      setUserGastoCategoria("");
      setUserGastoValor("");
      setUserGastoParcelas("");
      setUserActiveForm(null);
      setUserReloadToken((token) => token + 1);
      await refreshAdminTargetAfterMutation("lancamentos");
    } catch (err: any) {
      console.error("Erro ao registrar gasto", err);
      setUserPanelError(err?.message || "Erro ao registrar gasto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUserRegistrarPagamento(event: React.FormEvent) {
    event.preventDefault();
    setUserPanelError(null);
    setUserPanelMessage(null);

    if (!webApp?.initData) {
      setUserPanelError(
        "Este mini app deve ser aberto dentro do Telegram para registrar pagamentos de verdade.",
      );
      return;
    }

    const valorStr = userPagamentoValor.trim().replace(",", ".");
    const descricao = userPagamentoDescricao.trim();

    if (!valorStr) {
      setUserPanelError("Informe o valor do pagamento.");
      return;
    }

    const valorNum = Number(valorStr);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setUserPanelError("Valor do pagamento inválido.");
      return;
    }

    const body: any = {
      valor: valorStr,
    };
    if (descricao) {
      body.descricao = descricao;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/userRegistrarPagamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(withAdminTargetBody(body)),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setUserPanelError(data?.error || "Erro ao registrar pagamento.");
        return;
      }

      setUserPanelMessage("Pagamento registrado com sucesso.");
      setUserPagamentoValor("");
      setUserPagamentoDescricao("");
      setUserActiveForm(null);
      setUserReloadToken((token) => token + 1);
      await refreshAdminTargetAfterMutation("pagamentos");
    } catch (err: any) {
      console.error("Erro ao registrar pagamento", err);
      setUserPanelError(err?.message || "Erro ao registrar pagamento.");
    } finally {
      setSaving(false);
    }
  }

  const userSaldoAtual = Number(userOverview?.saldo_atual || 0);
  const userMesRef = userOverview?.mes_ref;
  const userAnoRef = userOverview?.ano_ref;
  const userTotais = userOverview?.extrato_atual?.totais ?? null;

  const userInvoiceFeatureEnabled =
    userOverview?.features?.invoice_pdf_request === true;

  const userInvoiceCycle = userSelectedCycle
    ? userSelectedCycle
    : userMesRef != null && userAnoRef != null
      ? `${String(userMesRef).padStart(2, "0")}/${String(userAnoRef)}`
      : null;
  const userInvoiceDownloadUrl = userInvoiceStatus?.download_url
    ? String(userInvoiceStatus.download_url)
    : null;

  async function fetchUserInvoiceStatus(cycle: string) {
    if (!cycle) {
      return null;
    }
    setUserInvoiceLoading(true);
    setUserInvoiceError(null);
    try {
      const resp = await fetch(
        withAdminTargetUrl(
          `${functionsBaseUrl}/userGetInvoiceStatus?cycle=${encodeURIComponent(
            cycle,
          )}`,
        ),
        {
          method: "GET",
          headers: {
            "x-telegram-init-data": webApp?.initData ?? "",
          },
        },
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        setUserInvoiceError(data?.error || "Erro ao carregar status.");
        return null;
      }
      setUserInvoiceStatus(data);
      return data;
    } catch (err: any) {
      console.error("Erro ao carregar status da invoice", err);
      setUserInvoiceError(err?.message || "Erro ao carregar status.");
      return null;
    } finally {
      setUserInvoiceLoading(false);
    }
  }

  async function handleUserRequestInvoicePdf() {
    setUserInvoiceError(null);
    setUserInvoiceMessage(null);
    if (!userInvoiceCycle) {
      setUserInvoiceError("Selecione um ciclo para solicitar a fatura.");
      return;
    }
    setUserInvoiceLoading(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/userRequestInvoicePdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp?.initData ?? "",
        },
        body: JSON.stringify(withAdminTargetBody({ cycle: userInvoiceCycle })),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        setUserInvoiceError(data?.error || "Erro ao solicitar fatura.");
        return;
      }
      setUserInvoiceMessage(
        data?.message ||
          "Aguarde, sua fatura está sendo preparada e ficará disponível para download.",
      );
      setUserInvoiceStatus(data);
      await fetchUserInvoiceStatus(userInvoiceCycle);
    } catch (err: any) {
      console.error("Erro ao solicitar invoice", err);
      setUserInvoiceError(err?.message || "Erro ao solicitar fatura.");
    } finally {
      setUserInvoiceLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: any = null;

    async function tick() {
      if (cancelled) return;
      if (!userInvoiceFeatureEnabled) return;
      if (!userInvoiceCycle) return;

      const statusResp = await fetchUserInvoiceStatus(userInvoiceCycle);

      if (cancelled) return;
      const status = String(statusResp?.status || "").toLowerCase();

      if (
        status === "pending" ||
        status === "uploading" ||
        status === "generating"
      ) {
        timer = setTimeout(tick, 6000);
      }
    }

    // Carrega status ao trocar de ciclo.
    if (userInvoiceFeatureEnabled && userInvoiceCycle) {
      tick();
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [userInvoiceFeatureEnabled, userInvoiceCycle]);

  const userSaldoMes = userTotais ? Number(userTotais.saldo_mes || 0) : 0;
  let userSaldoMesColor = "#e5e7eb";
  if (Number.isFinite(userSaldoMes) && Math.abs(userSaldoMes) >= 0.005) {
    userSaldoMesColor = userSaldoMes > 0 ? "#f97373" : "#4ade80";
  }

  const userSaldoGeral = userSaldoAtual;
  let userMainNumberColor = "#e5e7eb";
  let userMainNumberLabel: string;
  if (Number.isFinite(userSaldoGeral) && Math.abs(userSaldoGeral) >= 0.005) {
    if (userSaldoGeral > 0) {
      userMainNumberColor = "#f97373";
      userMainNumberLabel = "Quanto falta pagar até este ciclo";
    } else {
      userMainNumberColor = "#4ade80";
      userMainNumberLabel = "Crédito acumulado até este ciclo";
    }
  } else {
    userMainNumberLabel = "Nenhum valor a pagar até este ciclo";
  }

  let userComparativoTexto: string | null = null;
  if (userTotais && userPrevTotals) {
    const atualGastos = Number(userTotais.parcelas_mes || 0);
    const prevGastos = Number(userPrevTotals.parcelas_mes || 0);
    const diffGastos = atualGastos - prevGastos;
    if (Number.isFinite(diffGastos)) {
      if (Math.abs(diffGastos) < 0.005) {
        userComparativoTexto =
          "Neste ciclo você gastou o mesmo que no ciclo anterior.";
      } else if (diffGastos > 0) {
        userComparativoTexto = `Neste ciclo você gastou ${formatCurrencyBRL(
          Math.abs(diffGastos),
        )} a mais do que no ciclo anterior.`;
      } else {
        userComparativoTexto = `Neste ciclo você gastou ${formatCurrencyBRL(
          Math.abs(diffGastos),
        )} a menos do que no ciclo anterior.`;
      }
    }
  }

  const userExtratoItens: any[] = Array.isArray(userOverview?.extrato_atual?.itens)
    ? userOverview.extrato_atual.itens
    : [];

  const userCategoriasResumo = (() => {
    const totals: Record<string, number> = {};
    for (const item of userExtratoItens) {
      const tipoLower = String(item?.tipo || "").toLowerCase();
      const isPagamento =
        tipoLower === "pagamento" || tipoLower === "pagamentos";
      if (isPagamento) {
        continue;
      }
      const valor = Number(item?.valor || 0);
      if (!Number.isFinite(valor) || valor <= 0) {
        continue;
      }
      const categoria =
        String(item?.meta?.categoria || "").trim() || "Sem categoria";
      totals[categoria] = (totals[categoria] || 0) + valor;
    }
    const entries = Object.entries(totals);
    entries.sort((a, b) => b[1] - a[1]);
    return entries;
  })();
  const userExtratoFilteredItens = userExtratoItens.filter((item: any) => {
    if (userExtratoFilter === "all") {
      return true;
    }
    const tipo = String(item?.tipo || "").toLowerCase();
    if (userExtratoFilter === "pagamentos") {
      return tipo === "pagamento" || tipo === "pagamentos";
    }
    return (
      tipo === "parcela" ||
      tipo === "gasto" ||
      tipo === "gastos" ||
      tipo === "compra"
    );
  });

  const userExtratoHasItens = userExtratoFilteredItens.length > 0;
  const userExtratoItensToShow = userShowAllExtrato
    ? userExtratoFilteredItens
    : userExtratoFilteredItens.slice(0, 10);

  let userExtratoTitulo = "Últimos lançamentos do ciclo atual";
  if (userExtratoFilter === "gastos") {
    userExtratoTitulo = "Últimos gastos/parcelas do ciclo atual";
  } else if (userExtratoFilter === "pagamentos") {
    userExtratoTitulo = "Últimos pagamentos do ciclo atual";
  }

  if (userShowAllExtrato) {
    if (userExtratoFilter === "gastos") {
      userExtratoTitulo = "Todos os gastos/parcelas do ciclo atual";
    } else if (userExtratoFilter === "pagamentos") {
      userExtratoTitulo = "Todos os pagamentos do ciclo atual";
    } else {
      userExtratoTitulo = "Todos os lançamentos do ciclo atual";
    }
  }

  const hasSelectedCycle = selectedCycle !== null;

  const filteredGastos = hasSelectedCycle
    ? gastos.filter((g) => gastoPertenceAoCiclo(g, selectedCycle))
    : gastos;

  const filteredPagamentos = hasSelectedCycle
    ? pagamentos.filter(
        (p) => getCycleFromIsoDate(p.data_pagamento) === selectedCycle,
      )
    : pagamentos;

  const userPageMeta = (() => {
    if (userPage === "recorrentes") {
      return {
        title: "Gastos recorrentes",
        subtitle: "Cadastre e mantenha modelos automáticos para os próximos ciclos.",
      };
    }
    if (userPage === "gastos") {
      return {
        title: "Meus gastos",
        subtitle: "Revise e edite os lançamentos de gasto do ciclo selecionado.",
      };
    }
    if (userPage === "pagamentos") {
      return {
        title: "Meus pagamentos",
        subtitle: "Acompanhe e ajuste os pagamentos usados para abater o saldo.",
      };
    }
    if (userPage === "extrato") {
      return {
        title: "Extrato do ciclo",
        subtitle: "Visualização consolidada de gastos e pagamentos no mesmo lugar.",
      };
    }
    return {
      title: "Resumo do seu cartão",
      subtitle: "Veja rapidamente saldo, alertas e ações mais importantes.",
    };
  })();

  const userPageItemsCount = (() => {
    if (userPage === "recorrentes") {
      return `${userRecurringGastos.length} recorrente(s)`;
    }
    if (userPage === "gastos") {
      return `${userGastosList.length} gasto(s)`;
    }
    if (userPage === "pagamentos") {
      return `${userPagamentosList.length} pagamento(s)`;
    }
    if (userPage === "extrato") {
      return `${userExtratoFilteredItens.length} item(ns)`;
    }
    return userInvoiceFeatureEnabled
      ? `Fatura: ${String(userInvoiceStatus?.status ?? "none")}`
      : "Fatura PDF desabilitada";
  })();

  const adminPageMeta = (() => {
    if (adminPage === "workspace") {
      return {
        title: "Operação de usuário",
        subtitle: "Acesse cadastro, fatura, gastos e pagamentos do usuário selecionado.",
      };
    }
    if (adminPage === "system") {
      return {
        title: "Sistema",
        subtitle: "Versões, changelog e checagens de sincronização do ambiente.",
      };
    }
    return {
      title: "Solicitações",
      subtitle: "Aprove pedidos de acesso e abra usuários com menos cliques.",
    };
  })();

  const adminPendingRequestsCount = adminAccessRequests.filter((item: any) => {
    return String(item?.status || "").toLowerCase() === "pending";
  }).length;

  const adminActiveTabLabel = (() => {
    if (adminActiveTab === "overview") return "Visão geral";
    if (adminActiveTab === "lancamentos") return "Lançamentos";
    if (adminActiveTab === "pagamentos") return "Pagamentos";
    if (adminActiveTab === "faturas") return "Faturas";
    return "Sistema";
  })();

  const showLoadingOverlay = loading || saving || summaryLoading || userLoading;
  let loadingMessage = "Carregando informações da sua conta...";
  if (summaryLoading) {
    loadingMessage = "Carregando resumo da fatura...";
  }
  if (loading) {
    loadingMessage = "Carregando dados...";
  }
  if (saving) {
    loadingMessage = "Salvando alterações...";
  }

  return (
    <div className="app">
      <div className="card app-shell">
        {telegramContextWarning && (
          <div className="warning">{telegramContextWarning}</div>
        )}
        {actionMessage && <div className="success">{actionMessage}</div>}

        {showLoadingOverlay && (
          <div className="loading-overlay">
            <div className="loading-box">
              <div className="loading-spinner" />
              <div>{loadingMessage}</div>
            </div>
          </div>
        )}

        {userActiveForm === "edit_gasto" && selectedUserGasto && (
          <div className="modal-overlay">
            <div className="modal-card">
              <section>
                <strong>Editar gasto</strong>
                <form onSubmit={handleUserSaveGastoEdit} className="form">
                  <div>ID: {selectedUserGasto.id}</div>
                  <label>
                    <span>Descrição:</span>{" "}
                    <input
                      type="text"
                      value={userEditGastoDescricao}
                      onChange={(e) =>
                        setUserEditGastoDescricao(e.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Categoria:</span>{" "}
                    <input
                      type="text"
                      value={userEditGastoCategoria}
                      onChange={(e) =>
                        setUserEditGastoCategoria(e.target.value)
                      }
                      placeholder="Ex: alimentação, transporte"
                    />
                  </label>
                  <label>
                    <span>Valor total (R$):</span>{" "}
                    <input
                      type="text"
                      value={userEditGastoValor}
                      onChange={(e) => setUserEditGastoValor(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Parcelas (opcional):</span>{" "}
                    <input
                      type="text"
                      value={userEditGastoParcelas}
                      onChange={(e) => setUserEditGastoParcelas(e.target.value)}
                      placeholder="Deixe em branco para pagamento à vista"
                    />
                  </label>
                  {userLancamentosError && (
                    <div className="error mt-2">{userLancamentosError}</div>
                  )}
                  <div className="button-row mt-2">
                    <button type="submit" disabled={saving}>
                      {saving ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleUserCancelGasto}
                    >
                      Cancelar gasto
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setSelectedUserGasto(null);
                        setUserActiveForm(null);
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        )}

        {userActiveForm === "edit_pagamento" && selectedUserPagamento && (
          <div className="modal-overlay">
            <div className="modal-card">
              <section>
                <strong>Editar pagamento</strong>
                <form onSubmit={handleUserSavePagamentoEdit} className="form">
                  <div>ID: {selectedUserPagamento.id}</div>
                  <label>
                    <span>Descrição:</span>{" "}
                    <input
                      type="text"
                      value={userEditPagamentoDescricao}
                      onChange={(e) =>
                        setUserEditPagamentoDescricao(e.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Valor (R$):</span>{" "}
                    <input
                      type="text"
                      value={userEditPagamentoValor}
                      onChange={(e) =>
                        setUserEditPagamentoValor(e.target.value)
                      }
                    />
                  </label>
                  {userLancamentosError && (
                    <div className="error mt-2">{userLancamentosError}</div>
                  )}
                  <div className="button-row mt-2">
                    <button type="submit" disabled={saving}>
                      {saving ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleUserCancelPagamento}
                    >
                      Cancelar pagamento
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setSelectedUserPagamento(null);
                        setUserActiveForm(null);
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        )}

        {userActiveForm === "recorrente" && (
          <div className="modal-overlay">
            <div className="modal-card">
              <section>
                <strong>
                  {selectedRecurringId
                    ? "Editar gasto recorrente"
                    : "Novo gasto recorrente"}
                </strong>
                <p className="section-subtitle">
                  Esse gasto será adicionado automaticamente nos ciclos futuros.
                </p>
                <form onSubmit={handleSaveRecurringGasto} className="form">
                  {selectedRecurringId && <div>ID: {selectedRecurringId}</div>}
                  <label>
                    <span>Descrição:</span>{" "}
                    <input
                      type="text"
                      value={recurringDescricao}
                      onChange={(e) => setRecurringDescricao(e.target.value)}
                      placeholder="Ex: academia"
                    />
                  </label>
                  <label>
                    <span>Categoria:</span>{" "}
                    <input
                      type="text"
                      value={recurringCategoria}
                      onChange={(e) => setRecurringCategoria(e.target.value)}
                      placeholder="Ex: saúde"
                    />
                  </label>
                  <label>
                    <span>Valor (R$):</span>{" "}
                    <input
                      type="text"
                      value={recurringValor}
                      onChange={(e) => setRecurringValor(e.target.value)}
                      placeholder="Ex: 120,00"
                    />
                  </label>
                  {userRecurringError && (
                    <div className="error mt-2">{userRecurringError}</div>
                  )}
                  <div className="button-row mt-2">
                    <button type="submit" disabled={saving}>
                      {saving ? "Salvando..." : "Salvar"}
                    </button>
                    {selectedRecurringId && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleDeleteRecurringGasto}
                      >
                        Desativar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setSelectedRecurringId(null);
                        setRecurringDescricao("");
                        setRecurringValor("");
                        setRecurringCategoria("");
                        setUserActiveForm(null);
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        )}

        {userActiveForm === "gasto" && (
          <div className="modal-overlay">
            <div className="modal-card">
              <section>
                <strong>Registrar novo gasto</strong>
                <p className="section-subtitle">
                  Informe os dados do novo gasto que será considerado na fatura
                  do seu cartão.
                </p>
                <form onSubmit={handleUserRegistrarGasto} className="form">
                  <label>
                    <span>Descrição do gasto:</span>{" "}
                    <input
                      type="text"
                      value={userGastoDescricao}
                      onChange={(e) => setUserGastoDescricao(e.target.value)}
                      placeholder="Ex: mercado, assinatura, restaurante"
                    />
                  </label>
                  <label>
                    <span>Categoria:</span>{" "}
                    <input
                      type="text"
                      value={userGastoCategoria}
                      onChange={(e) => setUserGastoCategoria(e.target.value)}
                      placeholder="Ex: alimentação"
                    />
                  </label>
                  <label>
                    <span>Valor total (R$):</span>{" "}
                    <input
                      type="text"
                      value={userGastoValor}
                      onChange={(e) => setUserGastoValor(e.target.value)}
                      placeholder="Ex: 150,00"
                    />
                  </label>
                  <label>
                    <span>Parcelas (opcional):</span>{" "}
                    <input
                      type="text"
                      value={userGastoParcelas}
                      onChange={(e) => setUserGastoParcelas(e.target.value)}
                      placeholder="Deixe em branco para pagamento à vista"
                    />
                  </label>
                  <div className="button-row">
                    <button type="submit" disabled={saving}>
                      {saving ? "Registrando..." : "Salvar gasto"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setUserActiveForm(null)}
                    >
                      Fechar
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        )}

        {userActiveForm === "pagamento" && (
          <div className="modal-overlay">
            <div className="modal-card">
              <section>
                <strong>Registrar novo pagamento</strong>
                <p className="section-subtitle">
                  Registre um pagamento que será abatido do saldo da sua fatura.
                </p>
                <form onSubmit={handleUserRegistrarPagamento} className="form">
                  <label>
                    <span>Valor do pagamento (R$):</span>{" "}
                    <input
                      type="text"
                      value={userPagamentoValor}
                      onChange={(e) => setUserPagamentoValor(e.target.value)}
                      placeholder="Ex: 500,00"
                    />
                  </label>
                  <label>
                    <span>Descrição (opcional):</span>{" "}
                    <input
                      type="text"
                      value={userPagamentoDescricao}
                      onChange={(e) =>
                        setUserPagamentoDescricao(e.target.value)
                      }
                      placeholder="Ex: pagamento da fatura de novembro"
                    />
                  </label>
                  <div className="button-row">
                    <button type="submit" disabled={saving}>
                      {saving ? "Registrando..." : "Salvar pagamento"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setUserActiveForm(null)}
                    >
                      Fechar
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        )}

        {isAdmin && selectedGastoId && (
          <div className="modal-overlay">
            <div className="modal-card">
              <section>
                <strong>Editar gasto selecionado</strong>
                <form onSubmit={handleSaveGasto} className="form">
                  <div>ID: {selectedGastoId}</div>
                  <label>
                    <span>Novo valor total (R$):</span>{" "}
                    <input
                      type="text"
                      value={editGastoValorTotal}
                      onChange={(e) => setEditGastoValorTotal(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Novas parcelas (opcional):</span>{" "}
                    <input
                      type="text"
                      value={editGastoParcelas}
                      onChange={(e) => setEditGastoParcelas(e.target.value)}
                    />
                  </label>
                  <div className="button-row">
                    <button type="submit" disabled={saving}>
                      {saving ? "Salvando..." : "Salvar alterações"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDeleteGasto}
                    >
                      Inativar gasto
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setSelectedGastoId(null);
                        setEditGastoValorTotal("");
                        setEditGastoParcelas("");
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        )}

        {infoDialog && (
          <div className="modal-overlay">
            <div className="modal-card">
              {infoDialog === "saldo_ciclo" && (
                <>
                  <h2 className="modal-title">Saldo do período</h2>
                  <p>
                    Considera apenas a fatura selecionada: parcelas/gastos do
                    ciclo menos pagamentos do ciclo.
                  </p>
                </>
              )}
              {infoDialog === "saldo_acumulado" && (
                <>
                  <h2 className="modal-title">Saldo acumulado</h2>
                  {(() => {
                    let ctxTotais: any = null;
                    if (cycleSummary) {
                      ctxTotais = {
                        saldo_mes: cycleSummary.saldo_mes,
                        saldo_acumulado: cycleSummary.saldo_acumulado,
                      };
                    } else if (userTotais) {
                      ctxTotais = {
                        saldo_mes: Number(userTotais.saldo_mes || 0),
                        saldo_acumulado: Number(
                          (userTotais.saldo_acumulado ?? userSaldoAtual) || 0,
                        ),
                      };
                    }

                    if (!ctxTotais) {
                      return (
                        <p>
                          Considera o saldo total do cartão até o ciclo
                          selecionado.
                        </p>
                      );
                    }

                    const saldoMes = Number(ctxTotais.saldo_mes || 0);
                    const saldoAcumulado = Number(
                      ctxTotais.saldo_acumulado || 0,
                    );
                    const carryOver = Number(
                      (saldoAcumulado - saldoMes).toFixed(2),
                    );

                    let saldoMesColor = "#e5e7eb";
                    if (
                      Number.isFinite(saldoMes) &&
                      Math.abs(saldoMes) >= 0.005
                    ) {
                      saldoMesColor = saldoMes > 0 ? "#f97373" : "#4ade80";
                    }

                    let carryColor = "#9ca3af";
                    if (
                      Number.isFinite(carryOver) &&
                      Math.abs(carryOver) >= 0.005
                    ) {
                      carryColor = carryOver > 0 ? "#f97373" : "#4ade80";
                    }

                    const totalInfo = getSaldoAcumuladoInfo(saldoAcumulado);

                    return (
                      <>
                        <p>
                          O <strong>saldo acumulado</strong> é o total a pagar
                          (ou crédito) considerando o histórico até o ciclo
                          selecionado.
                        </p>

                        <div className="subcard">
                          <div className="subcard-title">Decomposição</div>
                          <div className="resumo-fatura-linha">
                            <span className="resumo-fatura-label">
                              Saldo deste ciclo
                            </span>
                            <span
                              className="resumo-fatura-valor"
                              style={{ color: saldoMesColor }}
                            >
                              {formatCurrencyBRL(saldoMes)}
                            </span>
                          </div>

                          {Number.isFinite(carryOver) &&
                            Math.abs(carryOver) >= 0.005 && (
                              <div className="resumo-fatura-linha">
                                <span className="resumo-fatura-label">
                                  Saldo vindo de ciclos anteriores
                                </span>
                                <span
                                  className="resumo-fatura-valor"
                                  style={{ color: carryColor }}
                                >
                                  {formatCurrencyBRL(carryOver)}
                                </span>
                              </div>
                            )}

                          <div className="resumo-fatura-linha resumo-fatura-acumulado">
                            <span
                              className="resumo-fatura-label"
                              style={{ color: totalInfo.color }}
                            >
                              {totalInfo.label}
                            </span>
                            <span
                              className="resumo-fatura-valor"
                              style={{ color: totalInfo.color }}
                            >
                              {formatCurrencyBRL(saldoAcumulado)}
                            </span>
                          </div>
                        </div>

                        <p className="section-subtitle">
                          Exemplo: se você gastou R$ 1.359,69 neste ciclo, mas o
                          saldo acumulado é R$ 1.427,83, então R$ 68,14 vem de
                          ciclos anteriores.
                        </p>
                      </>
                    );
                  })()}
                </>
              )}
              <div className="modal-footer">
                <button type="button" onClick={() => setInfoDialog(null)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {isAdmin && selectedPagamentoId && (
          <div className="modal-overlay">
            <div className="modal-card">
              <section>
                <strong>Editar pagamento selecionado</strong>
                <form onSubmit={handleSavePagamento} className="form">
                  <div>ID: {selectedPagamentoId}</div>
                  <label>
                    <span>Novo valor (R$):</span>{" "}
                    <input
                      type="text"
                      value={editPagamentoValor}
                      onChange={(e) => setEditPagamentoValor(e.target.value)}
                    />
                  </label>
                  <div className="button-row">
                    <button type="submit" disabled={saving}>
                      {saving ? "Salvando..." : "Salvar alterações"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDeletePagamento}
                    >
                      Cancelar pagamento
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setSelectedPagamentoId(null);
                        setEditPagamentoValor("");
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        )}

        <div className="card-header">
          <div className="app-header-row">
            <div className="app-brand">
              <h1 className="app-title">Lobo Card</h1>
              <div className="app-subtitle">
                Painel financeiro no Telegram
              </div>
            </div>
            <div className="app-header-badges">
              <span className="app-role-badge">
                {isAdmin ? "Admin" : "Usuário"}
              </span>
              <span className="app-version-badge">v{APP_VERSION}</span>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="app-nav">
            <button
              type="button"
              className={
                "app-nav-button" +
                (activePanel === "user" ? " app-nav-button--active" : "")
              }
              onClick={() => {
                setActivePanel("user");
                setUserPage("overview");
              }}
            >
              Meu cartão
            </button>
            <button
              type="button"
              className={
                "app-nav-button" +
                (activePanel === "admin" ? " app-nav-button--active" : "")
              }
              onClick={() => {
                setActivePanel("admin");
                setAdminPage("requests");
              }}
            >
              Painel admin
            </button>
          </div>
        )}

        <section className="card-section card-section--identity">
          <strong>{isAdmin ? "Admin conectado" : "Usuário conectado"}</strong>
          <div className="identity-grid">
            {user ? (
              <>
                <div className="identity-item">ID: {user.id}</div>
                <div className="identity-item">Nome: {user.first_name}</div>
                <div className="identity-item">Username: {user.username ? `@${user.username}` : "-"}</div>
              </>
            ) : (
              <div className="identity-item">Usuário não identificado pelo Telegram WebApp.</div>
            )}
          </div>
        </section>

        {(!isAdmin || activePanel === "user") && (
          <section className="card-section">
            <SectionHeader
              title="Resumo do seu cartão"
              subtitle="Veja seu saldo, lançamentos recentes e registre novos gastos e pagamentos."
            />

            {userBillingCycles.length > 0 && (
              <div className="user-cycle-select">
                <BillingCycleSelect
                  value={userSelectedCycle || ""}
                  options={userBillingCycles}
                  onChange={(next) => setUserSelectedCycle(next || null)}
                />
                <div className="button-row mt-1">
                  <button
                    type="button"
                    className="button--sm button--ghost"
                    disabled={userLoading || saving}
                    onClick={() => {
                      clearUserOverviewCacheForCycle(userSelectedCycle);
                      setUserReloadToken((t) => t + 1);
                      setUserRecurringReloadToken((t) => t + 1);
                    }}
                  >
                    Atualizar
                  </button>
                </div>
              </div>
            )}

            {userPanelError && (
              <div className="error mt-2">{userPanelError}</div>
            )}
            {userPanelMessage && (
              <div className="success mt-2">{userPanelMessage}</div>
            )}

            {userOverview?.autorizado === false ? (
              <div className="subcard">
                <div className="section-title">Acesso ainda não liberado</div>
                <p className="section-subtitle section-subtitle--tight">
                  {userOverview?.error
                    ? String(userOverview.error)
                    : "Seu acesso ainda não foi liberado para este mini app."}
                </p>

                {(() => {
                  const solicit = userOverview?.solicitacao_acesso;
                  if (!solicit) {
                    return null;
                  }
                  const status = String(solicit?.status || "").toLowerCase();
                  if (!status) {
                    return null;
                  }

                  if (status === "approved") {
                    return (
                      <div className="admin-access-request">
                        <div className="admin-status--approved">
                          Solicitação aprovada
                        </div>
                        <div className="admin-access-meta">
                          {solicit?.aprovado_em
                            ? `Aprovado em ${formatDateTime(solicit.aprovado_em)}`
                            : ""}
                        </div>
                      </div>
                    );
                  }

                  if (status === "pending") {
                    return (
                      <div className="admin-access-request">
                        <div className="admin-status--pending">
                          Solicitação pendente
                        </div>
                        <div className="admin-access-meta">
                          {solicit?.solicitado_em
                            ? `Solicitado em ${formatDateTime(
                                solicit.solicitado_em,
                              )}`
                            : ""}
                        </div>
                      </div>
                    );
                  }

                  return null;
                })()}

                <div className="button-row mt-2">
                  <button
                    type="button"
                    disabled={(() => {
                      const status = String(
                        userOverview?.solicitacao_acesso?.status || "",
                      ).toLowerCase();
                      return userRequestingAccess || status === "pending";
                    })()}
                    onClick={handleUserRequestAccess}
                  >
                    {(() => {
                      const status = String(
                        userOverview?.solicitacao_acesso?.status || "",
                      ).toLowerCase();
                      if (userRequestingAccess) {
                        return "Enviando pedido...";
                      }
                      if (status === "pending") {
                        return "Pedido já enviado";
                      }
                      return "Pedir liberação de acesso";
                    })()}
                  </button>
                  <button
                    type="button"
                    className="button--sm button--ghost"
                    disabled={userLoading || saving}
                    onClick={() => {
                      clearUserOverviewCacheForCycle(userSelectedCycle);
                      setUserReloadToken((t) => t + 1);
                    }}
                  >
                    Atualizar status
                  </button>
                </div>
                <p className="muted-text muted-text--sm mt-1">
                  Assim que um administrador aprovar, feche e abra o mini app
                  novamente.
                </p>
              </div>
            ) : (
              <>
                <div className="page-hero">
                  <div className="page-hero-title">{userPageMeta.title}</div>
                  <div className="page-hero-subtitle">{userPageMeta.subtitle}</div>
                  <div className="page-kpi-grid">
                    <div className="page-kpi-card">
                      <div className="page-kpi-label">Ciclo ativo</div>
                      <div className="page-kpi-value">
                        {userSelectedCycle ?? "(não selecionado)"}
                      </div>
                    </div>
                    <div className="page-kpi-card">
                      <div className="page-kpi-label">Saldo geral</div>
                      <div className="page-kpi-value">
                        {formatCurrencyBRL(userSaldoAtual)}
                      </div>
                    </div>
                    <div className="page-kpi-card">
                      <div className="page-kpi-label">Destaque da página</div>
                      <div className="page-kpi-value">{userPageItemsCount}</div>
                    </div>
                  </div>
                </div>

                <div className="panel-nav panel-nav--user">
                  <button
                    type="button"
                    className={
                      "panel-nav-button" +
                      (userPage === "overview"
                        ? " panel-nav-button--active"
                        : "")
                    }
                    onClick={() => setUserPage("overview")}
                  >
                    Resumo
                  </button>
                  <button
                    type="button"
                    className={
                      "panel-nav-button" +
                      (userPage === "recorrentes"
                        ? " panel-nav-button--active"
                        : "")
                    }
                    onClick={() => setUserPage("recorrentes")}
                  >
                    Recorrentes
                  </button>
                  <button
                    type="button"
                    className={
                      "panel-nav-button" +
                      (userPage === "gastos" ? " panel-nav-button--active" : "")
                    }
                    onClick={() => setUserPage("gastos")}
                  >
                    Gastos
                  </button>
                  <button
                    type="button"
                    className={
                      "panel-nav-button" +
                      (userPage === "pagamentos"
                        ? " panel-nav-button--active"
                        : "")
                    }
                    onClick={() => setUserPage("pagamentos")}
                  >
                    Pagamentos
                  </button>
                  <button
                    type="button"
                    className={
                      "panel-nav-button" +
                      (userPage === "extrato"
                        ? " panel-nav-button--active"
                        : "")
                    }
                    onClick={() => setUserPage("extrato")}
                  >
                    Extrato
                  </button>
                </div>

                <div className="flow-steps flow-steps--user">
                  <div className="flow-step">
                    <div className="flow-step-kicker">Passo 1</div>
                    <div className="flow-step-title">Entenda seu cenário</div>
                    <div className="flow-step-text">
                      Comece em Resumo para ver saldo e situação do ciclo.
                    </div>
                  </div>
                  <div className="flow-step">
                    <div className="flow-step-kicker">Passo 2</div>
                    <div className="flow-step-title">Registre movimentos</div>
                    <div className="flow-step-text">
                      Use Gastos, Pagamentos e Recorrentes para atualizar dados.
                    </div>
                  </div>
                  <div className="flow-step">
                    <div className="flow-step-kicker">Passo 3</div>
                    <div className="flow-step-title">Valide no extrato</div>
                    <div className="flow-step-text">
                      Confira o impacto final na página Extrato.
                    </div>
                  </div>
                </div>

                {userPage === "overview" && (
                  <>
                {userMesRef && userAnoRef && userTotais && (
                  <div className="user-main-number-card">
                    <div className="user-main-number-label">
                      {userMainNumberLabel}
                    </div>
                    <div
                      className="user-main-number-value"
                      style={{ color: userMainNumberColor }}
                    >
                      {formatCurrencyBRL(userSaldoGeral)}
                    </div>
                    <div className="user-main-number-sub">
                      Ciclo {String(userMesRef).padStart(2, "0")}/{userAnoRef}
                    </div>
                  </div>
                )}

                <div className="user-overview-card">
                  <div className="user-overview-kicker">Usuário</div>
                  <div className="user-overview-name">
                    {userOverview?.user_name || user?.first_name || "-"}
                  </div>
                  <div className="user-overview-username">
                    {(() => {
                      if (userOverview?.username) {
                        return `@${userOverview.username}`;
                      }
                      if (user?.username) {
                        return `@${user.username}`;
                      }
                      return "-";
                    })()}
                  </div>
                  <div className="user-overview-balance">
                    <div className="muted-text">Saldo geral do cartão</div>
                    <div>
                      <strong>{formatCurrencyBRL(userSaldoAtual)}</strong>
                    </div>
                  </div>
                </div>

                {userInvoiceFeatureEnabled && (
                  <div className="subcard">
                    <div className="subcard-title">Fatura em PDF</div>
                    <p className="section-subtitle section-subtitle--tight">
                      Selecione o ciclo e solicite a fatura. Quando estiver
                      pronta, o download aparecerá aqui.
                    </p>

                    {userInvoiceError && (
                      <div className="error mt-1">{userInvoiceError}</div>
                    )}
                    {userInvoiceMessage && (
                      <div className="success mt-1">{userInvoiceMessage}</div>
                    )}

                    <div className="mt-1">
                      <div className="muted-text muted-text--sm"> {/* NOSONAR */}
                        Ciclo: {userInvoiceCycle ?? "(selecione um ciclo)"}
                      </div>
                      <div className="muted-text muted-text--sm">
                        Status:{" "}
                        {String(userInvoiceStatus?.status ?? "none")}
                      </div>
                    </div>

                    {userInvoiceDownloadUrl && (
                      <div className="mt-1">
                        <a
                          href={userInvoiceDownloadUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Baixar fatura (PDF)
                        </a>
                      </div>
                    )}

                    <div className="button-row mt-2">
                      <button
                        type="button"
                        disabled={
                          userInvoiceLoading ||
                          saving ||
                          userLoading ||
                          !userInvoiceCycle
                        }
                        onClick={handleUserRequestInvoicePdf}
                      >
                        {userInvoiceLoading
                          ? "Solicitando..."
                          : "Solicitar fatura"}
                      </button>
                      <button
                        type="button"
                        className="button--sm button--ghost"
                        disabled={
                          userInvoiceLoading ||
                          saving ||
                          userLoading ||
                          !userInvoiceCycle
                        }
                        onClick={() => {
                          if (userInvoiceCycle) {
                            fetchUserInvoiceStatus(userInvoiceCycle);
                          }
                        }}
                      >
                        Atualizar status
                      </button>
                    </div>
                  </div>
                )}

                {userMesRef && userAnoRef && userTotais && (
                  <div className="resumo-fatura-card user-resumo-card">
                    <div className="resumo-fatura-titulo">
                      Movimentação deste ciclo
                    </div>
                    <div className="resumo-fatura-linha">
                      <span className="resumo-fatura-label">
                        Gastos/parcelas
                      </span>
                      <span className="resumo-fatura-valor">
                        {formatCurrencyBRL(
                          Number(userTotais.parcelas_mes || 0),
                        )}
                      </span>
                    </div>
                    <div className="resumo-fatura-linha">
                      <span className="resumo-fatura-label">Pagamentos</span>
                      <span className="resumo-fatura-valor">
                        {formatCurrencyBRL(
                          Number(userTotais.pagamentos_mes || 0),
                        )}
                      </span>
                    </div>
                    <div className="resumo-fatura-linha">
                      <span className="resumo-fatura-label">
                        Saldo deste ciclo
                      </span>
                      <span className="resumo-fatura-direita">
                        <span
                          className="resumo-fatura-valor"
                          style={{ color: userSaldoMesColor }}
                        >
                          {formatCurrencyBRL(Number(userTotais.saldo_mes || 0))}
                        </span>
                        <button
                          type="button"
                          className="button--sm button--ghost"
                          onClick={() => setInfoDialog("saldo_ciclo")}
                        >
                          info
                        </button>
                      </span>
                    </div>

                    {(() => {
                      const info = getSaldoAcumuladoInfo(userSaldoAtual);
                      return (
                        <div className="resumo-fatura-linha resumo-fatura-acumulado">
                          <span
                            className="resumo-fatura-label"
                            style={{ color: info.color }}
                          >
                            {info.label}
                          </span>
                          <span className="resumo-fatura-direita">
                            <span
                              className="resumo-fatura-valor"
                              style={{ color: info.color }}
                            >
                              {formatCurrencyBRL(userSaldoAtual)}
                            </span>
                            <button
                              type="button"
                              className="button--sm button--ghost"
                              onClick={() => setInfoDialog("saldo_acumulado")}
                            >
                              info
                            </button>
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {userComparativoTexto && (
                  <div className="user-comparativo">{userComparativoTexto}</div>
                )}

                <div className="section-kicker">Ações rápidas</div>
                <div className="user-quick-actions">
                  <button
                    type="button"
                    className="user-quick-action-button"
                    onClick={() => setUserActiveForm("gasto")}
                  >
                    Novo gasto
                  </button>
                  <button
                    type="button"
                    className="user-quick-action-button"
                    onClick={() => setUserActiveForm("pagamento")}
                  >
                    Novo pagamento
                  </button>
                  <button
                    type="button"
                    className="user-quick-action-button"
                    onClick={() => {
                      setSelectedRecurringId(null);
                      setRecurringDescricao("");
                      setRecurringValor("");
                      setRecurringCategoria("");
                      setUserActiveForm("recorrente");
                    }}
                  >
                    Recorrentes
                  </button>
                </div>

                {recurringMessage && (
                  <div className="success mt-2">{recurringMessage}</div>
                )}
                  </>
                )}

                {userPage === "recorrentes" && (
                <div className="user-section">
                  <SectionHeader
                    title="Gastos recorrentes"
                    subtitle="Cadastre modelos para repetir automaticamente nos próximos ciclos."
                  />

                  {userRecurringError && (
                    <div className="error mt-2">{userRecurringError}</div>
                  )}

                  {(() => {
                    if (userRecurringLoading) {
                      return (
                        <p className="section-subtitle">
                          Carregando recorrentes...
                        </p>
                      );
                    }

                    if (userRecurringGastos.length === 0) {
                      return (
                        <p className="section-subtitle">
                          Nenhum gasto recorrente cadastrado.
                        </p>
                      );
                    }

                    return (
                      <ul className="gastos-list">
                        {userRecurringGastos.map((item: any) => (
                          <li key={String(item.id || "")} className="gasto-item">
                            <div className="gasto-textos">
                              <div className="gasto-descricao">
                                {String(item.descricao || "(sem descrição)")}
                              </div>
                              <div className="gasto-meta">
                                <span>
                                  {String(item.categoria || "").trim() ||
                                    "Sem categoria"}
                                </span>
                              </div>
                            </div>
                          <div className="gasto-acoes">
                            <div className="gasto-valor">
                              {formatCurrencyBRL(Number(item.valor_total || 0))}
                            </div>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleSelectRecurring(item)}
                            >
                              Editar
                            </button>
                          </div>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}

                  <div className="button-row mt-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setSelectedRecurringId(null);
                        setRecurringDescricao("");
                        setRecurringValor("");
                        setRecurringCategoria("");
                        setUserActiveForm("recorrente");
                      }}
                    >
                      Novo recorrente
                    </button>
                  </div>
                </div>
                )}

                {userPage === "gastos" && (
                <div className="user-section">
                  <SectionHeader
                    title="Meus gastos"
                    subtitle="Últimos gastos ativos registrados para o seu cartão."
                  />
                  {userLancamentosError && (
                    <div className="error mt-2">{userLancamentosError}</div>
                  )}
                  {userLancamentosLoading ? (
                    <p className="section-subtitle">
                      Carregando seus gastos...
                    </p>
                  ) : (
                    <>
                      {(() => {
                        const filtered = userSelectedCycle
                          ? userGastosList.filter((g: any) =>
                              gastoPertenceAoCiclo(g, userSelectedCycle),
                            )
                          : userGastosList;

                        if (filtered.length === 0) {
                          return (
                            <p className="section-subtitle">
                              Nenhum gasto encontrado.
                            </p>
                          );
                        }

                        const limit = 15;
                        const listToShow = userShowAllGastos
                          ? filtered
                          : filtered.slice(0, limit);

                        return (
                          <>
                            <p className="section-subtitle">
                              {filtered.length} gasto(s)
                              {userSelectedCycle ? " neste ciclo" : ""}.
                            </p>
                            <ul className="gastos-list">
                              {listToShow.map((g: any) => (
                                <li
                                  key={String(g.id || "")}
                                  className="gasto-item"
                                >
                                  <div className="gasto-textos">
                                    <div className="gasto-descricao">
                                      {String(g.descricao || "(sem descrição)")}
                                    </div>
                                    <div className="gasto-meta">
                                      <span>
                                        {formatDateIsoToBR(g.data_compra)}
                                      </span>
                                      <span>•</span>
                                      <span>
                                        {String(g.categoria || "").trim() ||
                                          "Sem categoria"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="gasto-acoes">
                                    <div className="gasto-valor">
                                      {formatCurrencyBRL(
                                        Number(g.valor_total || 0),
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() =>
                                        handleSelectUserGastoForEdit(g)
                                      }
                                    >
                                      Editar
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>

                            {filtered.length > limit && (
                              <div className="button-row mt-2">
                                <button
                                  type="button"
                                  className="button--sm button--ghost"
                                  onClick={() =>
                                    setUserShowAllGastos((prev) => !prev)
                                  }
                                >
                                  {userShowAllGastos
                                    ? "Mostrar menos"
                                    : "Mostrar tudo"}
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
                )}

                {userPage === "pagamentos" && (
                <div className="user-section">
                  <SectionHeader
                    title="Meus pagamentos"
                    subtitle="Pagamentos registrados (usados para abater o saldo)."
                  />
                  {userLancamentosError && (
                    <div className="error mt-2">{userLancamentosError}</div>
                  )}
                  {userLancamentosLoading ? (
                    <p className="section-subtitle">
                      Carregando seus pagamentos...
                    </p>
                  ) : (
                    <>
                      {(() => {
                        const filtered = userSelectedCycle
                          ? userPagamentosList.filter(
                              (p: any) =>
                                getCycleFromIsoDate(p.data_pagamento) ===
                                userSelectedCycle,
                            )
                          : userPagamentosList;

                        if (filtered.length === 0) {
                          return (
                            <p className="section-subtitle">
                              Nenhum pagamento encontrado.
                            </p>
                          );
                        }

                        const limit = 15;
                        const listToShow = userShowAllPagamentos
                          ? filtered
                          : filtered.slice(0, limit);

                        return (
                          <>
                            <p className="section-subtitle">
                              {filtered.length} pagamento(s)
                              {userSelectedCycle ? " neste ciclo" : ""}.
                            </p>
                            <ul className="admin-pagamentos-list">
                              {listToShow.map((p: any) => (
                                <li
                                  key={String(p.id || "")}
                                  className="admin-pagamento-item"
                                >
                                  <div className="admin-pagamento-textos">
                                    <div className="admin-pagamento-descricao">
                                      {String(p.descricao || "Pagamento")}
                                    </div>
                                    <div className="admin-pagamento-meta">
                                      <span>
                                        {formatDateIsoToBR(p.data_pagamento)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="gasto-acoes">
                                    <div className="admin-pagamento-valor">
                                      {formatCurrencyBRL(Number(p.valor || 0))}
                                    </div>
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() =>
                                        handleSelectUserPagamentoForEdit(p)
                                      }
                                    >
                                      Editar
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>

                            {filtered.length > limit && (
                              <div className="button-row mt-2">
                                <button
                                  type="button"
                                  className="button--sm button--ghost"
                                  onClick={() =>
                                    setUserShowAllPagamentos((prev) => !prev)
                                  }
                                >
                                  {userShowAllPagamentos
                                    ? "Mostrar menos"
                                    : "Mostrar tudo"}
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
                )}

                {userPage === "extrato" && (
                <div className="user-section user-extrato-wrap">
                  <SectionHeader
                    title="Extrato do ciclo"
                    subtitle="Lançamentos consolidados (parcelas e pagamentos) do ciclo selecionado."
                  />

                  {userCategoriasResumo.length > 0 && (
                    <div className="subcard user-categorias-card">
                      <div className="subcard-title">Resumo por categoria</div>
                      <div className="user-categorias-rows">
                        {userCategoriasResumo
                          .slice(0, 6)
                          .map(([cat, total]) => (
                            <div key={cat} className="user-categorias-row">
                              <span>{cat}</span>
                              <span className="user-categorias-total">
                                {formatCurrencyBRL(total)}
                              </span>
                            </div>
                          ))}
                      </div>
                      {userCategoriasResumo.length > 6 && (
                        <p className="section-subtitle mt-1">
                          Mostrando as 6 categorias com maior gasto neste ciclo.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="user-extrato-filters">
                    <button
                      type="button"
                      className={
                        "user-extrato-filter-button" +
                        (userExtratoFilter === "all"
                          ? " user-extrato-filter-button--active"
                          : "")
                      }
                      onClick={() => setUserExtratoFilter("all")}
                    >
                      Tudo
                    </button>
                    <button
                      type="button"
                      className={
                        "user-extrato-filter-button" +
                        (userExtratoFilter === "gastos"
                          ? " user-extrato-filter-button--active"
                          : "")
                      }
                      onClick={() => setUserExtratoFilter("gastos")}
                    >
                      Gastos
                    </button>
                    <button
                      type="button"
                      className={
                        "user-extrato-filter-button" +
                        (userExtratoFilter === "pagamentos"
                          ? " user-extrato-filter-button--active"
                          : "")
                      }
                      onClick={() => setUserExtratoFilter("pagamentos")}
                    >
                      Pagamentos
                    </button>
                  </div>

                  <div className="section-title">{userExtratoTitulo}</div>
                  {userExtratoHasItens ? (
                    <ul className="gastos-list">
                      {userExtratoItensToShow.map((item: any, idx: number) => {
                        const tipoLower = String(
                          item?.tipo || "",
                        ).toLowerCase();
                        const isPagamento =
                          tipoLower === "pagamento" ||
                          tipoLower === "pagamentos";
                        const valor = Number(item?.valor || 0);
                        const valorColor = isPagamento ? "#4ade80" : "#facc15";
                        return (
                          <li
                            key={`${String(item?.data || "")}_${idx}`}
                            className="user-extrato-item"
                          >
                            <div className="user-extrato-textos">
                              <div className="user-extrato-descricao">
                                {String(item?.descricao || "(sem descrição)")}
                              </div>
                              <div className="user-extrato-meta">
                                <span>{formatDateIsoToBR(item?.data)}</span>
                                <span>•</span>
                                <span>
                                  {isPagamento ? "Pagamento" : "Gasto/Parcela"}
                                </span>
                              </div>
                            </div>
                            <div
                              className="user-extrato-valor"
                              style={{ color: valorColor }}
                            >
                              {formatCurrencyBRL(valor)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="section-subtitle">
                      Nenhum lançamento encontrado neste ciclo.
                    </p>
                  )}

                  {userExtratoFilteredItens.length > 10 && (
                    <div className="button-row mt-2">
                      <button
                        type="button"
                        className="button--sm button--ghost"
                        onClick={() => setUserShowAllExtrato((prev) => !prev)}
                      >
                        {userShowAllExtrato ? "Mostrar menos" : "Mostrar tudo"}
                      </button>
                    </div>
                  )}
                </div>
                )}
              </>
            )}
          </section>
        )}

        {isAdmin && activePanel === "admin" && (
          <section className="card-section">
            <SectionHeader
              title="Navegação do admin"
              subtitle="Escolha a página para reduzir rolagem e focar no fluxo atual."
            />
            <div className="panel-nav panel-nav--admin">
              <button
                type="button"
                className={
                  "panel-nav-button" +
                  (adminPage === "requests" ? " panel-nav-button--active" : "")
                }
                onClick={() => setAdminPage("requests")}
              >
                Solicitações
              </button>
              <button
                type="button"
                className={
                  "panel-nav-button" +
                  (adminPage === "workspace" ? " panel-nav-button--active" : "")
                }
                onClick={() => setAdminPage("workspace")}
              >
                Operação usuário
              </button>
              <button
                type="button"
                className={
                  "panel-nav-button" +
                  (adminPage === "system" ? " panel-nav-button--active" : "")
                }
                onClick={() => setAdminPage("system")}
              >
                Sistema
              </button>
            </div>

            <div className="page-hero page-hero--admin">
              <div className="page-hero-title">{adminPageMeta.title}</div>
              <div className="page-hero-subtitle">{adminPageMeta.subtitle}</div>
              <div className="page-kpi-grid">
                <div className="page-kpi-card">
                  <div className="page-kpi-label">Pendências</div>
                  <div className="page-kpi-value">
                    {adminPendingRequestsCount} pendente(s)
                  </div>
                </div>
                <div className="page-kpi-card">
                  <div className="page-kpi-label">Usuário em foco</div>
                  <div className="page-kpi-value">
                    {targetUserId.trim() || "Nenhum selecionado"}
                  </div>
                </div>
                <div className="page-kpi-card">
                  <div className="page-kpi-label">Aba operacional</div>
                  <div className="page-kpi-value">{adminActiveTabLabel}</div>
                </div>
              </div>
            </div>

            <div className="flow-steps flow-steps--admin">
              <div className="flow-step">
                <div className="flow-step-kicker">Etapa 1</div>
                <div className="flow-step-title">Trate solicitações</div>
                <div className="flow-step-text">
                  Use Solicitações para aprovar e abrir usuários rapidamente.
                </div>
              </div>
              <div className="flow-step">
                <div className="flow-step-kicker">Etapa 2</div>
                <div className="flow-step-title">Selecione o usuário</div>
                <div className="flow-step-text">
                  Em Operação usuário, abra um contexto de trabalho antes de editar.
                </div>
              </div>
              <div className="flow-step">
                <div className="flow-step-kicker">Etapa 3</div>
                <div className="flow-step-title">Acompanhe sistema</div>
                <div className="flow-step-text">
                  Em Sistema, valide versão e sincronismo do ambiente.
                </div>
              </div>
            </div>
          </section>
        )}

        {isAdmin && activePanel === "admin" && adminPage === "requests" && (
          <section className="card-section">
            <SectionHeader
              title="Painel administrativo"
              subtitle="Busque um usuário para visualizar sua fatura, lançamentos e atualizar seus dados."
            />

            <div className="subcard">
              <div className="subcard-title">Solicitações de acesso</div>
              <p className="section-subtitle section-subtitle--tight">
                Pedidos enviados pelo mini app (filtre por status e aprove em 1
                toque).
              </p>

              <div className="user-extrato-filters">
                <button
                  type="button"
                  className={
                    "user-extrato-filter-button" +
                    (adminAccessRequestsFilter === "pending"
                      ? " user-extrato-filter-button--active"
                      : "")
                  }
                  onClick={() => setAdminAccessRequestsFilter("pending")}
                >
                  Pendentes
                </button>
                <button
                  type="button"
                  className={
                    "user-extrato-filter-button" +
                    (adminAccessRequestsFilter === "approved"
                      ? " user-extrato-filter-button--active"
                      : "")
                  }
                  onClick={() => setAdminAccessRequestsFilter("approved")}
                >
                  Aprovadas
                </button>
                <button
                  type="button"
                  className={
                    "user-extrato-filter-button" +
                    (adminAccessRequestsFilter === "all"
                      ? " user-extrato-filter-button--active"
                      : "")
                  }
                  onClick={() => setAdminAccessRequestsFilter("all")}
                >
                  Todas
                </button>
              </div>

              <form onSubmit={(e) => e.preventDefault()} className="form">
                <label>
                  <span>Buscar na lista:</span>{" "}
                  <input
                    type="text"
                    value={adminAccessRequestsSearch}
                    onChange={(e) =>
                      setAdminAccessRequestsSearch(e.target.value)
                    }
                    placeholder="Nome, username ou ID"
                  />
                </label>
              </form>

              {adminAccessRequestsError && (
                <div className="error mt-2">{adminAccessRequestsError}</div>
              )}

              {(() => {
                if (adminAccessRequestsLoading) {
                  return (
                    <p className="section-subtitle">
                      Carregando solicitações...
                    </p>
                  );
                }

                const term = adminAccessRequestsSearch.trim().toLowerCase();
                const filtered = adminAccessRequests.filter((reqItem: any) => {
                  if (!term) {
                    return true;
                  }
                  const userId = String(reqItem?.user_id || "").toLowerCase();
                  const userInfo = reqItem?.user;
                  const name = String(userInfo?.name || "").toLowerCase();
                  const username = String(
                    userInfo?.username || "",
                  ).toLowerCase();
                  return (
                    userId.includes(term) ||
                    name.includes(term) ||
                    username.includes(term)
                  );
                });

                let statusLabel = "";
                if (adminAccessRequestsFilter === "pending") {
                  statusLabel = "pendente";
                } else if (adminAccessRequestsFilter === "approved") {
                  statusLabel = "aprovada";
                }

                if (filtered.length === 0) {
                  return (
                    <p className="section-subtitle">
                      Nenhuma solicitação {statusLabel ? `${statusLabel}` : ""}
                      {term ? " para este filtro/busca" : ""}.
                    </p>
                  );
                }

                return (
                  <>
                    <p className="section-subtitle">
                      Mostrando {Math.min(filtered.length, 20)} de{" "}
                      {filtered.length}
                      {statusLabel ? ` ${statusLabel}` : ""}.
                    </p>
                    <ul className="gastos-list">
                      {filtered.slice(0, 20).map((reqItem: any) => {
                        const userId = String(reqItem?.user_id || "");
                        const userInfo = reqItem?.user;
                        const labelName = String(userInfo?.name || "").trim();
                        const labelUsername = userInfo?.username
                          ? `@${String(userInfo.username)}`
                          : "";
                        const solicitadoEm = reqItem?.solicitado_em
                          ? formatDateTime(reqItem.solicitado_em)
                          : "-";
                        const status = String(
                          reqItem?.status || "",
                        ).toLowerCase();
                        const isPending = status === "pending";

                        return (
                          <li key={userId} className="gasto-item">
                            <div className="gasto-textos">
                              <div className="gasto-descricao">
                                {labelName || userId}
                              </div>
                              <div className="gasto-meta">
                                <span>{userId}</span>
                                {labelUsername && (
                                  <>
                                    <span>•</span>
                                    <span>{labelUsername}</span>
                                  </>
                                )}
                                <span>•</span>
                                <span>Solicitado em {solicitadoEm}</span>
                              </div>
                            </div>
                            <div className="gasto-acoes">
                              <div className="button-row">
                                <button
                                  type="button"
                                  className="button--sm button--ghost"
                                  disabled={loading || saving}
                                  onClick={() => {
                                    setTargetUserId(userId);
                                    void loadAdminUserDataById(userId);
                                  }}
                                >
                                  Abrir
                                </button>
                                {isPending && (
                                  <>
                                    <button
                                      type="button"
                                      className="button--sm"
                                      disabled={saving}
                                      onClick={() =>
                                        void handleAdminApproveAccess(userId)
                                      }
                                    >
                                      Aprovar
                                    </button>
                                    <button
                                      type="button"
                                      className="button--sm"
                                      disabled={saving || loading}
                                      onClick={() =>
                                        void handleAdminApproveAccess(
                                          userId,
                                          true,
                                        )
                                      }
                                    >
                                      Aprovar e abrir
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                );
              })()}

              <div className="button-row mt-2">
                <button
                  type="button"
                  className="button--sm button--ghost"
                  disabled={adminAccessRequestsLoading}
                  onClick={() =>
                    setAdminAccessRequestsReloadToken((t) => t + 1)
                  }
                >
                  Atualizar lista
                </button>
              </div>
            </div>
          </section>
        )}

        {isAdmin && activePanel === "admin" && adminPage === "workspace" && (
          <section className="card-section">
            <SectionHeader
              title="Consultar usuário alvo"
              subtitle="Busque por ID/username ou selecione diretamente na lista de usuários para abrir a área de trabalho." 
            />

            <div className="subcard">
              <div className="subcard-title">Área de trabalho atual</div>
              <div className="admin-profile-grid">
                <div className="admin-profile-field">
                  <div className="admin-profile-label">Usuário selecionado</div>
                  <div className="admin-profile-value">
                    {userDetails
                      ? `${String(userDetails.name || "(sem nome)")} (${String(
                          userDetails.id,
                        )})`
                      : targetUserId.trim() || "Nenhum usuário aberto"}
                  </div>
                </div>
                <div className="admin-profile-field">
                  <div className="admin-profile-label">Aba ativa</div>
                  <div className="admin-profile-value">
                    {(() => {
                      if (adminActiveTab === "overview") return "Visão geral";
                      if (adminActiveTab === "lancamentos") return "Lançamentos";
                      if (adminActiveTab === "pagamentos") return "Pagamentos";
                      if (adminActiveTab === "faturas") return "Faturas";
                      return "Configuração";
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleLoadData} className="form">
              <label>
                <span>ID ou username do usuário (Telegram):</span>{" "}
                <input
                  type="text"
                  value={targetUserId}
                  onChange={(e) => handleTargetUserChange(e.target.value)}
                />
              </label>
              {userSuggestions.length > 0 && !userDetails && (
                <ul>
                  {userSuggestions.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleSelectUserSuggestion(u)}
                      >
                        {u.id} — {u.name || "(sem nome)"}
                        {u.username ? ` (@${u.username})` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="submit" disabled={loading}>
                {loading ? "Carregando..." : "Carregar dados"}
              </button>
            </form>
            {error && <div className="error">{error}</div>}

            {!userDetails && (
              <div className="admin-empty-state mt-2">
                <div className="admin-empty-title">Nenhum usuário em operação</div>
                <div className="admin-empty-text">
                  Selecione um usuário acima para habilitar as abas operacionais
                  (perfil, gastos, pagamentos e faturas).
                </div>
              </div>
            )}

            <div className="subcard mt-2 admin-user-directory">
              <div className="subcard-title">Todos os usuários do bot</div>
              <p className="section-subtitle section-subtitle--tight">
                Lista completa paginada. Use busca rápida e clique em "Abrir" para entrar no contexto do usuário.
              </p>
              <div className="admin-user-directory-meta">
                {adminAllUsers.length} carregado(s)
              </div>

              <form onSubmit={(e) => e.preventDefault()} className="form">
                <label>
                  <span>Buscar na lista:</span>{" "}
                  <input
                    type="text"
                    value={adminAllUsersSearch}
                    onChange={(e) => setAdminAllUsersSearch(e.target.value)}
                    placeholder="Nome, username ou ID"
                  />
                </label>
              </form>

              {adminAllUsersError && (
                <div className="error mt-2">{adminAllUsersError}</div>
              )}

              {(() => {
                const term = adminAllUsersSearch.trim().toLowerCase();
                const filtered = adminAllUsers.filter((u) => {
                  if (!term) {
                    return true;
                  }
                  const id = u.id.toLowerCase();
                  const name = String(u.name || "").toLowerCase();
                  const username = String(u.username || "").toLowerCase();
                  return (
                    id.includes(term) ||
                    name.includes(term) ||
                    username.includes(term)
                  );
                });

                if (adminAllUsersLoading && adminAllUsers.length === 0) {
                  return (
                    <p className="section-subtitle">Carregando usuários...</p>
                  );
                }

                if (filtered.length === 0) {
                  return (
                    <p className="section-subtitle">
                      Nenhum usuário encontrado para este filtro.
                    </p>
                  );
                }

                return (
                  <>
                    <p className="section-subtitle">
                      Exibindo {Math.min(filtered.length, 60)} de {filtered.length} resultado(s).
                    </p>
                    <ul className="gastos-list">
                      {filtered.slice(0, 60).map((u) => (
                        <li key={u.id} className="gasto-item">
                          <div className="gasto-textos">
                            <div className="gasto-descricao">
                              {u.name || "(sem nome)"}
                            </div>
                            <div className="gasto-meta">
                              <span>{u.id}</span>
                              {u.username ? (
                                <>
                                  <span>•</span>
                                  <span>@{u.username}</span>
                                </>
                              ) : null}
                              <span>•</span>
                              <span>{u.autorizado ? "Autorizado" : "Sem acesso"}</span>
                              <span>•</span>
                              <span>{u.ativo ? "Ativo" : "Inativo"}</span>
                            </div>
                          </div>
                          <div className="gasto-acoes">
                            <button
                              type="button"
                              className="button--sm"
                              disabled={loading || saving}
                              onClick={() => {
                                setTargetUserId(u.id);
                                void loadAdminUserDataById(u.id);
                              }}
                            >
                              Abrir
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}

              <div className="button-row mt-2">
                <button
                  type="button"
                  className="button--sm button--ghost"
                  disabled={adminAllUsersLoading}
                  onClick={() => void loadAdminAllUsers({ reset: true })}
                >
                  Recarregar lista
                </button>
                <button
                  type="button"
                  className="button--sm button--ghost"
                  disabled={adminAllUsersLoading || !adminAllUsersHasMore}
                  onClick={() => void loadAdminAllUsers()}
                >
                  {adminAllUsersHasMore ? "Carregar mais" : "Lista completa"}
                </button>
              </div>
            </div>
          </section>
        )}

        {isAdmin && activePanel === "admin" && adminPage === "workspace" && userDetails && (
          <div className="admin-tabs-wrap">
            <div className="admin-tabs-title">Navegação administrativa</div>
            <div className="admin-tabs">
            {(() => {
              const isUserDetailsMissing = !userDetails;
              return (
                <>
            <button
              type="button"
              className={
                "admin-tab-button" +
                (adminActiveTab === "overview"
                  ? " admin-tab-button--active"
                  : "")
              }
              disabled={isUserDetailsMissing}
              onClick={() => {
                setAdminPage("workspace");
                setAdminActiveTab("overview");
              }}
              title={
                isUserDetailsMissing
                  ? "Selecione um usuário para habilitar"
                  : undefined
              }
            >
              Perfil e resumo
            </button>
            <button
              type="button"
              className={
                "admin-tab-button" +
                (adminActiveTab === "lancamentos"
                  ? " admin-tab-button--active"
                  : "")
              }
              disabled={isUserDetailsMissing}
              onClick={() => {
                setAdminPage("workspace");
                setAdminActiveTab("lancamentos");
              }}
              title={
                isUserDetailsMissing
                  ? "Selecione um usuário para habilitar"
                  : undefined
              }
            >
              Gastos
            </button>
            <button
              type="button"
              className={
                "admin-tab-button" +
                (adminActiveTab === "pagamentos"
                  ? " admin-tab-button--active"
                  : "")
              }
              disabled={isUserDetailsMissing}
              onClick={() => {
                setAdminPage("workspace");
                setAdminActiveTab("pagamentos");
              }}
              title={
                isUserDetailsMissing
                  ? "Selecione um usuário para habilitar"
                  : undefined
              }
            >
              Pagamentos
            </button>
            <button
              type="button"
              className={
                "admin-tab-button" +
                (adminActiveTab === "faturas"
                  ? " admin-tab-button--active"
                  : "")
              }
              onClick={() => {
                setAdminPage("workspace");
                setAdminActiveTab("faturas");
              }}
            >
              Faturas PDF
            </button>
            <button
              type="button"
              className={
                "admin-tab-button" +
                (adminActiveTab === "config" ? " admin-tab-button--active" : "")
              }
              onClick={() => {
                setAdminPage("system");
                setAdminActiveTab("config");
              }}
            >
              Sistema
            </button>
                </>
              );
            })()}
            </div>
          </div>
        )}

        {isAdmin &&
          activePanel === "admin" &&
          adminPage === "workspace" &&
          userDetails &&
          (adminActiveTab === "overview" || adminActiveTab === "config") && (
            <section className="card-section">
              <SectionHeader
                title="Dados do usuário"
                subtitle="Visão rápida do perfil do usuário e do ciclo selecionado."
              />
              <div className="subcard">
                <div className="subcard-title">Perfil</div>
                <div className="admin-profile-grid">
                  <div className="admin-profile-field">
                    <div className="admin-profile-label">ID Telegram</div>
                    <div className="admin-profile-value">
                      {String(userDetails.id)}
                    </div>
                  </div>
                  <div className="admin-profile-field">
                    <div className="admin-profile-label">Nome salvo</div>
                    <div className="admin-profile-value">
                      {userDetails.name || "(sem nome)"}
                    </div>
                  </div>
                  <div className="admin-profile-field">
                    <div className="admin-profile-label">Username salvo</div>
                    <div className="admin-profile-value">
                      {userDetails.username ? `@${userDetails.username}` : "-"}
                    </div>
                  </div>
                  <div className="admin-profile-field">
                    <div className="admin-profile-label">Criado em</div>
                    <div className="admin-profile-value">
                      {formatDateTime(userDetails.criado_em)}
                    </div>
                  </div>
                  <div className="admin-profile-field">
                    <div className="admin-profile-label">Último acesso</div>
                    <div className="admin-profile-value">
                      {formatDateTime(userDetails.last_seen)}
                    </div>
                  </div>
                  <div className="admin-profile-field">
                    <div className="admin-profile-label">Status da conta</div>
                    <div className="admin-profile-value">
                      {userDetails.ativo === false ? "Inativo" : "Ativo"} —{" "}
                      {userDetails.autorizado
                        ? "Acesso liberado"
                        : "Aguardando liberação"}
                    </div>
                  </div>

                  <div className="admin-profile-field">
                    <div className="admin-profile-label">
                      Solicitação de acesso
                    </div>
                    <div className="admin-profile-value">
                      {(() => {
                        const solicit = userDetails.solicitacao_acesso;
                        const statusRaw = String(
                          solicit?.status || "",
                        ).toLowerCase();
                        const status = statusRaw || "none";

                        if (status === "approved") {
                          return (
                            <div className="admin-access-request">
                              <div className="admin-status--approved">
                                Aprovada
                              </div>
                              <div className="admin-access-meta">
                                {solicit?.aprovado_em
                                  ? `Aprovado em ${formatDateTime(
                                      solicit.aprovado_em,
                                    )}`
                                  : ""}
                                {solicit?.aprovado_por
                                  ? ` por ${String(solicit.aprovado_por)}`
                                  : ""}
                              </div>
                            </div>
                          );
                        }

                        if (status === "pending") {
                          return (
                            <div className="admin-access-request">
                              <div className="admin-status--pending">
                                Pendente
                              </div>
                              <div className="admin-access-meta">
                                {solicit?.solicitado_em
                                  ? `Solicitado em ${formatDateTime(
                                      solicit.solicitado_em,
                                    )}`
                                  : ""}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="admin-access-request">
                            <div className="muted-text">
                              Nenhuma solicitação
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveUsuario} className="form">
                <label>
                  <span>Nome:</span>{" "}
                  <input
                    type="text"
                    value={editUserName}
                    onChange={(e) => setEditUserName(e.target.value)}
                  />
                </label>
                <label>
                  <span>Username (sem @):</span>{" "}
                  <input
                    type="text"
                    value={editUserUsername}
                    onChange={(e) => setEditUserUsername(e.target.value)}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editUserAtivo}
                    onChange={(e) => setEditUserAtivo(e.target.checked)}
                  />
                  <span>Usuário ativo</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editUserAutorizado}
                    onChange={(e) => setEditUserAutorizado(e.target.checked)}
                  />
                  <span>Acesso liberado (autorizado)</span>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={editUserInvoicePdfEnabled}
                    onChange={(e) =>
                      setEditUserInvoicePdfEnabled(e.target.checked)
                    }
                  />
                  <span>Permitir solicitar fatura em PDF</span>
                </label>
                <p className="muted-text muted-text--sm mt-1">
                  <strong>Usuário ativo</strong> controla se o usuário ainda
                  pode usar o cartão neste sistema.{" "}
                  <strong>Acesso liberado (autorizado)</strong> libera o uso do
                  mini app para registrar gastos e pagamentos.
                </p>
                <button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar dados do usuário"}
                </button>
              </form>

              <form onSubmit={handleAdminSendMessage} className="form mt-2">
                <label htmlFor="admin-message-text">
                  <span>Enviar mensagem para este usuário (Telegram):</span>
                </label>
                <textarea
                  id="admin-message-text"
                  value={adminMessageText}
                  onChange={(e) => setAdminMessageText(e.target.value)}
                  rows={3}
                  placeholder="Digite aqui a mensagem que o bot vai enviar para o usuário"
                />
                <button type="submit" disabled={adminMessageSending}>
                  {adminMessageSending ? "Enviando..." : "Enviar mensagem"}
                </button>
                {adminMessageResult ? (
                  <div className="mt-2">
                    <div className="muted-text">{adminMessageResult}</div>
                  </div>
                ) : null}
              </form>
              {userActionMessage && (
                <div className="success mt-2">{userActionMessage}</div>
              )}
            </section>
          )}

        {isAdmin && activePanel === "admin" && adminPage === "system" && (
          <section className="card-section">
            <SectionHeader
              title="Versões e changelog"
              subtitle="Visível somente para administradores."
            />
            <div className="subcard">
              <div className="subcard-title">Versões</div>
              {(() => {
                let backendVersionLabel = "-";
                if (adminMetaLoading) {
                  backendVersionLabel = "carregando...";
                } else {
                  backendVersionLabel = String(adminMeta?.versions?.backend || "-");
                }

                let botLabel = "-";
                if (adminMetaLoading) {
                  botLabel = "carregando...";
                } else if (adminMeta?.bot) {
                  let botUsername = "(sem username)";
                  if (adminMeta.bot.username) {
                    botUsername = `@${adminMeta.bot.username}`;
                  }
                  const botId = String(adminMeta.bot.id || "-");
                  botLabel = `${botUsername} (id: ${botId})`;
                }

                const backendVersion = String(
                  adminMeta?.versions?.backend || "",
                ).trim();
                let versionSyncMessage: React.ReactNode = null;
                if (backendVersion) {
                  if (backendVersion !== APP_VERSION) {
                    versionSyncMessage = (
                      <div className="error mt-2">
                        Atenção: versões divergentes (admin={APP_VERSION} /
                        backend={backendVersion}).
                      </div>
                    );
                  } else {
                    versionSyncMessage = (
                      <div className="success mt-2">
                        OK: versões sincronizadas (admin/backend {APP_VERSION}).
                      </div>
                    );
                  }
                }

                return ( // NOSONAR
                  <>
              <div className="admin-profile-grid">
                <div className="admin-profile-field">
                  <div className="admin-profile-label">
                    Versão do painel (admin)
                  </div>
                  <div className="admin-profile-value">{APP_VERSION}</div>
                </div>
                <div className="admin-profile-field">
                  <div className="admin-profile-label">
                    Versão do mini app (usuário)
                  </div>
                  <div className="admin-profile-value">{APP_VERSION}</div>
                </div>
                <div className="admin-profile-field">
                  <div className="admin-profile-label">Versão do backend</div>
                  <div className="admin-profile-value">{backendVersionLabel}</div>
                </div>
                <div className="admin-profile-field">
                  <div className="admin-profile-label">Bot em produção</div>
                  <div className="admin-profile-value">{botLabel}</div>
                </div>
              </div>

              {adminMetaError ? (
                <div className="error mt-2">{adminMetaError}</div>
              ) : null}

              {versionSyncMessage}
                  </>
                );
              })()}
            </div>

            <div className="subcard mt-2">
              <div className="subcard-title">Changelog</div>
              {(() => {
                if (adminMetaLoading) {
                  return <div className="muted-text">carregando...</div>;
                }

                const changelogItems = Array.isArray(adminMeta?.changelog?.items)
                  ? adminMeta.changelog.items
                  : [];

                if (changelogItems.length === 0) {
                  return (
                    <div className="muted-text">
                      Nenhuma entrada de changelog encontrada.
                    </div>
                  );
                }

                return (
                  <div>
                    {changelogItems.slice(0, 10).map((item: any, idx: number) => {
                      const titleVersion = String(item?.version || "-");
                      const titleDate = String(item?.date || "-");
                      const title = `${titleVersion} — ${titleDate}`;
                      const changes = Array.isArray(item?.changes)
                        ? item.changes
                        : [];
                      return (
                        <div key={`${title}-${idx}`} className="mt-2">
                          <strong>{title}</strong>
                          {changes.length > 0 ? (
                            <ul className="mt-1">
                              {changes
                                .slice(0, 20)
                                .map((c: any, cidx: number) => (
                                  <li key={`${idx}-${cidx}`}>{String(c)}</li>
                                ))}
                            </ul>
                          ) : (
                            <div className="muted-text">(sem detalhes)</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {isAdmin &&
          activePanel === "admin" &&
          adminPage === "workspace" &&
          adminActiveTab === "overview" &&
          billingCycles.length > 0 && (
            <section className="card-section">
              <strong>Selecionar fatura (ciclo)</strong>
              <BillingCycleSelect
                value={selectedCycle || ""}
                options={billingCycles}
                onChange={(next) => setSelectedCycle(next || null)}
              />

              {selectedCycle && cycleSummary && (
                <div className="resumo-fatura-card">
                  <div className="resumo-fatura-titulo">
                    Resumo da fatura {selectedCycle}
                  </div>
                  <div className="resumo-fatura-linha">
                    <span className="resumo-fatura-label">Gastos/parcelas</span>
                    <span className="resumo-fatura-valor">
                      {formatCurrencyBRL(cycleSummary.parcelas_mes)}
                    </span>
                  </div>
                  <div className="resumo-fatura-linha">
                    <span className="resumo-fatura-label">Pagamentos</span>
                    <span className="resumo-fatura-valor">
                      {formatCurrencyBRL(cycleSummary.pagamentos_mes)}
                    </span>
                  </div>
                  <div className="resumo-fatura-linha resumo-fatura-saldo-periodo">
                    <span className="resumo-fatura-label">
                      Saldo deste ciclo
                    </span>
                    <span className="resumo-fatura-direita">
                      <span className="resumo-fatura-valor">
                        {formatCurrencyBRL(cycleSummary.saldo_mes)}
                      </span>
                      <button
                        type="button"
                        className="button--sm button--ghost"
                        onClick={() => setInfoDialog("saldo_ciclo")}
                      >
                        info
                      </button>
                    </span>
                  </div>
                  {(() => {
                    const info = getSaldoAcumuladoInfo(
                      cycleSummary.saldo_acumulado,
                    );
                    return (
                      <div className="resumo-fatura-linha resumo-fatura-acumulado">
                        <span
                          className="resumo-fatura-label"
                          style={{ color: info.color }}
                        >
                          {info.label}
                        </span>
                        <span className="resumo-fatura-direita">
                          <span
                            className="resumo-fatura-valor"
                            style={{ color: info.color }}
                          >
                            {formatCurrencyBRL(cycleSummary.saldo_acumulado)}
                          </span>
                          <button
                            type="button"
                            className="button--sm button--ghost"
                            onClick={() => setInfoDialog("saldo_acumulado")}
                          >
                            info
                          </button>
                        </span>
                      </div>
                    );
                  })()}
                  <div className="button-row mt-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleExportAdminValidationReportCsv}
                    >
                      Exportar relatório de validação (CSV)
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

        {isAdmin &&
          activePanel === "admin" &&
          adminPage === "workspace" &&
          adminActiveTab === "lancamentos" && (
            <section className="card-section">
              <strong>Gastos do usuário</strong>
              <p className="section-subtitle">
                Use os botões abaixo para criar novos lançamentos para o usuário
                selecionado.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  disabled={saving || !targetUserId}
                  onClick={() => setUserActiveForm("gasto")}
                >
                  Novo gasto
                </button>
              </div>
              {(() => {
                if (filteredGastos.length === 0) {
                  return (
                    <p className="section-subtitle">
                      Nenhum gasto ativo foi encontrado para este usuário.
                    </p>
                  );
                }

                return (
                  <>
                    <p className="section-subtitle">
                      Lista de gastos ativos do usuário. Use este painel para
                      revisar e, se necessário, editar ou inativar lançamentos.
                    </p>
                    <div className="button-row">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleExportAdminGastosCsv}
                      >
                        Exportar CSV
                      </button>
                    </div>
                    <ul className="gastos-list">
                      {filteredGastos.map((g) => {
                      const dataStr = formatDateIsoToBR(g.data_compra);
                      const descricao = g.descricao || "(sem descrição)";
                      const valorTotal = Number(g.valor_total || 0);
                      const parcelasTotal = Number(g.parcelas_total || 1);
                      const valorParcela = Number(
                        g.valor_parcela || valorTotal,
                      );
                      const temParcelas =
                        Number.isFinite(parcelasTotal) && parcelasTotal > 1;
                      let parcelaAtual: number | null = null;
                      if (temParcelas && selectedCycle) {
                        const cycles = getGastoCycles(g);
                        const idx = cycles.indexOf(selectedCycle);
                        if (idx >= 0) {
                          parcelaAtual = idx + 1;
                        }
                      }
                      return (
                        <li key={g.id} className="gasto-item">
                          <div className="gasto-textos">
                            <div className="gasto-descricao">{descricao}</div>
                            <div className="gasto-meta">
                              <span>{dataStr}</span>
                              <span>•</span>
                              <span>
                                {(() => {
                                  if (!temParcelas) {
                                    return "Pagamento à vista";
                                  }
                                  if (parcelaAtual) {
                                    return `Parcela ${parcelaAtual}/${parcelasTotal}`;
                                  }
                                  return `${parcelasTotal} parcelas`;
                                })()}
                              </span>
                              {temParcelas && (
                                <>
                                  <span>•</span>
                                  <span>
                                    {`${parcelasTotal}x de ${formatCurrencyBRL(valorParcela)}`}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="gasto-acoes">
                            <div className="gasto-valor">
                              {formatCurrencyBRL(valorTotal)}
                            </div>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleSelectGasto(g)}
                            >
                              Editar
                            </button>
                          </div>
                        </li>
                      );
                      })}
                    </ul>
                  </>
                );
              })()}
            </section>
          )}

        {isAdmin &&
          activePanel === "admin" &&
          adminPage === "workspace" &&
          adminActiveTab === "pagamentos" && (
            <section className="card-section">
              <strong>Pagamentos do usuário</strong>
              <p className="section-subtitle">
                Use o botão abaixo para registrar um novo pagamento para o
                usuário selecionado.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  disabled={saving || !targetUserId}
                  onClick={() => setUserActiveForm("pagamento")}
                >
                  Novo pagamento
                </button>
              </div>
              {(() => {
                if (filteredPagamentos.length === 0) {
                  return (
                    <p className="section-subtitle">
                      Nenhum pagamento foi encontrado para este usuário.
                    </p>
                  );
                }

                return (
                  <>
                    <p className="section-subtitle">
                      Pagamentos registrados para este usuário. Aqui você pode
                      revisar, editar valores ou cancelar um pagamento.
                    </p>
                    <div className="button-row">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleExportAdminPagamentosCsv}
                      >
                        Exportar CSV
                      </button>
                    </div>
                    <ul className="admin-pagamentos-list">
                      {filteredPagamentos.map((p) => {
                      const dataStr = p.data_pagamento
                        ? p.data_pagamento.slice(0, 10)
                        : "-";
                      const descricao = p.descricao || "Pagamento";
                      const valorNum = Number(p.valor || 0);
                      return (
                        <li key={p.id} className="admin-pagamento-item">
                          <div className="admin-pagamento-textos">
                            <div className="admin-pagamento-descricao">
                              {descricao}
                            </div>
                            <div className="admin-pagamento-meta">
                              <span>{dataStr}</span>
                            </div>
                          </div>
                          <div className="gasto-acoes">
                            <div className="admin-pagamento-valor">
                              {formatCurrencyBRL(valorNum)}
                            </div>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleSelectPagamento(p)}
                            >
                              Editar
                            </button>
                          </div>
                        </li>
                      );
                      })}
                    </ul>
                  </>
                );
              })()}
            </section>
          )}

        {(() => {
          if (
            !isAdmin ||
            activePanel !== "admin" ||
            adminPage !== "workspace" ||
            adminActiveTab !== "faturas"
          ) {
            return null;
          }

          return (
          <section className="card-section">
            <SectionHeader
              title="Solicitações de fatura (PDF)"
              subtitle="Pedidos feitos pelos usuários. Gere o PDF com os dados do sistema ou anexe um PDF pronto."
            />

            {adminInvoiceRequestsError && (
              <div className="error">{adminInvoiceRequestsError}</div>
            )}
            {adminInvoiceRequestsMessage && (
              <div className="success">{adminInvoiceRequestsMessage}</div>
            )}

            <div className="button-row mt-1">
              <button
                type="button"
                className="button--sm button--ghost"
                disabled={adminInvoiceRequestsLoading || saving}
                onClick={() => setAdminInvoiceRequestsReloadToken((t) => t + 1)}
              >
                {adminInvoiceRequestsLoading ? "Atualizando..." : "Atualizar lista"}
              </button>
            </div>

            {(() => {
              if (adminInvoiceRequestsLoading) {
                return (
                  <p className="section-subtitle">Carregando solicitações...</p>
                );
              }

              if (adminInvoiceRequests.length === 0) {
                return (
                  <p className="section-subtitle">
                    Nenhuma solicitação pendente foi encontrada.
                  </p>
                );
              }

              return (
                <ul className="admin-pagamentos-list">
                  {adminInvoiceRequests.map((req: any) => {
                  const id = String(req?.id || "");
                  const cycle = String(req?.cycle || "-");
                  const userId = String(req?.user_id || "-");
                  const status = String(req?.status || "pending");
                  const userName = String(req?.user_name || "").trim();
                  const username = req?.username ? String(req.username) : null;
                  let label = userId;
                  if (userName) {
                    label = userName;
                    if (username) {
                      label = `${userName} (@${username})`;
                    }
                  } else if (username) {
                    label = `@${username}`;
                  }
                  const uploadInputId = `upload_${id || `${userId}_${cycle}`}`;

                  async function handleGenerate() {
                    setAdminInvoiceRequestsError(null);
                    setAdminInvoiceRequestsMessage(null);
                    setSaving(true);
                    try {
                      const resp = await fetch(
                        `${functionsBaseUrl}/adminGenerateInvoicePdf`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "x-telegram-init-data": webApp?.initData ?? "",
                          },
                          body: JSON.stringify({ userId, cycle }),
                        },
                      );

                      const data = await resp.json().catch(() => null);
                      if (!resp.ok) {
                        setAdminInvoiceRequestsError(
                          data?.error || "Erro ao gerar PDF.",
                        );
                        return;
                      }
                      setAdminInvoiceRequestsMessage(
                        `PDF gerado para ${label} (${cycle}).`,
                      );
                      setAdminInvoiceRequestsReloadToken((t) => t + 1);
                    } catch (err: any) {
                      console.error("Erro ao gerar invoice PDF", err);
                      setAdminInvoiceRequestsError(
                        err?.message ?? "Erro ao gerar PDF.",
                      );
                    } finally {
                      setSaving(false);
                    }
                  }

                  async function handleUpload(file: File) {
                    setAdminInvoiceRequestsError(null);
                    setAdminInvoiceRequestsMessage(null);
                    setSaving(true);
                    try {
                      const prepResp = await fetch(
                        `${functionsBaseUrl}/adminCreateInvoiceUploadUrl`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "x-telegram-init-data": webApp?.initData ?? "",
                          },
                          body: JSON.stringify({ userId, cycle }),
                        },
                      );
                      const prepData = await prepResp.json().catch(() => null);
                      if (!prepResp.ok) {
                        setAdminInvoiceRequestsError(
                          prepData?.error || "Erro ao preparar upload.",
                        );
                        return;
                      }

                      const uploadUrl = prepData?.upload_url;
                      const requestId = prepData?.request_id;
                      if (!uploadUrl || !requestId) {
                        setAdminInvoiceRequestsError(
                          "Resposta inválida ao preparar upload.",
                        );
                        return;
                      }

                      const putResp = await fetch(uploadUrl, {
                        method: "PUT",
                        headers: {
                          "Content-Type": "application/pdf",
                        },
                        body: file,
                      });
                      if (!putResp.ok) {
                        setAdminInvoiceRequestsError(
                          `Falha no upload do PDF (HTTP ${putResp.status}).`,
                        );
                        return;
                      }

                      const finResp = await fetch(
                        `${functionsBaseUrl}/adminMarkInvoiceUploaded`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "x-telegram-init-data": webApp?.initData ?? "",
                          },
                          body: JSON.stringify({ requestId }),
                        },
                      );
                      const finData = await finResp.json().catch(() => null);
                      if (!finResp.ok) {
                        setAdminInvoiceRequestsError(
                          finData?.error || "Erro ao finalizar upload.",
                        );
                        return;
                      }

                      setAdminInvoiceRequestsMessage(
                        `PDF anexado para ${label} (${cycle}).`,
                      );
                      setAdminInvoiceRequestsReloadToken((t) => t + 1);
                    } catch (err: any) {
                      console.error("Erro ao anexar invoice PDF", err);
                      setAdminInvoiceRequestsError(
                        err?.message ?? "Erro ao anexar PDF.",
                      );
                    } finally {
                      setSaving(false);
                    }
                  }

                  return (
                    <li
                      key={id || `${userId}_${cycle}`}
                      className="admin-pagamento-item"
                    >
                      <div className="admin-pagamento-textos">
                        <div className="admin-pagamento-descricao">{label}</div>
                        <div className="admin-pagamento-meta">
                          <span>ID {userId}</span>
                          <span>•</span>
                          <span>Ciclo {cycle}</span>
                          <span>•</span>
                          <span>Status: {status}</span>
                        </div>
                      </div>
                      <div className="gasto-acoes">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handleGenerate}
                        >
                          Gerar PDF
                        </button>
                        <label
                          htmlFor={uploadInputId}
                          className="button--sm"
                          style={{ cursor: saving ? "not-allowed" : "pointer" }}
                        >
                          <span>Anexar PDF</span>
                        </label>
                        <input
                          id={uploadInputId}
                          type="file"
                          accept="application/pdf"
                          disabled={saving}
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.currentTarget.value = "";
                            if (!f) return;
                            handleUpload(f);
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
                </ul>
              );
            })()}
          </section>
          );
        })()}
      </div>
    </div>
  );
}

export default App;
