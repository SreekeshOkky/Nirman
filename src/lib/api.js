import { supabase } from "./supabase";

const baseUrl = import.meta.env.VITE_API_URL || "/api";

async function sessionToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const expiring = (session.expires_at || 0) - 30 < Date.now() / 1000;
  if (!expiring) return session.access_token;
  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed?.session?.access_token || session.access_token;
}

async function signedFetch(path, options, accessToken) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {}),
    },
  });
}

function isDeadSession(error) {
  const message = `${error?.message || ""}`.toLowerCase();
  return (
    message.includes("session from session_id claim") ||
    message.includes("refresh token not found") ||
    message.includes("refresh token has expired") ||
    message.includes("user not found") ||
    message.includes("jwt has expired")
  );
}

export async function apiRequest(path, options = {}, token) {
  let accessToken = (await sessionToken()) || token;
  let response = await signedFetch(path, options, accessToken);
  if (response.status === 401 && supabase) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    const next = refreshed?.session?.access_token;
    if (next && next !== accessToken) {
      accessToken = next;
      response = await signedFetch(path, options, accessToken);
    } else if (error && isDeadSession(error)) {
      await supabase.auth.signOut();
      throw new Error("Your session expired. Please sign in again.");
    }
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Something went wrong");
  return payload;
}

export const api = {
  features: () => apiRequest("/features", {}),
  me: (token) => apiRequest("/me", {}, token),
  sites: (token, params) =>
    apiRequest(`/sites?${new URLSearchParams(params || {})}`, {}, token),
  overview: (token) => apiRequest("/overview", {}, token),
  createSite: (data, token) =>
    apiRequest("/sites", { method: "POST", body: JSON.stringify(data) }, token),
  archiveSite: (siteId, token) =>
    apiRequest(`/sites/${siteId}/archive`, { method: "POST" }, token),
  activateSite: (siteId, token) =>
    apiRequest(`/sites/${siteId}/activate`, { method: "POST" }, token),
  categories: (siteId, token) =>
    apiRequest(`/sites/${siteId}/categories`, {}, token),
  myCategories: (token) => apiRequest("/categories", {}, token),
  createCategory: (data, token) =>
    apiRequest(
      "/categories",
      { method: "POST", body: JSON.stringify(data) },
      token,
    ),
  updateCategory: (categoryId, data, token) =>
    apiRequest(
      `/categories/${categoryId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
    ),
  disableCategory: (categoryId, token) =>
    apiRequest(`/categories/${categoryId}/disable`, { method: "POST" }, token),
  members: (siteId, token) => apiRequest(`/sites/${siteId}/members`, {}, token),
  inviteMember: (siteId, data, token) =>
    apiRequest(
      `/sites/${siteId}/members/invite`,
      { method: "POST", body: JSON.stringify(data) },
      token,
    ),
  removeMember: (siteId, memberId, token) =>
    apiRequest(
      `/sites/${siteId}/members/${memberId}`,
      { method: "DELETE" },
      token,
    ),
  ledger: (siteId, params, token) =>
    apiRequest(
      `/sites/${siteId}/ledger?${new URLSearchParams(params)}`,
      {},
      token,
    ),
  createLedger: (siteId, data, token) =>
    apiRequest(
      `/sites/${siteId}/ledger`,
      { method: "POST", body: JSON.stringify(data) },
      token,
    ),
  updateLedger: (siteId, entryId, data, token) =>
    apiRequest(
      `/sites/${siteId}/ledger/${entryId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
    ),
  ledgerEntry: (siteId, entryId, token) =>
    apiRequest(`/sites/${siteId}/ledger/${entryId}`, {}, token),
  deleteLedger: (siteId, entryId, token) =>
    apiRequest(
      `/sites/${siteId}/ledger/${entryId}`,
      { method: "DELETE" },
      token,
    ),
  summary: (siteId, token) => apiRequest(`/sites/${siteId}/summary`, {}, token),
  reportExportUrl: (siteId) => `${baseUrl}/sites/${siteId}/reports/export`,
  monthly: (siteId, token) =>
    apiRequest(`/sites/${siteId}/reports/monthly`, {}, token),
  notes: (siteId, token) => apiRequest(`/sites/${siteId}/notes`, {}, token),
  createNote: (siteId, data, token) =>
    apiRequest(
      `/sites/${siteId}/notes`,
      { method: "POST", body: JSON.stringify(data) },
      token,
    ),
  updateNote: (siteId, noteId, data, token) =>
    apiRequest(
      `/sites/${siteId}/notes/${noteId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
    ),
  deleteNote: (siteId, noteId, token) =>
    apiRequest(`/sites/${siteId}/notes/${noteId}`, { method: "DELETE" }, token),
  audit: (siteId, token) =>
    apiRequest(`/sites/${siteId}/audit-logs`, {}, token),
  workspaceAudit: (token) => apiRequest(`/audit-logs`, {}, token),
  uploadAttachment: (siteId, file, token, ledgerEntryId) => {
    const body = new FormData();
    body.append("file", file);
    const suffix = ledgerEntryId
      ? `?ledger_entry_id=${encodeURIComponent(ledgerEntryId)}`
      : "";
    return sessionToken()
      .then((accessToken) =>
        fetch(`${baseUrl}/sites/${siteId}/attachments${suffix}`, {
          method: "POST",
          body,
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {},
        }),
      )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Upload failed");
        return data;
      });
  },
};
