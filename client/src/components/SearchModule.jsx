// Search module: provides indexed cross-module lookup for inventory, sales,
// purchases, and archived records.
import React, { useEffect, useMemo, useState } from "react";
import { Archive, ArrowRight, Box, BriefcaseBusiness, CalendarDays, ExternalLink, Filter, Package, ReceiptText, Search, ShoppingCart, UserRound } from "lucide-react";
import { formatDateTime } from "../utils/format";
import { getStockStatusBadgeClass } from "../utils/statusStyles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";

const getCategoryDisplay = product => {
  const category = product?.category || "Uncategorized";
  const note = String(product?.categoryNote || "").trim();
  return note ? `${category}: ${note}` : category;
};

const SEARCH_DEBOUNCE_MS = 140;
const MAX_SEARCH_RESULTS = 60;

const normalizeSearchText = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const tokenize = value => normalizeSearchText(value).split(/\s+/).filter(Boolean);

const compactJoin = values => values
  .flat()
  .filter(value => value !== null && value !== undefined && String(value).trim() !== "")
  .map(value => String(value).trim())
  .join(" ");

const uniqueCompactJoin = values => Array.from(new Set(values
  .flat()
  .filter(value => value !== null && value !== undefined && String(value).trim() !== "")
  .map(value => String(value).trim()))).join(", ");

const formatCurrency = value => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
}).format(Number(value || 0));

const getSaleItems = sale => Array.isArray(sale?.items) ? sale.items : [];
const getPurchaseItems = purchase => Array.isArray(purchase?.items) ? purchase.items : [];

const getRecordIcon = type => {
  switch (type) {
    case "inventory":
      return Package;
    case "archive":
      return Archive;
    case "sale":
      return ReceiptText;
    case "purchase":
      return ShoppingCart;
    default:
      return Search;
  }
};

const getRecordTypeLabel = type => {
  switch (type) {
    case "inventory":
      return "Inventory";
    case "archive":
      return "Archive";
    case "sale":
      return "Sales";
    case "purchase":
      return "Purchases";
    default:
      return "Record";
  }
};

