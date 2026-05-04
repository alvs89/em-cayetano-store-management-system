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
