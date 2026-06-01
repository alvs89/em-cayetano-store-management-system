// Centralizes API URL construction so every component uses the same backend
// origin in local development, staging, and deployed environments.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const apiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
