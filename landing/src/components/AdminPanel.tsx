"use client";

import {
  Activity,
  BadgeCheck,
  Ban,
  BarChart3,
  Check,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Crown,
  Database,
  KeyRound,
  Loader2,
  LogOut,
  Moon,
  PlugZap,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Plan = "BASIC" | "PRO" | "ULTRA";
type Role = "SUPER_ADMIN" | "ADMIN" | "CUSTOMER";
type UserFilter = "active" | "expired" | "pending-manual";
type Theme = "dark" | "light";
type AdminView = "overview" | "generate" | "users" | "masters" | "settings" | "admins";

type AuthUser = {
  id: string;
  email: string;
  role: Role;
  plan: Plan;
  validUntil?: string;
  creditsLimit?: number;
  creditsUsed?: number;
};

type AdminUser = {
  id: string;
  email: string;
  role: Role;
  plan: Plan;
  validUntil?: string;
  isManuallyDisabled?: boolean;
  systemExpired?: boolean;
  manualDisable?: boolean;
  daysRemaining?: number;
  creditsLimit: number;
  creditsUsed: number;
  createdAt?: string;
};

type Analytics = {
  totalUsers: number;
  usersPerPlan: Array<{ plan: Plan; _count: { _all: number } }>;
  estimatedRevenueCents: number;
  resellerSales: Array<{ createdByAdminId: string | null; _count: { _all: number } }>;
  users: AdminUser[];
};

type RevenueReport = {
  activeRevenueCents: number;
  activeUsersCount: number;
  daily: Array<{ date: string; revenueCents: number; count: number }>;
  monthly: Array<{ month: string; revenueCents: number; count: number }>;
};

type UserListResponse = {
  filter: UserFilter;
  count: number;
  users: AdminUser[];
};

type AdminListResponse = {
  admins: AdminUser[];
};

type GeneratedUserSettings = {
  validDays: number;
};

type SalesReportRow = {
  adminId: string;
  adminName: string;
  basicCount: number;
  proCount: number;
  ultraCount: number;
};

type MasterAccount = {
  id: string;
  provider: string;
  email: string;
  status: "ACTIVE" | "COOLING_DOWN" | "EXHAUSTED" | "AUTH_INVALID" | "REQUIRES_SYNC" | "DISABLED";
  dailyLimit: number;
  remainingLimit: number;
  cooldownUntil: string | null;
  lastUsedAt: string | null;
  hasVaultData: boolean;
  vaultVersion: number;
  vaultHealth: string;
  lastVaultSyncAt: string | null;
  proxyHost: string | null;
  proxyPort: number | null;
  proxyUsername: string | null;
  hasProxyPassword: boolean;
  activeJobCount: number;
  capacityLimit: number;
  createdAt: string;
  updatedAt: string;
};

type Notice = {
  tone: "success" | "error" | "info";
  text: string;
};

const storageKeys = {
  apiBase: "flow_admin_api_base",
  token: "flow_admin_token",
  user: "flow_admin_user",
  theme: "flow_admin_theme",
  activeView: "flow_admin_active_view",
};

const filters: Array<{ id: UserFilter; label: string }> = [
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
  { id: "pending-manual", label: "Needs Review" },
];

const planAccent: Record<Plan, string> = {
  BASIC: "border-slate-500/45 bg-slate-200 text-slate-800 admin-dark:bg-slate-500/10 admin-dark:text-slate-100",
  PRO: "border-cyan-500/45 bg-cyan-100 text-cyan-900 admin-dark:border-cyan-400/40 admin-dark:bg-cyan-400/10 admin-dark:text-cyan-100",
  ULTRA: "border-amber-500/55 bg-amber-100 text-amber-950 admin-dark:border-amber-300/50 admin-dark:bg-amber-300/12 admin-dark:text-amber-100",
};

const planDisplayName: Record<Plan, string> = {
  BASIC: "PRO",
  PRO: "ULTRA",
  ULTRA: "UNLIMITED",
};

const defaultPlanCredits: Record<Plan, number> = {
  BASIC: 20,
  PRO: 100,
  ULTRA: 500,
};

function buildFingerprint() {
  const raw = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");

  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(index);
    hash |= 0;
  }

  return `admin_${Math.abs(hash)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeValidDays(value: number) {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.max(1, Math.min(3650, Math.round(value)));
}

function isAdminView(value: string | null): value is AdminView {
  return value === "overview" || value === "generate" || value === "users" || value === "masters" || value === "settings" || value === "admins";
}

export function AdminPanel() {
  const [apiBase, setApiBase] = useState("https://api.vidgen.fun");
  const [theme, setTheme] = useState<Theme>("dark");
  const [token, setToken] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [userList, setUserList] = useState<UserListResponse | null>(null);
  const [subAdmins, setSubAdmins] = useState<AdminUser[]>([]);
  const [salesReport, setSalesReport] = useState<SalesReportRow[]>([]);
  const [revenueReport, setRevenueReport] = useState<RevenueReport | null>(null);
  const [revenueView, setRevenueView] = useState<"daily" | "monthly">("daily");
  const [masterAccounts, setMasterAccounts] = useState<MasterAccount[]>([]);
  const [activeFilter, setActiveFilter] = useState<UserFilter>("active");
  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState<Plan | null>(null);
  const [savingGeneratedUserSettings, setSavingGeneratedUserSettings] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<Record<Plan, { email: string; password: string } | null>>({
    BASIC: null,
    PRO: null,
    ULTRA: null,
  });
  const [generatedUserValidDays, setGeneratedUserValidDays] = useState(30);
  const [planForm, setPlanForm] = useState({
    plan: "PRO" as Plan,
    creditsLimit: 100,
    priceCents: 2900,
    currency: "USD",
    durationDays: 30,
    isActive: true,
  });
  const [appConfigText, setAppConfigText] = useState('{\n  "maintenance": false,\n  "supportUrl": "https://vidgen.fun/support"\n}');
  const [appConfigKey, setAppConfigKey] = useState("system");
  const [adminForm, setAdminForm] = useState({ email: "", password: "", validDays: 365, creditsLimit: 100000 });
  const [masterForm, setMasterForm] = useState({
    provider: "google-flow",
    email: "",
    dailyLimit: 100,
    remainingLimit: 100,
    vaultData: "",
    proxyHost: "",
    proxyPort: 8080,
    proxyUsername: "",
    proxyPassword: "",
  });
  const [vaultEditor, setVaultEditor] = useState<{ id: string; email: string; vaultData: string; syncCode: string } | null>(null);
  const [proxyEditor, setProxyEditor] = useState<{
    id: string;
    email: string;
    proxyHost: string;
    proxyPort: number;
    proxyUsername: string;
    proxyPassword: string;
    hasProxyPassword: boolean;
  } | null>(null);
  const [syncCodeDisplay, setSyncCodeDisplay] = useState<{ code: string; expiresAt: string } | null>(null);
  const [keeperKeyDisplay, setKeeperKeyDisplay] = useState<string | null>(null);
  const [planEditor, setPlanEditor] = useState<{ id: string; email: string; plan: Plan; creditsLimit: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const isAuthed = Boolean(token && authUser);
  const isSuperAdmin = authUser?.role === "SUPER_ADMIN";
  const navItems: Array<{ id: AdminView; label: string; helper: string; icon: typeof BarChart3; superOnly?: boolean }> = [
    { id: "overview", label: "Overview", helper: "System snapshot", icon: BarChart3 },
    { id: "generate", label: "Generate User", helper: "Create credentials", icon: UserPlus },
    { id: "users", label: "User Registry", helper: "Search and disable", icon: Users },
    { id: "masters", label: "Master Accounts", helper: "Vault pool control", icon: Database, superOnly: true },
    { id: "settings", label: "Settings", helper: "Plans and app config", icon: Settings2, superOnly: true },
    { id: "admins", label: "Admins", helper: "Create admin seats", icon: UserCog, superOnly: true },
  ];
  const visibleNavItems = navItems.filter((item) => !item.superOnly || isSuperAdmin);
  const activeNavItem = visibleNavItems.find((item) => item.id === activeView) ?? visibleNavItems[0];

  const visibleUsers = useMemo(() => {
    const source = userList?.users ?? analytics?.users ?? [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return source;
    }

    return source.filter((user) => {
      return [user.email, user.plan, user.role, user.id].some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [analytics?.users, query, userList?.users]);

  const totals = useMemo(() => {
    const perPlan = new Map<Plan, number>([
      ["BASIC", 0],
      ["PRO", 0],
      ["ULTRA", 0],
    ]);

    for (const row of analytics?.usersPerPlan ?? []) {
      perPlan.set(row.plan, row._count._all);
    }

    return {
      basic: perPlan.get("BASIC") ?? 0,
      pro: perPlan.get("PRO") ?? 0,
      ultra: perPlan.get("ULTRA") ?? 0,
    };
  }, [analytics?.usersPerPlan]);

  useEffect(() => {
    const storedApiBase = window.localStorage.getItem(storageKeys.apiBase);
    const storedToken = window.localStorage.getItem(storageKeys.token);
    const storedUser = window.localStorage.getItem(storageKeys.user);
    const storedTheme = window.localStorage.getItem(storageKeys.theme);
    const storedActiveView = window.localStorage.getItem(storageKeys.activeView);

    if (storedApiBase) {
      setApiBase(storedApiBase);
    }
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }
    if (isAdminView(storedActiveView)) {
      setActiveView(storedActiveView);
    }
    if (storedToken) {
      setToken(storedToken);
    }
    if (storedUser) {
      try {
        setAuthUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        window.localStorage.removeItem(storageKeys.user);
      }
    }

    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (token && authUser) {
      void refreshAll(activeFilter);
      void loadGeneratedUserSettings();
    }
  }, [token, authUser]);

  useEffect(() => {
    if (authUser && !isSuperAdmin && (activeView === "masters" || activeView === "settings" || activeView === "admins")) {
      setActiveView("overview");
    }
  }, [activeView, authUser, isSuperAdmin]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.theme, theme);
  }, [theme]);

  useEffect(() => {
    if (sessionReady) {
      window.localStorage.setItem(storageKeys.activeView, activeView);
    }
  }, [activeView, sessionReady]);

  async function apiRequest<T>(path: string, options: RequestInit & { body?: BodyInit | null } = {}) {
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body != null ? { "Content-Type": "application/json" } : {}),
      ...(options.headers as Record<string, string> | undefined),
    };

    const response = await fetch(`${apiBase.replace(/\/$/, "")}${path}`, {
      ...options,
      headers,
    });

    const text = await response.text();
    const data = parseApiResponse(text, path);

    if (response.status === 401) {
      setToken("");
      setAuthUser(null);
      setAnalytics(null);
      setUserList(null);
      setSubAdmins([]);
      setSalesReport([]);
      setMasterAccounts([]);
      setActiveView("overview");
      window.localStorage.removeItem(storageKeys.token);
      window.localStorage.removeItem(storageKeys.user);
      throw new Error("Session expired. Please sign in again.");
    }

    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Request failed with ${response.status}`);
    }

    return data as T;
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fingerprint_id: buildFingerprint(),
        }),
      });
      const data = parseApiResponse(await response.text(), "/auth/login");
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Login failed");
      }
      if (data.user.role !== "SUPER_ADMIN" && data.user.role !== "ADMIN") {
        throw new Error("This panel is restricted to admin roles.");
      }

      setToken(data.accessToken);
      setAuthUser(data.user);
      window.localStorage.setItem(storageKeys.apiBase, apiBase.replace(/\/$/, ""));
      window.localStorage.setItem(storageKeys.token, data.accessToken);
      window.localStorage.setItem(storageKeys.user, JSON.stringify(data.user));
      setNotice({ tone: "success", text: `Signed in as ${data.user.role}` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Login failed" });
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll(filter = activeFilter) {
    setLoading(true);
    setNotice(null);
    try {
      const [analyticsResult, usersResult] = await Promise.all([
        apiRequest<Analytics>("/admin/analytics"),
        apiRequest<UserListResponse>(`/admin/users/${filter}`),
      ]);
      setAnalytics(analyticsResult);
      setUserList(usersResult);
      setActiveFilter(filter);
      await loadRevenueReport();
      if (authUser?.role === "SUPER_ADMIN") {
        await loadMasterAccounts();
        await loadAdmins();
        await loadSalesReport();
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not refresh admin data" });
    } finally {
      setLoading(false);
    }
  }

  async function loadGeneratedUserSettings() {
    try {
      const result = await apiRequest<GeneratedUserSettings>("/admin/generated-user-settings");
      setGeneratedUserValidDays(normalizeValidDays(result.validDays));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load credential validity setting" });
    }
  }

  async function saveGeneratedUserSettings() {
    setSavingGeneratedUserSettings(true);
    setNotice(null);

    try {
      const result = await apiRequest<GeneratedUserSettings>("/admin/generated-user-settings", {
        method: "PUT",
        body: JSON.stringify({
          validDays: normalizeValidDays(generatedUserValidDays),
        }),
      });
      setGeneratedUserValidDays(normalizeValidDays(result.validDays));
      setNotice({ tone: "success", text: `Default credential validity saved for ${normalizeValidDays(result.validDays)} days` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not save credential validity setting" });
    } finally {
      setSavingGeneratedUserSettings(false);
    }
  }

  async function loadMasterAccounts() {
    const result = await apiRequest<{ accounts: MasterAccount[] }>("/admin/master-accounts");
    setMasterAccounts(result.accounts);
  }

  async function loadAdmins() {
    const result = await apiRequest<AdminListResponse>("/admin/admins");
    setSubAdmins(result.admins);
  }

  async function loadSalesReport() {
    const result = await apiRequest<SalesReportRow[]>("/admin/sales-report");
    setSalesReport(result);
  }

  async function loadRevenueReport() {
    const result = await apiRequest<RevenueReport>("/admin/revenue-report");
    setRevenueReport(result);
  }

  async function generateUser(plan: Plan) {
    setGeneratingPlan(plan);
    setGeneratedCredentials((current) => ({ ...current, [plan]: null }));
    setNotice(null);

    try {
      const result = await apiRequest<{ user: AdminUser; password: string }>("/admin/generate-user", {
        method: "POST",
        body: JSON.stringify({
          plan,
          validDays: normalizeValidDays(generatedUserValidDays),
        }),
      });
      setGeneratedCredentials((current) => ({
        ...current,
        [plan]: { email: result.user.email, password: result.password },
      }));
      setNotice({ tone: "success", text: `${planDisplayName[result.user.plan]} user generated for ${normalizeValidDays(generatedUserValidDays)} days` });
      await refreshAll(activeFilter);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not generate user" });
    } finally {
      setGeneratingPlan(null);
    }
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      await apiRequest("/admin/plan-config", {
        method: "POST",
        body: JSON.stringify({
          ...planForm,
          creditsLimit: Number(planForm.creditsLimit),
          priceCents: Number(planForm.priceCents),
          durationDays: Number(planForm.durationDays),
        }),
      });
      setNotice({ tone: "success", text: `${planDisplayName[planForm.plan]} plan updated` });
      await refreshAll(activeFilter);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not update plan" });
    } finally {
      setLoading(false);
    }
  }

  async function saveAppConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      await apiRequest("/admin/app-config", {
        method: "POST",
        body: JSON.stringify({
          key: appConfigKey,
          value: JSON.parse(appConfigText),
        }),
      });
      setNotice({ tone: "success", text: `${appConfigKey} config saved` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Invalid config payload" });
    } finally {
      setLoading(false);
    }
  }

  async function addMasterAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      await apiRequest("/admin/master-accounts", {
        method: "POST",
        body: JSON.stringify({
          provider: masterForm.provider,
          email: masterForm.email,
          dailyLimit: Number(masterForm.dailyLimit),
          remainingLimit: Number(masterForm.remainingLimit),
          vaultData: masterForm.vaultData.trim() ? masterForm.vaultData : null,
          proxyHost: masterForm.proxyHost.trim() ? masterForm.proxyHost : null,
          proxyPort: masterForm.proxyHost.trim() ? Number(masterForm.proxyPort) : null,
          proxyUsername: masterForm.proxyUsername.trim() ? masterForm.proxyUsername : null,
          proxyPassword: masterForm.proxyPassword.trim() ? masterForm.proxyPassword : null,
        }),
      });
      setMasterForm({
        provider: "google-flow",
        email: "",
        dailyLimit: 100,
        remainingLimit: 100,
        vaultData: "",
        proxyHost: "",
        proxyPort: 8080,
        proxyUsername: "",
        proxyPassword: "",
      });
      setNotice({ tone: "success", text: "Master account added to the pool" });
      await loadMasterAccounts();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not add master account" });
    } finally {
      setLoading(false);
    }
  }

  async function saveProxySettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proxyEditor) {
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      await apiRequest(`/admin/master-accounts/${proxyEditor.id}/proxy`, {
        method: "PATCH",
        body: JSON.stringify({
          proxyHost: proxyEditor.proxyHost.trim() ? proxyEditor.proxyHost : null,
          proxyPort: proxyEditor.proxyHost.trim() ? Number(proxyEditor.proxyPort) : null,
          proxyUsername: proxyEditor.proxyUsername.trim() ? proxyEditor.proxyUsername : null,
          proxyPassword: proxyEditor.proxyPassword.trim() ? proxyEditor.proxyPassword : null,
        }),
      });
      setProxyEditor(null);
      setNotice({ tone: "success", text: "Master proxy settings saved" });
      await loadMasterAccounts();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not save proxy settings" });
    } finally {
      setLoading(false);
    }
  }

  async function saveVaultData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vaultEditor) {
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      await apiRequest(`/admin/master-accounts/${vaultEditor.id}/vault-data`, {
        method: "PATCH",
        body: JSON.stringify({
          vaultData: vaultEditor.vaultData.trim() ? vaultEditor.vaultData : null,
          syncCode: vaultEditor.syncCode.trim(),
        }),
      });
      setVaultEditor(null);
      setNotice({ tone: "success", text: "Vault cookies updated" });
      await loadMasterAccounts();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not update vault data" });
    } finally {
      setLoading(false);
    }
  }

  async function generateKeeperKey(masterAccountId: string) {
    setLoading(true);
    setNotice(null);

    try {
      const result = await apiRequest<{ keeperKey: string }>(`/admin/master-accounts/${masterAccountId}/keeper-key`, {
        method: "POST",
      });
      const payload = { v: 1, apiBaseUrl: apiBase.replace(/\/+$/, ""), masterAccountId, keeperKey: result.keeperKey };
      setKeeperKeyDisplay(btoa(JSON.stringify(payload)));
      setNotice({ tone: "success", text: "Setup code generated — paste it into the extension once" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not generate setup code" });
    } finally {
      setLoading(false);
    }
  }

  async function generateSyncCode(masterAccountId: string) {
    setLoading(true);
    setNotice(null);

    try {
      const result = await apiRequest<{ code: string; expiresAt: string }>(`/admin/master-accounts/${masterAccountId}/sync-code`, {
        method: "POST",
      });
      setSyncCodeDisplay(result);
      setNotice({ tone: "success", text: "One-time sync code generated" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not generate sync code" });
    } finally {
      setLoading(false);
    }
  }

  async function toggleMasterAccountStatus(account: MasterAccount) {
    const nextStatus = account.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    setLoading(true);
    setNotice(null);

    try {
      await apiRequest(`/admin/master-accounts/${account.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice({ tone: "success", text: nextStatus === "DISABLED" ? "Master account disabled" : "Master account re-enabled" });
      await loadMasterAccounts();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not update master account status" });
    } finally {
      setLoading(false);
    }
  }

  async function deleteMasterAccount(account: MasterAccount) {
    if (!window.confirm(`Permanently delete master account ${account.email}? This cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      await apiRequest(`/admin/master-accounts/${account.id}`, {
        method: "DELETE",
      });
      setNotice({ tone: "success", text: "Master account deleted" });
      await loadMasterAccounts();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not delete master account" });
    } finally {
      setLoading(false);
    }
  }

  async function saveUserPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planEditor) {
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      await apiRequest<{ user: AdminUser }>(`/admin/users/${planEditor.id}/plan`, {
        method: "PATCH",
        body: JSON.stringify({
          plan: planEditor.plan,
        }),
      });
      setPlanEditor(null);
      setNotice({ tone: "success", text: "Customer plan updated" });
      await refreshAll(activeFilter);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not update customer plan" });
    } finally {
      setLoading(false);
    }
  }

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      await apiRequest("/admin/create-admin", {
        method: "POST",
        body: JSON.stringify({
          email: adminForm.email,
          password: adminForm.password,
          validDays: Number(adminForm.validDays),
          creditsLimit: Number(adminForm.creditsLimit),
        }),
      });
      setAdminForm({ email: "", password: "", validDays: 365, creditsLimit: 100000 });
      setNotice({ tone: "success", text: "Admin account created" });
      await loadAdmins();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not create admin" });
    } finally {
      setLoading(false);
    }
  }

  async function toggleUser(user: AdminUser) {
    setLoading(true);
    setNotice(null);
    try {
      const disabled = Boolean(user.isManuallyDisabled || user.manualDisable);
      await apiRequest(`/admin/user/toggle-status/${user.id}`, {
        method: "POST",
        body: JSON.stringify({
          isManuallyDisabled: !disabled,
        }),
      });
      setNotice({ tone: "success", text: "User status updated" });
      await refreshAll(activeFilter);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not update user" });
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser() {
    if (!deleteTarget) {
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      await apiRequest(`/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      setNotice({ tone: "success", text: `Deleted ${deleteTarget.email}` });
      setDeleteTarget(null);
      await refreshAll(activeFilter);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not delete user" });
    } finally {
      setLoading(false);
    }
  }

  async function toggleAdmin(admin: AdminUser) {
    setLoading(true);
    setNotice(null);
    try {
      const disabled = Boolean(admin.isManuallyDisabled || admin.manualDisable);
      await apiRequest(`/admin/admins/${admin.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          isManuallyDisabled: !disabled,
        }),
      });
      setNotice({ tone: "success", text: "Admin status updated" });
      await loadAdmins();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not update admin" });
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      if (token) {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ revoke: true }),
        });
      }
    } catch {
      // Local sign-out must still complete if the backend is temporarily unavailable.
    } finally {
      setToken("");
      setAuthUser(null);
      setAnalytics(null);
      setUserList(null);
      setMasterAccounts([]);
      setActiveView("overview");
      window.localStorage.removeItem(storageKeys.token);
      window.localStorage.removeItem(storageKeys.user);
    }
  }

  async function copyCredential(plan: Plan) {
    const credential = generatedCredentials[plan];
    if (!credential) {
      return;
    }

    await navigator.clipboard.writeText(`${credential.email}\n${credential.password}`);
    setNotice({ tone: "success", text: "Credentials copied" });
  }

  if (!sessionReady) {
    return null;
  }

  return (
    <main className={`admin-theme ${theme === "light" ? "admin-light" : "admin-dark"}`}>
      <div className="admin-backdrop" />
      <div className="admin-grid" />

      <section className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="grid gap-3 border-b border-white/10 pb-4 lg:grid-cols-[280px_1fr_auto] lg:items-center">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-md border border-amber-300/30 bg-amber-300/10 text-amber-200 shadow-[0_0_32px_rgba(245,158,11,0.14)]">
              <Crown size={22} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/80">Flow Admin</p>
              <h1 className="text-xl font-semibold tracking-tight text-white">Control Room</h1>
            </div>
          </div>

          <div className="grid gap-1 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <PlugZap size={16} className="shrink-0 text-teal-200" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                value={apiBase}
                onChange={(event) => setApiBase(event.target.value)}
                placeholder="https://api.vidgen.fun"
              />
            </div>
            <p className="pl-6 text-xs text-zinc-500">Backend API. Production uses https://api.vidgen.fun</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="icon-button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              type="button"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {isAuthed ? (
              <>
                <Pill tone="cyan">{authUser?.role}</Pill>
                <button
                  className="icon-button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(token);
                    setNotice({ tone: "success", text: "Admin access token copied" });
                  }}
                  title="Copy admin access token (for the Vault Sync extension)"
                  type="button"
                >
                  <KeyRound size={18} />
                </button>
                <button className="icon-button" onClick={() => void refreshAll(activeFilter)} title="Refresh data">
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                </button>
                <button className="icon-button" onClick={logout} title="Sign out">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Pill tone="amber">Secure Login</Pill>
            )}
          </div>
        </header>

        {notice ? <NoticeBar notice={notice} /> : null}

        {!isAuthed ? (
          <section className="grid flex-1 place-items-center py-10">
            <div className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-[#0d1118]/92 shadow-[0_30px_110px_rgba(0,0,0,0.46)] lg:grid-cols-[1.08fr_.92fr]">
              <div className="min-h-[520px] border-b border-white/10 bg-[linear-gradient(145deg,rgba(13,148,136,0.20),transparent_44%),linear-gradient(45deg,rgba(245,158,11,0.16),transparent_48%),#0a0e15] p-7 lg:border-b-0 lg:border-r">
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <div className="mb-7 inline-flex items-center gap-2 rounded-md border border-teal-300/20 bg-teal-300/10 px-3 py-2 text-sm text-teal-100">
                      <ShieldCheck size={16} />
                      Admin orchestration console
                    </div>
                    <h2 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                      Sessions, users, plans, and reseller controls in one dense console.
                    </h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <LoginMetric icon={Users} label="Users" value="Scoped" />
                    <LoginMetric icon={Activity} label="Sessions" value="Live" />
                    <LoginMetric icon={WalletCards} label="Plans" value="Synced" />
                  </div>
                </div>
              </div>

              <form onSubmit={login} className="flex flex-col justify-center gap-4 p-6 sm:p-8">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">Authentication</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Admin sign in</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    Use the backend API address above, then sign in with your seeded admin account.
                  </p>
                </div>
                <Field label="Email">
                  <input className="field-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </Field>
                <Field label="Password">
                  <input className="field-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
                </Field>
                <button className="primary-button mt-2" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={18} />}
                  Sign in
                </button>
                <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm leading-6 text-zinc-500">
                  <p className="font-medium text-zinc-300">Quick check</p>
                  <p>Frontend: https://admin.vidgen.fun/admin</p>
                  <p>Backend API: https://api.vidgen.fun</p>
                </div>
              </form>
            </div>
          </section>
        ) : (
          <section className="grid flex-1 gap-4 py-4 xl:grid-cols-[280px_1fr]">
            <aside className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] p-4 xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
              <div className="rounded-md border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Signed in</p>
                <p className="mt-2 truncate text-sm font-medium text-white">{authUser?.email}</p>
                <div className="mt-3 flex gap-2">
                  <Pill tone="cyan">{authUser?.role}</Pill>
                  <Pill tone="amber">{authUser?.plan ? planDisplayName[authUser.plan] : ""}</Pill>
                </div>
              </div>

              <nav className="mt-4 grid gap-2">
                {visibleNavItems.map((item) => {
                  const Component = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={`nav-row text-left ${activeView === item.id ? "nav-row-active" : ""}`}
                      onClick={() => setActiveView(item.id)}
                      type="button"
                    >
                      <Component size={17} />
                      <span className="min-w-0">
                        <span className="block truncate">{item.label}</span>
                        <span className="block truncate text-xs font-medium text-zinc-500">{item.helper}</span>
                      </span>
                      <ChevronRight size={15} className="ml-auto shrink-0 text-zinc-500" />
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="grid min-w-0 gap-4">
              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">{activeNavItem.label}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">{activeNavItem.helper}</h2>
              </section>

              {activeView === "overview" ? (
              <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatPanel icon={Users} label="Customers" value={formatNumber(analytics?.totalUsers ?? 0)} accent="teal" />
                <StatPanel icon={Sparkles} label="Unlimited Users" value={formatNumber(totals.ultra)} accent="amber" />
                <StatPanel icon={CircleDollarSign} label="Active Revenue" value={formatCurrency(revenueReport?.activeRevenueCents ?? 0)} accent="emerald" />
                <StatPanel icon={UserCog} label="Resellers" value={formatNumber(subAdmins.length)} accent="blue" />
              </section>

              <section className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Start here</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Generate a user, copy credentials, then monitor status from the registry.</h2>
                  <p className="mt-1 text-sm text-zinc-500">Most daily admin work is available without touching advanced plan or JSON config controls.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button className="secondary-button justify-center" type="button" onClick={() => setActiveView("generate")}>
                    <UserPlus size={16} />
                    New user
                  </button>
                  <button className="secondary-button justify-center" type="button" onClick={() => setActiveView("users")}>
                    <Users size={16} />
                    View users
                  </button>
                  <button className="secondary-button justify-center" type="button" onClick={() => void refreshAll(activeFilter)}>
                    <RefreshCw size={16} />
                    Refresh
                  </button>
                </div>
              </section>

              <Panel title="Revenue Trend" icon={CircleDollarSign}>
                <div className="mb-4 flex items-center gap-2">
                  <button
                    className={`secondary-button h-9 px-3 text-xs ${revenueView === "daily" ? "border-teal-300/40 bg-teal-300/10 text-teal-100" : ""}`}
                    onClick={() => setRevenueView("daily")}
                    type="button"
                  >
                    Daily
                  </button>
                  <button
                    className={`secondary-button h-9 px-3 text-xs ${revenueView === "monthly" ? "border-teal-300/40 bg-teal-300/10 text-teal-100" : ""}`}
                    onClick={() => setRevenueView("monthly")}
                    type="button"
                  >
                    Monthly
                  </button>
                </div>
                <RevenueTrendTable rows={revenueView === "daily" ? (revenueReport?.daily ?? []) : (revenueReport?.monthly ?? [])} view={revenueView} />
              </Panel>

              {isSuperAdmin ? (
                <Panel title="Daily Sales Tracking" icon={CircleDollarSign}>
                  <SalesReportTable rows={salesReport} />
                </Panel>
              ) : null}
              </>
              ) : null}

              {activeView === "generate" ? (
              <section className="grid gap-4 xl:grid-cols-[1fr_320px]">
                <section className="grid gap-4 lg:grid-cols-3">
                  {(["BASIC", "PRO", "ULTRA"] as Plan[]).map((plan) => (
                    <PlanGeneratorCard
                      key={plan}
                      credential={generatedCredentials[plan]}
                      disabled={Boolean(generatingPlan)}
                      loading={generatingPlan === plan}
                      plan={plan}
                      validDays={normalizeValidDays(generatedUserValidDays)}
                      onCopy={() => void copyCredential(plan)}
                      onGenerate={() => void generateUser(plan)}
                    />
                  ))}
                </section>
                <div className="grid gap-4">
                  <Panel title="Issue Settings" icon={KeyRound}>
                    <div className="grid gap-4">
                      <Field label="Default credential validity days">
                        <input
                          className="field-input"
                          type="number"
                          min={1}
                          max={3650}
                          value={generatedUserValidDays}
                          disabled={!isSuperAdmin}
                          onChange={(event) => setGeneratedUserValidDays(normalizeValidDays(Number(event.target.value)))}
                        />
                      </Field>
                      {isSuperAdmin ? (
                        <button className="secondary-button justify-center" type="button" onClick={() => void saveGeneratedUserSettings()} disabled={savingGeneratedUserSettings}>
                          {savingGeneratedUserSettings ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                          Save default
                        </button>
                      ) : null}
                      <div className="admin-validity-note rounded-md border border-teal-300/30 bg-teal-300/10 p-3 text-sm font-medium leading-6">
                        Every generated email/password will expire after {normalizeValidDays(generatedUserValidDays)} days.
                        {!isSuperAdmin ? " This default is controlled by the super admin." : " This default is saved in backend AppConfig for every admin."}
                      </div>
                    </div>
                  </Panel>
                  <Panel title="Plan Mix" icon={BarChart3}>
                    <div className="grid gap-3">
                      <PlanRow label="BASIC" value={totals.basic} total={analytics?.totalUsers ?? 0} />
                      <PlanRow label="PRO" value={totals.pro} total={analytics?.totalUsers ?? 0} />
                      <PlanRow label="ULTRA" value={totals.ultra} total={analytics?.totalUsers ?? 0} />
                    </div>
                  </Panel>
                </div>
              </section>
              ) : null}

              {activeView === "masters" ? (
              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
                <Panel title="Master Accounts Pool" icon={Database}>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-zinc-500">Sensitive cookie values are never displayed here.</p>
                    </div>
                    <button className="secondary-button" onClick={() => void loadMasterAccounts()} type="button">
                      <RefreshCw size={16} />
                      Refresh Pool
                    </button>
                  </div>

                  <div className="grid max-h-[680px] gap-3 overflow-auto pr-1">
                    {masterAccounts.length > 0 ? (
                      masterAccounts.map((account) => (
                        <MasterAccountRow
                          key={account.id}
                          account={account}
                          onEditVault={() => setVaultEditor({ id: account.id, email: account.email, vaultData: "", syncCode: "" })}
                          onEditProxy={() =>
                            setProxyEditor({
                              id: account.id,
                              email: account.email,
                              proxyHost: account.proxyHost ?? "",
                              proxyPort: account.proxyPort ?? 8080,
                              proxyUsername: account.proxyUsername ?? "",
                              proxyPassword: "",
                              hasProxyPassword: account.hasProxyPassword,
                            })
                          }
                          onGetSyncCode={() => void generateSyncCode(account.id)}
                          onGetKeeperKey={() => void generateKeeperKey(account.id)}
                          onToggleStatus={() => void toggleMasterAccountStatus(account)}
                          onDelete={() => void deleteMasterAccount(account)}
                        />
                      ))
                    ) : (
                      <div className="grid place-items-center rounded-md border border-white/10 px-4 py-16 text-sm text-zinc-500">No master accounts found</div>
                    )}
                  </div>
                </Panel>

                <Panel title="Add Master Account" icon={UserPlus}>
                  <form className="grid gap-4" onSubmit={addMasterAccount}>
                    <Field label="Provider">
                      <input className="field-input" value={masterForm.provider} onChange={(event) => setMasterForm((current) => ({ ...current, provider: event.target.value }))} required />
                    </Field>
                    <Field label="Email">
                      <input className="field-input" type="email" value={masterForm.email} onChange={(event) => setMasterForm((current) => ({ ...current, email: event.target.value }))} required />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Daily Limit">
                        <input className="field-input" type="number" min={1} value={masterForm.dailyLimit} onChange={(event) => setMasterForm((current) => ({ ...current, dailyLimit: Number(event.target.value), remainingLimit: Number(event.target.value) }))} required />
                      </Field>
                      <Field label="Remaining">
                        <input className="field-input" type="number" min={0} value={masterForm.remainingLimit} onChange={(event) => setMasterForm((current) => ({ ...current, remainingLimit: Number(event.target.value) }))} required />
                      </Field>
                    </div>
                    <Field label="Initial Vault JSON">
                      <textarea className="field-input min-h-32 resize-y font-mono text-xs leading-relaxed" value={masterForm.vaultData} onChange={(event) => setMasterForm((current) => ({ ...current, vaultData: event.target.value }))} placeholder='[{"name":"SID","value":"...","domain":".google.com","path":"/"}]' />
                    </Field>
                    <div className="rounded-md border border-white/10 bg-black/10 p-3 admin-dark:bg-white/[0.03]">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Residential Proxy</p>
                      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                        <Field label="Proxy Host">
                          <input className="field-input" value={masterForm.proxyHost} onChange={(event) => setMasterForm((current) => ({ ...current, proxyHost: event.target.value }))} placeholder="proxy.example.com" />
                        </Field>
                        <Field label="Port">
                          <input className="field-input" type="number" min={1} max={65535} value={masterForm.proxyPort} onChange={(event) => setMasterForm((current) => ({ ...current, proxyPort: Number(event.target.value) }))} />
                        </Field>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Field label="Username">
                          <input className="field-input" value={masterForm.proxyUsername} onChange={(event) => setMasterForm((current) => ({ ...current, proxyUsername: event.target.value }))} />
                        </Field>
                        <Field label="Password">
                          <input className="field-input" type="password" value={masterForm.proxyPassword} onChange={(event) => setMasterForm((current) => ({ ...current, proxyPassword: event.target.value }))} />
                        </Field>
                      </div>
                    </div>
                    <button className="primary-button" disabled={loading}>
                      <Database size={18} />
                      Add Account
                    </button>
                  </form>
                </Panel>
              </section>
              ) : null}

              {activeView === "settings" ? (
              <section className="grid gap-4 xl:grid-cols-2">
                <Panel id="plan-controls" title="Plan Controls" icon={Settings2} locked={!isSuperAdmin}>
                  <form className="grid gap-4 sm:grid-cols-2" onSubmit={savePlan}>
                    <Field label="Plan">
                      <select className="field-input" value={planForm.plan} onChange={(event) => setPlanForm((current) => ({ ...current, plan: event.target.value as Plan }))} disabled={!isSuperAdmin}>
                        <option value="BASIC">{planDisplayName.BASIC}</option>
                        <option value="PRO">{planDisplayName.PRO}</option>
                        <option value="ULTRA">{planDisplayName.ULTRA}</option>
                      </select>
                    </Field>
                    <Field label="Credits Limit">
                      <input className="field-input" type="number" min={1} value={planForm.creditsLimit} onChange={(event) => setPlanForm((current) => ({ ...current, creditsLimit: Number(event.target.value) }))} disabled={!isSuperAdmin} />
                    </Field>
                    <Field label="Price Cents">
                      <input className="field-input" type="number" min={0} value={planForm.priceCents} onChange={(event) => setPlanForm((current) => ({ ...current, priceCents: Number(event.target.value) }))} disabled={!isSuperAdmin} />
                    </Field>
                    <Field label="Duration Days">
                      <input className="field-input" type="number" min={1} value={planForm.durationDays} onChange={(event) => setPlanForm((current) => ({ ...current, durationDays: Number(event.target.value) }))} disabled={!isSuperAdmin} />
                    </Field>
                    <Field label="Currency">
                      <input className="field-input" maxLength={3} value={planForm.currency} onChange={(event) => setPlanForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} disabled={!isSuperAdmin} />
                    </Field>
                    <label className="flex items-center gap-3 self-end rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm text-zinc-200">
                      <input type="checkbox" checked={planForm.isActive} onChange={(event) => setPlanForm((current) => ({ ...current, isActive: event.target.checked }))} disabled={!isSuperAdmin} />
                      Active
                    </label>
                    <button className="primary-button sm:col-span-2" disabled={loading || !isSuperAdmin}>
                      <Check size={18} />
                      Save Plan
                    </button>
                  </form>
                </Panel>

                <Panel id="app-config" title="App Config" icon={ShieldCheck} locked={!isSuperAdmin}>
                  <form className="grid gap-4" onSubmit={saveAppConfig}>
                    <Field label="Key">
                      <input className="field-input" value={appConfigKey} onChange={(event) => setAppConfigKey(event.target.value)} disabled={!isSuperAdmin} />
                    </Field>
                    <Field label="JSON Value">
                      <textarea className="field-input min-h-44 resize-y font-mono text-xs leading-relaxed" value={appConfigText} onChange={(event) => setAppConfigText(event.target.value)} disabled={!isSuperAdmin} />
                    </Field>
                    <button className="primary-button" disabled={loading || !isSuperAdmin}>
                      <ShieldCheck size={18} />
                      Save Config
                    </button>
                  </form>
                </Panel>
              </section>
              ) : null}

              {activeView === "admins" && isSuperAdmin ? (
                <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
                  <Panel title="Sub-Admin Registry" icon={Users}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-zinc-500">Only Super Admins can create or suspend admin seats.</p>
                      <button className="secondary-button" onClick={() => void loadAdmins()} type="button">
                        <RefreshCw size={16} />
                        Refresh
                      </button>
                    </div>

                    <div className="overflow-hidden rounded-md border border-white/10">
                      <div className="grid grid-cols-[1.4fr_.7fr_.8fr_.7fr_auto] gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500 max-lg:hidden">
                        <span>Admin</span>
                        <span>Plan</span>
                        <span>Credits</span>
                        <span>Status</span>
                        <span className="text-right">Action</span>
                      </div>
                      <div className="max-h-[520px] overflow-auto">
                        {subAdmins.length > 0 ? (
                          subAdmins.map((admin) => <AdminRow key={admin.id} admin={admin} onToggle={() => void toggleAdmin(admin)} />)
                        ) : (
                          <div className="grid place-items-center px-4 py-16 text-sm text-zinc-500">No sub-admins found</div>
                        )}
                      </div>
                    </div>
                  </Panel>

                  <Panel title="Create Admin" icon={UserCog}>
                    <form className="grid gap-4" onSubmit={createAdmin}>
                      <Field label="Email">
                        <input className="field-input" type="email" value={adminForm.email} onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))} required />
                      </Field>
                      <Field label="Password">
                        <input className="field-input" type="password" minLength={12} value={adminForm.password} onChange={(event) => setAdminForm((current) => ({ ...current, password: event.target.value }))} required />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Days">
                          <input className="field-input" type="number" min={1} value={adminForm.validDays} onChange={(event) => setAdminForm((current) => ({ ...current, validDays: Number(event.target.value) }))} />
                        </Field>
                        <Field label="Credits">
                          <input className="field-input" type="number" min={0} value={adminForm.creditsLimit} onChange={(event) => setAdminForm((current) => ({ ...current, creditsLimit: Number(event.target.value) }))} />
                        </Field>
                      </div>
                      <button className="primary-button" disabled={loading}>
                        <UserCog size={18} />
                        Create
                      </button>
                    </form>
                  </Panel>
                </section>
              ) : null}

              {activeView === "users" ? (
              <Panel id="user-registry" title="User Registry" icon={Users}>
                <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                    <Search size={17} className="text-zinc-500" />
                    <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users, plans, roles" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {filters.map((filter) => (
                      <button
                        key={filter.id}
                        className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${activeFilter === filter.id ? "border-teal-300/50 bg-teal-300/15 text-teal-100" : "border-white/10 bg-white/[0.035] text-zinc-400 hover:text-white"}`}
                        onClick={() => void refreshAll(filter.id)}
                        type="button"
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-md border border-white/10">
                  <div className="grid grid-cols-[1.5fr_.7fr_.7fr_.8fr_auto] gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500 max-lg:hidden">
                    <span>User</span>
                    <span>Plan</span>
                    <span>Credits</span>
                    <span>Status</span>
                    <span className="text-right">Action</span>
                  </div>

                  <div className="max-h-[620px] overflow-auto">
                    {visibleUsers.length > 0 ? (
                      visibleUsers.map((user) => (
                        <UserRow
                          key={user.id}
                          user={user}
                          onEditPlan={() => setPlanEditor({ id: user.id, email: user.email, plan: user.plan, creditsLimit: user.creditsLimit })}
                          onDelete={() => setDeleteTarget(user)}
                          onToggle={() => void toggleUser(user)}
                        />
                      ))
                    ) : (
                      <div className="grid place-items-center px-4 py-16 text-sm text-zinc-500">No users found</div>
                    )}
                  </div>
                </div>
              </Panel>
              ) : null}
            </div>
          </section>
        )}

        {vaultEditor ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
            <form className="w-full max-w-3xl rounded-lg border border-white/10 bg-[#0d1118] p-5 shadow-[0_30px_110px_rgba(0,0,0,0.46)]" onSubmit={saveVaultData}>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Update Cookies Vault</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">{vaultEditor.email}</h2>
                  <p className="mt-1 text-sm text-zinc-500">Paste raw JSON cookie payload. Empty value clears vaultData.</p>
                </div>
                <button className="icon-button" onClick={() => setVaultEditor(null)} type="button" title="Close">
                  <X size={18} />
                </button>
              </div>

              <textarea
                className="field-input min-h-[360px] resize-y font-mono text-xs leading-relaxed"
                value={vaultEditor.vaultData}
                onChange={(event) => setVaultEditor((current) => (current ? { ...current, vaultData: event.target.value } : current))}
                placeholder='[{"name":"SID","value":"...","domain":".google.com","path":"/","secure":true,"httpOnly":true}]'
              />
              <div className="mt-4">
                <Field label="Sync Authorization Code">
                  <input
                    className="field-input font-mono"
                    maxLength={24}
                    minLength={12}
                    onChange={(event) => setVaultEditor((current) => (current ? { ...current, syncCode: event.target.value } : current))}
                    placeholder="Paste temporary code"
                    required
                    value={vaultEditor.syncCode}
                  />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button className="secondary-button" onClick={() => setVaultEditor(null)} type="button">
                  Cancel
                </button>
                <button className="primary-button" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                  Save Vault
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {proxyEditor ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
            <form className="w-full max-w-xl rounded-lg border border-white/10 bg-[#0d1118] p-5 shadow-[0_30px_110px_rgba(0,0,0,0.46)]" onSubmit={saveProxySettings}>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Master Proxy</p>
                  <h2 className="mt-1 break-all text-xl font-semibold text-white">{proxyEditor.email}</h2>
                  <p className="mt-1 text-sm text-zinc-500">Leave host empty to remove proxy from this master account.</p>
                </div>
                <button className="icon-button" onClick={() => setProxyEditor(null)} type="button" title="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <Field label="Proxy Host">
                  <input className="field-input" value={proxyEditor.proxyHost} onChange={(event) => setProxyEditor((current) => (current ? { ...current, proxyHost: event.target.value } : current))} placeholder="proxy.example.com" />
                </Field>
                <Field label="Port">
                  <input className="field-input" type="number" min={1} max={65535} value={proxyEditor.proxyPort} onChange={(event) => setProxyEditor((current) => (current ? { ...current, proxyPort: Number(event.target.value) } : current))} />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Username">
                  <input className="field-input" value={proxyEditor.proxyUsername} onChange={(event) => setProxyEditor((current) => (current ? { ...current, proxyUsername: event.target.value } : current))} />
                </Field>
                <Field label={proxyEditor.hasProxyPassword ? "Password (blank keeps saved)" : "Password"}>
                  <input className="field-input" type="password" value={proxyEditor.proxyPassword} onChange={(event) => setProxyEditor((current) => (current ? { ...current, proxyPassword: event.target.value } : current))} />
                </Field>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button className="secondary-button" onClick={() => setProxyEditor(null)} type="button">
                  Cancel
                </button>
                <button className="primary-button" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                  Save Proxy
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {syncCodeDisplay ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#0d1118] p-6 shadow-[0_30px_110px_rgba(0,0,0,0.46)]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Sync Authorization</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Temporary Code</h2>
                </div>
                <button className="icon-button" onClick={() => setSyncCodeDisplay(null)} type="button" title="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="rounded-md border border-white/10 bg-black/20 p-5 text-center">
                <p className="text-4xl font-black tracking-widest text-teal-200">{syncCodeDisplay.code}</p>
                <p className="mt-3 text-xs text-zinc-500">
                  Expires at {new Date(syncCodeDisplay.expiresAt).toLocaleTimeString()}
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  className="primary-button justify-center"
                  onClick={async () => {
                    await navigator.clipboard.writeText(syncCodeDisplay.code);
                    setNotice({ tone: "success", text: "Code copied to clipboard" });
                  }}
                >
                  <Copy size={18} />
                  Copy Code
                </button>
                <button className="secondary-button justify-center" onClick={() => setSyncCodeDisplay(null)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {keeperKeyDisplay ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#0d1118] p-6 shadow-[0_30px_110px_rgba(0,0,0,0.46)]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Auto-Sync</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Setup Code</h2>
                </div>
                <button className="icon-button" onClick={() => setKeeperKeyDisplay(null)} type="button" title="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="rounded-md border border-white/10 bg-black/20 p-5 text-center">
                <p className="break-all font-mono text-sm text-teal-200">{keeperKeyDisplay}</p>
                <p className="mt-3 text-xs text-zinc-500">
                  Shown only once. Paste this into the extension's Setup Code field — it never expires until you regenerate it.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  className="primary-button justify-center"
                  onClick={async () => {
                    await navigator.clipboard.writeText(keeperKeyDisplay);
                    setNotice({ tone: "success", text: "Setup code copied to clipboard" });
                  }}
                >
                  <Copy size={18} />
                  Copy Setup Code
                </button>
                <button className="secondary-button justify-center" onClick={() => setKeeperKeyDisplay(null)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteTarget ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-rose-300/30 bg-[#0d1118] p-5 shadow-[0_30px_110px_rgba(0,0,0,0.46)]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">Delete User</p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-white">{deleteTarget.email}</h2>
                </div>
                <button className="icon-button" onClick={() => setDeleteTarget(null)} type="button" title="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="rounded-md border border-rose-300/35 bg-rose-50 p-4 text-sm leading-6 text-rose-950 admin-dark:border-rose-300/25 admin-dark:bg-rose-300/10 admin-dark:text-rose-50">
                This permanently deletes the user, registered devices, active leases, and usage history. This action cannot be undone.
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button className="secondary-button" onClick={() => setDeleteTarget(null)} type="button">
                  Cancel
                </button>
                <button className="primary-button bg-rose-600 hover:bg-rose-500" disabled={loading} onClick={() => void deleteUser()} type="button">
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                  Delete User
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {planEditor ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
            <form className="w-full max-w-md rounded-lg border border-white/10 bg-[#0d1118] p-5 shadow-[0_30px_110px_rgba(0,0,0,0.46)]" onSubmit={saveUserPlan}>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Edit Plan</p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-white">{planEditor.email}</h2>
                </div>
                <button className="icon-button" onClick={() => setPlanEditor(null)} type="button" title="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="grid gap-4">
                <Field label="Plan">
                  <select
                    className="field-input"
                    value={planEditor.plan}
                    onChange={(event) => {
                      const plan = event.target.value as Plan;
                      setPlanEditor((current) => (current ? { ...current, plan, creditsLimit: defaultPlanCredits[plan] } : current));
                    }}
                  >
                    <option value="BASIC">{planDisplayName.BASIC}</option>
                    <option value="PRO">{planDisplayName.PRO}</option>
                    <option value="ULTRA">{planDisplayName.ULTRA}</option>
                  </select>
                </Field>
                <div className="rounded-md border border-white/10 bg-black/20 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Target credits</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(planEditor.creditsLimit)}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button className="secondary-button" onClick={() => setPlanEditor(null)} type="button">
                  Cancel
                </button>
                <button className="primary-button" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <WalletCards size={18} />}
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
  id,
  locked = false,
}: {
  title: string;
  icon: typeof BarChart3;
  children: React.ReactNode;
  id?: string;
  locked?: boolean;
}) {
  return (
    <section id={id} className="min-w-0 rounded-lg border border-white/10 bg-[#0d1118]/92 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid size-9 place-items-center rounded-md border border-white/10 bg-white/[0.045] text-teal-200">
            <Icon size={18} />
          </div>
          <h2 className="truncate text-base font-semibold text-white">{title}</h2>
        </div>
        {locked ? <Pill tone="rose">SUPER ADMIN</Pill> : null}
      </div>
      {children}
    </section>
  );
}

function StatPanel({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: string; accent: "teal" | "amber" | "emerald" | "blue" }) {
  const color = {
    teal: "text-teal-200 bg-teal-300/10 border-teal-300/25",
    amber: "text-amber-200 bg-amber-300/10 border-amber-300/25",
    emerald: "text-emerald-200 bg-emerald-300/10 border-emerald-300/25",
    blue: "text-blue-200 bg-blue-300/10 border-blue-300/25",
  }[accent];

  return (
    <div className="rounded-lg border border-white/10 bg-[#0d1118]/92 p-4">
      <div className={`mb-5 grid size-10 place-items-center rounded-md border ${color}`}>
        <Icon size={19} />
      </div>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function PlanGeneratorCard({
  credential,
  disabled,
  loading,
  plan,
  validDays,
  onCopy,
  onGenerate,
}: {
  credential: { email: string; password: string } | null;
  disabled: boolean;
  loading: boolean;
  plan: Plan;
  validDays: number;
  onCopy: () => void;
  onGenerate: () => void;
}) {
  const planCopy: Record<Plan, { title: string; accent: string }> = {
    BASIC: {
      title: "Pro",
      accent: "generator-pro-accent",
    },
    PRO: {
      title: "Ultra",
      accent: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
    },
    ULTRA: {
      title: "Unlimited",
      accent: "border-amber-300/45 bg-amber-300/10 text-amber-100",
    },
  };
  const copy = planCopy[plan];

  return (
    <section className="rounded-lg border border-white/10 bg-[#0d1118]/92 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className={`grid size-10 place-items-center rounded-md border ${copy.accent}`}>
          <WalletCards size={19} />
        </div>
        <span
          className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${planAccent[plan]}`}
        >
          {planDisplayName[plan]}
        </span>
      </div>
      <h2 className="text-lg font-semibold text-white">{copy.title}</h2>
      <p className="mt-1 text-sm text-zinc-500">Expires after {formatNumber(validDays)} days with the selected plan credits.</p>
      <button
        className="primary-button mt-4 w-full justify-center whitespace-nowrap"
        disabled={disabled}
        onClick={onGenerate}
        style={{ height: 38, minHeight: 38, padding: "0 12px", fontSize: "12.5px" }}
        type="button"
      >
        {loading ? <Loader2 className="animate-spin" size={15} /> : <UserPlus size={15} />}
        Generate {copy.title}
      </button>

      {credential ? (
        <div className="mt-4 grid gap-3 rounded-md border border-emerald-300/30 bg-emerald-300/10 p-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">New credential</p>
            <p className="mt-1 truncate text-sm text-white">{credential.email}</p>
            <p className="mt-1 truncate font-mono text-sm text-emerald-100">{credential.password}</p>
          </div>
          <button className="secondary-button justify-center" onClick={onCopy} type="button">
            <Copy size={16} />
            Copy
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RevenueTrendTable({
  rows,
  view,
}: {
  rows: Array<{ date?: string; month?: string; revenueCents: number; count: number }>;
  view: "daily" | "monthly";
}) {
  return (
    <div className="overflow-hidden rounded-md border border-white/10">
      <div className="grid grid-cols-[1fr_.6fr_.8fr] gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500 max-md:hidden">
        <span>{view === "daily" ? "Date" : "Month"}</span>
        <span>Signups</span>
        <span>Revenue</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div key={row.date ?? row.month} className="grid gap-3 border-b border-white/10 px-4 py-3 last:border-b-0 md:grid-cols-[1fr_.6fr_.8fr] md:items-center">
              <span className="text-sm text-zinc-300">{row.date ?? row.month}</span>
              <span className="text-sm font-semibold text-slate-100">{formatNumber(row.count)}</span>
              <span className="text-sm font-semibold text-emerald-200">{formatCurrency(row.revenueCents)}</span>
            </div>
          ))
        ) : (
          <div className="grid place-items-center px-4 py-12 text-sm text-zinc-500">No revenue data yet</div>
        )}
      </div>
    </div>
  );
}

function SalesReportTable({ rows }: { rows: SalesReportRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-white/10">
      <div className="grid grid-cols-[1.5fr_.55fr_.55fr_.55fr_.55fr] gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-xs uppercase tracking-[0.18em] text-zinc-500 max-md:hidden">
        <span>Admin</span>
        <span>Pro</span>
        <span>Ultra</span>
        <span>Unlimited</span>
        <span>Total</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {rows.length > 0 ? (
          rows.map((row) => {
            const total = row.basicCount + row.proCount + row.ultraCount;
            return (
              <div key={row.adminId} className="grid gap-3 border-b border-white/10 px-4 py-4 last:border-b-0 md:grid-cols-[1.5fr_.55fr_.55fr_.55fr_.55fr] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{row.adminName}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{row.adminId}</p>
                </div>
                <span className="text-sm font-semibold text-slate-100">{formatNumber(row.basicCount)}</span>
                <span className="text-sm font-semibold text-cyan-100">{formatNumber(row.proCount)}</span>
                <span className="text-sm font-semibold text-amber-100">{formatNumber(row.ultraCount)}</span>
                <span className="text-sm font-semibold text-white">{formatNumber(total)}</span>
              </div>
            );
          })
        ) : (
          <div className="grid place-items-center px-4 py-16 text-sm text-zinc-500">No sub-admin sales today</div>
        )}
      </div>
    </div>
  );
}

function UserRow({
  user,
  onDelete,
  onEditPlan,
  onToggle,
}: {
  user: AdminUser;
  onDelete: () => void;
  onEditPlan: () => void;
  onToggle: () => void;
}) {
  const disabled = Boolean(user.isManuallyDisabled || user.manualDisable);
  const expired = Boolean(user.systemExpired || (user.validUntil && new Date(user.validUntil).getTime() < Date.now()));
  const status = disabled ? "Disabled" : expired ? "Expired" : "Active";

  return (
    <div className="grid gap-3 border-b border-white/10 px-4 py-4 last:border-b-0 lg:grid-cols-[1.5fr_.7fr_.7fr_.8fr_auto] lg:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{user.email}</p>
        <p className="mt-1 truncate text-xs text-zinc-500">{user.id}</p>
      </div>
      <div>
        <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${planAccent[user.plan]}`}>{planDisplayName[user.plan]}</span>
      </div>
      <div className="text-sm text-zinc-300">
        {formatNumber(user.creditsUsed)} / {formatNumber(user.creditsLimit)}
      </div>
      <div className="flex items-center gap-2">
        {status === "Active" ? <BadgeCheck size={16} className="text-emerald-700 admin-dark:text-emerald-300" /> : <Ban size={16} className="text-rose-300" />}
        <span className="text-sm text-zinc-300">{status}</span>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button className="secondary-button justify-center" onClick={onEditPlan} type="button">
          <WalletCards size={16} />
          Edit Plan
        </button>
        <button className="secondary-button justify-center" onClick={onToggle} type="button">
          {disabled ? <Check size={16} /> : <Ban size={16} />}
          {disabled ? "Enable" : "Disable"}
        </button>
        <button className="secondary-button justify-center text-rose-200 hover:text-rose-100" onClick={onDelete} type="button">
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </div>
  );
}

function AdminRow({ admin, onToggle }: { admin: AdminUser; onToggle: () => void }) {
  const disabled = Boolean(admin.isManuallyDisabled || admin.manualDisable);
  const expired = Boolean(admin.systemExpired || (admin.validUntil && new Date(admin.validUntil).getTime() < Date.now()));
  const status = disabled ? "Disabled" : expired ? "Expired" : "Active";

  return (
    <div className="grid gap-3 border-b border-white/10 px-4 py-4 last:border-b-0 lg:grid-cols-[1.4fr_.7fr_.8fr_.7fr_auto] lg:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{admin.email}</p>
        <p className="mt-1 truncate text-xs text-zinc-500">{admin.id}</p>
      </div>
      <div>
        <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${planAccent[admin.plan]}`}>{planDisplayName[admin.plan]}</span>
      </div>
      <div className="text-sm text-zinc-300">
        {formatNumber(admin.creditsUsed)} / {formatNumber(admin.creditsLimit)}
      </div>
      <div className="flex items-center gap-2">
        {status === "Active" ? <BadgeCheck size={16} className="text-emerald-700 admin-dark:text-emerald-300" /> : <Ban size={16} className="text-rose-300" />}
        <span className="text-sm text-zinc-300">{status}</span>
      </div>
      <button className="secondary-button justify-center" onClick={onToggle} type="button">
        {disabled ? <Check size={16} /> : <Ban size={16} />}
        {disabled ? "Enable" : "Disable"}
      </button>
    </div>
  );
}

