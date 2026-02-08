import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Edit, Mail, MapPin, Search, UserCheck, UserX } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";
import { mergeSort } from "../utils/algorithms";

export function UserManagementModule() {
  const { users, setUsers } = useData();
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
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
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");
  const [inactiveSearchQuery, setInactiveSearchQuery] = useState("");
  const [activeSort, setActiveSort] = useState({ key: "fullName", direction: "asc" });
  const [pendingSort, setPendingSort] = useState({ key: "fullName", direction: "asc" });
  const [inactiveSort, setInactiveSort] = useState({ key: "fullName", direction: "asc" });

  const normalizeUser = apiUser => ({
    id: (apiUser.user_id || apiUser.id || "").toString(),
    fullName: apiUser.full_name || apiUser.fullName,
    username: apiUser.username,
    email: apiUser.email,
    role: apiUser.role,
    branch: apiUser.branch,
    status: apiUser.status,
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

    return (
      <div className="flex items-center gap-1 text-left font-medium text-slate-700">
        <button
          type="button"
          onClick={() => handleSort(scope, key)}
          className="flex items-center gap-1 hover:text-slate-900"
        >
          <span>{label}</span>
        </button>
        <div className="flex items-center gap-1" aria-label={`Sort by ${label}`}>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              handleSort(scope, key, "asc");
            }}
            className="p-0.5"
            title={titles.asc}
          >
            <ArrowUp className={`w-3.5 h-3.5 ${isActive && cfg.direction === "asc" ? "text-blue-800" : "text-slate-400"}`} />
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              handleSort(scope, key, "desc");
            }}
            className="p-0.5"
            title={titles.desc}
          >
            <ArrowDown className={`w-3.5 h-3.5 ${isActive && cfg.direction === "desc" ? "text-blue-800" : "text-slate-400"}`} />
          </button>
        </div>
      </div>
    );
  };

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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader title="User Management" subtitle="Manage user accounts, roles, and permissions" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Active Users</p>
                  <p className="text-2xl text-slate-900">{activeUsers.length}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <UserCheck className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Pending Approval</p>
                  <p className="text-2xl text-slate-900">{pendingUsers.length}</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Mail className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Inactive Users</p>
                  <p className="text-2xl text-slate-900">{inactiveUsers.length}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <UserX className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="col-span-1 md:col-span-3 w-full">
          <CardHeader>
            <CardTitle>User Accounts</CardTitle>
            <CardDescription>View and manage all user accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="active" className="mb-4">
              <TabsList>
                <TabsTrigger value="active">Active ({activeUsers.length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({pendingUsers.length})</TabsTrigger>
                <TabsTrigger value="inactive">Inactive ({inactiveUsers.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="active">
                <div className="mb-4">
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
                <div className="border border-slate-200 rounded-lg">
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
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                Active
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setNewRole(user.role);
                                    setIsEditDialogOpen(true);
                                  }}
                                  title="Edit Role"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isActionLoading}
                                  onClick={() => handleOpenEditBranch(user)}
                                  title="Edit Branch"
                                >
                                  <MapPin className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isActionLoading}
                                  onClick={() => handleInitiateDeactivate(user)}
                                  title="Deactivate User"
                                >
                                  <UserX className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="pending">
                <div className="mb-4">
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

                <div className="border border-slate-200 rounded-lg">
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
                              <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                                {user.status || "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{user.createdDate}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  disabled={isActionLoading}
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
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowRejectDialog(true);
                                  }}
                                >
                                  <UserX className="w-4 h-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="inactive">
                <div className="mb-4">
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

                <div className="border border-slate-200 rounded-lg">
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
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{user.status || "Inactive"}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                disabled={isActionLoading}
                                onClick={() => handleInitiateReactivate(user)}
                              >
                                Reactivate
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Dialogs and AlertDialogs */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
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
          <AlertDialogContent className="bg-white rounded-lg border border-gray-200 p-6 shadow-lg max-w-lg">
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
          <AlertDialogContent className="bg-white rounded-lg border border-gray-200 p-6 shadow-lg max-w-lg">
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
          <AlertDialogContent className="bg-white rounded-lg border border-gray-200 p-6 shadow-lg max-w-lg">
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
          <DialogContent>
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
          <AlertDialogContent className="bg-white rounded-lg border border-gray-200 p-6 shadow-lg max-w-lg">
            <AlertDialogHeader showBrand={false}>
              <AlertDialogTitle>Confirm Branch Transfer</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to transfer this {selectedUser?.role?.toLowerCase() || "employee"} from{" "}
                <strong className="text-gray-900">{selectedUser?.branch}</strong> to{" "}
                <strong className="text-gray-900">{newBranch}</strong>? This will affect their system access.
              </AlertDialogDescription>
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
          <AlertDialogContent className="bg-white rounded-lg border border-gray-200 p-6 shadow-lg max-w-lg">
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
          <AlertDialogContent className="bg-white rounded-lg border border-gray-200 p-6 shadow-lg max-w-lg">
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