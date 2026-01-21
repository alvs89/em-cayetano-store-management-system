import React from 'react';
import { useState } from "react";
import { ArchiveRestore, Search, Filter, Archive } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { toast } from "sonner";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";
export function ArchiveModule({
  user
}) {
  const {
    inventory,
    setInventory,
    archivedInventory,
    setArchivedInventory
  } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [showUnarchiveDialog, setShowUnarchiveDialog] = useState(false);
  const categories = Array.from(new Set(archivedInventory.map(item => item.category)));

  // 🔍 Filtered archived inventory
  const filteredArchive = archivedInventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // 🔄 Unarchive Item
  const handleUnarchiveItem = () => {
    if (!selectedItem) return;
    setArchivedInventory(archivedInventory.filter(i => i.id !== selectedItem.id));
    setInventory([...inventory, selectedItem]);
    setShowUnarchiveDialog(false);
    toast.success(`${selectedItem.name} restored successfully!`, {
      description: "Item returned to active inventory."
    });
    setSelectedItem(null);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Archive",
    subtitle: "Manage archived inventory items"
  }), /*#__PURE__*/React.createElement(Card, {
    className: "mb-6"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 relative"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400"
  }), /*#__PURE__*/React.createElement(Input, {
    className: "pl-10",
    placeholder: "Search by name or ID...",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "w-full md:w-48"
  }, /*#__PURE__*/React.createElement(Select, {
    value: categoryFilter,
    onValueChange: value => setCategoryFilter(value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, null, /*#__PURE__*/React.createElement(Filter, {
    className: "w-4 h-4 mr-2"
  }), /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "All Categories"
  })), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "all"
  }, "All Categories"), categories.map(cat => /*#__PURE__*/React.createElement(SelectItem, {
    key: cat,
    value: cat
  }, cat)))))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(CardTitle, {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "w-5 h-5 text-slate-600"
  }), "Archived Items"), /*#__PURE__*/React.createElement(CardDescription, null, filteredArchive.length, " ", filteredArchive.length === 1 ? 'item' : 'items', " archived")))), /*#__PURE__*/React.createElement(CardContent, null, archivedInventory.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-12"
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "w-16 h-16 mx-auto text-slate-300 mb-4"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "text-slate-600 mb-2"
  }, "No Archived Items"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500"
  }, "Items archived from inventory will appear here.")) : /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "ID"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Archived Date"), user.role === "Admin" && /*#__PURE__*/React.createElement(TableHead, null, "Actions"))), /*#__PURE__*/React.createElement(TableBody, null, filteredArchive.map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, null, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: item.status === "In Stock" ? "bg-green-100 text-green-700" : item.status === "Low Stock" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm text-slate-600"
  }, item.lastUpdated), user.role === "Admin" && /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    className: "border-[#FFFF00] bg-yellow-50 text-slate-800 hover:bg-[#FFFF00] hover:text-black transition-all",
    title: "Restore to Inventory",
    onClick: () => {
      setSelectedItem(item);
      setShowUnarchiveDialog(true);
    }
  }, /*#__PURE__*/React.createElement(ArchiveRestore, {
    className: "w-4 h-4 mr-2"
  }), "Restore")))))))), /*#__PURE__*/React.createElement(AlertDialog, {
    open: showUnarchiveDialog,
    onOpenChange: setShowUnarchiveDialog
  }, /*#__PURE__*/React.createElement(AlertDialogContent, null, /*#__PURE__*/React.createElement(AlertDialogHeader, null, /*#__PURE__*/React.createElement(AlertDialogTitle, null, "Restore Item"), /*#__PURE__*/React.createElement(AlertDialogDescription, null, "Are you sure you want to restore \"", selectedItem?.name, "\" back to active inventory?")), /*#__PURE__*/React.createElement(AlertDialogFooter, null, /*#__PURE__*/React.createElement(AlertDialogCancel, {
    onClick: () => setSelectedItem(null)
  }, "Cancel"), /*#__PURE__*/React.createElement(AlertDialogAction, {
    onClick: handleUnarchiveItem,
    className: "bg-[#FFFF00] text-black hover:bg-[#e6e600]"
  }, "Restore Item")))));
}

