// Local form draft helpers keep unfinished operational work recoverable without
// creating official transactions, stock movements, reports, or audit records.
const FORM_DRAFT_PREFIX = "emc_form_draft";
const FORM_DRAFT_VERSION = 1;
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeScopePart = value =>
  String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";

export const getFormDraftKey = ({ module, userId, branch }) => [
  FORM_DRAFT_PREFIX,
  normalizeScopePart(module),
  normalizeScopePart(branch),
  normalizeScopePart(userId)
].join(":");

export const saveFormDraft = ({ module, userId, branch, data }) => {
  const payload = {
    version: FORM_DRAFT_VERSION,
    module,
    branch: branch || "",
    userId: userId || "",
    savedAt: new Date().toISOString(),
    data
  };
  localStorage.setItem(getFormDraftKey({ module, userId, branch }), JSON.stringify(payload));
  return payload;
};

export const loadFormDraft = ({ module, userId, branch }) => {
  try {
    const rawDraft = localStorage.getItem(getFormDraftKey({ module, userId, branch }));
    if (!rawDraft) return null;
    const parsedDraft = JSON.parse(rawDraft);
    const savedTime = new Date(parsedDraft?.savedAt || 0).getTime();
    if (
      parsedDraft?.version !== FORM_DRAFT_VERSION ||
      parsedDraft?.module !== module ||
      !Number.isFinite(savedTime) ||
      Date.now() - savedTime > MAX_DRAFT_AGE_MS
    ) {
      clearFormDraft({ module, userId, branch });
      return null;
    }
    return parsedDraft;
  } catch {
    clearFormDraft({ module, userId, branch });
    return null;
  }
};

export const clearFormDraft = ({ module, userId, branch }) => {
  localStorage.removeItem(getFormDraftKey({ module, userId, branch }));
};

export const formatDraftSavedAt = value => {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};
