import React from 'react';
import { useState, useEffect } from "react";
import { Search, Filter, Package } from "lucide-react";
import { linearSearchAll, sortByNameAsc, sortByNameDesc, binarySearch, sortByIdAsc } from "../utils/algorithms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";
export function SearchModule({
  user
}) {
  const {
    inventory
  } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchResults, setSearchResults] = useState([]);
  const [sortBy, setSortBy] = useState('relevance');
  const [sortOrder, setSortOrder] = useState('asc');
  const categories = Array.from(new Set(inventory.map(p => p.category)));

  // 🔍 LINEAR SEARCH & BINARY SEARCH ALGORITHMS for product searching
  // Automatically filter products whenever search query or filters change
  useEffect(() => {
    let results = [];

    // If searching by exact ID and inventory is sorted, use BINARY SEARCH
    // Binary Search: O(log n) - much faster than linear for sorted data
    if (searchQuery && searchQuery.match(/^[A-Z]\d{3}$/i)) {
      // Sort inventory by ID first for binary search
      const sortedByID = sortByIdAsc([...inventory]);
      const index = binarySearch(sortedByID, searchQuery.toUpperCase(), (item, target) => item.id.localeCompare(target));
      if (index !== -1) {
        results = [sortedByID[index]];
      }
    } else {
      // Use LINEAR SEARCH for general filtering
      // Linear Search: O(n) - checks each item sequentially
      // Perfect for multiple criteria (search + category + status)
      results = linearSearchAll(inventory, product => {
        const matchesSearch = searchQuery === "" || product.name.toLowerCase().includes(searchQuery.toLowerCase()) || product.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
        const matchesStatus = statusFilter === "all" || product.status === statusFilter;
        return matchesSearch && matchesCategory && matchesStatus;
      });
    }

    // Apply sorting to results
    if (sortBy === 'name') {
      results = sortOrder === 'asc' ? sortByNameAsc(results) : sortByNameDesc(results);
    }
    setSearchResults(results);
  }, [searchQuery, categoryFilter, statusFilter, inventory, sortBy, sortOrder]);

  // Determine if we should show results (any filter is active or search query exists)
  const hasActiveFilters = searchQuery !== "" || categoryFilter !== "all" || statusFilter !== "all";
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Search Products",
    subtitle: "Quickly find and view product details"
  }), /*#__PURE__*/React.createElement(Card, {
    className: "mb-6"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 relative"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400"
  }), /*#__PURE__*/React.createElement(Input, {
    className: "pl-10 h-12",
    placeholder: "Search by product name or ID...",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "w-full md:w-48"
  }, /*#__PURE__*/React.createElement(Select, {
    value: categoryFilter,
    onValueChange: setCategoryFilter
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "h-12"
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Category"
  })), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "all"
  }, "All Categories"), categories.map(cat => /*#__PURE__*/React.createElement(SelectItem, {
    key: cat,
    value: cat
  }, cat))))), /*#__PURE__*/React.createElement("div", {
    className: "w-full md:w-48"
  }, /*#__PURE__*/React.createElement(Select, {
    value: statusFilter,
    onValueChange: setStatusFilter
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "h-12"
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Status"
  })), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "all"
  }, "All Status"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "In Stock"
  }, "In Stock"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "Low Stock"
  }, "Low Stock"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "Out of Stock"
  }, "Out of Stock"))))), hasActiveFilters && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 flex items-center gap-2 text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement(Filter, {
    className: "w-4 h-4"
  }), /*#__PURE__*/React.createElement("span", null, "Active filters: "), searchQuery && /*#__PURE__*/React.createElement(Badge, {
    variant: "secondary",
    className: "bg-yellow-100 text-yellow-800"
  }, "Search: \"", searchQuery, "\""), categoryFilter !== "all" && /*#__PURE__*/React.createElement(Badge, {
    variant: "secondary",
    className: "bg-blue-100 text-blue-800"
  }, "Category: ", categoryFilter), statusFilter !== "all" && /*#__PURE__*/React.createElement(Badge, {
    variant: "secondary",
    className: "bg-purple-100 text-purple-800"
  }, "Status: ", statusFilter)))), hasActiveFilters ? /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Search Results"), /*#__PURE__*/React.createElement(CardDescription, null, searchResults.length, " ", searchResults.length === 1 ? "product" : "products", " ", "found")), /*#__PURE__*/React.createElement(CardContent, null, searchResults.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-16"
  }, /*#__PURE__*/React.createElement(Package, {
    className: "w-16 h-16 mx-auto mb-4 text-slate-300"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "text-xl text-slate-600 mb-2"
  }, "No records found"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-400"
  }, "Try adjusting your search criteria")) : /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
  }, searchResults.map(product => /*#__PURE__*/React.createElement(Card, {
    key: product.id,
    className: "hover:shadow-lg transition-all"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between mb-2"
  }, /*#__PURE__*/React.createElement(Badge, {
    variant: "outline",
    className: "font-mono text-xs"
  }, product.id), /*#__PURE__*/React.createElement(Badge, {
    variant: product.status === "In Stock" ? "default" : product.status === "Low Stock" ? "secondary" : "destructive",
    className: product.status === "In Stock" ? "bg-green-100 text-green-700 hover:bg-green-100" : product.status === "Low Stock" ? "bg-orange-100 text-orange-700 hover:bg-orange-100" : ""
  }, product.status)), /*#__PURE__*/React.createElement(CardTitle, {
    className: "text-lg"
  }, product.name), /*#__PURE__*/React.createElement(CardDescription, null, "Product ID: ", product.id)), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Category"), /*#__PURE__*/React.createElement("span", null, product.category)), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Quantity"), /*#__PURE__*/React.createElement("span", null, product.quantity)), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Last Updated"), /*#__PURE__*/React.createElement("span", null, product.lastUpdated))))))))) : /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    className: "py-16"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center text-slate-400"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "w-16 h-16 mx-auto mb-4 opacity-50"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-lg mb-2"
  }, "Start searching for products"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm"
  }, "Type in the search box or select filters to see results automatically")))));
}

