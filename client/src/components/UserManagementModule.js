import React from 'react';
import { useState } from "react";
import { UserCheck, UserX, Edit, Mail, Search, MapPin } from "lucide-react";
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
export function UserManagementModule() {
  const {
    users,
    setUsers
  } = useData();
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditBranchDialogOpen, setIsEditBranchDialogOpen] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showBranchTransferDialog, setShowBranchTransferDialog] = useState(false);
  const [showRoleChangeDialog, setShowRoleChangeDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const activeUsers = users.filter(u => u.status === "Active");
  const pendingUsers = users.filter(u => u.status === "Pending");
  const inactiveUsers = users.filter(u => u.status === "Inactive");

  // Filter active users based on search query
  const filteredActiveUsers = activeUsers.filter(user => user.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || user.username.toLowerCase().includes(searchQuery.toLowerCase()) || user.email.toLowerCase().includes(searchQuery.toLowerCase()) || user.branch.toLowerCase().includes(searchQuery.toLowerCase()));
  const handleApprove = user => {
    // Generate invite token and expiry (7 days from now)
    const inviteToken = `invite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    setUsers(users.map(u => u.id === user.id ? {
      ...u,
      status: "Active",
      inviteToken,
      inviteExpiry,
      passwordSet: false
    } : u));
    toast.success(`${user.fullName} approved successfully!`, {
      description: 'Invite email with password setup link has been sent'
    });
  };
  const handleReject = () => {
    if (!selectedUser) return;
    setUsers(users.filter(u => u.id !== selectedUser.id));
    setShowRejectDialog(false);
    toast.error(`${selectedUser.fullName}'s registration rejected`, {
      description: 'The user has been notified'
    });
    setSelectedUser(null);
  };
  const handleInitiateDeactivate = user => {
    setSelectedUser(user);
    setShowDeactivateDialog(true);
  };
  const handleConfirmDeactivate = () => {
    if (!selectedUser) return;
    setUsers(users.map(u => u.id === selectedUser.id ? {
      ...u,
      status: "Inactive"
    } : u));
    setShowDeactivateDialog(false);
    toast.warning(`${selectedUser.fullName}'s account deactivated`, {
      description: 'User will no longer have system access'
    });
    setSelectedUser(null);
  };
  const handleInitiateRoleChange = () => {
    if (!selectedUser || !newRole) return;

    // Check if role has actually changed
    if (newRole === selectedUser.role) {
      toast.info("No changes made", {
        description: "The selected role is the same as the current role"
      });
      setIsEditDialogOpen(false);
      return;
    }

    // Close the edit dialog and open the confirmation dialog
    setIsEditDialogOpen(false);
    setShowRoleChangeDialog(true);
  };
  const handleConfirmRoleChange = () => {
    if (!selectedUser || !newRole) return;
    setUsers(users.map(u => u.id === selectedUser.id ? {
      ...u,
      role: newRole
    } : u));
    setShowRoleChangeDialog(false);
    toast.success(`Role updated to ${newRole}`, {
      description: `${selectedUser.fullName} now has ${newRole} privileges`
    });
    setSelectedUser(null);
    setNewRole("");
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

    // Close the edit dialog and open the confirmation dialog
    setIsEditBranchDialogOpen(false);
    setShowBranchTransferDialog(true);
  };
  const handleConfirmBranchTransfer = () => {
    if (!selectedUser || !newBranch) return;
    const oldBranch = selectedUser.branch;

    // Update the user's branch
    setUsers(users.map(u => u.id === selectedUser.id ? {
      ...u,
      branch: newBranch
    } : u));
    setShowBranchTransferDialog(false);
    toast.success(`Branch transfer completed`, {
      description: `${selectedUser.fullName} transferred from ${oldBranch} to ${newBranch}. Their data access has been automatically updated.`
    });
    setSelectedUser(null);
    setNewBranch("");
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "User Management",
    subtitle: "Manage user accounts, roles, and permissions"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mb-8 hidden"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "text-3xl text-slate-900 mb-2"
  }, "User Management"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600"
  }, "Manage user accounts, roles, and permissions")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-3 gap-6 mb-6"
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Active Users"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl text-slate-900"
  }, activeUsers.length)), /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(UserCheck, {
    className: "w-6 h-6 text-green-600"
  }))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Pending Approval"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl text-slate-900"
  }, pendingUsers.length)), /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(Mail, {
    className: "w-6 h-6 text-orange-600"
  }))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Inactive Users"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl text-slate-900"
  }, inactiveUsers.length)), /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(UserX, {
    className: "w-6 h-6 text-red-600"
  })))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "User Accounts"), /*#__PURE__*/React.createElement(CardDescription, null, "View and manage all user accounts")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Tabs, {
    defaultValue: "active"
  }, /*#__PURE__*/React.createElement(TabsList, {
    className: "mb-4"
  }, /*#__PURE__*/React.createElement(TabsTrigger, {
    value: "active"
  }, "Active (", activeUsers.length, ")"), /*#__PURE__*/React.createElement(TabsTrigger, {
    value: "pending"
  }, "Pending (", pendingUsers.length, ")"), /*#__PURE__*/React.createElement(TabsTrigger, {
    value: "inactive"
  }, "Inactive (", inactiveUsers.length, ")")), /*#__PURE__*/React.createElement(TabsContent, {
    value: "active"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
  }), /*#__PURE__*/React.createElement(Input, {
    placeholder: "Search by name, username, email, or branch...",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value),
    className: "pl-10"
  }))), /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Full Name"), /*#__PURE__*/React.createElement(TableHead, null, "Username"), /*#__PURE__*/React.createElement(TableHead, null, "Email"), /*#__PURE__*/React.createElement(TableHead, null, "Role"), /*#__PURE__*/React.createElement(TableHead, null, "Branch"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Actions"))), /*#__PURE__*/React.createElement(TableBody, null, filteredActiveUsers.length === 0 ? /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableCell, {
    colSpan: 7,
    className: "text-center text-slate-400 py-8"
  }, "No active users found")) : filteredActiveUsers.map(user => /*#__PURE__*/React.createElement(TableRow, {
    key: user.id
  }, /*#__PURE__*/React.createElement(TableCell, null, user.fullName), /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, user.username), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm"
  }, user.email), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, user.role)), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm"
  }, user.branch), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: "bg-green-100 text-green-700 hover:bg-green-100"
  }, "Active")), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    onClick: () => {
      setSelectedUser(user);
      setNewRole(user.role);
      setIsEditDialogOpen(true);
    },
    title: "Edit Role"
  }, /*#__PURE__*/React.createElement(Edit, {
    className: "w-4 h-4"
  })), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    onClick: () => handleOpenEditBranch(user),
    title: "Edit Branch"
  }, /*#__PURE__*/React.createElement(MapPin, {
    className: "w-4 h-4"
  })), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    onClick: () => handleInitiateDeactivate(user),
    title: "Deactivate User"
  }, /*#__PURE__*/React.createElement(UserX, {
    className: "w-4 h-4"
  }))))))))), /*#__PURE__*/React.createElement(TabsContent, {
    value: "pending"
  }, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Full Name"), /*#__PURE__*/React.createElement(TableHead, null, "Username"), /*#__PURE__*/React.createElement(TableHead, null, "Email"), /*#__PURE__*/React.createElement(TableHead, null, "Branch"), /*#__PURE__*/React.createElement(TableHead, null, "Created Date"), /*#__PURE__*/React.createElement(TableHead, null, "Actions"))), /*#__PURE__*/React.createElement(TableBody, null, pendingUsers.length === 0 ? /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableCell, {
    colSpan: 6,
    className: "text-center text-slate-400 py-8"
  }, "No pending users")) : pendingUsers.map(user => /*#__PURE__*/React.createElement(TableRow, {
    key: user.id
  }, /*#__PURE__*/React.createElement(TableCell, null, user.fullName), /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, user.username), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm"
  }, user.email), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm"
  }, user.branch), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm"
  }, user.createdDate), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: () => handleApprove(user)
  }, /*#__PURE__*/React.createElement(UserCheck, {
    className: "w-4 h-4 mr-1"
  }), "Approve"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    onClick: () => {
      setSelectedUser(user);
      setShowRejectDialog(true);
    }
  }, /*#__PURE__*/React.createElement(UserX, {
    className: "w-4 h-4 mr-1"
  }), "Reject")))))))), /*#__PURE__*/React.createElement(TabsContent, {
    value: "inactive"
  }, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Full Name"), /*#__PURE__*/React.createElement(TableHead, null, "Username"), /*#__PURE__*/React.createElement(TableHead, null, "Email"), /*#__PURE__*/React.createElement(TableHead, null, "Role"), /*#__PURE__*/React.createElement(TableHead, null, "Branch"), /*#__PURE__*/React.createElement(TableHead, null, "Actions"))), /*#__PURE__*/React.createElement(TableBody, null, inactiveUsers.length === 0 ? /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableCell, {
    colSpan: 6,
    className: "text-center text-slate-400 py-8"
  }, "No inactive users")) : inactiveUsers.map(user => /*#__PURE__*/React.createElement(TableRow, {
    key: user.id
  }, /*#__PURE__*/React.createElement(TableCell, null, user.fullName), /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, user.username), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm"
  }, user.email), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, user.role)), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm"
  }, user.branch), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: () => handleApprove(user)
  }, "Reactivate")))))))))), /*#__PURE__*/React.createElement(Dialog, {
    open: isEditDialogOpen,
    onOpenChange: setIsEditDialogOpen
  }, /*#__PURE__*/React.createElement(DialogContent, null, /*#__PURE__*/React.createElement(DialogHeader, null, /*#__PURE__*/React.createElement(DialogTitle, null, "Edit User Role"), /*#__PURE__*/React.createElement(DialogDescription, null, "Update role for: ", selectedUser?.fullName)), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4 py-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "role"
  }, "Role"), /*#__PURE__*/React.createElement(Select, {
    value: newRole,
    onValueChange: setNewRole
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "role"
  }, /*#__PURE__*/React.createElement(SelectValue, null)), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "Admin"
  }, "Admin"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "Employee"
  }, "Employee"))))), /*#__PURE__*/React.createElement(DialogFooter, null, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    onClick: () => {
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      setNewRole("");
    }
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    onClick: handleInitiateRoleChange
  }, "Save Changes")))), /*#__PURE__*/React.createElement(AlertDialog, {
    open: showRoleChangeDialog,
    onOpenChange: setShowRoleChangeDialog
  }, /*#__PURE__*/React.createElement(AlertDialogContent, null, /*#__PURE__*/React.createElement(AlertDialogHeader, null, /*#__PURE__*/React.createElement(AlertDialogTitle, null, "Confirm Role Change"), /*#__PURE__*/React.createElement(AlertDialogDescription, null, "Are you sure you want to change ", /*#__PURE__*/React.createElement("strong", {
    className: "text-gray-900"
  }, selectedUser?.fullName), "'s role from ", /*#__PURE__*/React.createElement("strong", {
    className: "text-gray-900"
  }, selectedUser?.role), " to ", /*#__PURE__*/React.createElement("strong", {
    className: "text-gray-900"
  }, newRole), "? This will affect their system permissions.")), /*#__PURE__*/React.createElement(AlertDialogFooter, null, /*#__PURE__*/React.createElement(AlertDialogCancel, {
    onClick: () => {
      setShowRoleChangeDialog(false);
      setSelectedUser(null);
      setNewRole("");
    }
  }, "Cancel"), /*#__PURE__*/React.createElement(AlertDialogAction, {
    onClick: handleConfirmRoleChange,
    className: "bg-[#FFFF00] text-black hover:bg-[#e6e600]"
  }, "Confirm Change")))), /*#__PURE__*/React.createElement(AlertDialog, {
    open: showDeactivateDialog,
    onOpenChange: setShowDeactivateDialog
  }, /*#__PURE__*/React.createElement(AlertDialogContent, null, /*#__PURE__*/React.createElement(AlertDialogHeader, null, /*#__PURE__*/React.createElement(AlertDialogTitle, null, "Deactivate User Account"), /*#__PURE__*/React.createElement(AlertDialogDescription, null, "Are you sure you want to deactivate ", /*#__PURE__*/React.createElement("strong", {
    className: "text-gray-900"
  }, selectedUser?.fullName), "'s account? They will no longer have access to the system until reactivated.")), /*#__PURE__*/React.createElement(AlertDialogFooter, null, /*#__PURE__*/React.createElement(AlertDialogCancel, {
    onClick: () => {
      setShowDeactivateDialog(false);
      setSelectedUser(null);
    }
  }, "Cancel"), /*#__PURE__*/React.createElement(AlertDialogAction, {
    onClick: handleConfirmDeactivate,
    className: "bg-[#FF0000] hover:bg-[#cc0000]"
  }, "Deactivate User")))), /*#__PURE__*/React.createElement(Dialog, {
    open: isEditBranchDialogOpen,
    onOpenChange: setIsEditBranchDialogOpen
  }, /*#__PURE__*/React.createElement(DialogContent, null, /*#__PURE__*/React.createElement(DialogHeader, null, /*#__PURE__*/React.createElement(DialogTitle, null, "Edit User Branch"), /*#__PURE__*/React.createElement(DialogDescription, null, "Transfer ", selectedUser?.fullName, " to a different branch. This will automatically update their data access permissions.")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4 py-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "current-branch"
  }, "Current Branch"), /*#__PURE__*/React.createElement(Input, {
    id: "current-branch",
    value: selectedUser?.branch || "",
    disabled: true,
    className: "bg-gray-50"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "new-branch"
  }, "New Branch"), /*#__PURE__*/React.createElement(Select, {
    value: newBranch,
    onValueChange: setNewBranch
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "new-branch"
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select a branch"
  })), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "Manggahan"
  }, "Manggahan"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "San Rafael"
  }, "San Rafael")))), /*#__PURE__*/React.createElement("div", {
    className: "bg-yellow-50 border border-yellow-200 rounded-lg p-3"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-yellow-800"
  }, /*#__PURE__*/React.createElement("strong", null, "Note:"), " Transferring this ", selectedUser?.role?.toLowerCase() || "employee", " will automatically update their system access to view and modify records only for the newly assigned branch."))), /*#__PURE__*/React.createElement(DialogFooter, null, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    onClick: () => {
      setIsEditBranchDialogOpen(false);
      setSelectedUser(null);
      setNewBranch("");
    }
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    onClick: handleInitiateBranchTransfer,
    className: "bg-[#FFFF00] text-black hover:bg-[#e6e600]"
  }, "Continue")))), /*#__PURE__*/React.createElement(AlertDialog, {
    open: showBranchTransferDialog,
    onOpenChange: setShowBranchTransferDialog
  }, /*#__PURE__*/React.createElement(AlertDialogContent, null, /*#__PURE__*/React.createElement(AlertDialogHeader, null, /*#__PURE__*/React.createElement(AlertDialogTitle, null, "Confirm Branch Transfer"), /*#__PURE__*/React.createElement(AlertDialogDescription, null, "Are you sure you want to transfer this ", selectedUser?.role?.toLowerCase() || "employee", " from ", /*#__PURE__*/React.createElement("strong", {
    className: "text-gray-900"
  }, selectedUser?.branch), " to ", /*#__PURE__*/React.createElement("strong", {
    className: "text-gray-900"
  }, newBranch), "? This will affect their system access.")), /*#__PURE__*/React.createElement(AlertDialogFooter, null, /*#__PURE__*/React.createElement(AlertDialogCancel, {
    onClick: () => {
      setShowBranchTransferDialog(false);
      setSelectedUser(null);
      setNewBranch("");
    }
  }, "Cancel"), /*#__PURE__*/React.createElement(AlertDialogAction, {
    onClick: handleConfirmBranchTransfer,
    className: "bg-[#FFFF00] text-black hover:bg-[#e6e600]"
  }, "Confirm Transfer")))), /*#__PURE__*/React.createElement(AlertDialog, {
    open: showRejectDialog,
    onOpenChange: setShowRejectDialog
  }, /*#__PURE__*/React.createElement(AlertDialogContent, null, /*#__PURE__*/React.createElement(AlertDialogHeader, null, /*#__PURE__*/React.createElement(AlertDialogTitle, null, "Reject User Registration"), /*#__PURE__*/React.createElement(AlertDialogDescription, null, "Are you sure you want to reject the registration request from ", /*#__PURE__*/React.createElement("strong", null, selectedUser?.fullName), "? This action cannot be undone and the user will be notified.")), /*#__PURE__*/React.createElement(AlertDialogFooter, null, /*#__PURE__*/React.createElement(AlertDialogCancel, {
    onClick: () => setSelectedUser(null)
  }, "Cancel"), /*#__PURE__*/React.createElement(AlertDialogAction, {
    onClick: handleReject,
    className: "bg-[#FF0000] hover:bg-[#cc0000]"
  }, "Reject User")))));
}

