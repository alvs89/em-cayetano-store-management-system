import React, { useEffect, useState } from "react";
import { Filter, Package, Search } from "lucide-react";
import { linearSearchAll, sortByNameAsc, sortByNameDesc } from "../utils/algorithms";
import { formatDateTime } from "../utils/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";

export function SearchModule() {
  const { inventory } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchResults, setSearchResults] = useState([]);
  const [sortBy, setSortBy] = useState("relevance");
  const [sortOrder, setSortOrder] = useState("asc");

  const categories = Array.from(new Set(inventory.map(product => product.category).filter(Boolean)));

  useEffect(() => {
    let results = [];

    results = linearSearchAll(inventory, product => {
      const productName = (product.name || "").toLowerCase();
      const productId = (product.id || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesSearch = searchQuery === "" || productName.includes(query) || productId.includes(query);
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

  const getStatusBadgeClass = status => {
    if (status === "In Stock") return "bg-green-100 text-green-700 hover:bg-green-100";
    if (status === "Low Stock") return "bg-orange-100 text-orange-700 hover:bg-orange-100";
    return "";
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
        }

        .search-result-card {
          min-width: 0;
          border-color: #dbe3ee;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .search-result-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 32px rgba(15, 23, 42, 0.1);
        }

        .search-result-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .search-result-name {
          overflow-wrap: anywhere;
          line-height: 1.25;
        }

        .search-result-detail {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.85rem;
          min-width: 0;
          color: #0f172a;
          font-size: 0.9rem;
        }

        .search-result-detail span:last-child {
          min-width: 0;
          text-align: right;
          overflow-wrap: anywhere;
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
          .search-results-card [data-slot="card-content"],
          .search-empty-card [data-slot="card-content"] {
            padding: 1.25rem;
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
            gap: 0.875rem;
          }

          .search-result-card [data-slot="card-header"] {
            padding: 1rem 1rem 0.6rem;
          }

          .search-result-card [data-slot="card-content"] {
            padding: 0 1rem 1rem;
          }

          .search-result-detail {
            border-radius: 0.75rem;
            background: #f8fafc;
            padding: 0.7rem 0.75rem;
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

          .search-controls-grid,
          .search-results-grid {
            grid-template-columns: 1fr;
          }

          .search-input-wrap {
            grid-column: auto;
          }

          .search-result-header {
            flex-direction: column;
          }

          .search-result-header > .inline-flex {
            align-self: flex-start;
          }

          .search-result-detail {
            align-items: flex-start;
            flex-direction: column;
            gap: 0.2rem;
          }

          .search-result-detail span:last-child {
            text-align: left;
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
                  placeholder="Search active products by name or ID"
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
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
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
                  <p className="text-slate-400">Try adjusting your search criteria</p>
                </div>
              ) : (
                <div className="search-results-grid">
                  {searchResults.map(product => (
                    <Card key={product.id} className="search-result-card hover:shadow-lg">
                      <CardHeader>
                        <div className="search-result-header">
                          <Badge variant="outline" className="font-mono text-xs">
                            {product.id}
                          </Badge>
                          <Badge
                            variant={
                              product.status === "In Stock"
                                ? "default"
                                : product.status === "Low Stock"
                                  ? "secondary"
                                  : "destructive"
                            }
                            className={getStatusBadgeClass(product.status)}
                          >
                            {product.status}
                          </Badge>
                        </div>
                        <CardTitle className="search-result-name text-lg">{product.name}</CardTitle>
                        <CardDescription>Product ID: {product.id}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="search-result-detail">
                            <span className="text-slate-600">Category</span>
                            <span>{product.category}</span>
                          </div>
                          <div className="search-result-detail">
                            <span className="text-slate-600">Quantity</span>
                            <span>{product.quantity}</span>
                          </div>
                          <div className="search-result-detail">
                            <span className="text-slate-600">Last Updated</span>
                            <span>{formatDateTime(product.lastUpdated)}</span>
                          </div>
                        </div>
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
              <div className="search-empty-state text-center text-slate-400">
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