export function SearchModule({ onNavigate }) {
  const { inventory, archivedInventory, salesTransactions, purchaseTransactions } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("relevance");
  const [sortOrder, setSortOrder] = useState("asc");

  const categories = useMemo(
    () => Array.from(new Set([...(inventory || []), ...(archivedInventory || [])].map(product => product.category).filter(Boolean))).sort(),
    [archivedInventory, inventory]
  );

  const searchIndex = useMemo(() => {
    const records = [];

    (inventory || []).forEach(product => {
      const categoryDisplay = getCategoryDisplay(product);
      records.push({
        key: `inventory-${product.id}`,
        type: "inventory",
        module: "inventory",
        record: product,
        title: product.name || "Unnamed product",
        subtitle: categoryDisplay,
        code: product.itemCode || product.id,
        category: product.category || "",
        status: product.status || "",
        date: product.lastUpdated || "",
        details: [
          { label: "Category", value: categoryDisplay, icon: BriefcaseBusiness },
          { label: "Quantity", value: product.quantity ?? 0, icon: Box },
          { label: "Supplier", value: product.supplierName || "Unassigned", icon: UserRound },
          { label: "Last Updated", value: formatDateTime(product.lastUpdated), icon: CalendarDays },
        ],
        searchableText: compactJoin([
          product.id,
          product.productId,
          product.itemCode,
          product.name,
          product.category,
          product.categoryNote,
          product.supplierName,
          product.status,
          product.branch,
          product.quantity,
          product.reorderLevel,
        ]),
        importantText: compactJoin([product.itemCode, product.name, product.category, product.supplierName]),
      });
    });

    (archivedInventory || []).forEach(product => {
      const categoryDisplay = getCategoryDisplay(product);
      records.push({
        key: `archive-${product.id}`,
        type: "archive",
        module: "archive",
        record: product,
        title: product.name || "Archived product",
        subtitle: categoryDisplay,
        code: product.archiveCode || product.itemCode || product.id,
        category: product.category || "",
        status: product.status || "Archived",
        date: product.archivedAt || product.lastUpdated || "",
        details: [
          { label: "Category", value: categoryDisplay, icon: BriefcaseBusiness },
          { label: "Archive Reason", value: product.archiveReasonNote || product.archiveReason || "Archived", icon: Archive },
          { label: "Supplier", value: product.supplierName || "Unassigned", icon: UserRound },
          { label: "Archived", value: formatDateTime(product.archivedAt || product.lastUpdated), icon: CalendarDays },
        ],
        searchableText: compactJoin([
          product.id,
          product.originalInventoryId,
          product.productId,
          product.itemCode,
          product.archiveCode,
          product.name,
          product.category,
          product.categoryNote,
          product.supplierName,
          product.status,
          product.archiveReason,
          product.archiveReasonNote,
        ]),
        importantText: compactJoin([product.itemCode, product.archiveCode, product.name, product.category, product.supplierName]),
      });
    });

    (salesTransactions || []).forEach(sale => {
      const items = getSaleItems(sale);
      const itemNames = uniqueCompactJoin(items.map(item => item.itemName));
      const categoriesText = uniqueCompactJoin(items.map(item => item.categoryNote ? `${item.category}: ${item.categoryNote}` : item.category));
      records.push({
        key: `sale-${sale.id}`,
        type: "sale",
        module: "sales",
        record: sale,
        title: sale.salesNumber || sale.officialInvoiceNumber || `Sale ${sale.id}`,
        subtitle: itemNames || `${sale.totalQuantity || 0} sold item${Number(sale.totalQuantity) === 1 ? "" : "s"}`,
        code: sale.officialInvoiceNumber || sale.salesNumber || sale.id,
        category: "",
        status: sale.status || "completed",
        date: sale.createdAt || sale.encodedAt || "",
        details: [
          { label: "Customer", value: sale.customerName || "Walk-in", icon: UserRound },
          { label: "Amount", value: formatCurrency(sale.totalAmount), icon: ReceiptText },
          { label: "Items", value: itemNames || `${sale.totalQuantity || 0} unit${Number(sale.totalQuantity) === 1 ? "" : "s"}`, icon: Package },
          { label: "Transaction Date", value: formatDateTime(sale.createdAt), icon: CalendarDays },
        ],
        searchableText: compactJoin([
          sale.id,
          sale.salesNumber,
          sale.officialInvoiceNumber,
          sale.officialInvoiceExpectedNumber,
          sale.branch,
          sale.customerType,
          sale.customerName,
          sale.customerTin,
          sale.customerAddress,
          sale.paymentMethod,
          sale.paymentReference,
          sale.status,
          sale.transactionType,
          sale.remarks,
          sale.backdateReason,
          sale.cancelReason,
          itemNames,
          categoriesText,
          items.flatMap(item => [item.productId, item.inventoryId, item.itemName, item.category, item.categoryNote, item.branch]),
        ]),
        importantText: compactJoin([sale.salesNumber, sale.officialInvoiceNumber, sale.customerName, itemNames]),
      });
    });

    (purchaseTransactions || []).forEach(purchase => {
      const items = getPurchaseItems(purchase);
      const itemNames = uniqueCompactJoin(items.map(item => item.itemName));
      const categoriesText = uniqueCompactJoin(items.map(item => item.categoryNote ? `${item.category}: ${item.categoryNote}` : item.category));
      records.push({
        key: `purchase-${purchase.id}`,
        type: "purchase",
        module: "purchases",
        record: purchase,
        title: purchase.purchaseNumber || `Purchase ${purchase.id}`,
        subtitle: purchase.supplierName || itemNames || "Purchase record",
        code: purchase.documentNumber || purchase.purchaseNumber || purchase.id,
        category: "",
        status: purchase.status || "completed",
        date: purchase.createdAt || purchase.encodedAt || "",
        details: [
          { label: "Supplier", value: purchase.supplierName || "No supplier", icon: UserRound },
          { label: "Amount", value: formatCurrency(purchase.subtotalAmount), icon: ShoppingCart },
          { label: "Items", value: itemNames || `${purchase.totalQuantity || 0} unit${Number(purchase.totalQuantity) === 1 ? "" : "s"}`, icon: Package },
          { label: "Transaction Date", value: formatDateTime(purchase.createdAt), icon: CalendarDays },
        ],
        searchableText: compactJoin([
          purchase.id,
          purchase.purchaseNumber,
          purchase.branch,
          purchase.supplierName,
          purchase.documentType,
          purchase.documentTypeNote,
          purchase.documentNumber,
          purchase.paymentTerms,
          purchase.remarks,
          purchase.status,
          purchase.encodedByName,
          purchase.backdateReason,
          purchase.cancelReason,
          itemNames,
          categoriesText,
          items.flatMap(item => [item.productId, item.inventoryId, item.itemName, item.category, item.categoryNote, item.branch]),
        ]),
        importantText: compactJoin([purchase.purchaseNumber, purchase.documentNumber, purchase.supplierName, itemNames]),
      });
    });

    const tokenMap = new Map();
    const indexedRecords = records.map((record, index) => {
      const normalizedText = normalizeSearchText(record.searchableText);
      const normalizedImportantText = normalizeSearchText(record.importantText);
      const tokens = Array.from(new Set(tokenize(record.searchableText)));

      tokens.forEach(token => {
        if (!tokenMap.has(token)) tokenMap.set(token, new Set());
        tokenMap.get(token).add(index);
      });

      return {
        ...record,
        index,
        normalizedText,
        normalizedImportantText,
        tokens,
      };
    });

    return {
      records: indexedRecords,
      tokenMap,
      totals: {
        inventory: (inventory || []).length,
        archive: (archivedInventory || []).length,
        sale: (salesTransactions || []).length,
        purchase: (purchaseTransactions || []).length,
      },
    };
  }, [archivedInventory, inventory, purchaseTransactions, salesTransactions]);

  const statusOptions = useMemo(
    () => Array.from(new Set(searchIndex.records.map(record => record.status).filter(Boolean))).sort(),
    [searchIndex]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const applyDashboardStatusFilter = status => {
      if (!status) return;
      setSearchQuery("");
      setTypeFilter("inventory");
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

  const searchResults = useMemo(() => {
    const queryTokens = tokenize(debouncedSearchQuery);
    const hasQuery = queryTokens.length > 0;
    const candidateIndexes = new Set();

    if (hasQuery) {
      queryTokens.forEach(queryToken => {
        searchIndex.tokenMap.forEach((indexes, token) => {
          if (token === queryToken || token.startsWith(queryToken) || token.includes(queryToken)) {
            indexes.forEach(index => candidateIndexes.add(index));
          }
        });
      });
    } else {
      searchIndex.records.forEach(record => candidateIndexes.add(record.index));
    }

    const scoredResults = Array.from(candidateIndexes)
      .map(index => {
        const record = searchIndex.records[index];
        if (!record) return null;
        if (typeFilter !== "all" && record.type !== typeFilter) return null;
        if (categoryFilter !== "all" && !["inventory", "archive"].includes(record.type)) return null;
        if (categoryFilter !== "all" && record.category !== categoryFilter) return null;
        if (statusFilter !== "all" && record.status !== statusFilter) return null;

        let score = hasQuery ? 0 : 1;
        const normalizedTitle = normalizeSearchText(record.title);
        const normalizedCode = normalizeSearchText(record.code);
        const normalizedSubtitle = normalizeSearchText(record.subtitle);

        queryTokens.forEach(queryToken => {
          if (normalizedCode === queryToken) score += 90;
          if (normalizedCode.startsWith(queryToken)) score += 60;
          if (normalizedTitle === queryToken) score += 70;
          if (normalizedTitle.startsWith(queryToken)) score += 45;
          if (record.normalizedImportantText.includes(queryToken)) score += 25;
          if (normalizedSubtitle.includes(queryToken)) score += 14;
          if (record.normalizedText.includes(queryToken)) score += 8;
          if (record.tokens.some(token => token.startsWith(queryToken))) score += 6;
          if (record.tokens.some(token => token.includes(queryToken))) score += 3;
        });

        if (hasQuery && score <= 0) return null;
        return { ...record, score };
      })
      .filter(Boolean);

    const sortedResults = [...scoredResults].sort((a, b) => {
      if (sortBy === "name") {
        const result = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
        return sortOrder === "asc" ? result : -result;
      }

      if (sortBy === "date") {
        const aTime = new Date(a.date || 0).getTime();
        const bTime = new Date(b.date || 0).getTime();
        const result = (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
        return sortOrder === "asc" ? result : -result;
      }

      if (b.score !== a.score) return b.score - a.score;
      return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
    });

    return sortedResults.slice(0, MAX_SEARCH_RESULTS);
  }, [categoryFilter, debouncedSearchQuery, searchIndex, sortBy, sortOrder, statusFilter, typeFilter]);

  const hasActiveFilters = searchQuery.trim() !== "" || typeFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all";
  const openSearchRecord = result => {
    if (!result) return;

    if (result.type === "inventory" && result.record?.id) {
      const focusId = String(result.record.id);
      localStorage.setItem("inventoryFocusItemId", focusId);
      onNavigate?.("inventory");
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("inventory-focus-item", {
          detail: { id: focusId }
        }));
      }, 80);
      return;
    }

    if (result.type === "archive" && result.record?.originalInventoryId) {
      localStorage.setItem("archiveRowHighlightOriginalId", String(result.record.originalInventoryId));
      onNavigate?.("archive");
      return;
    }

    if (result.type === "sale") {
      localStorage.setItem("sales_history_target_period", "all");
      onNavigate?.("sales");
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("sales-history-target-view", {
          detail: { period: "all" }
        }));
      }, 80);
      return;
    }

    if (result.type === "purchase") {
      onNavigate?.("purchases");
      return;
    }

    if (!result.record?.id) return;
    const focusId = String(result.record.id);
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
          grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.22fr) minmax(12rem, 0.26fr) minmax(11rem, 0.24fr);
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

        .search-result-type {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          color: #475569;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .search-result-type svg {
          height: 1rem;
          width: 1rem;
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
            grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.34fr);
          }

          .search-select-wrap:nth-child(4) {
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

          .search-select-wrap:nth-child(4) {
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
        title="System Search"
        subtitle="Find products, archived records, sales, and purchases from one place"
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
                  placeholder="Search item code, product, supplier, invoice, customer, remarks..."
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                />
              </div>

              <div className="search-select-wrap">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Record Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Records</SelectItem>
                    <SelectItem value="inventory">Inventory</SelectItem>
                    <SelectItem value="archive">Archive</SelectItem>
                    <SelectItem value="sale">Sales</SelectItem>
                    <SelectItem value="purchase">Purchases</SelectItem>
                  </SelectContent>
                </Select>
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
                    {statusOptions.map(status => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
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
                {typeFilter !== "all" && (
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                    Type: {getRecordTypeLabel(typeFilter)}
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
                {searchResults.length} {searchResults.length === 1 ? "record" : "records"} found
                {searchResults.length === MAX_SEARCH_RESULTS ? ` - showing top ${MAX_SEARCH_RESULTS} matches` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {searchResults.length === 0 ? (
                <div className="search-empty-state text-center">
                  <Package className="mx-auto mb-4 h-16 w-16 text-slate-300" />
                  <h3 className="mb-2 text-xl text-slate-600">No records found</h3>
                  <p className="text-slate-700">Try a product name, item code, supplier, invoice number, customer, or transaction reference.</p>
                </div>
              ) : (
                <div className="search-results-grid">
                  {searchResults.map(result => {
                    const RecordIcon = getRecordIcon(result.type);
                    return (
                      <Card
                        key={result.key}
                        className="search-result-card hover:shadow-lg"
                        role="button"
                        tabIndex={0}
                        aria-label={`View ${result.title} in ${getRecordTypeLabel(result.type)}`}
                        onClick={() => openSearchRecord(result)}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openSearchRecord(result);
                          }
                        }}
                      >
                        <CardHeader>
                          <div className="search-result-header">
                            <span className="search-result-code-badge">
                              <span className="search-result-code-bars" aria-hidden="true">||||</span>
                              {result.code || result.record?.id || result.key}
                            </span>
                            <span className="search-result-type">
                              <RecordIcon aria-hidden="true" />
                              {getRecordTypeLabel(result.type)}
                            </span>
                          </div>
                          <CardTitle className="search-result-name">{result.title}</CardTitle>
                          {result.status && (
                            <Badge
                              variant={result.status === "In Stock" ? "default" : result.status === "Low Stock" ? "secondary" : "outline"}
                              className={`${["In Stock", "Low Stock", "Out of Stock"].includes(result.status) ? getStockStatusBadgeClass(result.status) : ""} search-result-status-badge`}
                            >
                              {result.status}
                            </Badge>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="search-result-detail-grid">
                            {result.details.slice(0, 4).map(detail => {
                              const DetailIcon = detail.icon;
                              return (
                                <div key={`${result.key}-${detail.label}`} className="search-result-detail">
                                  <span className="search-result-detail-icon" aria-hidden="true"><DetailIcon /></span>
                                  <span>
                                    <span className="search-result-detail-label">{detail.label}</span>
                                    <span className="search-result-detail-value">
                                      {detail.value === null || detail.value === undefined || detail.value === "" ? "-" : detail.value}
                                    </span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <span className="search-result-action">
                            <span className="inline-flex items-center gap-2"><ExternalLink aria-hidden="true" /> View in {getRecordTypeLabel(result.type)}</span>
                            <ArrowRight aria-hidden="true" />
                          </span>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="search-empty-card">
            <CardContent className="py-16">
              <div className="search-empty-state text-center text-slate-700">
                <Search className="mx-auto mb-4 h-16 w-16 opacity-50" />
                <p className="mb-2 text-lg">Start searching across the system</p>
                <p className="text-sm">Type a product, item code, supplier, invoice, customer, or record reference.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default SearchModule;
