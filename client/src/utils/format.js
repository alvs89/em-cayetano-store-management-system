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

export const formatPurchasePaymentTerms = (value, creditTermsDays = null) => {
  const normalized = String(value || "cash").trim().toLowerCase();
  const labels = {
    cash: "Cash",
    cod: "COD",
    credit: "Credit",
    branch_transfer: "Branch Transfer"
  };
  if (normalized === "credit" && creditTermsDays) {
    return `Credit - ${creditTermsDays} days`;
  }
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

export const formatPurchaseDocumentLabel = (documentType, documentNumber = "", documentTypeNote = "") => {
  const normalized = String(documentType || "DR").trim().toUpperCase();
  const typeLabel = formatPurchaseDocumentType(documentType);
  const numberLabel = String(documentNumber || "").trim();
  const baseLabel = numberLabel ? `${typeLabel} ${numberLabel}` : typeLabel;
  const noteLabel = String(documentTypeNote || "").trim();
  return normalized === "OTHER" && noteLabel ? `${baseLabel}: ${noteLabel}` : baseLabel;
};