function MasterAccountRow({
  account,
  onEditProxy,
  onEditVault,
  onGetSyncCode,
  onGetKeeperKey,
  onToggleStatus,
  onDelete,
}: {
  account: MasterAccount;
  onEditProxy: () => void;
  onEditVault: () => void;
  onGetSyncCode: () => void;
  onGetKeeperKey: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const remainingPercent = account.dailyLimit > 0 ? Math.max(0, Math.min(100, Math.round((account.remainingLimit / account.dailyLimit) * 100))) : 0;
  const statusClass =
    account.status === "ACTIVE"
      ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
      : account.status === "COOLING_DOWN"
        ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
        : account.status === "DISABLED"
          ? "border-zinc-400/35 bg-zinc-400/10 text-zinc-300"
          : account.status === "REQUIRES_SYNC" || account.status === "AUTH_INVALID"
            ? "border-orange-400/40 bg-orange-400/10 text-orange-200"
            : "border-rose-300/35 bg-rose-300/10 text-rose-100";
  const statusLabel = account.status === "REQUIRES_SYNC" ? "Platform Blocked" : account.status.replace("_", " ");
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-all text-sm font-semibold text-slate-950 admin-dark:text-white">{account.email}</p>
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClass}`}>{statusLabel}</span>
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="rounded bg-black/20 px-1.5 py-0.5 font-medium text-zinc-400 admin-dark:bg-white/5">{account.provider}</span>
            <button
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-zinc-500 hover:bg-zinc-100 admin-dark:hover:bg-white/10"
              onClick={async () => {
                await navigator.clipboard.writeText(account.id);
              }}
              type="button"
              title="Copy master account ID"
            >
              <Copy size={12} />
              {account.id.slice(0, 10)}…
            </button>
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${account.hasVaultData ? "text-cyan-400" : "text-zinc-500"}`}>
              <Database size={11} />
              {account.hasVaultData ? "Vault loaded" : "Vault empty"}
            </span>
            <span className="rounded bg-black/20 px-1.5 py-0.5 font-medium text-zinc-500 admin-dark:bg-white/5">
              v{account.vaultVersion} / {account.vaultHealth}
            </span>
            {account.lastVaultSyncAt ? (
              <span className="rounded bg-black/20 px-1.5 py-0.5 font-medium text-zinc-500 admin-dark:bg-white/5">
                Synced {new Date(account.lastVaultSyncAt).toLocaleString()}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded bg-black/20 px-1.5 py-0.5 font-medium text-zinc-500 admin-dark:bg-white/5">
              <Activity size={11} />
              {formatNumber(account.activeJobCount)} / {formatNumber(account.capacityLimit)} active
            </span>
            <span className={`inline-flex items-center gap-1 rounded bg-black/20 px-1.5 py-0.5 font-medium admin-dark:bg-white/5 ${account.proxyHost ? "text-emerald-500 admin-dark:text-emerald-300" : "text-zinc-500"}`}>
              <PlugZap size={11} />
              {account.proxyHost ? `Proxy ${account.proxyHost}:${account.proxyPort ?? 8080}` : "No proxy"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="primary-button h-9 justify-center whitespace-nowrap px-3 text-xs" onClick={onGetKeeperKey} type="button" title="Generate a one-paste setup code for the sync extension">
            <RefreshCw size={14} />
            Setup Code
          </button>
          <button
            className="secondary-button h-9 justify-center whitespace-nowrap px-3 text-xs"
            onClick={onEditProxy}
            type="button"
            title="Set residential proxy for this master account"
          >
            <PlugZap size={14} />
            Proxy
          </button>
          <button
            className="secondary-button h-9 justify-center whitespace-nowrap px-3 text-xs"
            onClick={onToggleStatus}
            type="button"
            title={account.status === "DISABLED" ? "Re-enable this account in the round-robin pool" : "Remove this account from the round-robin pool"}
          >
            {account.status === "DISABLED" ? <Check size={14} /> : <Ban size={14} />}
            {account.status === "DISABLED" ? "Enable" : "Disable"}
          </button>
          <button className="secondary-button h-9 justify-center whitespace-nowrap px-3 text-xs text-rose-400 hover:border-rose-400/40 hover:bg-rose-500/10" onClick={onDelete} type="button" title="Permanently delete this account">
            <Trash2 size={14} />
            Delete
          </button>
          <button
            className="secondary-button h-9 justify-center whitespace-nowrap px-3 text-xs text-zinc-500"
            onClick={() => setShowAdvanced((value) => !value)}
            type="button"
            title="Manual fallback tools — only needed if the sync extension can't be used"
          >
            <ChevronRight size={14} className={showAdvanced ? "rotate-90 transition-transform" : "transition-transform"} />
            Advanced
          </button>
        </div>
      </div>

      {showAdvanced ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <span className="text-[11px] text-zinc-500">Manual fallback (no extension needed):</span>
          <button className="secondary-button h-9 justify-center whitespace-nowrap px-3 text-xs" onClick={onGetSyncCode} type="button" title="Generate one-time sync code">
            <KeyRound size={14} />
            Sync Code
          </button>
          <button className="secondary-button h-9 justify-center whitespace-nowrap px-3 text-xs" onClick={onEditVault} type="button">
            <Database size={14} />
            Update Vault
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-300 to-amber-200" style={{ width: `${remainingPercent}%` }} />
        </div>
        <p className="whitespace-nowrap text-xs font-medium text-zinc-400">
          {formatNumber(account.remainingLimit)} / {formatNumber(account.dailyLimit)} remaining
        </p>
      </div>
    </div>
  );
}

function PlanRow({ label, value, total }: { label: Plan; value: number; total: number }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-200">{planDisplayName[label]}</span>
        <span className="text-zinc-500">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-teal-300 via-amber-200 to-emerald-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "cyan" | "amber" | "rose"; children: React.ReactNode }) {
  const style = {
    cyan: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
    amber: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    rose: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  }[tone];

  return <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${style}`}>{children}</span>;
}

function NoticeBar({ notice }: { notice: Notice }) {
  const Icon = notice.tone === "success" ? Check : notice.tone === "error" ? Ban : Activity;
  const style =
    notice.tone === "success"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-50"
      : notice.tone === "error"
        ? "border-rose-300/25 bg-rose-300/10 text-rose-50"
        : "border-cyan-300/25 bg-cyan-300/10 text-cyan-50";

  return (
    <div className={`mt-4 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${style}`}>
      <Icon size={16} />
      {notice.text}
    </div>
  );
}

function LoginMetric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <Icon className="mb-5 text-amber-200" size={18} />
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function parseApiResponse(text: string, path: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    if (/^\s*</.test(text)) {
      throw new Error(
        `Backend returned HTML for ${path}. Set API Base to https://api.vidgen.fun and confirm the backend/CORS deployment is live.`,
      );
    }

    throw new Error(`Backend returned invalid JSON for ${path}.`);
  }
}
