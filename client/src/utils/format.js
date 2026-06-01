// Formatting helpers keep dates, purchase terms, and document labels consistent
// across reports, history views, and transaction screens.
export const formatDateTime = value => {
  if (!value) return "No date available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date available";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
};

const titleCaseWords = value =>
  String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase());

export const formatPurchasePaymentTerms = value => {
  const normalized = String(value || "cash").trim().toLowerCase();
  const labels = {
    cash: "Cash",
    cod: "COD",
    credit: "Credit",
    branch_transfer: "Branch Transfer"
  };
  return labels[normalized] || titleCaseWords(normalized);
};

export const formatPurchaseDocumentType = value => {
  const normalized = String(value || "DR").trim().toUpperCase();
  const labels = {
    DR: "DR",
    SI: "SI",
    OR: "OR",
    OTHER: "Other"
  };
  return labels[normalized] || titleCaseWords(normalized);
};

export const formatPurchaseDocumentLabel = (documentType, documentNumber = "") => {
  const typeLabel = formatPurchaseDocumentType(documentType);
  const numberLabel = String(documentNumber || "").trim();
  return numberLabel ? `${typeLabel} ${numberLabel}` : typeLabel;
};
