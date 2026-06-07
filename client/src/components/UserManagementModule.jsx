// User Management module: lets administrators create, approve, update, and
// deactivate system users while preserving role and branch controls.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Copy, Edit, Info, KeyRound, Mail, MapPin, Plus, Search, User, UserCheck, UserX, Users, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { API_BASE_URL } from "../utils/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";
import { mergeSort } from "../utils/algorithms";
import { getEmailTypoSuggestion } from "../utils/emailValidation";
import { ROLE_OPTIONS, getRoleLabel, isAdminRole, normalizeRole } from "../utils/roles";

const sanitizePersonNameInput = value => String(value ?? "").replace(/[^A-Za-zÀ-ÖØ-öø-ÿÑñ .'-]/g, "");
const sanitizeUsernameInput = value => String(value ?? "").replace(/[^A-Za-z0-9._-]/g, "");
const isValidPersonName = value => /^[A-Za-zÀ-ÖØ-öø-ÿÑñ]+(?:[ .'-][A-Za-zÀ-ÖØ-öø-ÿÑñ]+)*$/.test(String(value ?? "").trim());
const isValidUsername = value => /^[A-Za-z0-9._-]{3,30}$/.test(String(value ?? "").trim());
const isValidEmailAddress = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());

const SETUP_ACCOUNT_CREDENTIALS_KEY = "setup_account_credentials";
const ROLE_FILTER_ALL = "all";

const credentialOwnerKey = credentials =>
  String(credentials?.userId || credentials?.email || credentials?.username || "").trim().toLowerCase();

const loadSetupAccountCredentials = () => {
  try {
    const saved = sessionStorage.getItem(SETUP_ACCOUNT_CREDENTIALS_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter(item => item?.temporaryPassword) : [];
  } catch {
    return [];
  }
};

const readApiErrorMessage = async (res, fallback = "Request failed") => {
  try {
    const data = await res.json();
    return data?.error || data?.message || fallback;
  } catch {
    try {
      return (await res.text()) || fallback;
    } catch {
      return fallback;
    }
  }
};

export function UserManagementModule() {
  const { users, setUsers, refreshSystemSummary } = useData();
  const API_BASE = API_BASE_URL;
  const authToken = localStorage.getItem("token");
  const sessionUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch (e) {
      return {};
    }
  })();

  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditAccountDialogOpen, setIsEditAccountDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditBranchDialogOpen, setIsEditBranchDialogOpen] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showBranchTransferDialog, setShowBranchTransferDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRoleChangeDialog, setShowRoleChangeDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isSetupCredentialsDialogOpen, setIsSetupCredentialsDialogOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [accountDetails, setAccountDetails] = useState({
    fullName: "",
    username: "",
    email: ""
  });
  const [newAccount, setNewAccount] = useState({
    fullName: "",
    username: "",
    email: "",
    role: "Inventory Staff",
    branch: sessionUser?.branch || "Manggahan"
  });
  const [createdAccountCredentials, setCreatedAccountCredentials] = useState(null);
  const [setupAccountCredentials, setSetupAccountCredentials] = useState(loadSetupAccountCredentials);
  const [searchQuery, setSearchQuery] = useState("");
  const [inactiveSearchQuery, setInactiveSearchQuery] = useState("");
  const [activeRoleFilter, setActiveRoleFilter] = useState(ROLE_FILTER_ALL);
  const [inactiveRoleFilter, setInactiveRoleFilter] = useState(ROLE_FILTER_ALL);
  const [confirmedEmailTypo, setConfirmedEmailTypo] = useState("");
  const [activeTab, setActiveTab] = useState(() => {
    const targetTab = localStorage.getItem("user_management_target_tab");
    if (targetTab === "inactive" || targetTab === "active") {
      localStorage.removeItem("user_management_target_tab");
      return targetTab;
    }
    if (targetTab === "pending") {
      localStorage.removeItem("user_management_target_tab");
      return "inactive";
    }
    return "active";
  });
  const [activeSort, setActiveSort] = useState({ key: "fullName", direction: "asc" });
  const [inactiveSort, setInactiveSort] = useState({ key: "fullName", direction: "asc" });
  const accountEmailTypoSuggestion = useMemo(
    () => getEmailTypoSuggestion(accountDetails.email),
    [accountDetails.email]
  );
  const newAccountEmailTypoSuggestion = useMemo(
    () => getEmailTypoSuggestion(newAccount.email),
    [newAccount.email]
  );

  useEffect(() => {
    const validTabs = new Set(["active", "inactive"]);
    const handleTargetTab = event => {
      const targetTab = event?.detail?.tab || localStorage.getItem("user_management_target_tab");
      if (targetTab === "pending") {
        localStorage.removeItem("user_management_target_tab");
        setActiveTab("inactive");
        return;
      }
      if (!validTabs.has(targetTab)) return;
      localStorage.removeItem("user_management_target_tab");
      setActiveTab(targetTab);
    };

    window.addEventListener("user-management-target-tab", handleTargetTab);
    handleTargetTab();

    return () => {
      window.removeEventListener("user-management-target-tab", handleTargetTab);
    };
  }, []);

  const normalizeUser = apiUser => ({
    id: (apiUser.user_id || apiUser.id || "").toString(),
    fullName: apiUser.full_name || apiUser.fullName,
    username: apiUser.username,
    email: apiUser.email,
    role: apiUser.role,
    roleLabel: getRoleLabel(apiUser.role),
    branch: apiUser.branch,
    status: apiUser.status,
    mustChangePassword: Boolean(apiUser.must_change_password ?? apiUser.mustChangePassword),
    createdDate: apiUser.created_at
      ? new Date(apiUser.created_at).toLocaleDateString()
      : apiUser.createdDate,
  });

  const loadUsers = useCallback(async ({ silent = false } = {}) => {
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (!res.ok) {
        const message = await res.text();
        if (!silent) {
          toast.error("Unable to load users", { description: message || res.statusText });
        }
        return;
      }
      const data = await res.json();
      const normalized = Array.isArray(data.users) ? data.users.map(normalizeUser) : [];
      setUsers(normalized);
    } catch (err) {
      console.error(err);
      if (!silent) {
        toast.error("Network error while loading users");
      }
    }
  }, [API_BASE, authToken, setUsers]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    const reloadUsersAfterMaintenance = () => {
      loadUsers({ silent: true });
      refreshSystemSummary();
      setSelectedUser(null);
      setShowRejectDialog(false);
      setShowApproveDialog(false);
      setShowDeactivateDialog(false);
      setShowReactivateDialog(false);
      setShowRoleChangeDialog(false);
      setShowBranchTransferDialog(false);
      setIsEditAccountDialogOpen(false);
      setIsEditDialogOpen(false);
      setIsEditBranchDialogOpen(false);
    };

    window.addEventListener("database-restored", reloadUsersAfterMaintenance);
    window.addEventListener("maintenance-action-completed", reloadUsersAfterMaintenance);

    return () => {
      window.removeEventListener("database-restored", reloadUsersAfterMaintenance);
      window.removeEventListener("maintenance-action-completed", reloadUsersAfterMaintenance);
    };
  }, [loadUsers, refreshSystemSummary]);

  const activeUsers = users.filter(u => u.status === "Active");
  const inactiveUsers = users.filter(u => u.status !== "Active");
  const setupRequiredUsers = activeUsers.filter(user => user.mustChangePassword);
  const findSetupCredentialsForUser = user => setupAccountCredentials.find(credentials => {
    const userKeys = [
      user?.id,
      user?.email,
      user?.username
    ].map(value => String(value || "").trim().toLowerCase()).filter(Boolean);
    return userKeys.includes(credentialOwnerKey(credentials));
  });

  const saveSetupCredentials = credentials => {
    const credentialRecord = {
      ...credentials,
      savedAt: new Date().toISOString()
    };
    setSetupAccountCredentials(prev => {
      const next = [
        credentialRecord,
        ...prev.filter(item => credentialOwnerKey(item) !== credentialOwnerKey(credentialRecord))
      ];
      sessionStorage.setItem(SETUP_ACCOUNT_CREDENTIALS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const makeComparator = sortCfg => (a, b) => {
    const key = sortCfg.key;
    if (key === "createdDate") {
      const aTime = new Date(a?.[key] ?? "").getTime() || 0;
      const bTime = new Date(b?.[key] ?? "").getTime() || 0;
      const baseNum = aTime - bTime;
      return sortCfg.direction === "asc" ? baseNum : -baseNum;
    }
    const aVal = (a?.[key] ?? "").toString().toLowerCase();
    const bVal = (b?.[key] ?? "").toString().toLowerCase();
    const base = aVal.localeCompare(bVal);
    return sortCfg.direction === "asc" ? base : -base;
  };

  const activeComparator = useMemo(() => makeComparator(activeSort), [activeSort]);
  const inactiveComparator = useMemo(() => makeComparator(inactiveSort), [inactiveSort]);

  // Ensure user updates immediately reflect across tabs without requiring a reload.
  const upsertUser = updatedUser => {
    setUsers(prev => {
      const existing = prev.find(u => u.id === updatedUser.id);
      if (!existing) return [...prev, updatedUser];

      // Preserve any fields the API did not return (e.g., role or role) to keep badges visible.
      const merged = {
        ...existing,
        ...updatedUser,
        role: updatedUser.role ?? existing.role,
        roleLabel: getRoleLabel(updatedUser.role ?? existing.role),
        branch: updatedUser.branch ?? existing.branch,
        email: updatedUser.email ?? existing.email,
        username: updatedUser.username ?? existing.username,
        fullName: updatedUser.fullName ?? existing.fullName,
        status: updatedUser.status ?? existing.status,
        createdDate: updatedUser.createdDate ?? existing.createdDate
      };

      return prev.map(u => (u.id === merged.id ? merged : u));
    });
  };

  const handleSort = (scope, key, forcedDirection) => {
    const nextState = prev => {
      if (forcedDirection) return { key, direction: forcedDirection };
      return prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" };
    };

    if (scope === "active") setActiveSort(nextState);
    if (scope === "inactive") setInactiveSort(nextState);
  };

  const getSortState = scope => {
    if (scope === "active") return activeSort;
    return inactiveSort;
  };

  const renderSortableHeader = (scope, key, label) => {
    const cfg = getSortState(scope);
    const isActive = cfg.key === key;
    const titles = key === "createdDate"
      ? {
          asc: `Sort by ${label} (Oldest First)`,
          desc: `Sort by ${label} (Newest First)`
        }
      : {
          asc: `Sort by ${label} (A-Z)`,
          desc: `Sort by ${label} (Z-A)`
        };

    return (
      <div className="flex items-center gap-1 text-left font-medium text-slate-700">
        <button
          type="button"
          onClick={() => handleSort(scope, key)}
          className="table-sort-header-button flex items-center gap-1 bg-transparent p-0 hover:text-slate-900"
          title={isActive ? titles[cfg.direction] : titles.asc}
        >
          <span>{label}</span>
          <span className={`table-sort-direction ${isActive ? "table-sort-direction-active" : ""}`} aria-hidden="true">
            <ArrowUp
              className={`table-sort-direction-arrow table-sort-direction-arrow-up ${isActive && cfg.direction === "asc" ? "table-sort-direction-arrow-current" : ""} ${isActive && cfg.direction === "desc" ? "table-sort-direction-arrow-muted" : ""}`}
            />
            <ArrowDown
              className={`table-sort-direction-arrow table-sort-direction-arrow-down ${isActive && cfg.direction === "desc" ? "table-sort-direction-arrow-current" : ""} ${isActive && cfg.direction === "asc" ? "table-sort-direction-arrow-muted" : ""}`}
            />
          </span>
        </button>
      </div>
    );
  };

  const renderUserStatusBadge = user => {
    const status = user.status || (activeTab === "inactive" ? "Inactive" : "Active");
    const statusClasses = {
      Active: "bg-green-100 text-green-700 hover:bg-green-100",
      Pending: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
      Inactive: "bg-red-100 text-red-700 hover:bg-red-100"
    };

    return (
      <Badge className={statusClasses[status] || "bg-slate-100 text-slate-700 hover:bg-slate-100"}>
        {status}
      </Badge>
    );
  };

  const renderPasswordSetupBadge = user => user?.mustChangePassword ? (
    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
      First Login Setup Required
    </Badge>
  ) : null;

  const renderUserActions = (scope, user, isMobile = false) => {
    const actionClass = isMobile ? "user-mobile-action" : "";

    if (scope === "inactive") {
      return (
        <div className={isMobile ? "user-mobile-actions" : "flex gap-2"}>
          <Button
            size="sm"
            variant="outline"
            disabled={isActionLoading}
            className={actionClass}
            onClick={() => handleOpenEditAccount(user)}
            title="Edit Account Details"
          >
            <User className="w-4 h-4" />
            {isMobile && <span>Account</span>}
          </Button>
          <Button
            size="sm"
            disabled={isActionLoading}
            className={actionClass}
            onClick={() => handleInitiateReactivate(user)}
          >
            Reactivate
          </Button>
        </div>
      );
    }

    return (
      <div className={isMobile ? "user-mobile-actions" : "flex gap-2"}>
        <Button
          size="sm"
          variant="outline"
          disabled={isActionLoading}
          className={actionClass}
          onClick={() => handleOpenEditAccount(user)}
          title="Edit Account Details"
        >
          <User className="w-4 h-4" />
          {isMobile && <span>Account</span>}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={actionClass}
          onClick={() => {
            setSelectedUser(user);
            setNewRole(normalizeRole(user.role));
            setIsEditDialogOpen(true);
          }}
          title="Edit Role"
        >
          <Edit className="w-4 h-4" />
          {isMobile && <span>Edit Role</span>}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isActionLoading}
          className={actionClass}
          onClick={() => handleOpenEditBranch(user)}
          title="Edit Branch"
        >
          <MapPin className="w-4 h-4" />
          {isMobile && <span>Branch</span>}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isActionLoading}
          className={actionClass}
          onClick={() => handleInitiateDeactivate(user)}
          title="Deactivate User"
        >
          <UserX className="w-4 h-4" />
          {isMobile && <span>Deactivate</span>}
        </Button>
      </div>
    );
  };

  const renderMobileEmptyState = message => (
    <div className="user-mobile-empty">
      {message}
    </div>
  );

  const renderMobileUserCards = (scope, userList, emptyMessage) => (
    <div className="user-mobile-list">
      {userList.length === 0
        ? renderMobileEmptyState(emptyMessage)
        : userList.map(user => (
          <article className="user-mobile-card" key={user.id}>
            <div className="user-mobile-card-header">
              <div className="min-w-0">
                <h3 title={user.fullName}>{user.fullName || "Unnamed User"}</h3>
                <p>ID: {user.id || "N/A"}</p>
              </div>
              <span
                className="user-role-text user-mobile-role-text"
                title={user.roleLabel || getRoleLabel(user.role) || "Unassigned"}
              >
                {user.roleLabel || getRoleLabel(user.role) || "Unassigned"}
              </span>
            </div>

            <div className="user-mobile-fields">
              <div className="user-mobile-field">
                <span>Username</span>
                <strong title={user.username}>{user.username || "N/A"}</strong>
              </div>
              <div className="user-mobile-field">
                <span>Email</span>
                <strong title={user.email}>{user.email || "N/A"}</strong>
              </div>
              <div className="user-mobile-field">
                <span>Branch</span>
                <strong title={user.branch}>{user.branch || "Not set"}</strong>
              </div>
            </div>

            <div className="user-mobile-card-footer">
              <div className="flex flex-wrap gap-2">
                {renderUserStatusBadge(user)}
                {renderPasswordSetupBadge(user)}
              </div>
              {renderUserActions(scope, user, true)}
            </div>
          </article>
        ))}
    </div>
  );

  const renderRoleFilter = (value, onChange) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="user-role-filter-trigger" aria-label="Filter users by role">
        <span className="user-role-filter-label">
          <Users className="h-4 w-4 shrink-0 text-slate-500" />
          <SelectValue placeholder="All Roles" />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ROLE_FILTER_ALL}>All Roles</SelectItem>
        {ROLE_OPTIONS.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const filteredActiveUsers = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = activeUsers.filter(user => {
      const matchesSearch = (
        (user.fullName || "").toLowerCase().includes(lowerQuery) ||
        (user.username || "").toLowerCase().includes(lowerQuery) ||
        (user.email || "").toLowerCase().includes(lowerQuery) ||
        (user.branch || "").toLowerCase().includes(lowerQuery)
      );
      const matchesRole = activeRoleFilter === ROLE_FILTER_ALL || normalizeRole(user.role) === activeRoleFilter;
      return matchesSearch && matchesRole;
    });
    return mergeSort(filtered, activeComparator);
  }, [activeRoleFilter, activeUsers, activeComparator, searchQuery]);

  const filteredInactiveUsers = useMemo(() => {
    const lowerQuery = inactiveSearchQuery.toLowerCase();
    const filtered = inactiveUsers.filter(user => {
      const matchesSearch = (
        (user.fullName || "").toLowerCase().includes(lowerQuery) ||
        (user.username || "").toLowerCase().includes(lowerQuery) ||
        (user.email || "").toLowerCase().includes(lowerQuery) ||
        (user.branch || "").toLowerCase().includes(lowerQuery)
      );
      const matchesRole = inactiveRoleFilter === ROLE_FILTER_ALL || normalizeRole(user.role) === inactiveRoleFilter;
      return matchesSearch && matchesRole;
    });
    return mergeSort(filtered, inactiveComparator);
  }, [inactiveRoleFilter, inactiveUsers, inactiveComparator, inactiveSearchQuery]);

  const renderChangePreview = (label, currentValue, nextValue, nextTone = "yellow") => {
    const hasChange = nextValue && currentValue !== nextValue;
    const nextToneClasses = nextTone === "red"
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-yellow-300 bg-yellow-100 text-slate-900";

    return (
      <div className="user-change-preview-grid">
        <div className="user-change-preview-card border-slate-200 bg-slate-50">
          <div className="user-change-preview-header">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current {label}</p>
            <Badge variant="outline" className="shrink-0 border-slate-300 text-slate-600">Current</Badge>
          </div>
          <p className="user-change-preview-value text-sm font-semibold text-slate-800" title={currentValue || "Not set"}>
            {currentValue || "Not set"}
          </p>
        </div>
        <div className={`user-change-preview-card transition-all ${hasChange ? nextToneClasses : "border-slate-200 bg-white text-slate-700"}`}>
          <div className="user-change-preview-header">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">New {label}</p>
            <Badge className={`shrink-0 ${hasChange ? "bg-[#FF0000] text-white hover:bg-[#FF0000]" : "bg-slate-200 text-slate-700 hover:bg-slate-200"}`}>
              {hasChange ? "New Selection" : "Unchanged"}
            </Badge>
          </div>
          <p
            className={`user-change-preview-value text-sm font-semibold ${hasChange ? "text-slate-900" : "text-slate-700"}`}
            title={nextValue || "No selection yet"}
          >
            {nextValue || "No selection yet"}
          </p>
          {hasChange && (
            <p className="mt-3 text-xs font-medium text-slate-700">
              This new {label.toLowerCase()} will be applied after confirmation.
            </p>
          )}
        </div>
      </div>
    );
  };

  const resetCreateUserForm = ({ clearCredentials = true } = {}) => {
    setNewAccount({
      fullName: "",
      username: "",
      email: "",
      role: "Inventory Staff",
      branch: sessionUser?.branch || "Manggahan"
    });
    setConfirmedEmailTypo("");
    if (clearCredentials) setCreatedAccountCredentials(null);
  };

  const shouldPauseForEmailTypoWarning = email => {
    const suggestion = getEmailTypoSuggestion(email);
    if (!suggestion || confirmedEmailTypo === suggestion.entered) return false;

    setConfirmedEmailTypo(suggestion.entered);
    return true;
  };

  const renderEmailTypoWarning = suggestion => {
    if (!suggestion) return null;

    const isConfirmed = confirmedEmailTypo === suggestion.entered;

    return (
      <p className={`user-email-typo-warning ${isConfirmed ? "user-email-typo-warning-confirmed" : ""}`}>
        {isConfirmed
          ? `Submit again to keep ${suggestion.entered}.`
          : `Did you mean ${suggestion.suggested}? Please double-check before saving.`}
      </p>
    );
  };

  const handleOpenEditAccount = user => {
    setSelectedUser(user);
    setAccountDetails({
      fullName: user.fullName || "",
      username: user.username || "",
      email: user.email || ""
    });
    setConfirmedEmailTypo("");
    setIsEditAccountDialogOpen(true);
  };

  const updateAccountDetail = (field, value) => {
    if (field === "email") setConfirmedEmailTypo("");
    setAccountDetails(prev => ({
      ...prev,
      [field]: field === "fullName"
        ? sanitizePersonNameInput(value)
        : value
    }));
  };

  const resetAccountDetailsDialog = () => {
    setIsEditAccountDialogOpen(false);
    setSelectedUser(null);
    setAccountDetails({ fullName: "", username: "", email: "" });
    setConfirmedEmailTypo("");
  };

  const handleUpdateAccountDetails = async event => {
    event.preventDefault();
    if (!selectedUser) return;

    const payload = {
      fullName: accountDetails.fullName.trim(),
      email: accountDetails.email.trim().toLowerCase()
    };

    if (!payload.fullName || !payload.email) {
      toast.error("Please complete the full name and email address.");
      return;
    }
    if (!isValidPersonName(payload.fullName)) {
      toast.error("Full name should contain letters only.", {
        description: "Spaces, hyphens, apostrophes, and periods are allowed."
      });
      return;
    }
    if (!isValidEmailAddress(payload.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (shouldPauseForEmailTypoWarning(payload.email)) {
      return;
    }

    const noChanges =
      payload.fullName === (selectedUser.fullName || "") &&
      payload.email === String(selectedUser.email || "").toLowerCase();

    if (noChanges) {
      toast.info("No changes made", {
        description: "The account details are already up to date."
      });
      resetAccountDetailsDialog();
      return;
    }

    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${selectedUser.id}/details`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Account update failed", { description: data.error || res.statusText });
        return;
      }

      const updated = normalizeUser(data.user);
      upsertUser(updated);

      const actingUserId = (sessionUser?.id ?? sessionUser?.user_id ?? "").toString();
      if (actingUserId && actingUserId === updated.id) {
        const refreshedSessionUser = {
          ...sessionUser,
          id: sessionUser?.id ?? sessionUser?.user_id,
          fullName: updated.fullName,
          email: updated.email,
          role: updated.role,
          branch: updated.branch
        };
        localStorage.setItem("user", JSON.stringify(refreshedSessionUser));
      }

      toast.success("Account details updated", {
        description: `${updated.fullName}'s profile information was saved.`
      });
      resetAccountDetailsDialog();
    } catch (err) {
      console.error(err);
      toast.error("Network error while updating account details");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateUserAccount = async event => {
    event.preventDefault();
    if (!newAccount.fullName.trim() || !newAccount.username.trim() || !newAccount.email.trim()) {
      toast.error("Please complete the full name, username, and email.");
      return;
    }
    if (!isValidPersonName(newAccount.fullName)) {
      toast.error("Full name should contain letters only.", {
        description: "Spaces, hyphens, apostrophes, and periods are allowed."
      });
      return;
    }
    if (!isValidUsername(newAccount.username)) {
      toast.error("Username should be 3 to 30 characters.", {
        description: "Use letters, numbers, dots, underscores, or hyphens only."
      });
      return;
    }
    if (!isValidEmailAddress(newAccount.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    const cleanEmail = newAccount.email.trim().toLowerCase();
    if (shouldPauseForEmailTypoWarning(cleanEmail)) {
      return;
    }

    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newAccount)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Failed to create account", { description: data.error || res.statusText });
        return;
      }

      const createdUser = normalizeUser(data.user);
      upsertUser(createdUser);
      refreshSystemSummary();
      setActiveTab("active");
      const generatedCredentials = {
        userId: createdUser.id,
        fullName: createdUser.fullName,
        username: createdUser.username,
        email: createdUser.email,
        temporaryPassword: data.temporaryPassword,
        emailDeliveryStatus: data.emailDeliveryStatus || "unknown"
      };
      setCreatedAccountCredentials(generatedCredentials);
      saveSetupCredentials(generatedCredentials);
      setIsCreateUserDialogOpen(false);
      toast.success("User account created", {
        description: data.emailDeliveryStatus === "sent"
          ? "Tell the employee to check their email for the temporary credentials."
          : "Tell the employee to check their email. The temporary credentials are also ready to copy if needed."
      });
    } catch (err) {
      console.error(err);
      toast.error("Network error while creating account");
    } finally {
      setIsActionLoading(false);
    }
  };

  const copyTemporaryCredentials = async (credentials = createdAccountCredentials) => {
    const selectedCredentials = credentials?.temporaryPassword ? credentials : createdAccountCredentials;
    if (!selectedCredentials?.username || !selectedCredentials?.temporaryPassword) {
      toast.error("Temporary credentials are not available to copy.");
      return;
    }
    const credentialText = `Username: ${selectedCredentials.username}\nTemporary Password: ${selectedCredentials.temporaryPassword}`;
    try {
      await navigator.clipboard.writeText(credentialText);
      toast.success("Temporary credentials copied.");
    } catch {
      toast.error("Unable to copy credentials automatically.");
    }
  };

  const getCreatedAccountEmailMessage = () => {
    if (!createdAccountCredentials) return "";
    if (createdAccountCredentials.emailDeliveryStatus === "sent") {
      return (
        <>
          Tell <strong>{createdAccountCredentials.fullName}</strong> to check <strong>{createdAccountCredentials.email}</strong> for the temporary credentials. You can also copy them here if needed.
        </>
      );
    }
    if (createdAccountCredentials.emailDeliveryStatus === "failed") {
      return (
        <>
          Tell <strong>{createdAccountCredentials.fullName}</strong> to check <strong>{createdAccountCredentials.email}</strong>. If the email is not visible, copy and share these temporary credentials directly.
        </>
      );
    }
    if (createdAccountCredentials.emailDeliveryStatus === "local_preview") {
      return "Email service is not configured for live delivery. Copy and share these temporary credentials directly with the assigned user.";
    }
    return "Copy and share these temporary credentials directly if the user does not receive an email.";
  };

  const handleApprove = async user => {
    if (!user) return false;
    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${user.id}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (!res.ok) {
        const message = await res.text();
        toast.error("Approval failed", { description: message || res.statusText });
        return false;
      }
      const data = await res.json();
      const updated = normalizeUser(data.user);
      upsertUser(updated);
      refreshSystemSummary();
      toast.success(`User ${updated.fullName} is now Active`, {
        description: "Activation email sent to the employee"
      });
      return true;
    } catch (err) {
      console.error(err);
      toast.error("Network error while approving user");
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleConfirmApprove = async () => {
    const success = await handleApprove(selectedUser);
    if (success) {
      setShowApproveDialog(false);
      setSelectedUser(null);
    }
  };

  const handleInitiateReactivate = user => {
    setSelectedUser(user);
    setShowReactivateDialog(true);
  };

  const handleConfirmReactivate = async () => {
    const success = await handleApprove(selectedUser);
    if (success) {
      setShowReactivateDialog(false);
      setSelectedUser(null);
    }
  };

  const handleReject = async () => {
    if (!selectedUser) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${selectedUser.id}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (!res.ok) {
        const message = await res.text();
        toast.error("Rejection failed", { description: message || res.statusText });
        return;
      }
      const data = await res.json();
      const updated = normalizeUser(data.user);
      upsertUser(updated);
      refreshSystemSummary();
      toast.error(`${updated.fullName} set to Inactive`, {
        description: "User can no longer access the system"
      });
    } catch (err) {
      console.error(err);
      toast.error("Network error while rejecting user");
    } finally {
      setIsActionLoading(false);
      setShowRejectDialog(false);
      setSelectedUser(null);
    }
  };

  const handleInitiateDeactivate = user => {
    setSelectedUser(user);
    setShowDeactivateDialog(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!selectedUser) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${selectedUser.id}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (!res.ok) {
        const message = await readApiErrorMessage(res, res.statusText);
        toast.error("Failed to deactivate user", { description: message || res.statusText });
        return;
      }
      const data = await res.json();
      const updated = normalizeUser(data.user);
      upsertUser(updated);
      refreshSystemSummary();
      toast.warning(`${updated.fullName}'s account deactivated`, {
        description: 'User will no longer have system access'
      });
    } catch (err) {
      console.error(err);
      toast.error("Network error while deactivating user");
    } finally {
      setIsActionLoading(false);
      setShowDeactivateDialog(false);
      setSelectedUser(null);
    }
  };

  const handleInitiateRoleChange = () => {
    if (!selectedUser || !newRole) return;
    if (normalizeRole(newRole) === normalizeRole(selectedUser.role)) {
      toast.info("No changes made", {
        description: "The selected role is the same as the current role"
      });
      setIsEditDialogOpen(false);
      return;
    }
    setIsEditDialogOpen(false);
    setShowRoleChangeDialog(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!selectedUser || !newRole) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${selectedUser.id}/role`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role: newRole })
      });

      if (!res.ok) {
        let message = '';
        try {
          const errJson = await res.json();
          message = errJson?.error || errJson?.message || '';
        } catch (e) {
          message = await res.text();
        }
        toast.error("Role update failed", { description: message || res.statusText });
        return;
      }

      const data = await res.json();
      const updated = normalizeUser(data.user);
      upsertUser(updated);

      const actingUserId = (sessionUser?.id ?? sessionUser?.user_id ?? "").toString();
      const targetUserId = (updated?.id ?? "").toString();

      if (actingUserId && targetUserId && actingUserId === targetUserId) {
        toast.success("Role updated", {
          description: `Your role is now ${getRoleLabel(updated.role)}. Please re-login to refresh your access.`
        });
      } else {
        toast.success("Role updated successfully. User must re-login to apply changes.");
      }

      // If this admin demoted themselves, immediately clear session, set message, and redirect
      if (data.selfDemoted) {
        localStorage.setItem('postLogoutToast', JSON.stringify({
          title: 'Your role has been updated. You have been logged out to refresh your permissions.',
          description: `Role changed to ${getRoleLabel(updated.role)}. Please log in again.`
        }));
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('active_branch');
        window.location.href = '/';
        return;
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error while updating role");
    } finally {
      setIsActionLoading(false);
      setShowRoleChangeDialog(false);
      setSelectedUser(null);
      setNewRole("");
    }
  };

  const handleOpenEditBranch = user => {
    setSelectedUser(user);
    setNewBranch(user.branch);
    setIsEditBranchDialogOpen(true);
  };

  const handleInitiateBranchTransfer = () => {
    if (!selectedUser || !newBranch || newBranch === selectedUser.branch) {
      if (newBranch === selectedUser.branch) {
        toast.info("No changes made", {
          description: "The selected branch is the same as the current branch"
        });
        setIsEditBranchDialogOpen(false);
      }
      return;
    }
    setIsEditBranchDialogOpen(false);
    setShowBranchTransferDialog(true);
  };

  const handleConfirmBranchTransfer = async () => {
    if (!selectedUser || !newBranch) return;
    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${selectedUser.id}/branch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ branch: newBranch })
      });

      if (!res.ok) {
        const message = await res.text();
        toast.error("Branch transfer failed", { description: message || res.statusText });
        return;
      }

      const data = await res.json();
      const updated = normalizeUser(data.user);

      // If the user moved to another branch, remove them from the current branch view.
      if (updated.branch !== sessionUser.branch) {
        setUsers(users.filter(u => u.id !== updated.id));
      } else {
        upsertUser(updated);
      }

      toast.success(`Branch transfer completed`, {
        description: `${updated.fullName} transferred to ${updated.branch}. Their access has been updated.`
      });
    } catch (err) {
      console.error(err);
      toast.error("Network error while transferring user");
    } finally {
      setIsActionLoading(false);
      setShowBranchTransferDialog(false);
      setSelectedUser(null);
      setNewBranch("");
    }
  };

  return (
    <div className="user-management-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .user-management-page,
        .user-management-page * {
          box-sizing: border-box;
        }

        .user-management-page {
          overflow-x: hidden;
        }

        .user-management-shell {
          width: 100%;
        }

        .user-summary-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .user-summary-card {
          min-width: 0;
          transition: padding 180ms ease, min-height 180ms ease;
        }

        .user-summary-content {
          min-height: 84px;
        }

        .user-summary-icon {
          width: 3rem;
          height: 3rem;
        }

        .user-accounts-card {
          overflow: hidden;
        }

        .user-accounts-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding-bottom: 0.75rem;
        }

        .user-accounts-title {
          min-width: 0;
        }

        .user-create-account-button {
          min-height: 3rem;
          min-width: 11.5rem;
          width: auto;
          border-radius: 0.75rem;
          padding-inline: 1.2rem;
          box-shadow: 0 10px 20px rgba(255, 0, 0, 0.2);
          white-space: nowrap;
        }

        .user-setup-credentials-button {
          min-height: 3rem;
          width: auto;
          border: 1px solid #bfdbfe;
          border-radius: 0.75rem;
          background: #ffffff;
          color: #1d4ed8;
          padding-inline: 1rem;
          font-weight: 700;
          white-space: nowrap;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .user-setup-credentials-button:hover {
          border-color: #93c5fd;
          background: #eff6ff;
          color: #1e40af;
          box-shadow: 0 12px 24px rgba(37, 99, 235, 0.14);
        }

        .user-setup-credentials-button:active {
          background: #dbeafe;
          border-color: #60a5fa;
          box-shadow: 0 6px 14px rgba(37, 99, 235, 0.12);
        }

        .user-setup-credentials-button svg {
          color: #2563eb;
        }

        .user-setup-credentials-dialog {
          width: min(100% - 2rem, 34rem);
          max-width: min(100% - 2rem, 34rem) !important;
          border-radius: 1rem;
          padding: 1.35rem;
        }

        .user-setup-dialog-header {
          display: grid;
          grid-template-columns: 3.25rem minmax(0, 1fr);
          gap: 1rem;
          align-items: start;
        }

        .user-setup-dialog-icon {
          display: inline-flex;
          width: 3.25rem;
          height: 3.25rem;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #eff6ff;
          color: #2563eb;
        }

        .user-setup-divider {
          height: 1px;
          background: #dbe3ef;
          margin: 0.25rem 0 0.1rem;
        }

        .user-setup-list {
          display: grid;
          gap: 0.75rem;
          max-height: min(58vh, 26rem);
          overflow-y: auto;
          padding-right: 0.15rem;
        }

        .user-setup-item {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 0.75rem;
          align-items: start;
          border: 1px solid #dbe3ef;
          border-radius: 0.9rem;
          background: #ffffff;
          padding: 1rem;
        }

        .user-setup-item-main {
          display: grid;
          grid-template-columns: 2.75rem minmax(0, 1fr);
          gap: 0.85rem;
          align-items: start;
        }

        .user-setup-avatar {
          display: inline-flex;
          width: 2.75rem;
          height: 2.75rem;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #eff6ff;
          color: #2563eb;
        }

        .user-setup-name {
          color: #111827;
          font-size: 1.05rem;
          font-weight: 800;
          line-height: 1.25;
        }

        .user-setup-identity-row {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.35rem;
          margin-top: 0.35rem;
          color: #64748b;
          font-size: 0.85rem;
          line-height: 1.35;
        }

        .user-setup-identity-row span {
          display: inline-flex;
          min-width: 0;
          align-items: center;
          gap: 0.35rem;
        }

        .user-setup-identity-row strong {
          color: #334155;
          overflow-wrap: anywhere;
        }

        .user-setup-meta {
          display: none;
          margin-top: 0.2rem;
          color: #64748b;
          font-size: 0.85rem;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .user-setup-info-box {
          display: flex;
          gap: 0.65rem;
          align-items: flex-start;
          border: 1px solid #bfdbfe;
          border-radius: 0.75rem;
          background: #eff6ff;
          padding: 0.8rem;
          color: #1e3a8a;
          font-size: 0.9rem;
          line-height: 1.45;
        }

        .user-setup-info-box svg {
          margin-top: 0.1rem;
          color: #2563eb;
          flex-shrink: 0;
        }

        .user-setup-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .user-setup-view-button {
          border-color: #bfdbfe;
          color: #1d4ed8;
          background: #ffffff;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .user-setup-view-button:hover {
          border-color: #93c5fd;
          background: #eff6ff;
          color: #1e40af;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
        }

        .user-setup-view-button:active {
          background: #dbeafe;
          border-color: #60a5fa;
        }

        .user-tabs-list {
          width: fit-content;
          max-width: 100%;
          flex-wrap: wrap;
          gap: 0.25rem;
          height: auto;
          padding: 0.25rem;
          border-radius: 999px;
        }

        .user-tabs-list [role="tab"] {
          min-height: 2.5rem;
          border-radius: 999px;
          white-space: nowrap;
        }

        .user-tabs-list [role="tab"][data-state="active"] {
          background: #ff0000;
          color: #ffffff;
          box-shadow: 0 10px 18px rgba(255, 0, 0, 0.22);
        }

        .user-tabs-list [role="tab"][data-state="active"]:hover {
          background: #e00000;
          color: #ffffff;
        }

        .user-edit-dialog,
        .user-confirm-dialog {
          width: min(100% - 2rem, 34rem);
          max-width: min(100% - 2rem, 34rem) !important;
          gap: 0.85rem;
          border-radius: 1rem;
        }

        .user-edit-dialog {
          padding: 1.25rem;
        }

        .user-create-dialog {
          width: min(100% - 2rem, 34rem);
          max-width: min(100% - 2rem, 34rem) !important;
        }

        .user-create-dialog .create-full-name-field {
          grid-column: 1 / -1;
        }

        .user-create-dialog input::placeholder {
          color: #64748b;
          opacity: 1;
        }

        .user-edit-dialog [data-slot="dialog-header"] {
          gap: 0.35rem;
          padding-right: 1.75rem;
        }

        .user-edit-dialog [data-slot="dialog-title"],
        .user-confirm-dialog [data-slot="alert-dialog-title"] {
          font-size: 1.15rem;
          line-height: 1.2;
        }

        .user-edit-dialog [data-slot="dialog-description"],
        .user-confirm-dialog [data-slot="alert-dialog-description"] {
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .user-edit-dialog [data-slot="dialog-footer"],
        .user-confirm-dialog [data-slot="alert-dialog-footer"] {
          gap: 0.6rem;
        }

        .user-confirm-dialog [data-slot="alert-dialog-header"] {
          gap: 0.5rem;
          padding: 1.25rem 1.25rem 0;
        }

        .user-confirm-dialog [data-slot="alert-dialog-footer"] {
          padding: 0 1.25rem 1.25rem;
        }

        .user-confirm-dialog .rounded-lg.p-4,
        .user-edit-dialog .rounded-lg.p-4 {
          padding: 0.8rem;
        }

        .user-search-wrap {
          max-width: 100%;
        }

        .user-filter-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(14rem, 17rem);
          align-items: center;
          gap: 0.75rem;
        }

        .user-search-control {
          position: relative;
          min-width: 0;
        }

        .user-search-control input,
        .user-role-filter-trigger {
          height: 2.875rem;
          min-height: 2.875rem;
          border-color: #dbe3ef;
          border-radius: 0.75rem;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .user-search-control input {
          padding-left: 2.5rem;
          padding-right: 2.75rem;
        }

        .user-role-filter-trigger {
          width: 100%;
          justify-content: space-between;
          gap: 0.75rem;
          color: #0f172a;
          font-weight: 600;
        }

        .user-role-filter-label {
          display: inline-flex;
          min-width: 0;
          align-items: center;
          gap: 0.6rem;
          overflow: hidden;
        }

        .user-role-filter-label [data-slot="select-value"] {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .user-role-filter-trigger:hover,
        .user-role-filter-trigger:focus-visible,
        .user-search-control input:focus-visible {
          border-color: #94a3b8;
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.16);
        }

        .user-table-shell {
          overflow-x: auto;
          overflow-y: hidden;
        }

        .user-table-shell table {
          table-layout: auto;
          min-width: 1160px;
          width: 100%;
        }

        .user-role-cell {
          min-width: 280px;
          width: 280px;
          white-space: nowrap;
        }

        .user-mobile-list {
          display: none;
        }

        .user-role-text {
          display: block;
          width: 100%;
          max-width: 100%;
          color: #0f172a;
          font-size: 0.875rem;
          font-weight: 500;
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: clip;
          text-align: left;
        }

        .user-mobile-role-text {
          width: auto;
          max-width: none;
          flex-shrink: 1;
          color: #334155;
          font-size: 0.8125rem;
          white-space: normal;
        }

        .user-change-preview-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .user-change-preview-card {
          min-width: 0;
          border-width: 1px;
          border-style: solid;
          border-radius: 0.85rem;
          padding: 0.9rem;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .user-change-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .user-change-preview-value {
          display: block;
          max-width: 100%;
          min-height: 1.5rem;
          margin-top: 0.85rem;
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role-select-trigger {
          min-height: 44px;
          height: auto;
          align-items: center;
          white-space: normal;
          line-height: 1.3;
        }

        .user-role-select-trigger [data-slot="select-value"] {
          white-space: normal;
          overflow-wrap: anywhere;
          line-clamp: unset;
          -webkit-line-clamp: unset;
        }

        .user-account-details-form {
          display: grid;
          gap: 1rem;
          padding-top: 0.5rem;
        }

        .user-account-details-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .user-immutable-input:disabled {
          cursor: not-allowed;
          border-color: #dbe3ef;
          background: #f8fafc;
          color: #475569;
          opacity: 1;
        }

        .user-email-typo-warning {
          margin-top: 0.45rem;
          color: #92400e;
          font-size: 0.78rem;
          font-weight: 600;
          line-height: 1.45;
        }

        .user-email-typo-warning-confirmed {
          color: #0f766e;
        }

        .user-account-details-note {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          border: 1px solid #bfdbfe;
          border-radius: 0.85rem;
          background: #eff6ff;
          padding: 0.85rem;
          color: #1e3a8a;
          font-size: 0.875rem;
          line-height: 1.45;
        }

        .user-account-details-note svg {
          margin-top: 0.1rem;
          flex-shrink: 0;
          color: #2563eb;
        }

        @media (max-width: 640px) {
          .user-change-preview-grid {
            grid-template-columns: 1fr;
          }

          .user-account-details-grid {
            grid-template-columns: 1fr;
          }
        }

        .user-mobile-empty {
          display: grid;
          min-height: 8rem;
          place-items: center;
          border: 1px dashed #cbd5e1;
          border-radius: 0.75rem;
          color: #64748b;
          text-align: center;
          padding: 1rem;
          background: #f8fafc;
        }

        @media (max-width: 900px) {
          .user-management-page {
            padding: 1.25rem;
          }

          .user-management-shell {
            gap: 1.25rem;
          }

          .user-management-page .mb-8 {
            margin-bottom: 1.25rem;
          }

          .user-management-page .mb-8 > .relative {
            border-radius: 1.25rem;
            padding: 2rem;
          }

          .user-management-page .mb-8 h1 {
            font-size: clamp(2rem, 7vw, 2.75rem);
            line-height: 1.05;
            margin-bottom: 0.5rem;
          }

          .user-management-page .mb-8 p {
            font-size: clamp(0.95rem, 3.4vw, 1.1rem);
            line-height: 1.35;
          }

          .user-summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.85rem;
          }

          .user-summary-content {
            min-height: 72px;
          }
        }

        @media (max-width: 820px) {
          .user-management-page {
            padding: 1.25rem;
          }

          .user-management-shell {
            gap: 1rem;
          }

          .user-management-page .mb-8 > .relative {
            padding: 1.5rem;
          }

          .user-management-page .mb-8 .flex.min-w-0.items-center {
            align-items: center;
            gap: 1rem;
          }

          .user-management-page .mb-8 .flex.h-16 {
            width: 4rem;
            height: 4rem;
            border-radius: 1rem;
          }

          .user-management-page .mb-8 .flex.h-16 svg {
            width: 2rem;
            height: 2rem;
          }

          .user-management-page .mb-8 .min-w-0[style] {
            margin-left: 0 !important;
          }

          .user-summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.875rem;
          }

          .user-summary-card .pt-6 {
            padding: 1rem;
          }

          .user-summary-content {
            min-height: 64px;
          }

          .user-summary-card p:first-child {
            font-size: 0.875rem;
            line-height: 1.2;
          }

          .user-summary-card p:last-child {
            font-size: 1.75rem;
            line-height: 1.1;
          }

          .user-summary-icon {
            width: 2.75rem;
            height: 2.75rem;
            border-radius: 0.75rem;
          }

          .user-summary-icon svg {
            width: 1.35rem;
            height: 1.35rem;
          }

          .user-accounts-card > div:first-child {
            padding: 1.25rem 1.25rem 0.75rem;
          }

          .user-accounts-card > div:nth-child(2) {
            padding: 0 1.25rem 1.25rem;
          }

          .user-accounts-card [data-slot="card-title"] {
            font-size: 1.125rem;
          }

          .user-accounts-card [data-slot="card-description"] {
            font-size: 0.95rem;
            line-height: 1.35;
          }

          .user-accounts-header {
            flex-direction: row;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.85rem;
          }

          .user-accounts-title {
            flex: 1 1 auto;
          }

          .user-create-account-button {
            width: fit-content;
            flex: 0 0 auto;
            min-width: 0;
            max-width: 100%;
            justify-content: center;
            padding-inline: 0.95rem;
            font-size: 0.9rem;
          }

          .user-create-account-button svg {
            margin-right: 0;
          }

          .user-create-account-button span {
            display: none;
          }

          .user-setup-credentials-button {
            min-width: 0;
            max-width: 100%;
            padding-inline: 0.95rem;
            font-size: 0.9rem;
          }

          @media (max-width: 420px) {
            .user-accounts-header {
              align-items: center;
              gap: 0.65rem;
            }

            .user-create-account-button {
              min-height: 2.75rem;
              width: 2.75rem;
              padding: 0;
              border-radius: 0.75rem;
            }

            .user-setup-credentials-button {
              min-height: 2.75rem;
              padding-inline: 0.8rem;
            }
          }

          .user-setup-item {
            grid-template-columns: 1fr;
          }

          .user-setup-actions {
            justify-content: stretch;
          }

          .user-setup-actions button {
            flex: 1 1 9rem;
          }

          .user-tabs-list {
            width: 100%;
            justify-content: flex-start;
            border-radius: 1rem;
          }

          .user-tabs-list [role="tab"] {
            flex: 1 1 auto;
            min-width: fit-content;
            padding-inline: 0.85rem;
            font-size: 0.9rem;
          }

          .user-search-wrap {
            margin-bottom: 0.875rem;
          }

          .user-filter-row {
            grid-template-columns: 1fr;
            gap: 0.65rem;
          }

          .user-search-control input,
          .user-role-filter-trigger {
            min-height: 2.75rem;
            height: 2.75rem;
            font-size: 0.95rem;
            text-overflow: clip;
          }

          .user-table-shell {
            display: none;
          }

          .user-mobile-list {
            display: grid;
            gap: 0.875rem;
          }

          .user-mobile-card {
            min-width: 0;
            border: 1px solid #dbe3ee;
            border-radius: 0.9rem;
            background: #ffffff;
            padding: 1rem;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
          }

          .user-mobile-card-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .user-mobile-card-header h3 {
            color: #0f172a;
            font-size: 1rem;
            font-weight: 800;
            line-height: 1.25;
            overflow-wrap: anywhere;
          }

          .user-mobile-card-header p {
            color: #64748b;
            font-size: 0.8rem;
            margin-top: 0.25rem;
          }

          .user-mobile-fields {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.6rem;
            margin-top: 0.875rem;
          }

          .user-mobile-field {
            min-width: 0;
            border-radius: 0.75rem;
            background: #f8fafc;
            padding: 0.75rem;
          }

          .user-mobile-field span {
            display: block;
            color: #64748b;
            font-size: 0.72rem;
            font-weight: 800;
            letter-spacing: 0.02em;
            text-transform: uppercase;
          }

          .user-mobile-field strong {
            display: block;
            min-width: 0;
            color: #0f172a;
            font-size: 0.9rem;
            line-height: 1.25;
            margin-top: 0.25rem;
            overflow-wrap: anywhere;
          }

          .user-mobile-field:nth-child(2) {
            grid-column: 1 / -1;
          }

          .user-mobile-card-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            margin-top: 0.875rem;
            padding-top: 0.875rem;
            border-top: 1px solid #e2e8f0;
          }

          .user-mobile-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 0.5rem;
          }

          .user-mobile-action {
            min-height: 2.75rem;
            gap: 0.4rem;
            border-radius: 0.75rem;
          }
        }

        @media (max-width: 520px) {
          .user-management-page {
            padding: 1rem;
          }

          .user-management-page .mb-8 > .relative {
            padding: 1.25rem;
          }

          .user-management-page .mb-8 .flex.min-w-0.items-center {
            flex-wrap: nowrap;
          }

          .user-management-page .mb-8 .flex.h-16 {
            width: 3.25rem;
            height: 3.25rem;
            border-radius: 0.9rem;
          }

          .user-management-page .mb-8 .flex.h-16 svg {
            width: 1.7rem;
            height: 1.7rem;
          }

          .user-management-page .mb-8 h1 {
            font-size: clamp(1.65rem, 8vw, 2.1rem);
          }

          .user-summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.55rem;
          }

          .user-summary-content {
            min-height: 84px;
            align-items: flex-start;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
          }

          .user-summary-card .pt-6 {
            padding: 0.75rem;
          }

          .user-summary-card p:first-child {
            max-width: calc(100% - 1.85rem);
            font-size: 0.76rem;
            line-height: 1.18;
          }

          .user-summary-card p:last-child {
            font-size: 1.55rem;
          }

          .user-summary-icon {
            position: absolute;
            top: 0.05rem;
            right: 0;
            width: 2rem;
            height: 2rem;
            border-radius: 0.65rem;
          }

          .user-summary-icon svg {
            width: 1.05rem;
            height: 1.05rem;
          }

          .user-tabs-list {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .user-tabs-list [role="tab"] {
            min-width: 0;
            padding-inline: 0.5rem;
            font-size: 0.82rem;
          }

          .user-mobile-fields {
            grid-template-columns: 1fr;
          }

          .user-mobile-field:nth-child(2) {
            grid-column: auto;
          }

          .user-mobile-card-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .user-mobile-card-footer > .inline-flex {
            width: fit-content;
          }

          .user-mobile-actions,
          .user-mobile-action {
            width: 100%;
          }

          .user-mobile-action {
            flex: 1 1 100%;
            justify-content: center;
          }
        }

        @media (max-width: 380px) {
          .user-summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.45rem;
          }

          .user-summary-card .pt-6 {
            padding: 0.65rem;
          }

          .user-summary-content {
            min-height: 78px;
          }

          .user-summary-card p:first-child {
            font-size: 0.7rem;
          }

          .user-summary-card p:last-child {
            font-size: 1.35rem;
          }

          .user-summary-icon {
            width: 1.75rem;
            height: 1.75rem;
          }
        }
      `}</style>
      <div className="user-management-shell w-full space-y-6">
        <PageHeader
          title="User Management"
          subtitle="Manage user accounts, roles, and permissions"
          icon={<Users className="h-8 w-8" />}
        />

        <div className="user-summary-grid grid gap-6">
          <Card className="user-summary-card">
            <CardContent className="pt-6">
              <div className="user-summary-content flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Active Users</p>
                  <p className="text-2xl text-slate-900">{activeUsers.length}</p>
                </div>
                <div className="user-summary-icon bg-green-100 rounded-lg flex items-center justify-center">
                  <UserCheck className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="user-summary-card">
            <CardContent className="pt-6">
              <div className="user-summary-content flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Accounts Without Access</p>
                  <p className="text-2xl text-slate-900">{inactiveUsers.length}</p>
                </div>
                <div className="user-summary-icon bg-red-100 rounded-lg flex items-center justify-center">
                  <UserX className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="user-accounts-card col-span-1 md:col-span-3 w-full">
          <CardHeader className="user-accounts-header">
            <div className="user-accounts-title">
              <CardTitle>User Accounts</CardTitle>
              <CardDescription>View and manage all user accounts</CardDescription>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {setupRequiredUsers.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSetupCredentialsDialogOpen(true)}
                  className="user-setup-credentials-button"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  <span>Accounts Requiring Setup ({setupRequiredUsers.length})</span>
                </Button>
              )}
              <Button
                type="button"
                onClick={() => {
                  resetCreateUserForm();
                  setIsCreateUserDialogOpen(true);
                }}
                className="user-create-account-button bg-[#FF0000] text-white hover:bg-[#cc0000]"
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>Create User Account</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
              <TabsList className="user-tabs-list">
                <TabsTrigger value="active">Active ({activeUsers.length})</TabsTrigger>
                <TabsTrigger value="inactive">No Access ({inactiveUsers.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="active">
                <div className="user-filter-row user-search-wrap mb-4">
                  <div className="user-search-control">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search by full name, username, email address, or branch"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="border-slate-200"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="search-clear-button search-clear-button--absolute"
                        onClick={() => setSearchQuery("")}
                        aria-label="Clear user search"
                      >
                        <X />
                      </button>
                    )}
                  </div>
                  {renderRoleFilter(activeRoleFilter, setActiveRoleFilter)}
                </div>
                <div className="user-table-shell border border-slate-200 rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[17%]">
                          {renderSortableHeader("active", "fullName", "Full Name")}
                        </TableHead>
                        <TableHead className="w-[12%]">
                          {renderSortableHeader("active", "username", "Username")}
                        </TableHead>
                        <TableHead className="w-[18%]">
                          {renderSortableHeader("active", "email", "Email")}
                        </TableHead>
                        <TableHead className="w-[20%]">
                          <span className="font-medium text-slate-700">Role</span>
                        </TableHead>
                        <TableHead className="w-[10%]">Branch</TableHead>
                        <TableHead className="w-[8%]">Status</TableHead>
                        <TableHead className="w-[15%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActiveUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-slate-700 py-8">
                            No active users found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredActiveUsers.map(user => (
                          <TableRow key={user.id}>
                            <TableCell className="truncate" title={user.fullName}>
                              {user.fullName}
                            </TableCell>
                            <TableCell className="font-mono text-sm truncate" title={user.username}>
                              {user.username}
                            </TableCell>
                            <TableCell className="text-sm truncate" title={user.email}>
                              {user.email}
                            </TableCell>
                            <TableCell className="user-role-cell">
                              <span
                                className="user-role-text"
                                title={user.roleLabel || getRoleLabel(user.role)}
                              >
                                {user.roleLabel || getRoleLabel(user.role)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">{user.branch}</TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                {renderUserStatusBadge(user)}
                                {renderPasswordSetupBadge(user)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {renderUserActions("active", user)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {renderMobileUserCards("active", filteredActiveUsers, "No active users found")}
              </TabsContent>

              <TabsContent value="inactive">
                <div className="user-filter-row user-search-wrap mb-4">
                  <div className="user-search-control">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search by full name, username, email address, or branch"
                      value={inactiveSearchQuery}
                      onChange={e => setInactiveSearchQuery(e.target.value)}
                      className="border-slate-200"
                    />
                    {inactiveSearchQuery && (
                      <button
                        type="button"
                        className="search-clear-button search-clear-button--absolute"
                        onClick={() => setInactiveSearchQuery("")}
                        aria-label="Clear inactive user search"
                      >
                        <X />
                      </button>
                    )}
                  </div>
                  {renderRoleFilter(inactiveRoleFilter, setInactiveRoleFilter)}
                </div>

                <div className="user-table-shell border border-slate-200 rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[17%]">
                          {renderSortableHeader("inactive", "fullName", "Full Name")}
                        </TableHead>
                        <TableHead className="w-[12%]">
                          {renderSortableHeader("inactive", "username", "Username")}
                        </TableHead>
                        <TableHead className="w-[18%]">
                          {renderSortableHeader("inactive", "email", "Email")}
                        </TableHead>
                        <TableHead className="w-[20%]">
                          <span className="font-medium text-slate-700">Role</span>
                        </TableHead>
                        <TableHead className="w-[10%]">Branch</TableHead>
                        <TableHead className="w-[8%]">Status</TableHead>
                        <TableHead className="w-[15%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInactiveUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-slate-700 py-8">
                            No blocked or inactive accounts
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInactiveUsers.map(user => (
                          <TableRow key={user.id}>
                            <TableCell className="truncate" title={user.fullName}>
                              {user.fullName}
                            </TableCell>
                            <TableCell className="font-mono text-sm truncate" title={user.username}>
                              {user.username}
                            </TableCell>
                            <TableCell className="text-sm truncate" title={user.email}>
                              {user.email}
                            </TableCell>
                            <TableCell className="user-role-cell">
                              <span
                                className="user-role-text"
                                title={user.roleLabel || getRoleLabel(user.role)}
                              >
                                {user.roleLabel || getRoleLabel(user.role)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">{user.branch}</TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                {renderUserStatusBadge(user)}
                                {renderPasswordSetupBadge(user)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {renderUserActions("inactive", user)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {renderMobileUserCards("inactive", filteredInactiveUsers, "No blocked or inactive accounts")}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Dialogs and AlertDialogs */}
        <Dialog open={isCreateUserDialogOpen} onOpenChange={(open) => {
          setIsCreateUserDialogOpen(open);
          if (!open) resetCreateUserForm({ clearCredentials: false });
        }}>
          <DialogContent className="user-edit-dialog user-create-dialog">
            <DialogHeader>
              <DialogTitle>Create User Account</DialogTitle>
              <DialogDescription className="mt-2 max-w-[30rem] text-base leading-7 text-slate-700">
                Create accounts only for approved store personnel. Use Admin / Owner for the business owner or authorized owner-level users who need full system control.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUserAccount} className="space-y-4 py-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="create-full-name-field space-y-2 md:col-span-2">
                  <Label htmlFor="create-full-name">Full Name</Label>
                  <Input
                    id="create-full-name"
                    value={newAccount.fullName}
                    onChange={event => {
                      const cleaned = sanitizePersonNameInput(event.target.value);
                      if (cleaned !== event.target.value) {
                        toast.warning("Full name accepts letters only.", {
                          id: "create-user-full-name-letters-only",
                          duration: 2400
                        });
                      }
                      setNewAccount(prev => ({ ...prev, fullName: cleaned }));
                    }}
                    placeholder="Full name of the account owner"
                    disabled={isActionLoading || Boolean(createdAccountCredentials)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-username">Username</Label>
                  <Input
                    id="create-username"
                    value={newAccount.username}
                    onChange={event => {
                      const cleaned = sanitizeUsernameInput(event.target.value);
                      if (cleaned !== event.target.value) {
                        toast.warning("Username accepts letters and numbers.", {
                          description: "Dots, underscores, and hyphens are also allowed.",
                          id: "create-user-username-valid-characters",
                          duration: 2400
                        });
                      }
                      setNewAccount(prev => ({ ...prev, username: cleaned }));
                    }}
                    placeholder="username"
                    disabled={isActionLoading || Boolean(createdAccountCredentials)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-email">Email</Label>
                  <Input
                    id="create-email"
                    type="email"
                    value={newAccount.email}
                    onChange={event => {
                      setConfirmedEmailTypo("");
                      setNewAccount(prev => ({ ...prev, email: event.target.value }));
                    }}
                    placeholder="user@email.com"
                    disabled={isActionLoading || Boolean(createdAccountCredentials)}
                  />
                  {renderEmailTypoWarning(newAccountEmailTypoSuggestion)}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-role">System Role</Label>
                  <Select
                    value={newAccount.role}
                    onValueChange={value => setNewAccount(prev => ({ ...prev, role: value }))}
                    disabled={isActionLoading || Boolean(createdAccountCredentials)}
                  >
                    <SelectTrigger id="create-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-slate-700">
                    {ROLE_OPTIONS.find(option => option.value === newAccount.role)?.description}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-branch">Assigned Branch</Label>
                  <Select
                    value={newAccount.branch}
                    onValueChange={value => setNewAccount(prev => ({ ...prev, branch: value }))}
                    disabled={isActionLoading || Boolean(createdAccountCredentials)}
                  >
                    <SelectTrigger id="create-branch">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Manggahan">Manggahan</SelectItem>
                      <SelectItem value="San Rafael">San Rafael</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                Temporary credentials will be generated after creation. Share them only with the assigned account owner.
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateUserDialogOpen(false);
                    resetCreateUserForm();
                  }}
                  disabled={isActionLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isActionLoading} className="bg-[#FF0000] text-white hover:bg-[#cc0000]">
                  {isActionLoading ? "Creating..." : "Create Account"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(createdAccountCredentials)}
          onOpenChange={open => {
            if (!open) setCreatedAccountCredentials(null);
          }}
        >
          <DialogContent className="user-edit-dialog">
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <KeyRound className="h-5 w-5" />
                </div>
              <div>
                <DialogTitle>Temporary password generated</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-slate-700">
                    The account is active. Ask the employee to check their email and change this password after first login.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
            <div className={`rounded-xl border p-3 text-sm leading-6 ${
              createdAccountCredentials?.emailDeliveryStatus === "sent" || createdAccountCredentials?.emailDeliveryStatus === "failed"
                ? "border-green-200 bg-green-50 text-green-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}>
              {getCreatedAccountEmailMessage()}
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              <p className="font-semibold">Account created for {createdAccountCredentials?.fullName}</p>
              <p className="mt-1 text-xs leading-5 text-green-800">
                These credentials remain available from Accounts Requiring Setup during this browser session.
              </p>
              <div className="mt-3 rounded-lg bg-white p-3 font-mono text-slate-900">
                <p>Username: {createdAccountCredentials?.username}</p>
                <p>Temporary Password: {createdAccountCredentials?.temporaryPassword}</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreatedAccountCredentials(null)}>
                Done
              </Button>
              <Button type="button" onClick={() => copyTemporaryCredentials()} className="bg-[#FF0000] text-white hover:bg-[#cc0000]">
                <Copy className="mr-2 h-4 w-4" />
                Copy Credentials
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isSetupCredentialsDialogOpen} onOpenChange={setIsSetupCredentialsDialogOpen}>
          <DialogContent className="user-setup-credentials-dialog border border-slate-200 bg-white shadow-2xl">
            <DialogHeader>
              <div className="user-setup-dialog-header">
                <div className="user-setup-dialog-icon">
                  <KeyRound className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <DialogTitle>Accounts Requiring Setup</DialogTitle>
                  <DialogDescription className="mt-2 text-sm leading-6 text-slate-700">
                    Active users listed here still need to sign in with their temporary password and create their own password.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="user-setup-divider" />

            {setupRequiredUsers.length > 0 ? (
              <div className="user-setup-list">
                {setupRequiredUsers.map(setupUser => {
                  const setupCredentials = findSetupCredentialsForUser(setupUser);
                  return (
                    <div className="user-setup-item" key={setupUser.id}>
                      <div className="user-setup-item-main">
                        <span className="user-setup-avatar">
                          <User className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                        <p className="user-setup-name">{setupUser.fullName}</p>
                        <div className="user-setup-identity-row">
                          <span>
                            <User className="h-4 w-4" />
                            Username: <strong>{setupUser.username}</strong>
                          </span>
                          <span>
                            <Mail className="h-4 w-4" />
                            Email: <strong>{setupUser.email}</strong>
                          </span>
                        </div>
                        <p className="user-setup-meta">
                          Username: <strong>{setupUser.username}</strong> · Email: <strong>{setupUser.email}</strong>
                        </p>
                        <p className="user-setup-meta">
                          {setupCredentials
                            ? "Temporary credentials are available from this browser session."
                            : "Temporary password is not visible here after creation. Tell the employee to check their email."}
                        </p>
                      </div>
                      </div>
                      <div className="user-setup-info-box">
                        <Info className="h-5 w-5" />
                        <span>
                          {setupCredentials
                            ? "Temporary credentials are available from this browser session."
                            : "Temporary password is not visible here after creation. Tell the employee to check their email."}
                        </span>
                      </div>
                      <div className="user-setup-actions">
                        {setupCredentials ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setIsSetupCredentialsDialogOpen(false);
                                setCreatedAccountCredentials(setupCredentials);
                              }}
                              className="user-setup-view-button"
                            >
                              <KeyRound className="mr-2 h-4 w-4" />
                              View
                            </Button>
                            <Button
                              type="button"
                              className="bg-[#FF0000] text-white hover:bg-[#cc0000]"
                              onClick={() => copyTemporaryCredentials(setupCredentials)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-900">
                All active users have completed first-login setup.
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsSetupCredentialsDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isEditAccountDialogOpen}
          onOpenChange={open => {
            if (open) {
              setIsEditAccountDialogOpen(true);
            } else {
              resetAccountDetailsDialog();
            }
          }}
        >
          <DialogContent className="user-edit-dialog user-account-details-dialog">
            <DialogHeader>
              <DialogTitle>Edit Account Details</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-slate-700">
                Update the employee's name and contact email. Role and branch access are managed separately.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateAccountDetails} className="user-account-details-form">
              <div className="space-y-2">
                <Label htmlFor="edit-full-name">Full Name</Label>
                <Input
                  id="edit-full-name"
                  value={accountDetails.fullName}
                  onChange={event => updateAccountDetail("fullName", event.target.value)}
                  placeholder="Enter full name"
                  autoComplete="name"
                />
              </div>
              <div className="user-account-details-grid">
                <div className="space-y-2">
                  <Label htmlFor="edit-username">Username</Label>
                  <Input
                    id="edit-username"
                    value={accountDetails.username}
                    readOnly
                    disabled
                    className="user-immutable-input"
                    placeholder="Username"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email Address</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={accountDetails.email}
                    onChange={event => updateAccountDetail("email", event.target.value)}
                    placeholder="Enter email address"
                    autoComplete="email"
                  />
                  {renderEmailTypoWarning(accountEmailTypoSuggestion)}
                </div>
              </div>
              <div className="user-account-details-note">
                <Info className="h-4 w-4" />
                <span>
                  Use this only to correct employee identity and contact details. Permission changes should still be handled through Role or Branch.
                </span>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetAccountDetailsDialog}
                  disabled={isActionLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isActionLoading}>
                  {isActionLoading ? "Saving..." : "Save Details"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="user-edit-dialog">
            <DialogHeader>
              <DialogTitle>Edit User Role</DialogTitle>
              <DialogDescription>Update role for: {selectedUser?.fullName}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger id="role" className="user-role-select-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {renderChangePreview("Role", getRoleLabel(selectedUser?.role), getRoleLabel(newRole || selectedUser?.role))}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSelectedUser(null);
                  setNewRole("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleInitiateRoleChange}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showRoleChangeDialog} onOpenChange={setShowRoleChangeDialog}>
          <AlertDialogContent className="user-confirm-dialog bg-white rounded-lg border border-gray-200 p-0 shadow-lg">
            <AlertDialogHeader showBrand={false}>
              <AlertDialogTitle>Confirm Role Change</AlertDialogTitle>
              <AlertDialogDescription>
                {isAdminRole(newRole) && !isAdminRole(selectedUser?.role) ? (
                  <>Are you sure you want to promote <strong className="text-gray-900">{selectedUser?.fullName}</strong> to Admin / Owner?</>
                ) : selectedUser && sessionUser?.id === selectedUser.id && !isAdminRole(newRole) ? (
                  <>You are changing your own role from <strong className="text-gray-900">Admin / Owner</strong> to <strong className="text-gray-900">{getRoleLabel(newRole)}</strong>. You will lose administrative access and will be logged out immediately after this change.</>
                ) : (
                  <>Are you sure you want to change <strong className="text-gray-900">{selectedUser?.fullName}</strong>'s role from{' '}
                    <strong className="text-gray-900">{getRoleLabel(selectedUser?.role)}</strong> to{' '}
                    <strong className="text-gray-900">{getRoleLabel(newRole)}</strong>? This will affect their system permissions.</>
                )}
              </AlertDialogDescription>
              {renderChangePreview("Role", getRoleLabel(selectedUser?.role), getRoleLabel(newRole), "red")}

              {selectedUser && sessionUser?.id === selectedUser.id && !isAdminRole(newRole) && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium text-amber-900">What happens after you confirm</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>Your session will end and you will be redirected to the login page.</li>
                    <li>You will see a confirmation message on the login screen so you know the change was applied.</li>
                    <li>Re-login with your new role to continue.</li>
                  </ul>
                </div>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel
                onClick={() => {
                  setShowRoleChangeDialog(false);
                  setSelectedUser(null);
                  setNewRole("");
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmRoleChange} className="bg-[#FFFF00] text-black hover:bg-[#e6e600]">
                Confirm Change
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
          <AlertDialogContent className="user-confirm-dialog bg-white rounded-lg border border-gray-200 p-0 shadow-lg">
            <AlertDialogHeader showBrand={false}>
              <AlertDialogTitle>Deactivate User Account</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to deactivate <strong className="text-gray-900">{selectedUser?.fullName}</strong>'s account? They will no longer have access to the system until reactivated.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel
                onClick={() => {
                  setShowDeactivateDialog(false);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDeactivate} className="bg-[#FF0000] hover:bg-[#cc0000]">
                Deactivate User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <AlertDialogContent className="user-confirm-dialog bg-white rounded-lg border border-gray-200 p-0 shadow-lg">
            <AlertDialogHeader showBrand={false}>
              <AlertDialogTitle>Approve User Account</AlertDialogTitle>
              <AlertDialogDescription>
                Approve the pending account for <strong className="text-gray-900">{selectedUser?.fullName}</strong>? They will gain access as an Active user.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel
                onClick={() => {
                  setShowApproveDialog(false);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmApprove} className="bg-[#FF0000] hover:bg-[#cc0000] text-white">
                Approve
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={isEditBranchDialogOpen} onOpenChange={setIsEditBranchDialogOpen}>
          <DialogContent className="user-edit-dialog">
            <DialogHeader>
              <DialogTitle>Edit User Branch</DialogTitle>
              <DialogDescription>
                Transfer {selectedUser?.fullName} to a different branch. This will automatically update their data access permissions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="current-branch">Current Branch</Label>
                <Input id="current-branch" value={selectedUser?.branch || ""} disabled className="bg-gray-50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-branch">New Branch</Label>
                <Select value={newBranch} onValueChange={setNewBranch}>
                  <SelectTrigger id="new-branch">
                    <SelectValue placeholder="Select a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manggahan">Manggahan</SelectItem>
                    <SelectItem value="San Rafael">San Rafael</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {renderChangePreview("Branch", selectedUser?.branch, newBranch || selectedUser?.branch)}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Transferring this {(getRoleLabel(selectedUser?.role) || "user").toLowerCase()} will automatically update their system access to view and modify records only for the newly assigned branch.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditBranchDialogOpen(false);
                  setSelectedUser(null);
                  setNewBranch("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleInitiateBranchTransfer} className="bg-[#FFFF00] text-black hover:bg-[#e6e600]">
                Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showBranchTransferDialog} onOpenChange={setShowBranchTransferDialog}>
          <AlertDialogContent className="user-confirm-dialog bg-white rounded-lg border border-gray-200 p-0 shadow-lg">
            <AlertDialogHeader showBrand={false}>
              <AlertDialogTitle>Confirm Branch Transfer</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to transfer this {(getRoleLabel(selectedUser?.role) || "user").toLowerCase()} from{" "}
                <strong className="text-gray-900">{selectedUser?.branch}</strong> to{" "}
                <strong className="text-gray-900">{newBranch}</strong>? This will affect their system access.
              </AlertDialogDescription>
              {renderChangePreview("Branch", selectedUser?.branch, newBranch, "red")}
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel
                onClick={() => {
                  setShowBranchTransferDialog(false);
                  setSelectedUser(null);
                  setNewBranch("");
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmBranchTransfer} className="bg-[#FFFF00] text-black hover:bg-[#e6e600]">
                Confirm Transfer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <AlertDialogContent className="user-confirm-dialog bg-white rounded-lg border border-gray-200 p-0 shadow-lg">
            <AlertDialogHeader showBrand={false}>
              <AlertDialogTitle>Reject User Account</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to reject the pending account for <strong>{selectedUser?.fullName}</strong>? This action cannot be undone and the user will be notified.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel onClick={() => setSelectedUser(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReject} className="bg-[#FF0000] hover:bg-[#cc0000]">
                Reject User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
          <AlertDialogContent className="user-confirm-dialog bg-white rounded-lg border border-gray-200 p-0 shadow-lg">
            <AlertDialogHeader showBrand={false}>
              <AlertDialogTitle>Reactivate User Account</AlertDialogTitle>
              <AlertDialogDescription>
                Reactivate <strong className="text-gray-900">{selectedUser?.fullName}</strong>? They will regain system access as an Active user.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel
                onClick={() => {
                  setShowReactivateDialog(false);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmReactivate} className="bg-[#FFFF00] text-black hover:bg-[#e6e600]">
                Confirm Reactivation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default UserManagementModule;
