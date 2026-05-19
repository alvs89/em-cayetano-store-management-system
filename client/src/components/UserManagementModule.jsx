import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Copy, Edit, Mail, MapPin, Plus, Search, UserCheck, UserX, Users } from "lucide-react";
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

const sanitizePersonNameInput = value => String(value ?? "").replace(/[^A-Za-zÀ-ÖØ-öø-ÿÑñ .'-]/g, "");
const sanitizeUsernameInput = value => String(value ?? "").replace(/[^A-Za-z0-9._-]/g, "");
const isValidPersonName = value => /^[A-Za-zÀ-ÖØ-öø-ÿÑñ]+(?:[ .'-][A-Za-zÀ-ÖØ-öø-ÿÑñ]+)*$/.test(String(value ?? "").trim());
const isValidUsername = value => /^[A-Za-z0-9._-]{3,30}$/.test(String(value ?? "").trim());
const isValidEmailAddress = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());

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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditBranchDialogOpen, setIsEditBranchDialogOpen] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showBranchTransferDialog, setShowBranchTransferDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRoleChangeDialog, setShowRoleChangeDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [newAccount, setNewAccount] = useState({
    fullName: "",
    username: "",
    email: "",
    role: "Employee",
    branch: sessionUser?.branch || "Manggahan"
  });
  const [createdAccountCredentials, setCreatedAccountCredentials] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");
  const [inactiveSearchQuery, setInactiveSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(() => {
    const targetTab = localStorage.getItem("user_management_target_tab");
    if (targetTab === "pending" || targetTab === "inactive" || targetTab === "active") {
      localStorage.removeItem("user_management_target_tab");
      return targetTab;
    }
    return "active";
  });
  const [activeSort, setActiveSort] = useState({ key: "fullName", direction: "asc" });
  const [pendingSort, setPendingSort] = useState({ key: "fullName", direction: "asc" });
  const [inactiveSort, setInactiveSort] = useState({ key: "fullName", direction: "asc" });

  useEffect(() => {
    const validTabs = new Set(["active", "pending", "inactive"]);
    const handleTargetTab = event => {
      const targetTab = event?.detail?.tab || localStorage.getItem("user_management_target_tab");
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
    branch: apiUser.branch,
    status: apiUser.status,
    mustChangePassword: Boolean(apiUser.must_change_password ?? apiUser.mustChangePassword),
    createdDate: apiUser.created_at
      ? new Date(apiUser.created_at).toLocaleDateString()
      : apiUser.createdDate,
  });

  useEffect(() => {
    const loadUsers = async () => {
      if (!authToken) return;
      try {
        const res = await fetch(`${API_BASE}/api/admin/users`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        if (!res.ok) {
          const message = await res.text();
          toast.error("Unable to load users", { description: message || res.statusText });
          return;
        }
        const data = await res.json();
        const normalized = Array.isArray(data.users) ? data.users.map(normalizeUser) : [];
        setUsers(normalized);
      } catch (err) {
        console.error(err);
        toast.error("Network error while loading users");
      }
    };
    loadUsers();
  }, [API_BASE, authToken, setUsers]);

  const activeUsers = users.filter(u => u.status === "Active");
  const pendingUsers = users.filter(u => u.status === "Pending");
  const inactiveUsers = users.filter(u => u.status === "Inactive");

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
  const pendingComparator = useMemo(() => makeComparator(pendingSort), [pendingSort]);
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
    if (scope === "pending") setPendingSort(nextState);
    if (scope === "inactive") setInactiveSort(nextState);
  };

  const getSortState = scope => {
    if (scope === "active") return activeSort;
    if (scope === "pending") return pendingSort;
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

    const iconClass = `h-4 w-4 shrink-0 transition-transform ${isActive ? 'opacity-100' : 'opacity-45'} ${isActive && cfg.direction === 'desc' ? 'rotate-180' : ''}`;

    return (
      <div className="flex items-center gap-1 text-left font-medium text-slate-700">
        <button
          type="button"
          onClick={() => handleSort(scope, key)}
          className="flex items-center gap-1 hover:text-slate-900"
          title={isActive ? titles[cfg.direction] : titles.asc}
        >
          <span>{label}</span>
          <ArrowUpDown className={iconClass} aria-hidden="true" />
        </button>
      </div>
    );
  };

  const renderUserStatusBadge = user => {
    const status = user.status || (activeTab === "pending" ? "Pending" : activeTab === "inactive" ? "Inactive" : "Active");
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
      Password Setup Required
    </Badge>
  ) : null;

  const renderUserActions = (scope, user, isMobile = false) => {
    const actionClass = isMobile ? "user-mobile-action" : "";

    if (scope === "pending") {
      return (
        <div className={isMobile ? "user-mobile-actions" : "flex gap-2"}>
          <Button
            size="sm"
            disabled={isActionLoading}
            className={actionClass}
            onClick={() => {
              setSelectedUser(user);
              setShowApproveDialog(true);
            }}
          >
            <UserCheck className="w-4 h-4 mr-1" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isActionLoading}
            className={actionClass}
            onClick={() => {
              setSelectedUser(user);
              setShowRejectDialog(true);
            }}
          >
            <UserX className="w-4 h-4 mr-1" />
            Reject
          </Button>
        </div>
      );
    }

    if (scope === "inactive") {
      return (
        <div className={isMobile ? "user-mobile-actions" : ""}>
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
          className={actionClass}
          onClick={() => {
            setSelectedUser(user);
            setNewRole(user.role);
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
              <Badge variant="outline" className="user-role-badge">
                {user.role || (scope === "pending" ? "Pending" : "Unassigned")}
              </Badge>
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
              {scope === "pending" && (
                <div className="user-mobile-field">
                  <span>Created</span>
                  <strong>{user.createdDate || "N/A"}</strong>
                </div>
              )}
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

  const filteredActiveUsers = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = activeUsers.filter(user =>
      (user.fullName || "").toLowerCase().includes(lowerQuery) ||
      (user.username || "").toLowerCase().includes(lowerQuery) ||
      (user.email || "").toLowerCase().includes(lowerQuery) ||
      (user.branch || "").toLowerCase().includes(lowerQuery)
    );
    return mergeSort(filtered, activeComparator);
  }, [activeUsers, activeComparator, searchQuery]);

  const filteredPendingUsers = useMemo(() => {
    const lowerQuery = pendingSearchQuery.toLowerCase();
    const filtered = pendingUsers.filter(user =>
      (user.fullName || "").toLowerCase().includes(lowerQuery) ||
      (user.username || "").toLowerCase().includes(lowerQuery) ||
      (user.email || "").toLowerCase().includes(lowerQuery) ||
      (user.branch || "").toLowerCase().includes(lowerQuery)
    );
    return mergeSort(filtered, pendingComparator);
  }, [pendingUsers, pendingComparator, pendingSearchQuery]);

  const filteredInactiveUsers = useMemo(() => {
    const lowerQuery = inactiveSearchQuery.toLowerCase();
    const filtered = inactiveUsers.filter(user =>
      (user.fullName || "").toLowerCase().includes(lowerQuery) ||
      (user.username || "").toLowerCase().includes(lowerQuery) ||
      (user.email || "").toLowerCase().includes(lowerQuery) ||
      (user.branch || "").toLowerCase().includes(lowerQuery)
    );
    return mergeSort(filtered, inactiveComparator);
  }, [inactiveUsers, inactiveComparator, inactiveSearchQuery]);

  const renderChangePreview = (label, currentValue, nextValue, nextTone = "yellow") => {
    const hasChange = nextValue && currentValue !== nextValue;
    const nextToneClasses = nextTone === "red"
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-yellow-300 bg-yellow-100 text-slate-900";

    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current {label}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">{currentValue || "Not set"}</span>
            <Badge variant="outline" className="border-slate-300 text-slate-600">Current</Badge>
          </div>
        </div>
        <div className={`rounded-lg border p-4 shadow-sm transition-all ${hasChange ? nextToneClasses : "border-slate-200 bg-white text-slate-700"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">New {label}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className={`text-sm font-semibold ${hasChange ? "text-slate-900" : "text-slate-700"}`}>
              {nextValue || "No selection yet"}
            </span>
            <Badge className={hasChange ? "bg-[#FF0000] text-white hover:bg-[#FF0000]" : "bg-slate-200 text-slate-700 hover:bg-slate-200"}>
              {hasChange ? "New Selection" : "Unchanged"}
            </Badge>
          </div>
          {hasChange && (
            <p className="mt-3 text-xs font-medium text-slate-700">
              This new {label.toLowerCase()} will be applied after confirmation.
            </p>
          )}
        </div>
      </div>
    );
  };

  const resetCreateUserForm = () => {
    setNewAccount({
      fullName: "",
      username: "",
      email: "",
      role: "Employee",
      branch: sessionUser?.branch || "Manggahan"
    });
    setCreatedAccountCredentials(null);
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
      setCreatedAccountCredentials({
        fullName: createdUser.fullName,
        username: createdUser.username,
        temporaryPassword: data.temporaryPassword
      });
      toast.success("User account created", {
        description: "Temporary credentials were generated and sent by email when email service is available."
      });
    } catch (err) {
      console.error(err);
      toast.error("Network error while creating account");
    } finally {
      setIsActionLoading(false);
    }
  };

  const copyTemporaryCredentials = async () => {
    if (!createdAccountCredentials) return;
    const credentialText = `Username: ${createdAccountCredentials.username}\nTemporary Password: ${createdAccountCredentials.temporaryPassword}`;
    try {
      await navigator.clipboard.writeText(credentialText);
      toast.success("Temporary credentials copied.");
    } catch {
      toast.error("Unable to copy credentials automatically.");
    }
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
        const message = await res.text();
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
    if (newRole === selectedUser.role) {
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
          description: `Your role is now ${updated.role}. Please re-login to refresh your access.`
        });
      } else {
        toast.success("Role updated successfully. User must re-login to apply changes.");
      }

      // If this admin demoted themselves, immediately clear session, set message, and redirect
      if (data.selfDemoted) {
        localStorage.setItem('postLogoutToast', JSON.stringify({
          title: 'Your role has been updated. You have been logged out to refresh your permissions.',
          description: `Role changed to ${updated.role}. Please log in again.`
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
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
          width: min(100% - 2rem, 28rem);
          max-width: min(100% - 2rem, 28rem) !important;
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

        .user-confirm-dialog .grid.grid-cols-1.gap-3,
        .user-edit-dialog .grid.grid-cols-1.gap-3 {
          gap: 0.55rem;
        }

        .user-confirm-dialog .rounded-lg.p-4,
        .user-edit-dialog .rounded-lg.p-4 {
          padding: 0.8rem;
        }

        .user-search-wrap {
          max-width: 100%;
        }

        .user-table-shell {
          overflow: hidden;
        }

        .user-table-shell table {
          table-layout: fixed;
          width: 100%;
        }

        .user-mobile-list {
          display: none;
        }

        .user-role-badge {
          max-width: 100%;
          white-space: normal;
          text-align: center;
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

          .user-search-wrap input {
            min-height: 2.75rem;
            font-size: 0.95rem;
            text-overflow: ellipsis;
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
                  <p className="text-sm text-slate-600 mb-1">Pending Approval</p>
                  <p className="text-2xl text-slate-900">{pendingUsers.length}</p>
                </div>
                <div className="user-summary-icon bg-orange-100 rounded-lg flex items-center justify-center">
                  <Mail className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="user-summary-card">
            <CardContent className="pt-6">
              <div className="user-summary-content flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Inactive Users</p>
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
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
              <TabsList className="user-tabs-list">
                <TabsTrigger value="active">Active ({activeUsers.length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({pendingUsers.length})</TabsTrigger>
                <TabsTrigger value="inactive">Inactive ({inactiveUsers.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="active">
                <div className="user-search-wrap mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search by name, username, email, or role..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-10 border-[#7a4b00] ring-1 ring-[#7a4b00] focus:border-[#593500] focus:ring-[#593500]"
                    />
                  </div>
                </div>
                <div className="user-table-shell border border-slate-200 rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[18%]">
                          {renderSortableHeader("active", "fullName", "Full Name")}
                        </TableHead>
                        <TableHead className="w-[14%]">
                          {renderSortableHeader("active", "username", "Username")}
                        </TableHead>
                        <TableHead className="w-[24%]">
                          {renderSortableHeader("active", "email", "Email")}
                        </TableHead>
                        <TableHead className="w-[12%]">
                          {renderSortableHeader("active", "role", "Role")}
                        </TableHead>
                        <TableHead className="w-[12%]">Branch</TableHead>
                        <TableHead className="w-[10%]">Status</TableHead>
                        <TableHead className="w-[10%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActiveUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-slate-400 py-8">
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
                            <TableCell>
                              <Badge variant="outline">{user.role}</Badge>
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

              <TabsContent value="pending">
                <div className="user-search-wrap mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search by name, username, email, or role..."
                      value={pendingSearchQuery}
                      onChange={e => setPendingSearchQuery(e.target.value)}
                      className="pl-10 border-[#7a4b00] ring-1 ring-[#7a4b00] focus:border-[#593500] focus:ring-[#593500]"
                    />
                  </div>
                </div>

                <div className="user-table-shell border border-slate-200 rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[18%]">
                          {renderSortableHeader("pending", "fullName", "Full Name")}
                        </TableHead>
                        <TableHead className="w-[14%]">
                          {renderSortableHeader("pending", "username", "Username")}
                        </TableHead>
                        <TableHead className="w-[22%]">
                          {renderSortableHeader("pending", "email", "Email")}
                        </TableHead>
                        <TableHead className="w-[12%]">
                          {renderSortableHeader("pending", "role", "Role")}
                        </TableHead>
                        <TableHead className="w-[12%]">Branch</TableHead>
                        <TableHead className="w-[10%]">Status</TableHead>
                        <TableHead className="w-[8%]">
                          {renderSortableHeader("pending", "createdDate", "Created")}
                        </TableHead>
                        <TableHead className="w-[6%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPendingUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                            No pending users
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPendingUsers.map(user => (
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
                            <TableCell>
                              <Badge variant="outline">{user.role || "Pending"}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{user.branch}</TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                {renderUserStatusBadge(user)}
                                {renderPasswordSetupBadge(user)}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{user.createdDate}</TableCell>
                            <TableCell>
                              {renderUserActions("pending", user)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {renderMobileUserCards("pending", filteredPendingUsers, "No pending users")}
              </TabsContent>

              <TabsContent value="inactive">
                <div className="user-search-wrap mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search by name, username, email, or role..."
                      value={inactiveSearchQuery}
                      onChange={e => setInactiveSearchQuery(e.target.value)}
                      className="pl-10 border-[#7a4b00] ring-1 ring-[#7a4b00] focus:border-[#593500] focus:ring-[#593500]"
                    />
                  </div>
                </div>

                <div className="user-table-shell border border-slate-200 rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[22%]">
                          {renderSortableHeader("inactive", "fullName", "Full Name")}
                        </TableHead>
                        <TableHead className="w-[14%]">
                          {renderSortableHeader("inactive", "username", "Username")}
                        </TableHead>
                        <TableHead className="w-[22%]">
                          {renderSortableHeader("inactive", "email", "Email")}
                        </TableHead>
                        <TableHead className="w-[12%]">
                          {renderSortableHeader("inactive", "role", "Role")}
                        </TableHead>
                        <TableHead className="w-[12%]">Branch</TableHead>
                        <TableHead className="w-[10%]">Status</TableHead>
                        <TableHead className="w-[8%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInactiveUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                            No inactive users
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
                            <TableCell>
                              <Badge variant="outline">{user.role}</Badge>
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
                {renderMobileUserCards("inactive", filteredInactiveUsers, "No inactive users")}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Dialogs and AlertDialogs */}
        <Dialog open={isCreateUserDialogOpen} onOpenChange={(open) => {
          setIsCreateUserDialogOpen(open);
          if (!open) resetCreateUserForm();
        }}>
          <DialogContent className="user-edit-dialog user-create-dialog">
            <DialogHeader>
              <DialogTitle>Create User Account</DialogTitle>
              <DialogDescription className="mt-2 max-w-[30rem] text-base leading-7 text-slate-700">
                Create an account for approved store personnel. Use Admin only for trusted users who need access to system settings, user management, and protected records.
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
                    onChange={event => setNewAccount(prev => ({ ...prev, email: event.target.value }))}
                    placeholder="user@email.com"
                    disabled={isActionLoading || Boolean(createdAccountCredentials)}
                  />
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
                      <SelectItem value="Employee">Employee</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
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

              {createdAccountCredentials ? (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                  <p className="font-semibold">Account created for {createdAccountCredentials.fullName}</p>
                  <div className="mt-3 rounded-lg bg-white p-3 font-mono text-slate-900">
                    <p>Username: {createdAccountCredentials.username}</p>
                    <p>Temporary Password: {createdAccountCredentials.temporaryPassword}</p>
                  </div>
                  <p className="mt-3">
                    Share these credentials only with the assigned account owner. They will be required to set a new password after first login.
                  </p>
                  <Button type="button" variant="outline" className="mt-3" onClick={copyTemporaryCredentials}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Credentials
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                  Temporary credentials will be generated after creation. Share them only with the assigned account owner.
                </div>
              )}

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
                  {createdAccountCredentials ? "Close" : "Cancel"}
                </Button>
                {!createdAccountCredentials && (
                  <Button type="submit" disabled={isActionLoading} className="bg-[#FF0000] text-white hover:bg-[#cc0000]">
                    {isActionLoading ? "Creating..." : "Create Account"}
                  </Button>
                )}
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
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Employee">Employee</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {renderChangePreview("Role", selectedUser?.role, newRole || selectedUser?.role)}
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
                {newRole === 'Admin' && selectedUser?.role !== 'Admin' ? (
                  <>Are you sure you want to promote <strong className="text-gray-900">{selectedUser?.fullName}</strong> to Admin?</>
                ) : selectedUser && sessionUser?.id === selectedUser.id && newRole !== 'Admin' ? (
                  <>You are changing your own role from <strong className="text-gray-900">Admin</strong> to <strong className="text-gray-900">{newRole}</strong>. You will lose administrative access and will be logged out immediately after this change.</>
                ) : (
                  <>Are you sure you want to change <strong className="text-gray-900">{selectedUser?.fullName}</strong>'s role from{' '}
                    <strong className="text-gray-900">{selectedUser?.role}</strong> to{' '}
                    <strong className="text-gray-900">{newRole}</strong>? This will affect their system permissions.</>
                )}
              </AlertDialogDescription>
              {renderChangePreview("Role", selectedUser?.role, newRole, "red")}

              {selectedUser && sessionUser?.id === selectedUser.id && newRole !== 'Admin' && (
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
              <AlertDialogTitle>Approve User Registration</AlertDialogTitle>
              <AlertDialogDescription>
                Approve the registration request for <strong className="text-gray-900">{selectedUser?.fullName}</strong>? They will receive an activation email and gain access as an Active user.
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
                  <strong>Note:</strong> Transferring this {selectedUser?.role?.toLowerCase() || "employee"} will automatically update their system access to view and modify records only for the newly assigned branch.
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
                Are you sure you want to transfer this {selectedUser?.role?.toLowerCase() || "employee"} from{" "}
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
              <AlertDialogTitle>Reject User Registration</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to reject the registration request from <strong>{selectedUser?.fullName}</strong>? This action cannot be undone and the user will be notified.
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
