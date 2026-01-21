import React from 'react';
import { useState } from "react";
import { Plus, Minus, Archive, Search, Filter, ArrowUpDown } from "lucide-react";
import { linearSearch, linearSearchAll, sortByNameAsc, sortByNameDesc, sortByQuantityAsc, sortByQuantityDesc, sortByIdAsc, sortByIdDesc, sortByDateAsc, sortByDateDesc } from "../utils/algorithms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "./ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";
export function InventoryModule({
  user,
  onNavigate
}) {
  const {
    inventory,
    setInventory,
    archivedInventory,
    setArchivedInventory
  } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isStockInDialogOpen, setIsStockInDialogOpen] = useState(false);
  const [isStockOutDialogOpen, setIsStockOutDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [stockAmount, setStockAmount] = useState("");

  // 🔄 Sorting state: track which column and direction to sort
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const categories = Array.from(new Set(inventory.map(item => item.category)));
  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    quantity: "",
    reorderLevel: "10" // Default reorder level
  });

  // 🔍 Filtered inventory using Linear Search Algorithm
  // Linear Search: O(n) - iterates through each item sequentially
  // Used here because we're filtering with multiple criteria (search + category)
  const filteredInventory = linearSearchAll(inventory, item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // 📊 Sorted inventory using Merge Sort Algorithm
  // Merge Sort: O(n log n) - efficient sorting for any data size
  // Applied after filtering to maintain search/filter results
  const sortedInventory = (() => {
    switch (sortBy) {
      case 'name':
        return sortOrder === 'asc' ? sortByNameAsc(filteredInventory) : sortByNameDesc(filteredInventory);
      case 'quantity':
        return sortOrder === 'asc' ? sortByQuantityAsc(filteredInventory) : sortByQuantityDesc(filteredInventory);
      case 'id':
        return sortOrder === 'asc' ? sortByIdAsc(filteredInventory) : sortByIdDesc(filteredInventory);
      case 'date':
        return sortOrder === 'asc' ? sortByDateAsc(filteredInventory) : sortByDateDesc(filteredInventory);
      default:
        return filteredInventory;
    }
  })();

  // 🔀 Handle column header click to change sort
  const handleSort = column => {
    if (sortBy === column) {
      // Toggle sort order if clicking the same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to ascending
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // ➕ Add Item
  const handleAddItem = () => {
    if (!newItem.name || !newItem.category || !newItem.quantity || !newItem.reorderLevel) {
      toast.error("Please fill in all fields before adding an item.");
      return;
    }
    const quantity = parseInt(newItem.quantity);
    const reorderLevel = parseInt(newItem.reorderLevel);
    if (isNaN(quantity) || quantity < 0) {
      toast.error("Please enter a valid quantity.");
      return;
    }
    if (isNaN(reorderLevel) || reorderLevel < 0 || reorderLevel > 20) {
      toast.error("Reorder Level must be between 0 and 20.");
      return;
    }

    // 🔍 Check for duplicate item using Linear Search Algorithm
    // Linear Search: O(n) - checks each item to find duplicates
    // Perfect for unsorted data with multiple matching criteria
    const existingItem = linearSearch(inventory, item => item.name.toLowerCase() === newItem.name.toLowerCase() && item.category.toLowerCase() === newItem.category.toLowerCase());
    if (existingItem) {
      toast.error("Item already exists!", {
        description: `"${newItem.name}" in category "${newItem.category}" is already in inventory (ID: ${existingItem.id}). Use Stock In to add more units.`
      });
      return;
    }
    const prefix = newItem.category.charAt(0).toUpperCase();
    const sameCategoryItems = inventory.filter(item => item.id.startsWith(prefix));
    const nextNumber = (sameCategoryItems.length + 1).toString().padStart(3, "0");
    const item = {
      id: `${prefix}${nextNumber}`,
      name: newItem.name,
      category: newItem.category,
      quantity,
      reorderLevel,
      status: quantity === 0 ? "Out of Stock" : quantity <= reorderLevel ? "Low Stock" : "In Stock",
      lastUpdated: new Date().toISOString().split("T")[0]
    };
    setInventory([...inventory, item]);
    setIsAddDialogOpen(false);
    setNewItem({
      name: "",
      category: "",
      quantity: "",
      reorderLevel: "10"
    });
    if (quantity === 0) {
      toast.error(`${newItem.name} added but OUT OF STOCK!`, {
        description: 'Item needs immediate stocking'
      });
    } else if (quantity <= reorderLevel) {
      toast.warning(`${newItem.name} added but LOW ON STOCK!`, {
        description: `Only ${quantity} units - Consider restocking soon`
      });
    } else {
      toast.success(`${newItem.name} added successfully!`, {
        description: `Initial stock: ${quantity} units`
      });
    }
  };

  // 📦 Stock In
  const handleStockIn = () => {
    if (!selectedItem || !stockAmount) {
      toast.error("Please enter a valid amount first.");
      return;
    }
    const amount = parseInt(stockAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid stock quantity.");
      return;
    }
    const updatedInventory = inventory.map(item => {
      if (item.id === selectedItem.id) {
        const newQuantity = item.quantity + amount;
        const newStatus = newQuantity === 0 ? "Out of Stock" : newQuantity <= item.reorderLevel ? "Low Stock" : "In Stock";
        return {
          ...item,
          quantity: newQuantity,
          status: newStatus,
          lastUpdated: new Date().toISOString().split("T")[0]
        };
      }
      return item;
    });
    setInventory(updatedInventory);
    setIsStockInDialogOpen(false);
    setStockAmount("");
    toast.success(`Added ${amount} units to ${selectedItem.name}`, {
      description: `New stock level: ${selectedItem.quantity + amount} units`
    });
    setSelectedItem(null);
  };

  // 📉 Stock Out
  const handleStockOut = () => {
    if (!selectedItem || !stockAmount) {
      toast.error("Please enter a valid amount first.");
      return;
    }
    const amount = parseInt(stockAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid stock quantity.");
      return;
    }
    if (amount > selectedItem.quantity) {
      toast.error("Insufficient stock.");
      return;
    }
    const updatedInventory = inventory.map(item => {
      if (item.id === selectedItem.id) {
        const newQuantity = item.quantity - amount;
        const newStatus = newQuantity === 0 ? "Out of Stock" : newQuantity <= item.reorderLevel ? "Low Stock" : "In Stock";
        return {
          ...item,
          quantity: newQuantity,
          status: newStatus,
          lastUpdated: new Date().toISOString().split("T")[0]
        };
      }
      return item;
    });
    setInventory(updatedInventory);
    setIsStockOutDialogOpen(false);
    setStockAmount("");
    const newQuantity = selectedItem.quantity - amount;
    if (newQuantity === 0) {
      toast.error(`${selectedItem.name} is now OUT OF STOCK!`, {
        description: `Removed ${amount} units - Immediate restocking required`
      });
    } else if (newQuantity <= selectedItem.reorderLevel) {
      toast.warning(`${selectedItem.name} is now LOW ON STOCK!`, {
        description: `Removed ${amount} units - Only ${newQuantity} units remaining`
      });
    } else {
      toast.success(`Removed ${amount} units from ${selectedItem.name}`, {
        description: `Remaining stock: ${newQuantity} units`
      });
    }
    setSelectedItem(null);
  };

  // Archive Item
  const handleArchiveItem = item => {
    setInventory(inventory.filter(i => i.id !== item.id));
    setArchivedInventory([...archivedInventory, item]);
    toast.success(`${item.name} archived successfully!`, {
      description: 'Item moved to archive. View in Archive page.'
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Inventory Management",
    subtitle: "Manage stock levels and product inventory"
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
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(CardTitle, null, "Inventory Items"), /*#__PURE__*/React.createElement(CardDescription, null, sortedInventory.length, " items found", sortBy && /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500 ml-2"
  }, "\u2022 Sorted by ", sortBy === 'date' ? 'Last Updated' : sortBy.charAt(0).toUpperCase() + sortBy.slice(1), " (", sortOrder === 'asc' ? 'A-Z' : 'Z-A', ")"))), user.role === "Admin" && /*#__PURE__*/React.createElement(Dialog, {
    open: isAddDialogOpen,
    onOpenChange: setIsAddDialogOpen
  }, /*#__PURE__*/React.createElement(DialogTrigger, {
    asChild: true
  }, /*#__PURE__*/React.createElement(Button, {
    className: "bg-slate-700 hover:bg-slate-800 text-white font-semibold shadow-md transition-all duration-300"
  }, /*#__PURE__*/React.createElement(Plus, {
    className: "w-4 h-4 mr-2"
  }), "Add Item")), /*#__PURE__*/React.createElement(DialogContent, null, /*#__PURE__*/React.createElement(DialogHeader, null, /*#__PURE__*/React.createElement(DialogTitle, null, "Add New Item"), /*#__PURE__*/React.createElement(DialogDescription, null, "Enter details of the new inventory item.")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4 py-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "item-name"
  }, "Item Name"), /*#__PURE__*/React.createElement(Input, {
    id: "item-name",
    value: newItem.name,
    onChange: e => setNewItem({
      ...newItem,
      name: e.target.value
    }),
    placeholder: "e.g., Steel Hammer"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "category"
  }, "Category"), /*#__PURE__*/React.createElement(Input, {
    id: "category",
    value: newItem.category,
    onChange: e => setNewItem({
      ...newItem,
      category: e.target.value
    }),
    placeholder: "e.g., Tools, Paint, Cement"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "quantity"
  }, "Initial Quantity"), /*#__PURE__*/React.createElement(Input, {
    id: "quantity",
    type: "number",
    value: newItem.quantity,
    onChange: e => setNewItem({
      ...newItem,
      quantity: e.target.value
    }),
    placeholder: "0"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "reorder-level"
  }, "Reorder Level (Max 20)"), /*#__PURE__*/React.createElement(Input, {
    id: "reorder-level",
    type: "number",
    min: "0",
    max: "20",
    value: newItem.reorderLevel,
    onChange: e => setNewItem({
      ...newItem,
      reorderLevel: e.target.value
    }),
    placeholder: "10"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mt-1"
  }, "Determines when item becomes \"Low Stock\". Max 20 units."))), /*#__PURE__*/React.createElement(DialogFooter, null, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    onClick: () => setIsAddDialogOpen(false)
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    onClick: handleAddItem
  }, "Add Item")))))), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => handleSort('id'),
    className: "hover:bg-slate-100 font-semibold"
  }, "ID", sortBy === 'id' && /*#__PURE__*/React.createElement(ArrowUpDown, {
    className: `w-4 h-4 ml-1 ${sortOrder === 'desc' ? 'rotate-180' : ''}`
  }))), /*#__PURE__*/React.createElement(TableHead, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => handleSort('name'),
    className: "hover:bg-slate-100 font-semibold"
  }, "Item Name", sortBy === 'name' && /*#__PURE__*/React.createElement(ArrowUpDown, {
    className: `w-4 h-4 ml-1 ${sortOrder === 'desc' ? 'rotate-180' : ''}`
  }))), /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => handleSort('quantity'),
    className: "hover:bg-slate-100 font-semibold"
  }, "Quantity", sortBy === 'quantity' && /*#__PURE__*/React.createElement(ArrowUpDown, {
    className: `w-4 h-4 ml-1 ${sortOrder === 'desc' ? 'rotate-180' : ''}`
  }))), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => handleSort('date'),
    className: "hover:bg-slate-100 font-semibold"
  }, "Last Updated", sortBy === 'date' && /*#__PURE__*/React.createElement(ArrowUpDown, {
    className: `w-4 h-4 ml-1 ${sortOrder === 'desc' ? 'rotate-180' : ''}`
  }))), /*#__PURE__*/React.createElement(TableHead, null, "Actions"))), /*#__PURE__*/React.createElement(TableBody, null, sortedInventory.map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, null, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: item.status === "In Stock" ? "bg-green-100 text-green-700" : item.status === "Low Stock" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm text-slate-600"
  }, item.lastUpdated), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    className: "border-green-500 text-green-700 hover:bg-green-50",
    title: "Stock In: Add new stock",
    onClick: () => {
      setSelectedItem(item);
      setIsStockInDialogOpen(true);
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    className: "w-4 h-4"
  })), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    className: "border-red-500 text-red-700 hover:bg-red-50",
    title: "Stock Out: Deduct stock",
    onClick: () => {
      setSelectedItem(item);
      setIsStockOutDialogOpen(true);
    }
  }, /*#__PURE__*/React.createElement(Minus, {
    className: "w-4 h-4"
  })), user.role === "Admin" && /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    title: "Archive: Remove item from list",
    onClick: () => handleArchiveItem(item)
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "w-4 h-4"
  })))))))))), /*#__PURE__*/React.createElement(Dialog, {
    open: isStockInDialogOpen,
    onOpenChange: setIsStockInDialogOpen
  }, /*#__PURE__*/React.createElement(DialogContent, null, /*#__PURE__*/React.createElement(DialogHeader, null, /*#__PURE__*/React.createElement(DialogTitle, {
    className: "text-green-700"
  }, "Stock In"), /*#__PURE__*/React.createElement(DialogDescription, null, "Add stock for: ", selectedItem?.name)), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4 py-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "stock-in-amount"
  }, "Quantity to Add"), /*#__PURE__*/React.createElement(Input, {
    id: "stock-in-amount",
    type: "number",
    value: stockAmount,
    onChange: e => setStockAmount(e.target.value),
    placeholder: "0"
  })), /*#__PURE__*/React.createElement("div", {
    className: "p-3 bg-green-50 rounded-lg border border-green-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-green-800"
  }, "Current Stock: ", selectedItem?.quantity ?? 0, " units"))), /*#__PURE__*/React.createElement(DialogFooter, null, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    onClick: () => setIsStockInDialogOpen(false)
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "bg-green-600 hover:bg-green-700",
    onClick: handleStockIn
  }, "Confirm Stock In")))), /*#__PURE__*/React.createElement(Dialog, {
    open: isStockOutDialogOpen,
    onOpenChange: setIsStockOutDialogOpen
  }, /*#__PURE__*/React.createElement(DialogContent, null, /*#__PURE__*/React.createElement(DialogHeader, null, /*#__PURE__*/React.createElement(DialogTitle, {
    className: "text-red-700"
  }, "Stock Out"), /*#__PURE__*/React.createElement(DialogDescription, null, "Remove stock for: ", selectedItem?.name)), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4 py-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "stock-out-amount"
  }, "Quantity to Remove"), /*#__PURE__*/React.createElement(Input, {
    id: "stock-out-amount",
    type: "number",
    value: stockAmount,
    onChange: e => setStockAmount(e.target.value),
    placeholder: "0"
  })), /*#__PURE__*/React.createElement("div", {
    className: "p-3 bg-red-50 rounded-lg border border-red-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-red-800"
  }, "Current Stock: ", selectedItem?.quantity ?? 0, " units"))), /*#__PURE__*/React.createElement(DialogFooter, null, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    onClick: () => setIsStockOutDialogOpen(false)
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "bg-red-600 hover:bg-red-700",
    onClick: handleStockOut
  }, "Confirm Stock Out")))));
}

