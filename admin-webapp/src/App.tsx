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

const ADMIN_WEBAPP_USER_IDS = new Set<string>(["7108400574"]);

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
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
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
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
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
      month = 1;
      year += 1;
    }
  }
  return `${String(month).padStart(2, "0")}/${year}`;
}

function getGastoCycles(g: any): string[] {
  const iso = (g && g.data_compra) as string | null | undefined;
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
      month = 1;
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

function getSaldoAcumuladoInfo(valor: number): { label: string; color: string } {
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
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsv(rows: any[][]): string {
  return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
}

function downloadTextFile(filename: string, content: string, mime: string): void {
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

function App() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [gastos, setGastos] = useState<any[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [billingCycles, setBillingCycles] = useState<string[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string | null>(null);
  const [cycleSummary, setCycleSummary] = useState<
    | {
        parcelas_mes: number;
        pagamentos_mes: number;
        saldo_mes: number;
        saldo_acumulado: number;
        saldo_acumulado_bruto: number;
        saldo_quitado_ate_base: number;
        base_mes: number;
        base_ano: number;
      }
    | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [selectedGastoId, setSelectedGastoId] = useState<string | null>(null);
  const [editGastoValorTotal, setEditGastoValorTotal] = useState<string>("");
  const [editGastoParcelas, setEditGastoParcelas] = useState<string>("");
  const [selectedPagamentoId, setSelectedPagamentoId] = useState<string | null>(
    null
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
  const [userActionMessage, setUserActionMessage] = useState<string | null>(
    null
  );
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryReloadToken, setSummaryReloadToken] = useState(0);
  const [userOverview, setUserOverview] = useState<any | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userReloadToken, setUserReloadToken] = useState(0);
  const [userPanelError, setUserPanelError] = useState<string | null>(null);
  const [userPanelMessage, setUserPanelMessage] = useState<string | null>(
    null
  );
  const [userGastoDescricao, setUserGastoDescricao] = useState<string>("");
  const [userGastoValor, setUserGastoValor] = useState<string>("");
  const [userGastoParcelas, setUserGastoParcelas] = useState<string>("");
  const [userGastoCategoria, setUserGastoCategoria] = useState<string>("");
  const [userPagamentoValor, setUserPagamentoValor] = useState<string>("");
  const [userPagamentoDescricao, setUserPagamentoDescricao] =
    useState<string>("");
  const [userBillingCycles, setUserBillingCycles] = useState<string[]>([]);
  const [userSelectedCycle, setUserSelectedCycle] = useState<string | null>(
    null
  );
  const [userRecurringGastos, setUserRecurringGastos] = useState<any[]>([]);
  const [userRecurringLoading, setUserRecurringLoading] = useState(false);
  const [userRecurringError, setUserRecurringError] = useState<string | null>(
    null
  );
  const [userRecurringReloadToken, setUserRecurringReloadToken] = useState(0);
  const [selectedRecurringId, setSelectedRecurringId] = useState<string | null>(
    null
  );
  const [recurringDescricao, setRecurringDescricao] = useState<string>("");
  const [recurringValor, setRecurringValor] = useState<string>("");
  const [recurringCategoria, setRecurringCategoria] = useState<string>("");
  const [recurringMessage, setRecurringMessage] = useState<string | null>(null);
  const [userGastosList, setUserGastosList] = useState<any[]>([]);
  const [userPagamentosList, setUserPagamentosList] = useState<any[]>([]);
  const [userLancamentosLoading, setUserLancamentosLoading] = useState(false);
  const [userLancamentosError, setUserLancamentosError] = useState<string | null>(
    null
  );
  const [selectedUserGasto, setSelectedUserGasto] = useState<any | null>(null);
  const [userEditGastoDescricao, setUserEditGastoDescricao] = useState<string>(
    ""
  );
  const [userEditGastoValor, setUserEditGastoValor] = useState<string>("");
  const [userEditGastoParcelas, setUserEditGastoParcelas] = useState<string>(
    ""
  );
  const [userEditGastoCategoria, setUserEditGastoCategoria] =
    useState<string>("");
  const [selectedUserPagamento, setSelectedUserPagamento] = useState<any | null>(
    null
  );
  const [userEditPagamentoDescricao, setUserEditPagamentoDescricao] =
    useState<string>("");
  const [userEditPagamentoValor, setUserEditPagamentoValor] =
    useState<string>("");
  const [userShowAllExtrato, setUserShowAllExtrato] = useState(false);
  const [userExtratoFilter, setUserExtratoFilter] = useState<
    "all" | "gastos" | "pagamentos"
  >("all");
  const [userPrevTotals, setUserPrevTotals] = useState<any | null>(null);
  const [userOverviewCache, setUserOverviewCache] = useState<
    Record<string, any>
  >({});
  const [userRequestingAccess, setUserRequestingAccess] = useState(false);
  const [activePanel, setActivePanel] = useState<"user" | "admin">("user");
  const [adminActiveTab, setAdminActiveTab] = useState<
    "overview" | "lancamentos" | "pagamentos" | "config"
  >("overview");
  const [userActiveForm, setUserActiveForm] = useState<
    | null
    | "gasto"
    | "pagamento"
    | "recorrente"
    | "edit_gasto"
    | "edit_pagamento"
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
      wa.ready();
    }
  }, []);

  const isAdmin =
    !!user && ADMIN_WEBAPP_USER_IDS.has(String(user.id));

  const functionsBaseUrl =
    "https://us-central1-bot-cartao-credito.cloudfunctions.net";

  useEffect(() => {
    async function fetchUserLancamentos() {
      if (!webApp || !webApp.initData) {
        setUserGastosList([]);
        setUserPagamentosList([]);
        return;
      }

      if (userOverview && userOverview.autorizado === false) {
        setUserGastosList([]);
        setUserPagamentosList([]);
        return;
      }

      setUserLancamentosLoading(true);
      setUserLancamentosError(null);
      try {
        const headers: HeadersInit = {
          "x-telegram-init-data": webApp.initData,
        };

        const [respGastos, respPagamentos] = await Promise.all([
          fetch(`${functionsBaseUrl}/userListGastos?limit=100`, { headers }),
          fetch(`${functionsBaseUrl}/userListPagamentos?limit=100`, { headers }),
        ]);

        let dataGastos: any = null;
        let dataPagamentos: any = null;
        try {
          dataGastos = await respGastos.json();
        } catch {
          dataGastos = null;
        }
        try {
          dataPagamentos = await respPagamentos.json();
        } catch {
          dataPagamentos = null;
        }

        if (!respGastos.ok) {
          setUserGastosList([]);
          setUserLancamentosError(
            (dataGastos && dataGastos.error) || "Erro ao carregar seus gastos."
          );
        } else {
          setUserGastosList(
            Array.isArray(dataGastos?.itens) ? dataGastos.itens : []
          );
        }

        if (!respPagamentos.ok) {
          setUserPagamentosList([]);
          setUserLancamentosError(
            (dataPagamentos && dataPagamentos.error) ||
              "Erro ao carregar seus pagamentos."
          );
        } else {
          setUserPagamentosList(
            Array.isArray(dataPagamentos?.itens) ? dataPagamentos.itens : []
          );
        }
      } catch (err: any) {
        console.error("Erro ao carregar lançamentos do usuário", err);
        setUserGastosList([]);
        setUserPagamentosList([]);
        setUserLancamentosError(
          err?.message || "Erro ao carregar seus lançamentos."
        );
      } finally {
        setUserLancamentosLoading(false);
      }
    }

    fetchUserLancamentos();
  }, [webApp, functionsBaseUrl, userReloadToken, userSelectedCycle, userOverview]);

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
        : ""
    );
    const parcelas = Number(item?.parcelas_total || 1);
    setUserEditGastoParcelas(
      Number.isFinite(parcelas) && parcelas > 1 ? String(parcelas) : ""
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
        : ""
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

    if (!webApp || !webApp.initData) {
      setUserLancamentosError(
        "Este mini app deve ser aberto dentro do Telegram para editar lançamentos de verdade."
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
          "x-telegram-init-data": webApp.initData,
        },
        body: JSON.stringify(body),
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
      "text/csv;charset=utf-8"
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
      "text/csv;charset=utf-8"
    );
  }

  async function handleUserCancelGasto() {
    setUserLancamentosError(null);
    setUserPanelMessage(null);

    if (!selectedUserGasto?.id) {
      return;
    }

    if (!webApp || !webApp.initData) {
      setUserLancamentosError(
        "Este mini app deve ser aberto dentro do Telegram para cancelar lançamentos de verdade."
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja cancelar (inativar) este gasto?"
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
          "x-telegram-init-data": webApp.initData,
        },
        body: JSON.stringify({ gastoId: String(selectedUserGasto.id) }),
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

    if (!webApp || !webApp.initData) {
      setUserLancamentosError(
        "Este mini app deve ser aberto dentro do Telegram para editar lançamentos de verdade."
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
          "x-telegram-init-data": webApp.initData,
        },
        body: JSON.stringify(body),
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

    if (!webApp || !webApp.initData) {
      setUserLancamentosError(
        "Este mini app deve ser aberto dentro do Telegram para cancelar lançamentos de verdade."
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja cancelar este pagamento?"
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
          "x-telegram-init-data": webApp.initData,
        },
        body: JSON.stringify({ pagamentoId: String(selectedUserPagamento.id) }),
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
    } catch (err: any) {
      console.error("Erro ao cancelar pagamento", err);
      setUserLancamentosError(err?.message || "Erro ao cancelar pagamento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUserRequestAccess() {
    if (!webApp || !webApp.initData) {
      return;
    }

    setUserRequestingAccess(true);
    setUserPanelError(null);
    setUserPanelMessage(null);

    try {
      const headers: HeadersInit = {
        "x-telegram-init-data": webApp.initData,
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
          (data && data.error) ||
            "Erro ao enviar pedido de liberação de acesso."
        );
        return;
      }

      setUserPanelMessage(
        data?.message ||
          "Seu pedido de liberação foi enviado. Assim que for aprovado, volte a abrir o mini app."
      );
    } catch (err: any) {
      console.error("Erro em handleUserRequestAccess", err);
      setUserPanelError(
        err?.message || "Erro ao enviar pedido de liberação de acesso."
      );
    } finally {
      setUserRequestingAccess(false);
    }
  }

  useEffect(() => {
    async function fetchUserRecurringGastos() {
      if (!webApp || !webApp.initData) {
        setUserRecurringGastos([]);
        return;
      }

      if (userOverview && userOverview.autorizado === false) {
        setUserRecurringGastos([]);
        return;
      }

      setUserRecurringLoading(true);
      setUserRecurringError(null);
      try {
        const headers: HeadersInit = {
          "x-telegram-init-data": webApp.initData,
        };

        const resp = await fetch(
          `${functionsBaseUrl}/userListRecurringGastos`,
          { headers }
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
            (data && data.error) || "Erro ao carregar gastos recorrentes."
          );
          return;
        }

        const itens = Array.isArray(data?.itens) ? data.itens : [];
        setUserRecurringGastos(itens);
      } catch (err: any) {
        console.error("Erro ao carregar gastos recorrentes", err);
        setUserRecurringGastos([]);
        setUserRecurringError(
          err?.message || "Erro ao carregar gastos recorrentes."
        );
      } finally {
        setUserRecurringLoading(false);
      }
    }

    fetchUserRecurringGastos();
  }, [webApp, functionsBaseUrl, userRecurringReloadToken, userOverview]);

  useEffect(() => {
    async function applyRecurringToSelectedCycle() {
      if (!webApp || !webApp.initData) {
        return;
      }

      if (!userSelectedCycle) {
        return;
      }

      if (userOverview && userOverview.autorizado === false) {
        return;
      }

      setRecurringMessage(null);
      try {
        const resp = await fetch(`${functionsBaseUrl}/userApplyRecurringGastos`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data": webApp.initData,
          },
          body: JSON.stringify({ cycle: userSelectedCycle }),
        });

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
            `Adicionamos ${created} gasto(s) recorrente(s) neste ciclo.`
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

    if (!webApp || !webApp.initData) {
      setUserRecurringError(
        "Este mini app deve ser aberto dentro do Telegram para registrar dados de verdade."
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
          "x-telegram-init-data": webApp.initData,
        },
        body: JSON.stringify(body),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setUserRecurringError(
          (data && data.error) || "Erro ao salvar gasto recorrente."
        );
        return;
      }

      setRecurringMessage(
        selectedRecurringId
          ? "Gasto recorrente atualizado."
          : "Gasto recorrente criado."
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

    if (!webApp || !webApp.initData) {
      setUserRecurringError(
        "Este mini app deve ser aberto dentro do Telegram para registrar dados de verdade."
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja desativar este gasto recorrente?"
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
          "x-telegram-init-data": webApp.initData,
        },
        body: JSON.stringify({ id: selectedRecurringId }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setUserRecurringError(
          (data && data.error) || "Erro ao desativar gasto recorrente."
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
        err?.message || "Erro ao desativar gasto recorrente."
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    async function fetchUserOverview() {
      if (!webApp || !webApp.initData) {
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
          "x-telegram-init-data": webApp.initData,
        };

        let url = `${functionsBaseUrl}/userGetOverview`;
        if (userSelectedCycle) {
          const [mesStr, anoStr] = userSelectedCycle.split("/");
          const mes = Number.parseInt(mesStr, 10);
          const ano = Number.parseInt(anoStr, 10);
          if (Number.isFinite(mes) && Number.isFinite(ano)) {
            url += `?mes=${mes}&ano=${ano}`;
          }
        }

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
          if (resp.status === 403 && data && data.autorizado === false) {
            setUserOverview({
              autorizado: false,
              error:
                data.error ||
                "Seu acesso ainda não foi liberado para este mini app.",
              isAdmin: data.isAdmin ?? false,
              user_id:
                data.user_id ?? (user ? String(user.id) : null),
            });
            return;
          }

          setUserOverview(null);
          setUserPanelError(
            (data && data.error) ||
              "Erro ao carregar o resumo da sua conta."
          );
          return;
        }

        setUserOverview(data);

        setUserOverviewCache((prev) => ({
          ...prev,
          [cacheKey]: data,
        }));
      } catch (err: any) {
        console.error("Erro ao carregar resumo do usuário", err);
        setUserPanelError(
          err?.message || "Erro ao carregar o resumo da sua conta."
        );
      } finally {
        setUserLoading(false);
      }
    }

    fetchUserOverview();
  }, [webApp, functionsBaseUrl, userReloadToken, user, userSelectedCycle]);

  useEffect(() => {
    async function fetchUserPrevTotals() {
      if (!webApp || !webApp.initData) {
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
          "x-telegram-init-data": webApp.initData,
        };
        const urlPrev = `${functionsBaseUrl}/userGetOverview?mes=${prevMes}&ano=${prevAno}`;
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

        const prev =
          dataPrev &&
          dataPrev.extrato_atual &&
          dataPrev.extrato_atual.totais
            ? dataPrev.extrato_atual.totais
            : null;

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
      if (!webApp || !webApp.initData) {
        setUserBillingCycles([]);
        return;
      }

      try {
        const headers: HeadersInit = {
          "x-telegram-init-data": webApp.initData,
        };
        const resp = await fetch(
          `${functionsBaseUrl}/userListBillingCycles`,
          { headers }
        );

        if (!resp.ok) {
          setUserBillingCycles([]);
          return;
        }

        let data: any = null;
        try {
          data = await resp.json();
        } catch {
          data = null;
        }

        const rawCycles = Array.isArray(data?.cycles) ? data.cycles : [];

        const validCycles = rawCycles.filter((cycle: any) => {
          if (typeof cycle !== "string") {
            return false;
          }
          const parts = cycle.split("/");
          if (parts.length !== 2) {
            return false;
          }
          const [mStr, yStr] = parts;
          const m = Number(mStr);
          const y = Number(yStr);
          return (
            Number.isFinite(m) &&
            Number.isFinite(y) &&
            m >= 1 &&
            m <= 12 &&
            y >= 2000 &&
            y <= 2100
          );
        });

        const cycles = validCycles;
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
              alvoMes = 1;
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
      } catch (err) {
        console.error("Erro ao carregar ciclos do usuário", err);
        setUserBillingCycles([]);
      }
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
          "x-telegram-init-data": webApp.initData,
        };

        const resp = await fetch(
          `${functionsBaseUrl}/adminResumoFatura?userId=${encodeURIComponent(
            targetUserId.trim()
          )}&mes=${mes}&ano=${ano}`,
          { headers }
        );

        if (!resp.ok) {
          setCycleSummary(null);
          return;
        }

        const data = await resp.json();
        const totais = data?.totais || {};
        const saldoAcumulado = Number(
          (totais.saldo_acumulado ?? totais.saldo_mes) || 0
        );
        setCycleSummary({
          parcelas_mes: Number(totais.parcelas_mes || 0),
          pagamentos_mes: Number(totais.pagamentos_mes || 0),
          saldo_mes: Number(totais.saldo_mes || 0),
          saldo_acumulado: saldoAcumulado,
          saldo_acumulado_bruto: Number(
            (totais.saldo_acumulado_bruto ?? saldoAcumulado) || 0
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
  }, [selectedCycle, webApp, targetUserId, functionsBaseUrl, summaryReloadToken]);

  async function handleTargetUserChange(value: string) {
    setTargetUserId(value);
    setError(null);
    setActionMessage(null);
    setUserDetails(null);

    const term = value.trim();

    if (!webApp?.initData) {
      setUserSuggestions([]);
      return;
    }

    try {
      const headers: HeadersInit = {
        "x-telegram-init-data": webApp.initData,
      };

      const resp = await fetch(
        `${functionsBaseUrl}/adminSearchUsuarios?q=${encodeURIComponent(
          term
        )}`,
        { headers }
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
        }))
      );
    } catch (err) {
      console.error("Erro ao buscar usuários", err);
      setUserSuggestions([]);
    }
  }

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
    setError(null);
    setUserActionMessage(null);

    if (!userDetails || !userDetails.id) {
      setError("Nenhum usuário carregado.");
      return;
    }

    if (!webApp?.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais."
      );
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/adminUpdateUsuario`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp.initData,
        },
        body: JSON.stringify({
          userId: String(userDetails.id),
          name: editUserName,
          username: editUserUsername.trim() || null,
          ativo: editUserAtivo,
          autorizado: editUserAutorizado,
        }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setError((data && data.error) || "Erro ao atualizar usuário.");
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
            }
          : current
      );

      setUserActionMessage("Dados do usuário atualizados com sucesso.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro ao atualizar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadData(event: React.FormEvent) {
    event.preventDefault();
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
    setUserSuggestions([]);

    const userId = targetUserId.trim();
    if (!userId) {
      setError("Informe o ID do usuário alvo.");
      return;
    }

    if (!webApp?.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para carregar dados reais."
      );
      return;
    }

    setLoading(true);
    try {
      const headers: HeadersInit = {
        "x-telegram-init-data": webApp.initData,
      };

      const [gastosResp, pagamentosResp, usuarioResp] = await Promise.all([
        fetch(
          `${functionsBaseUrl}/adminListGastos?userId=${encodeURIComponent(
            userId
          )}&limit=500`,
          { headers }
        ),
        fetch(
          `${functionsBaseUrl}/adminListPagamentos?userId=${encodeURIComponent(
            userId
          )}&limit=500`,
          { headers }
        ),
        fetch(
          `${functionsBaseUrl}/adminGetUsuario?userId=${encodeURIComponent(
            userId
          )}`,
          { headers }
        ),
      ]);

      if (!gastosResp.ok) {
        throw new Error(`Erro ao carregar gastos (${gastosResp.status}).`);
      }
      if (!pagamentosResp.ok) {
        throw new Error(
          `Erro ao carregar pagamentos (${pagamentosResp.status}).`
        );
      }

      const gastosJson = await gastosResp.json();
      const pagamentosJson = await pagamentosResp.json();
      let usuarioJson: any | null = null;
      if (usuarioResp.ok) {
        try {
          usuarioJson = await usuarioResp.json();
        } catch {
          usuarioJson = null;
        }
      }

      const newGastos = Array.isArray(gastosJson.itens)
        ? gastosJson.itens
        : [];
      const newPagamentos = Array.isArray(pagamentosJson.itens)
        ? pagamentosJson.itens
        : [];

      setGastos(newGastos);
      setPagamentos(newPagamentos);

      if (usuarioJson && usuarioJson.dados) {
        const dados = usuarioJson.dados;
        setUserDetails(dados);
        setEditUserName(String(dados.name || ""));
        setEditUserUsername(dados.username ?? "");
        setEditUserAtivo(dados.ativo !== false);
        setEditUserAutorizado(!!dados.autorizado);
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
      const maxIndex = currentYear * 12 + currentMonth + 1; // fatura atual + 1

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
        // Escolha do ciclo padrão:
        // - Até 1 dia após o vencimento, preferir a fatura "atual".
        // - Depois disso, preferir a fatura "futura" (próximo ciclo), se existir.
        const diaVencimento = 10;
        const hojeDia = now.getDate();

        let alvoMes = currentMonth;
        let alvoAno = currentYear;

        if (hojeDia >= diaVencimento + 1) {
          alvoMes += 1;
          if (alvoMes > 12) {
            alvoMes = 1;
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

      // Após carregar os dados com sucesso, levar o admin direto
      // para a aba de Lançamentos, que é onde ele mais atua.
      setAdminActiveTab("lancamentos");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
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

    if (!webApp || !webApp.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais."
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
          "x-telegram-init-data": webApp.initData,
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
            : g
        )
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

    if (!webApp || !webApp.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais."
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja inativar este gasto?"
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
          "x-telegram-init-data": webApp.initData,
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

    if (!webApp || !webApp.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais."
      );
      return;
    }

    setSaving(true);
    try {
      const resp = await fetch(`${functionsBaseUrl}/adminEditPagamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": webApp.initData,
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
            : p
        )
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

    if (!webApp || !webApp.initData) {
      setError(
        "Este painel deve ser aberto dentro do Telegram para executar ações reais."
      );
      return;
    }

    const confirmed = globalThis.confirm(
      "Tem certeza que deseja cancelar este pagamento?"
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
          "x-telegram-init-data": webApp.initData,
        },
        body: JSON.stringify({ pagamentoId: selectedPagamentoId }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data?.error || "Erro ao cancelar pagamento.");
        return;
      }

      setPagamentos((current) =>
        current.filter((p) => p.id !== selectedPagamentoId)
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

    if (!webApp || !webApp.initData) {
      setUserPanelError(
        "Este mini app deve ser aberto dentro do Telegram para registrar gastos de verdade."
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
          "x-telegram-init-data": webApp.initData,
        },
        body: JSON.stringify(body),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setUserPanelError(
          (data && data.error) || "Erro ao registrar gasto."
        );
        return;
      }

      setUserPanelMessage("Gasto registrado com sucesso.");
      setUserGastoDescricao("");
      setUserGastoCategoria("");
      setUserGastoValor("");
      setUserGastoParcelas("");
      setUserActiveForm(null);
      setUserReloadToken((token) => token + 1);
    } catch (err: any) {
      console.error("Erro ao registrar gasto", err);
      setUserPanelError(
        err?.message || "Erro ao registrar gasto."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUserRegistrarPagamento(event: React.FormEvent) {
    event.preventDefault();
    setUserPanelError(null);
    setUserPanelMessage(null);

    if (!webApp || !webApp.initData) {
      setUserPanelError(
        "Este mini app deve ser aberto dentro do Telegram para registrar pagamentos de verdade."
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
      const resp = await fetch(
        `${functionsBaseUrl}/userRegistrarPagamento`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data": webApp.initData,
          },
          body: JSON.stringify(body),
        }
      );

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }

      if (!resp.ok) {
        setUserPanelError(
          (data && data.error) || "Erro ao registrar pagamento."
        );
        return;
      }

      setUserPanelMessage("Pagamento registrado com sucesso.");
      setUserPagamentoValor("");
      setUserPagamentoDescricao("");
      setUserActiveForm(null);
      setUserReloadToken((token) => token + 1);
    } catch (err: any) {
      console.error("Erro ao registrar pagamento", err);
      setUserPanelError(
        err?.message || "Erro ao registrar pagamento."
      );
    } finally {
      setSaving(false);
    }
  }

  const userSaldoAtual = Number(
    (userOverview && userOverview.saldo_atual) || 0
  );
  const userMesRef = userOverview && userOverview.mes_ref;
  const userAnoRef = userOverview && userOverview.ano_ref;
  const userTotais =
    userOverview &&
    userOverview.extrato_atual &&
    userOverview.extrato_atual.totais
      ? userOverview.extrato_atual.totais
      : null;

  const userSaldoMes = userTotais
    ? Number(userTotais.saldo_mes || 0)
    : 0;
  let userSaldoMesColor = "#e5e7eb";
  if (Number.isFinite(userSaldoMes) && Math.abs(userSaldoMes) >= 0.005) {
    userSaldoMesColor = userSaldoMes > 0 ? "#f97373" : "#4ade80";
  }

  const userSaldoGeral = userSaldoAtual;
  let userMainNumberColor = "#e5e7eb";
  let userMainNumberLabel = "Saldo até este ciclo";
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
          Math.abs(diffGastos)
        )} a mais do que no ciclo anterior.`;
      } else {
        userComparativoTexto = `Neste ciclo você gastou ${formatCurrencyBRL(
          Math.abs(diffGastos)
        )} a menos do que no ciclo anterior.`;
      }
    }
  }

  const userExtratoItens: any[] =
    userOverview &&
    userOverview.extrato_atual &&
    Array.isArray(userOverview.extrato_atual.itens)
      ? userOverview.extrato_atual.itens
      : [];

  const userCategoriasResumo = (() => {
    const totals: Record<string, number> = {};
    for (const item of userExtratoItens) {
      const tipoLower = String(item?.tipo || "").toLowerCase();
      const isPagamento = tipoLower === "pagamento" || tipoLower === "pagamentos";
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
    const tipo = String(item.tipo || "").toLowerCase();
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
        (p) => getCycleFromIsoDate(p.data_pagamento) === selectedCycle
      )
    : pagamentos;

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
      <div className="card">
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
                    Descrição:
                    <input
                      type="text"
                      value={userEditGastoDescricao}
                      onChange={(e) => setUserEditGastoDescricao(e.target.value)}
                    />
                  </label>
                  <label>
                    Categoria:
                    <input
                      type="text"
                      value={userEditGastoCategoria}
                      onChange={(e) => setUserEditGastoCategoria(e.target.value)}
                      placeholder="Ex: alimentação, transporte"
                    />
                  </label>
                  <label>
                    Valor total (R$):
                    <input
                      type="text"
                      value={userEditGastoValor}
                      onChange={(e) => setUserEditGastoValor(e.target.value)}
                    />
                  </label>
                  <label>
                    Parcelas (opcional):
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
                    Descrição:
                    <input
                      type="text"
                      value={userEditPagamentoDescricao}
                      onChange={(e) =>
                        setUserEditPagamentoDescricao(e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Valor (R$):
                    <input
                      type="text"
                      value={userEditPagamentoValor}
                      onChange={(e) => setUserEditPagamentoValor(e.target.value)}
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
                    Descrição:
                    <input
                      type="text"
                      value={recurringDescricao}
                      onChange={(e) => setRecurringDescricao(e.target.value)}
                      placeholder="Ex: academia"
                    />
                  </label>
                  <label>
                    Categoria:
                    <input
                      type="text"
                      value={recurringCategoria}
                      onChange={(e) => setRecurringCategoria(e.target.value)}
                      placeholder="Ex: saúde"
                    />
                  </label>
                  <label>
                    Valor (R$):
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
                  Informe os dados do novo gasto que será considerado na fatura do seu cartão.
                </p>
                <form onSubmit={handleUserRegistrarGasto} className="form">
                  <label>
                    Descrição do gasto:
                    <input
                      type="text"
                      value={userGastoDescricao}
                      onChange={(e) => setUserGastoDescricao(e.target.value)}
                      placeholder="Ex: mercado, assinatura, restaurante"
                    />
                  </label>
                  <label>
                    Categoria:
                    <input
                      type="text"
                      value={userGastoCategoria}
                      onChange={(e) => setUserGastoCategoria(e.target.value)}
                      placeholder="Ex: alimentação"
                    />
                  </label>
                  <label>
                    Valor total (R$):
                    <input
                      type="text"
                      value={userGastoValor}
                      onChange={(e) => setUserGastoValor(e.target.value)}
                      placeholder="Ex: 150,00"
                    />
                  </label>
                  <label>
                    Parcelas (opcional):
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
                    Valor do pagamento (R$):
                    <input
                      type="text"
                      value={userPagamentoValor}
                      onChange={(e) => setUserPagamentoValor(e.target.value)}
                      placeholder="Ex: 500,00"
                    />
                  </label>
                  <label>
                    Descrição (opcional):
                    <input
                      type="text"
                      value={userPagamentoDescricao}
                      onChange={(e) => setUserPagamentoDescricao(e.target.value)}
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
                    Novo valor total (R$):
                    <input
                      type="text"
                      value={editGastoValorTotal}
                      onChange={(e) => setEditGastoValorTotal(e.target.value)}
                    />
                  </label>
                  <label>
                    Novas parcelas (opcional):
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
                    Considera apenas a fatura selecionada: parcelas/gastos do ciclo menos pagamentos do ciclo.
                  </p>
                </>
              )}
              {infoDialog === "saldo_acumulado" && (
                <>
                  <h2 className="modal-title">Saldo acumulado</h2>
                  <p>
                    Considera o saldo total do cartão até o ciclo selecionado, com o ajuste do ciclo base.
                  </p>
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
                    Novo valor (R$):
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
            <h1 className="app-title">Controle de crédito</h1>
            <span className="app-version-badge">v{APP_VERSION}</span>
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
              onClick={() => setActivePanel("user")}
            >
              Meu cartão
            </button>
            <button
              type="button"
              className={
                "app-nav-button" +
                (activePanel === "admin" ? " app-nav-button--active" : "")
              }
              onClick={() => setActivePanel("admin")}
            >
              Painel admin
            </button>
          </div>
        )}

        <section className="card-section">
          <strong>{isAdmin ? "Admin conectado:" : "Usuário conectado:"}</strong>
          <div>
            {user ? (
              <>
                <div>ID: {user.id}</div>
                <div>Nome: {user.first_name}</div>
                <div>Username: {user.username ? `@${user.username}` : "-"}</div>
              </>
            ) : (
              <div>Usuário não identificado pelo Telegram WebApp.</div>
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
              </div>
            )}

            {userPanelError && <div className="error mt-2">{userPanelError}</div>}
            {userPanelMessage && (
              <div className="success mt-2">{userPanelMessage}</div>
            )}

            {userOverview && userOverview.autorizado === false ? (
              <div className="subcard">
                <div className="section-title">Acesso ainda não liberado</div>
                <p className="section-subtitle section-subtitle--tight">
                  Aguarde um administrador liberar seu acesso pelo painel.
                </p>
              </div>
            ) : (
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
                    {userOverview?.username
                      ? `@${userOverview.username}`
                      : user?.username
                      ? `@${user.username}`
                      : "-"}
                  </div>
                  <div className="user-overview-balance">
                    <div className="muted-text">Saldo geral do cartão</div>
                    <div>
                      <strong>{formatCurrencyBRL(userSaldoAtual)}</strong>
                    </div>
                  </div>
                </div>

                {userMesRef && userAnoRef && userTotais && (
                  <div className="resumo-fatura-card user-resumo-card">
                    <div className="resumo-fatura-titulo">
                      Movimentação deste ciclo
                    </div>
                    <div className="resumo-fatura-linha">
                      <span className="resumo-fatura-label">Gastos/parcelas</span>
                      <span className="resumo-fatura-valor">
                        {formatCurrencyBRL(Number(userTotais.parcelas_mes || 0))}
                      </span>
                    </div>
                    <div className="resumo-fatura-linha">
                      <span className="resumo-fatura-label">Pagamentos</span>
                      <span className="resumo-fatura-valor">
                        {formatCurrencyBRL(Number(userTotais.pagamentos_mes || 0))}
                      </span>
                    </div>
                    <div className="resumo-fatura-linha">
                      <span className="resumo-fatura-label">Saldo deste ciclo</span>
                      <span
                        className="resumo-fatura-valor"
                        style={{ color: userSaldoMesColor }}
                      >
                        {formatCurrencyBRL(Number(userTotais.saldo_mes || 0))}
                      </span>
                    </div>
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
              </>
            )}
          </section>
        )}

        {isAdmin && activePanel === "admin" && (
          <section className="card-section">
            <SectionHeader
              title="Painel administrativo"
              subtitle="Busque um usuário para visualizar sua fatura, lançamentos e atualizar seus dados."
            />
          </section>
        )}

        {isAdmin && activePanel === "admin" && (
          <section className="card-section">
            <SectionHeader
              title="Consultar usuário alvo"
              subtitle="Informe o ID numérico do Telegram ou o username (com ou sem @) para localizar o usuário."
            />
            <form onSubmit={handleLoadData} className="form">
              <label>
                ID ou username do usuário (Telegram):
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
          </section>
        )}

        {isAdmin && activePanel === "admin" && userDetails && (
          <div className="admin-tabs">
            <button
              type="button"
              className={
                "admin-tab-button" +
                (adminActiveTab === "overview" ? " admin-tab-button--active" : "")
              }
              onClick={() => setAdminActiveTab("overview")}
            >
              Visão geral
            </button>
            <button
              type="button"
              className={
                "admin-tab-button" +
                (adminActiveTab === "lancamentos" ? " admin-tab-button--active" : "")
              }
              onClick={() => setAdminActiveTab("lancamentos")}
            >
              Lançamentos
            </button>
            <button
              type="button"
              className={
                "admin-tab-button" +
                (adminActiveTab === "pagamentos" ? " admin-tab-button--active" : "")
              }
              onClick={() => setAdminActiveTab("pagamentos")}
            >
              Pagamentos
            </button>
            <button
              type="button"
              className={
                "admin-tab-button" +
                (adminActiveTab === "config" ? " admin-tab-button--active" : "")
              }
              onClick={() => setAdminActiveTab("config")}
            >
              Configuração
            </button>
          </div>
        )}

        {isAdmin && activePanel === "admin" && userDetails &&
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
                  <div className="admin-profile-value">{String(userDetails.id)}</div>
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
                    {userDetails.ativo === false ? "Inativo" : "Ativo"} — {" "}
                    {userDetails.autorizado ? "Acesso liberado" : "Aguardando liberação"}
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveUsuario} className="form">
              <label>
                Nome:
                <input
                  type="text"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                />
              </label>
              <label>
                Username (sem @):
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
              <p className="muted-text muted-text--sm mt-1">
                <strong>Usuário ativo</strong> controla se o usuário ainda pode usar o cartão neste sistema. {" "}
                <strong>Acesso liberado (autorizado)</strong> libera o uso do mini app para registrar gastos e pagamentos.
              </p>
              <button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar dados do usuário"}
              </button>
            </form>
            {userActionMessage && (
              <div className="success mt-2">{userActionMessage}</div>
            )}
          </section>
        )}

        {isAdmin && activePanel === "admin" && adminActiveTab === "overview" &&
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
                <div className="resumo-fatura-titulo">Resumo da fatura {selectedCycle}</div>
                <div className="resumo-fatura-linha">
                  <span className="resumo-fatura-label">Gastos/parcelas</span>
                  <span className="resumo-fatura-valor">{formatCurrencyBRL(cycleSummary.parcelas_mes)}</span>
                </div>
                <div className="resumo-fatura-linha">
                  <span className="resumo-fatura-label">Pagamentos</span>
                  <span className="resumo-fatura-valor">{formatCurrencyBRL(cycleSummary.pagamentos_mes)}</span>
                </div>
                <div className="resumo-fatura-linha resumo-fatura-saldo-periodo">
                  <span className="resumo-fatura-label">Saldo deste ciclo</span>
                  <span className="resumo-fatura-direita">
                    <span className="resumo-fatura-valor">{formatCurrencyBRL(cycleSummary.saldo_mes)}</span>
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
                  const info = getSaldoAcumuladoInfo(cycleSummary.saldo_acumulado);
                  return (
                    <div className="resumo-fatura-linha resumo-fatura-acumulado">
                      <span className="resumo-fatura-label" style={{ color: info.color }}>
                        {info.label}
                      </span>
                      <span className="resumo-fatura-direita">
                        <span className="resumo-fatura-valor" style={{ color: info.color }}>
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
              </div>
            )}
          </section>
        )}

        {isAdmin && activePanel === "admin" && adminActiveTab === "lancamentos" && (
          <section className="card-section">
            <strong>Gastos do usuário</strong>
            {filteredGastos.length === 0 ? (
              <p className="section-subtitle">Nenhum gasto ativo foi encontrado para este usuário.</p>
            ) : (
              <>
                <p className="section-subtitle">
                  Lista de gastos ativos do usuário. Use este painel para revisar e, se necessário, editar ou inativar lançamentos.
                </p>
                <div className="button-row">
                  <button type="button" disabled={saving} onClick={handleExportAdminGastosCsv}>
                    Exportar CSV
                  </button>
                </div>
                <ul className="gastos-list">
                  {filteredGastos.map((g) => {
                    const dataStr = formatDateIsoToBR(g.data_compra);
                    const descricao = g.descricao || "(sem descrição)";
                    const valorTotal = Number(g.valor_total || 0);
                    const parcelasTotal = Number(g.parcelas_total || 1);
                    const valorParcela = Number(g.valor_parcela || valorTotal);
                    const temParcelas = Number.isFinite(parcelasTotal) && parcelasTotal > 1;
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
                              {temParcelas
                                ? parcelaAtual
                                  ? `Parcela ${parcelaAtual}/${parcelasTotal}`
                                  : `${parcelasTotal} parcelas`
                                : "Pagamento à vista"}
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
                          <div className="gasto-valor">{formatCurrencyBRL(valorTotal)}</div>
                          <button type="button" disabled={saving} onClick={() => handleSelectGasto(g)}>
                            Editar
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}

        {isAdmin && activePanel === "admin" && adminActiveTab === "pagamentos" && (
          <section className="card-section">
            <strong>Pagamentos do usuário</strong>
            {filteredPagamentos.length === 0 ? (
              <p className="section-subtitle">Nenhum pagamento foi encontrado para este usuário.</p>
            ) : (
              <>
                <p className="section-subtitle">
                  Pagamentos registrados para este usuário. Aqui você pode revisar, editar valores ou cancelar um pagamento.
                </p>
                <div className="button-row">
                  <button type="button" disabled={saving} onClick={handleExportAdminPagamentosCsv}>
                    Exportar CSV
                  </button>
                </div>
                <ul className="admin-pagamentos-list">
                  {filteredPagamentos.map((p) => {
                    const dataStr = p.data_pagamento ? p.data_pagamento.slice(0, 10) : "-";
                    const descricao = p.descricao || "Pagamento";
                    const valorNum = Number(p.valor || 0);
                    return (
                      <li key={p.id} className="admin-pagamento-item">
                        <div className="admin-pagamento-textos">
                          <div className="admin-pagamento-descricao">{descricao}</div>
                          <div className="admin-pagamento-meta">
                            <span>{dataStr}</span>
                          </div>
                        </div>
                        <div className="gasto-acoes">
                          <div className="admin-pagamento-valor">{formatCurrencyBRL(valorNum)}</div>
                          <button type="button" disabled={saving} onClick={() => handleSelectPagamento(p)}>
                            Editar
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default App;
