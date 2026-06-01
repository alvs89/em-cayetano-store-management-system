// Search module: provides cross-module lookup for inventory, transactions,
// purchases, and archived records.
import React, { useEffect, useState } from "react";
import { ArrowRight, Box, BriefcaseBusiness, CalendarDays, ExternalLink, Filter, Package, Search, UserRound } from "lucide-react";
import { linearSearchAll, sortByNameAsc, sortByNameDesc } from "../utils/algorithms";
import { formatDateTime } from "../utils/format";
import { getStockStatusBadgeClass } from "../utils/statusStyles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";

export function SearchModule({ onNavigate }) {
  const { inventory } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchResults, setSearchResults] = useState([]);
  const [sortBy, setSortBy] = useState("relevance");
  const [sortOrder, setSortOrder] = useState("asc");

  const categories = Array.from(new Set(inventory.map(product => product.category).filter(Boolean)));

  useEffect(() => {
    const applyDashboardStatusFilter = status => {
      if (!status) return;
      setSearchQuery("");
      setCategoryFilter("all");
      setStatusFilter(status);
      setSortBy("name");
      setSortOrder("asc");
    };

    const pendingStatus = localStorage.getItem("dashboardSearchStatusFilter");
    if (pendingStatus) {
      applyDashboardStatusFilter(pendingStatus);
      localStorage.removeItem("dashboardSearchStatusFilter");
    }

    const handleDashboardSearchFilter = event => {
      applyDashboardStatusFilter(event.detail?.status);
    };

    window.addEventListener("dashboard-search-filter", handleDashboardSearchFilter);
    return () => window.removeEventListener("dashboard-search-filter", handleDashboardSearchFilter);
  }, []);

  useEffect(() => {
    let results = [];

    results = linearSearchAll(inventory, product => {
      const productName = (product.name || "").toLowerCase();
      const productId = String(product.id || "").toLowerCase();
      const productCode = (product.itemCode || "").toLowerCase();
      const productDatabaseId = String(product.productId || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        searchQuery === "" ||
        productName.includes(query) ||
        productCode.includes(query) ||
        productId.includes(query) ||
        productDatabaseId.includes(query);
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      const matchesStatus = statusFilter === "all" || product.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });

    if (sortBy === "name") {
      results = sortOrder === "asc" ? sortByNameAsc(results) : sortByNameDesc(results);
    }

    setSearchResults(results);
  }, [searchQuery, categoryFilter, statusFilter, inventory, sortBy, sortOrder]);

  const hasActiveFilters = searchQuery !== "" || categoryFilter !== "all" || statusFilter !== "all";
  const openInventoryRecord = product => {
    if (!product?.id) return;
    const focusId = String(product.id);
    localStorage.setItem("inventoryFocusItemId", focusId);
    onNavigate?.("inventory");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("inventory-focus-item", {
        detail: { id: focusId }
      }));
    }, 80);
  };

  return (
    <div className="search-products-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .search-products-page,
        .search-products-page * {
          box-sizing: border-box;
        }

        .search-products-page {
          overflow-x: hidden;
        }

        .search-products-page > .mb-8 {
          width: 100%;
          max-width: none;
        }

        .search-products-shell {
          width: 100%;
        }

        .search-controls-card,
        .search-results-card,
        .search-empty-card {
          overflow: hidden;
        }

        .search-results-card {
          gap: 1rem;
        }

        .search-results-card [data-slot="card-header"] {
          padding-bottom: 0;
        }

        .search-results-card [data-slot="card-content"] {
          padding-top: 0;
        }

        .search-controls-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.32fr) minmax(11rem, 0.28fr);
          gap: 1rem;
          align-items: center;
        }

        .search-input-wrap,
        .search-select-wrap {
          min-width: 0;
        }

        .search-input-wrap input,
        .search-select-wrap button {
          min-height: 3rem;
        }

        .active-filter-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
          min-width: 0;
        }

        .active-filter-row .inline-flex {
          max-width: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .search-results-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
          align-items: stretch;
          justify-items: stretch;
        }

        .search-result-card {
          position: relative;
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: none;
          min-width: 0;
          height: 100%;
          border-color: #dbe3ee;
          border-radius: 1rem;
          cursor: pointer;
          overflow: hidden;
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background-color 160ms ease;
        }

        .search-result-card:hover,
        .search-result-card:focus-visible {
          transform: translateY(-2px);
          background: #f8fafc !important;
          box-shadow: 0 16px 30px rgba(15, 23, 42, 0.08) !important;
          border-color: #94a3b8 !important;
          outline: none;
        }

        .search-result-card:focus-visible {
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16), 0 16px 30px rgba(15, 23, 42, 0.08) !important;
        }

        .search-result-card:active {
          transform: translateY(0);
          background: #f1f5f9 !important;
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08) !important;
        }

        .search-result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.85rem;
        }

        .search-result-card [data-slot="card-header"] {
          flex: 0 0 auto;
        }

        .search-result-card [data-slot="card-content"] {
          display: flex;
          flex: 1 1 auto;
          flex-direction: column;
        }

        .search-result-name {
          display: -webkit-box;
          min-height: 3.35rem;
          overflow: hidden;
          overflow-wrap: break-word;
          word-break: normal;
          color: #0f172a;
          font-size: clamp(1.05rem, 1.35vw, 1.35rem);
          font-weight: 750;
          letter-spacing: 0;
          line-height: 1.25;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }

        .search-result-action {
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.85rem;
          width: 100%;
          min-height: 2.5rem;
          border: 1px solid #bfdbfe;
          border-radius: 0.75rem;
          background: #eff6ff;
          color: #1d4ed8;
          padding: 0 0.85rem;
          font-size: 0.9rem;
          font-weight: 700;
          line-height: 1.2;
          margin-top: auto;
          transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
        }

        .search-result-action svg {
          width: 1rem;
          height: 1rem;
          flex-shrink: 0;
          transition: transform 160ms ease;
        }

        .search-result-card:hover .search-result-action,
        .search-result-card:focus-visible .search-result-action {
          border-color: #2563eb;
          background: #dbeafe;
          color: #1e3a8a;
        }

        .search-result-card:hover .search-result-action svg,
        .search-result-card:focus-visible .search-result-action svg {
          transform: translateX(2px);
        }

        .search-result-code-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          max-width: 100%;
          border: 1px solid #dbe3ee;
          border-radius: 0.7rem;
          background: #f8fafc;
          padding: 0.4rem 0.65rem;
          color: #0f172a;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 0.82rem;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .search-result-code-bars {
          color: #475569;
          font-size: 1rem;
          line-height: 1;
          letter-spacing: -0.08em;
        }

        .search-result-divider {
          height: 1px;
          width: 100%;
          background: #e2e8f0;
          margin: 1.1rem 0;
        }

        .search-result-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0;
          border-top: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 0.8rem;
          min-height: 8.55rem;
        }

        .search-result-detail {
          display: grid;
          grid-template-columns: 1.75rem minmax(0, 1fr);
          gap: 0.55rem;
          align-items: center;
          min-width: 0;
          color: #0f172a;
          padding: 0.65rem 0.6rem;
          font-size: 0.85rem;
        }

        .search-result-detail:nth-child(odd) {
          border-right: 1px solid #e2e8f0;
        }

        .search-result-detail:nth-child(n + 3) {
          border-top: 1px solid #e2e8f0;
        }

        .search-result-detail-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #475569;
        }

        .search-result-detail-icon svg {
          width: 1.1rem;
          height: 1.1rem;
          stroke-width: 2;
        }

        .search-result-detail-label {
          color: #64748b;
          display: block;
          font-size: 0.76rem;
          font-weight: 600;
          line-height: 1.2;
          white-space: nowrap;
        }

        .search-result-detail-value {
          display: block;
          margin-top: 0.12rem;
          color: #0f172a;
          font-size: 0.88rem;
          font-weight: 700;
          line-height: 1.25;
          overflow-wrap: break-word;
          word-break: normal;
        }

        .search-result-detail span:last-child {
          text-align: left;
        }

        @media (max-width: 980px) {
          .search-controls-grid {
            grid-template-columns: minmax(0, 1fr) minmax(11rem, 0.42fr);
          }

          .search-select-wrap:last-child {
            grid-column: 1 / -1;
          }

          .search-results-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .search-products-page {
            padding: 1.25rem;
          }

          .search-products-page > .mb-8 {
            margin-bottom: 1.25rem;
          }

          .search-products-page > .mb-8 > .relative {
            border-radius: 1.25rem;
            padding: 1.5rem;
          }

          .search-products-page > .mb-8 .flex.min-w-0.items-center {
            align-items: center;
            gap: 1rem;
          }

          .search-products-page > .mb-8 .flex.h-16 {
            width: 4rem;
            height: 4rem;
            border-radius: 1rem;
          }

          .search-products-page > .mb-8 .flex.h-16 svg {
            width: 2rem;
            height: 2rem;
          }

          .search-products-page > .mb-8 .min-w-0[style] {
            margin-left: 0 !important;
          }

          .search-products-page > .mb-8 h1 {
            font-size: clamp(1.85rem, 7vw, 2.55rem);
            line-height: 1.08;
          }

          .search-products-page > .mb-8 p {
            font-size: 0.98rem;
            line-height: 1.35;
          }

          .search-controls-card [data-slot="card-content"],
          .search-empty-card [data-slot="card-content"] {
            padding: 1.25rem;
          }

          .search-results-card [data-slot="card-content"] {
            padding: 1rem;
          }

          .search-controls-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.8rem;
          }

          .search-input-wrap {
            grid-column: 1 / -1;
          }

          .search-select-wrap:last-child {
            grid-column: auto;
          }

          .active-filter-row {
            align-items: flex-start;
            gap: 0.45rem;
            font-size: 0.85rem;
          }

          .search-results-card [data-slot="card-header"] {
            padding: 1.25rem 1.25rem 0;
          }

          .search-results-card [data-slot="card-title"] {
            font-size: 1.15rem;
          }

          .search-results-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            justify-items: stretch;
            gap: 0.7rem;
          }

          .search-result-card {
            width: 100%;
            max-width: none;
            border-radius: 0.9rem;
          }

          .search-result-card [data-slot="card-header"] {
            padding: 0.75rem 0.75rem 0.45rem;
          }

          .search-result-card [data-slot="card-content"] {
            padding: 0 0.75rem 0.75rem;
          }

          .search-result-header {
            align-items: flex-start;
            gap: 0.45rem;
            margin-bottom: 0.6rem;
          }

          .search-result-name {
            display: -webkit-box;
            min-height: 2.7rem;
            overflow: hidden;
            font-size: 0.9rem;
            line-height: 1.22;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 3;
          }

          .search-result-status-badge {
            flex-shrink: 0;
            padding: 0.18rem 0.45rem;
            font-size: 0.68rem;
            line-height: 1.15;
            white-space: nowrap;
          }

          .search-result-code-badge {
            min-width: 0;
            max-width: 100%;
            gap: 0.35rem;
            padding: 0.32rem 0.46rem;
            border-radius: 0.6rem;
            font-size: 0.68rem;
          }

          .search-result-code-bars {
            display: none;
          }

          .search-result-detail-grid {
            grid-template-columns: 1fr;
            gap: 0.35rem;
            border-top: 0;
            border-bottom: 0;
            margin: 0.6rem 0 0.65rem;
            min-height: 5rem;
          }

          .search-result-detail,
          .search-result-detail:nth-child(odd),
          .search-result-detail:nth-child(n + 3) {
            grid-template-columns: 1.15rem minmax(0, 1fr);
            gap: 0.35rem;
            border: 0;
            border-radius: 0.65rem;
            background: #f8fafc;
            padding: 0.45rem 0.5rem;
          }

          .search-result-detail-icon svg {
            width: 0.92rem;
            height: 0.92rem;
          }

          .search-result-detail-label {
            font-size: 0.66rem;
            line-height: 1.05;
          }

          .search-result-detail-value {
            display: -webkit-box;
            margin-top: 0.04rem;
            font-size: 0.78rem;
            line-height: 1.12;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }

          .search-result-action {
            min-height: 2.2rem;
            border-radius: 0.65rem;
            padding: 0 0.55rem;
            font-size: 0.76rem;
            gap: 0.45rem;
          }

          .search-result-action .inline-flex {
            min-width: 0;
            gap: 0.35rem;
          }

          .search-result-action svg {
            width: 0.9rem;
            height: 0.9rem;
          }

          .search-empty-state {
            padding: 2rem 1rem;
          }
        }

        @media (max-width: 420px) {
          .search-products-page {
            padding: 1rem;
          }

          .search-products-page > .mb-8 > .relative {
            padding: 1.25rem;
          }

          .search-products-page > .mb-8 .flex.h-16 {
            width: 3.25rem;
            height: 3.25rem;
          }

          .search-products-page > .mb-8 .flex.h-16 svg {
            width: 1.7rem;
            height: 1.7rem;
          }

          .search-products-page > .mb-8 h1 {
            font-size: 1.65rem;
          }

          .search-controls-grid {
            grid-template-columns: 1fr;
          }

          .search-input-wrap {
            grid-column: auto;
          }

          .search-result-header {
            align-items: flex-start;
            flex-direction: row;
            gap: 0.4rem;
          }

          .search-result-code-badge {
            max-width: calc(100% - 76px);
            padding: 0.28rem 0.38rem;
            font-size: 0.62rem;
          }

          .search-result-detail-grid {
            grid-template-columns: 1fr;
          }

          .search-result-detail,
          .search-result-detail:nth-child(odd),
          .search-result-detail:nth-child(n + 3) {
            border: 0;
            grid-template-columns: 1rem minmax(0, 1fr);
            padding: 0.4rem 0.45rem;
          }

          .search-result-name {
            min-height: 2.5rem;
            font-size: 0.84rem;
          }

          .search-result-detail-label {
            font-size: 0.62rem;
          }

          .search-result-detail-value {
            font-size: 0.72rem;
          }

          .search-result-action {
            min-height: 2.1rem;
            font-size: 0.7rem;
          }
        }

        @media (max-width: 360px) {
          .search-products-page {
            padding: 0.75rem;
          }

          .search-results-card [data-slot="card-content"] {
            padding: 0.75rem;
          }

          .search-results-grid {
            gap: 0.55rem;
          }

          .search-result-card [data-slot="card-header"] {
            padding: 0.65rem 0.6rem 0.4rem;
          }

          .search-result-card [data-slot="card-content"] {
            padding: 0 0.6rem 0.65rem;
          }

          .search-result-status-badge {
            padding: 0.16rem 0.35rem;
            font-size: 0.6rem;
          }

          .search-result-code-badge {
            max-width: calc(100% - 64px);
            font-size: 0.56rem;
          }

          .search-result-name {
            font-size: 0.78rem;
          }
        }
      `}</style>

      <PageHeader
        title="Search Products"
        subtitle="Quickly find and view product details"
        icon={<Search className="h-8 w-8" />}
      />

      <div className="search-products-shell space-y-6">
        <Card className="search-controls-card mb-6">
          <CardContent className="pt-6">
            <div className="search-controls-grid">
              <div className="search-input-wrap relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-12 pl-10"
                  placeholder="Search active products by name or item code"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                />
              </div>

              <div className="search-select-wrap">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="search-select-wrap">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="In Stock">In Stock</SelectItem>
                    <SelectItem value="Low Stock">Low Stock</SelectItem>
                    <SelectItem value="Out of Stock">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="active-filter-row mt-4 text-sm text-slate-600">
                <Filter className="h-4 w-4 shrink-0" />
                <span>Active filters:</span>
                {searchQuery && (
                  <Badge variant="secondary" className="border border-slate-200 bg-slate-100 text-slate-800">
                    Search: &quot;{searchQuery}&quot;
                  </Badge>
                )}
                {categoryFilter !== "all" && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    Category: {categoryFilter}
                  </Badge>
                )}
                {statusFilter !== "all" && (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                    Status: {statusFilter}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {hasActiveFilters ? (
          <Card className="search-results-card">
            <CardHeader>
              <CardTitle>Search Results</CardTitle>
              <CardDescription>
                {searchResults.length} {searchResults.length === 1 ? "product" : "products"} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {searchResults.length === 0 ? (
                <div className="search-empty-state text-center">
                  <Package className="mx-auto mb-4 h-16 w-16 text-slate-300" />
                  <h3 className="mb-2 text-xl text-slate-600">No records found</h3>
                  <p className="text-slate-700">Try adjusting your search criteria</p>
                </div>
              ) : (
                <div className="search-results-grid">
                  {searchResults.map(product => (
                    <Card
                      key={product.id}
                      className="search-result-card hover:shadow-lg"
                      role="button"
                      tabIndex={0}
                      aria-label={`View ${product.name} in Inventory`}
                      onClick={() => openInventoryRecord(product)}
                      onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openInventoryRecord(product);
                        }
                      }}
                    >
                      <CardHeader>
                        <div className="search-result-header">
                          <span className="search-result-code-badge">
                            <span className="search-result-code-bars" aria-hidden="true">||||</span>
                            {product.itemCode || product.id}
                          </span>
                          <Badge
                            variant={
                              product.status === "In Stock"
                                ? "default"
                                : product.status === "Low Stock"
                                  ? "secondary"
                                  : "destructive"
                            }
                            className={`${getStockStatusBadgeClass(product.status)} search-result-status-badge`}
                          >
                            {product.status}
                          </Badge>
                        </div>
                        <CardTitle className="search-result-name">{product.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="search-result-detail-grid">
                          <div className="search-result-detail search-result-detail-category">
                            <span className="search-result-detail-icon" aria-hidden="true"><BriefcaseBusiness /></span>
                            <span>
                              <span className="search-result-detail-label">Category</span>
                              <span className="search-result-detail-value">{product.category}</span>
                            </span>
                          </div>
                          <div className="search-result-detail search-result-detail-quantity">
                            <span className="search-result-detail-icon" aria-hidden="true"><Box /></span>
                            <span>
                              <span className="search-result-detail-label">Quantity</span>
                              <span className="search-result-detail-value">{product.quantity}</span>
                            </span>
                          </div>
                          <div className="search-result-detail search-result-detail-supplier">
                            <span className="search-result-detail-icon" aria-hidden="true"><UserRound /></span>
                            <span>
                              <span className="search-result-detail-label">Supplier</span>
                              <span className="search-result-detail-value">{product.supplierName || "Unassigned"}</span>
                            </span>
                          </div>
                          <div className="search-result-detail search-result-detail-updated">
                            <span className="search-result-detail-icon" aria-hidden="true"><CalendarDays /></span>
                            <span>
                              <span className="search-result-detail-label">Last Updated</span>
                              <span className="search-result-detail-value">{formatDateTime(product.lastUpdated)}</span>
                            </span>
                          </div>
                        </div>
                        <span className="search-result-action">
                          <span className="inline-flex items-center gap-2"><ExternalLink aria-hidden="true" /> View in Inventory</span>
                          <ArrowRight aria-hidden="true" />
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="search-empty-card">
            <CardContent className="py-16">
              <div className="search-empty-state text-center text-slate-700">
                <Search className="mx-auto mb-4 h-16 w-16 opacity-50" />
                <p className="mb-2 text-lg">Start searching for products</p>
                <p className="text-sm">Type in the search box or select filters to see results automatically</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default SearchModule;
