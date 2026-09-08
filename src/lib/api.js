import { supabase } from "./supabase";

const baseUrl = import.meta.env.VITE_API_URL || "/api";

async function currentToken(token) {
  if (!supabase) return token;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || token;
}

export async function apiRequest(path, options = {}, token) {
  const accessToken = await currentToken(token);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Something went wrong");
  return payload;
}

export const api = {
  me: (token) => apiRequest("/me", {}, token),
  sites: (token) => apiRequest("/sites", {}, token),
  overview: (token) => apiRequest("/overview", {}, token),
  createSite: (data, token) =>
    apiRequest("/sites", { method: "POST", body: JSON.stringify(data) }, token),
  categories: (siteId, token) =>
    apiRequest(`/sites/${siteId}/categories`, {}, token),
  createCategory: (siteId, data, token) =>
    apiRequest(
      `/sites/${siteId}/categories`,
      { method: "POST", body: JSON.stringify(data) },
      token,
    ),
  updateCategory: (siteId, categoryId, data, token) =>
    apiRequest(
      `/sites/${siteId}/categories/${categoryId}`,
      { method: "PATCH", body: JSON.stringify(data) },
      token,
    ),
  disableCategory: (siteId, categoryId, token) =>
    apiRequest(
      `/sites/${siteId}/categories/${categoryId}/disable`,
      { method: "POST" },
      token,
    ),
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
    return currentToken(token)
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
