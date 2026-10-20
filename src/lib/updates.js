import { formatDate, money } from "../components/Shared";

// When the user last looked at Updates, so "new entries" only lists what
// arrived since. Per device; without it the API defaults to the last 48h.
const SEEN_KEY = "updates-seen-at";

export function updatesSeenAt() {
  try {
    return window.localStorage.getItem(SEEN_KEY) || null;
  } catch {
    return null;
  }
}

export function markUpdatesSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    // Storage unavailable: new entries stay listed for 48 hours instead.
  }
}

function ago(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return formatDate(iso.slice(0, 10));
}

// Turn the /api/updates response into display rows, most urgent first.
// `mine`: the list only holds the viewer's own entries (supervisors), so
// "added by" is left out.
export function updateItems(data, { mine = false } = {}) {
  if (!data) return [];
  const budget = data.over_budget.map((site) => ({
    key: `budget-${site.site_id}`,
    kind: "budget",
    tone: site.pct > 100 ? "danger" : "warning",
    title:
      site.pct > 100
        ? `${site.site_name} is over budget`
        : `${site.site_name} has used ${site.pct}% of its budget`,
    detail: `${money(site.spent)} spent of ${money(site.budget)}`,
    to: `/sites/${site.site_id}/summary`,
  }));
  const fresh = data.new_entries.map((group) => ({
    key: `new-${group.site_id}-${group.added_by}`,
    kind: "new",
    tone: "info",
    title: `${group.added_by || "Someone"} added ${group.count} ${
      group.count === 1 ? "entry" : "entries"
    }`,
    detail: `${money(group.total)} paid out at ${group.site_name}`,
    when: ago(group.latest_at),
    to: `/sites/${group.site_id}`,
  }));
  const receipts = data.missing_receipts.map((entry) => ({
    key: `receipt-${entry.entry_id}`,
    kind: "receipt",
    tone: "warning",
    title: `No receipt: ${money(entry.amount)}${
      entry.paid_to ? ` to ${entry.paid_to}` : ""
    }`,
    detail: [
      entry.site_name,
      entry.category,
      !mine && entry.added_by && `added by ${entry.added_by}`,
    ]
      .filter(Boolean)
      .join(" · "),
    when: formatDate(entry.entry_date),
    to: `/sites/${entry.site_id}?view=${entry.entry_id}`,
  }));
  return [...budget, ...fresh, ...receipts];
}
