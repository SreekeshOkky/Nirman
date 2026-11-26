# App navigation

For the factory's verifier agent, which checks acceptance criteria in a real
browser and reads no source code. Keep it current when routes or persistent UI
change.

- **Base URL:** `http://localhost:4173` (started with `factory.yml` `start`)
- **Backend:** a real local Supabase with demo data. It resets every time the app starts.
- **Viewports:** desktop above 800px wide (left sidebar); 800px and below uses a bottom bar.
- **Theme:** Me → "Name and appearance" (`/settings`), radios Light / Dark / Match my device. Dark sets `data-theme="dark"` on `<html>`.

## Signing in
Every screen needs a sign-in form at `/`. Test accounts (local only):

| Role | Email | Password | Sees |
|---|---|---|---|
| Builder | `builder@nirman.test` | `factory-test-password` | Everything |
| Supervisor | `supervisor@nirman.test` | `factory-test-password` | Only Lakeview Villa; no edit, delete, Summary, Team, Categories or Activity |

Sign out: `/me` → "Sign out".

## Demo data
| Site | State | Id |
|---|---|---|
| Lakeview Villa | active, budget ₹5,00,000, ₹4,60,000 spent | `00000000-0000-4000-8002-000000000001` |
| Hillside Apartments | active, budget ₹20,00,000 | `00000000-0000-4000-8002-000000000002` |
| Old Warehouse | inactive, read-only | `00000000-0000-4000-8002-000000000003` |

Lakeview Villa entries: Kerala Cement Traders ₹2,45,000 (has a receipt), Suresh
Masonry ₹2,15,000 (added by the supervisor, no receipt), Demo Client ₹6,00,000
received. Hillside Apartments has a pending invite for `pending@nirman.test`.

## Routes
| Path | What it shows | How to reach it |
|---|---|---|
| `/` | Builder: "Your sites" with month totals and "Needs attention". Supervisor with one site: redirects to it | Nav "Sites" |
| `/sites` | All sites, Active / Inactive filter, New site, Mark inactive, Reactivate | Home → "All sites, including finished ones" |
| `/sites/<id>` | Site header, budget (builder), Entries tab: search, type filter, Add entry, Scan UPI | Click a site |
| `/sites/<id>/summary` | Reports and export (builder) | Site tab "Summary" |
| `/sites/<id>/notes` | Site notes | Site tab "Notes" |
| `/sites/<id>/team` | Members and pending invites (builder) | Site tab "Team" |
| `/sites/<id>?add=1` | Opens the Add entry panel | "Add entry" / "Add" |
| `/sites/<id>?view=<entry id>` | Opens one entry's details | An item on Updates |
| `/add` | "Which site is this for?" | "Add" with no site open |
| `/updates` | Over-budget sites, new team entries, missing receipts | Nav "Updates" |
| `/me` | Account, links to Categories, Activity log, All sites, settings, Sign out | Sidebar user card (desktop) or bottom bar (phone) |
| `/settings` | Name and appearance | From Me |
| `/categories` | Manage categories (builder) | Sidebar or Me |
| `/activity` | Audit history (builder) | Sidebar or Me |

Open `/categories` and `/activity` by clicking their links: loading either address
directly (or refreshing) currently lands on `/`.

Example: `/sites/00000000-0000-4000-8002-000000000001/summary`.
`/ledger`, `/reports`, `/notes` and `/team` redirect to the current site's tab.

## Persistent UI
### Sidebar (desktop)
Brand, "Add entry", Sites, Updates (with a count badge), Activity log, Categories, and the user card linking to `/me`.

### Bottom bar (800px and below)
Sites, Add, Updates and Me.

### Panels, dialogs and toasts
- "Add entry" slides in a panel: Paid out / Received, amount, paid to, category, payment method, date, receipt. Close with the X or Escape.
- Deleting an entry asks for confirmation, then shows a toast with "Undo".

## Doesn't work locally
- Emails are not delivered. Invite and password-reset mail is caught by a local mail sink: read it at `http://factory-supabase-mail:8025`.
- Sign-up confirms the account immediately (a hosted project asks for email confirmation).
- "Scan UPI" downloads its OCR model from a CDN, so it needs network access.
- Fonts from Google may not load.
