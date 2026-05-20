export const getStockStatusBadgeClass = status => {
  const baseClass = "stock-status-badge";

  if (status === "In Stock") {
    return `${baseClass} stock-status-badge-in`;
  }

  if (status === "Low Stock") {
    return `${baseClass} stock-status-badge-low`;
  }

  if (status === "Out of Stock") {
    return `${baseClass} stock-status-badge-out`;
  }

  return `${baseClass} stock-status-badge-neutral`;
};
