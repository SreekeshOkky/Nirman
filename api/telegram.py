"""Telegram bot: send a UPI payment screenshot, pick a site, and it's recorded
as an expense on that site.

Flow per screenshot (one telegram_drafts row):
  photo -> OCR (api/ocr.js) -> [ask amount if unread] -> ask site -> save entry
The draft's prompt_message_id ties inline-button presses back to it, because
Telegram callback data is limited to 64 bytes.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import difflib
import logging
import os
import re
import secrets
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from starlette.concurrency import run_in_threadpool
import httpx

from .config import get_settings
from .dependencies import CurrentUser, User, _load_profile, ensure_site_access, ensure_site_active, get_admin_client, maybe_one, require_feature
from .features import FEATURE_TELEGRAM, is_enabled
from .schemas import LedgerCreate
from .services import accessible_sites, attach_receipt, insert_ledger_entry, record_audit, site_categories

logger = logging.getLogger("nirmanam.telegram")

router = APIRouter(prefix="/telegram")
link_router = APIRouter(prefix="/telegram", dependencies=[Depends(require_feature(FEATURE_TELEGRAM))])

TELEGRAM_API = "https://api.telegram.org"
LINK_CODE_TTL = timedelta(minutes=15)
# How long the person who sent a screenshot can still undo or recategorise it
# from the chat. Site owners can always change it in the app.
EDIT_WINDOW = timedelta(minutes=15)
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_SITE_BUTTONS = 10
IMAGE_TYPES = {"image/jpeg", "image/png"}

_http = httpx.Client(transport=httpx.HTTPTransport(retries=2), timeout=httpx.Timeout(60.0, connect=10.0))


# ---------------------------------------------------------------- Telegram API

def tg(method: str, **params: Any) -> Any:
    token = get_settings().telegram_bot_token
    response = _http.post(f"{TELEGRAM_API}/bot{token}/{method}", json={k: v for k, v in params.items() if v is not None})
    data = response.json()
    if not data.get("ok"):
        logger.warning("Telegram %s failed: %s", method, data.get("description"))
        return None
    return data.get("result")


def download_file(file_id: str) -> bytes:
    info = tg("getFile", file_id=file_id)
    if not info or not info.get("file_path"):
        raise RuntimeError("Telegram did not return the file")
    if (info.get("file_size") or 0) > MAX_IMAGE_BYTES:
        raise ValueError("Image too large")
    token = get_settings().telegram_bot_token
    response = _http.get(f"{TELEGRAM_API}/file/bot{token}/{info['file_path']}")
    response.raise_for_status()
    return response.content


def send(chat_id: int, text: str, buttons: list[list[dict]] | None = None) -> dict | None:
    markup = {"inline_keyboard": buttons} if buttons else None
    return tg("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML", reply_markup=markup)


def edit(chat_id: int, message_id: int, text: str, buttons: list[list[dict]] | None = None) -> None:
    tg("editMessageText", chat_id=chat_id, message_id=message_id, text=text, parse_mode="HTML", reply_markup={"inline_keyboard": buttons or []})


def button(text: str, data: str) -> dict:
    return {"text": text, "callback_data": data}


_bot_username: str | None = None


def bot_username() -> str | None:
    global _bot_username
    configured = get_settings().telegram_bot_username
    if configured:
        return configured.lstrip("@")
    if _bot_username is None:
        me = tg("getMe") or {}
        _bot_username = me.get("username")
    return _bot_username


# -------------------------------------------------------------------- helpers

def brand() -> str:
    return get_settings().vite_brand_name or "Nirmanam"


def esc(value: Any) -> str:
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_inr(amount: Decimal | float | str) -> str:
    """Indian digit grouping: 1250000 -> ₹12,50,000."""
    value = Decimal(str(amount)).quantize(Decimal("0.01"))
    whole, frac = f"{value:.2f}".split(".")
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    text = ",".join(groups + [tail]) if groups else tail
    return f"₹{text}" + ("" if frac == "00" else f".{frac}")


def format_day(value: str | date) -> str:
    day = date.fromisoformat(value) if isinstance(value, str) else value
    return f"{day.day} {day.strftime('%b %Y')}"


AMOUNT_RE = re.compile(r"^\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*$", re.I)


def parse_amount(text: str) -> Decimal | None:
    match = AMOUNT_RE.match(text or "")
    if not match:
        return None
    try:
        value = Decimal(match.group(1).replace(",", ""))
    except InvalidOperation:
        return None
    return value if Decimal("0") < value < Decimal("1000000000000") else None


def parse_ts(value: str) -> datetime:
    """PostgREST timestamps ("...T10:00:00.12345+00:00") on any Python 3.9+."""
    value = value.replace("Z", "+00:00")
    match = re.match(r"^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?(.*)$", value)
    if match:
        value = match.group(1) + (f".{(match.group(2) + '000000')[:6]}" if match.group(2) else "") + match.group(3)
    return datetime.fromisoformat(value)


def message_day(unix_ts: int) -> date:
    return datetime.fromtimestamp(unix_ts, ZoneInfo(get_settings().telegram_timezone)).date()


# Python port of suggestCategory() / CATEGORY_HINTS in src/lib/upiParse.js.
CATEGORY_HINTS = [
    (r"\b(cement|concrete|rmc|sand|aggregate|brick|block|masonry)\b", ["cement", "concrete", "brick", "sand", "material"]),
    (r"\b(steel|tmt|rebar|rod|sariya|saria)\b", ["steel", "rebar", "rod", "material"]),
    (r"\b(labour|labor|wage|wages|mistri|mazdoor|worker|workmen|contractor)\b", ["labour", "labor", "wage", "contractor"]),
    (r"\b(rent|rental|jcb|mixer|crane|machine|equipment|excavator|hire)\b", ["rent", "equipment", "machine", "hire"]),
    (r"\b(electric|electrical|wiring|wire|switch|cable|mcb)\b", ["electric"]),
    (r"\b(plumb|plumbing|pipe|fitting|sanitary|tap|bathroom)\b", ["plumb", "pipe", "sanitary", "fitting"]),
    (r"\b(transport|diesel|petrol|fuel|lorry|truck|freight|delivery|tipper)\b", ["transport", "fuel", "freight", "logistics"]),
    (r"\b(paint|painting|primer|putty)\b", ["paint"]),
    (r"\b(tile|tiles|marble|granite|flooring|vitrified)\b", ["tile", "marble", "granite", "floor"]),
    (r"\b(wood|timber|ply|plywood|door|window|furniture)\b", ["wood", "timber", "door", "window"]),
]


def expense_categories(db, site: dict) -> list[dict]:
    return [c for c in site_categories(db, site) if c.get("type") in ("expense", "both")]


def suggest_category(text: str, categories: list[dict]) -> dict | None:
    lower = (text or "").lower()
    for category in categories:
        words = [w for w in re.split(r"[^a-z]+", category["name"].lower()) if len(w) > 3]
        if any(w in lower for w in words):
            return category
    for pattern, keys in CATEGORY_HINTS:
        if re.search(pattern, text or "", re.I):
            hit = next((c for c in categories if any(k in c["name"].lower() for k in keys)), None)
            if hit:
                return hit
    misc = next((c for c in categories if c["name"].lower() == "miscellaneous"), None)
    return misc or (categories[0] if categories else None)


def current_user(user_id: str) -> CurrentUser | None:
    profile = _load_profile(user_id)
    if not profile:
        return None
    return CurrentUser(id=profile["id"], email=profile.get("email") or "", role=profile["role"], full_name=profile.get("full_name") or "")


def linked_user_id(db, chat_id: int) -> str | None:
    row = maybe_one(db.table("telegram_links").select("user_id").eq("chat_id", chat_id))
    return row["user_id"] if row else None


def open_draft(db, chat_id: int) -> dict | None:
    rows = db.table("telegram_drafts").select("*").eq("chat_id", chat_id).in_("state", ["awaiting_amount", "awaiting_site"]).order("created_at", desc=True).limit(1).execute().data
    return rows[0] if rows else None


def draft_for_message(db, chat_id: int, message_id: int) -> dict | None:
    rows = db.table("telegram_drafts").select("*").eq("chat_id", chat_id).eq("prompt_message_id", message_id).order("created_at", desc=True).limit(1).execute().data
    return rows[0] if rows else None


def update_draft(db, draft_id: str, **changes: Any) -> None:
    db.table("telegram_drafts").update(changes).eq("id", draft_id).execute()


def active_sites(db, user_id: str) -> list[dict]:
    return sorted(accessible_sites(db, user_id), key=lambda s: (s.get("name") or "").lower())


def draft_headline(draft: dict) -> str:
    parts = [f"<b>{format_inr(draft['amount'])}</b>"]
    if draft.get("paid_to"):
        parts.append(f"to {esc(draft['paid_to'])}")
    parts.append(f"on {format_day(draft['entry_date'])}")
    return " ".join(parts)


# ------------------------------------------------------------ conversation

def handle_update(update: dict) -> None:
    db = get_admin_client()
    if "callback_query" in update:
        handle_callback(db, update["callback_query"])
        return
    message = update.get("message")
    if not message or (message.get("chat") or {}).get("type") != "private":
        return
    handle_message(db, update["update_id"], message)


def handle_message(db, update_id: int, message: dict) -> None:
    chat_id = message["chat"]["id"]
    text = (message.get("text") or "").strip()

    if text.startswith("/start"):
        code = text.split(maxsplit=1)[1].strip() if " " in text else ""
        if code:
            link_chat(db, chat_id, code, message.get("from") or {})
            return

    user_id = linked_user_id(db, chat_id)
    if not user_id:
        send(chat_id, f"This chat isn't connected yet. Open {esc(brand())} → <b>Me → Telegram</b> and tap <b>Connect Telegram</b>.")
        return

    if text.startswith("/start") or text.startswith("/help"):
        send(chat_id, "Send me a screenshot of a UPI payment. I'll read the amount and date, ask which site it's for, and add it as an expense.\n\n/cancel stops the payment in progress.")
        return
    if text.startswith("/cancel"):
        draft = open_draft(db, chat_id)
        if draft:
            update_draft(db, draft["id"], state="cancelled")
            if draft.get("prompt_message_id"):
                edit(chat_id, draft["prompt_message_id"], "Cancelled.")
        send(chat_id, "Cancelled." if draft else "Nothing to cancel.")
        return

    image = image_of(message)
    if image:
        receive_screenshot(db, update_id, chat_id, user_id, message, *image)
        return

    draft = open_draft(db, chat_id)
    if draft and text:
        if draft["state"] == "awaiting_amount":
            receive_amount(db, chat_id, user_id, draft, text)
        else:
            receive_site_name(db, chat_id, user_id, draft, text)
        return
    send(chat_id, "Send me a screenshot of a UPI payment to add it as an expense.")


def image_of(message: dict) -> tuple[str, str] | None:
    if message.get("photo"):
        return message["photo"][-1]["file_id"], "image/jpeg"
    document = message.get("document") or {}
    if document.get("mime_type") in IMAGE_TYPES:
        return document["file_id"], document["mime_type"]
    return None


def link_chat(db, chat_id: int, code: str, sender: dict) -> None:
    now = datetime.now(timezone.utc)
    row = maybe_one(db.table("telegram_links").select("*").eq("link_code", code))
    if not row or not row.get("code_expires_at") or parse_ts(row["code_expires_at"]) < now:
        send(chat_id, f"That link has expired. Open {esc(brand())} → <b>Me → Telegram</b> and tap <b>Connect Telegram</b> again.")
        return
    # A chat belongs to one account at a time.
    db.table("telegram_links").update({"chat_id": None, "telegram_username": None, "linked_at": None}).eq("chat_id", chat_id).neq("user_id", row["user_id"]).execute()
    db.table("telegram_links").update({
        "chat_id": chat_id,
        "telegram_username": sender.get("username"),
        "linked_at": now.isoformat(),
        "link_code": None,
        "code_expires_at": None,
    }).eq("user_id", row["user_id"]).execute()
    user = current_user(row["user_id"])
    name = (user.full_name or user.email) if user else "your account"
    send(chat_id, f"Connected to {esc(brand())} as <b>{esc(name)}</b>.\n\nSend me a screenshot of a UPI payment and I'll add it as an expense.")


def receive_screenshot(db, update_id: int, chat_id: int, user_id: str, message: dict, file_id: str, mime_type: str) -> None:
    # Claim the update first: a retried webhook inserts nothing and stops here.
    claimed = db.table("telegram_drafts").upsert({
        "user_id": user_id,
        "chat_id": chat_id,
        "update_id": update_id,
        "file_id": file_id,
        "mime_type": mime_type,
        "entry_date": message_day(message["date"]).isoformat(),
        "date_source": "message",
        "state": "reading",
    }, on_conflict="update_id", ignore_duplicates=True).execute().data
    if not claimed:
        return
    draft = claimed[0]
    for stale in db.table("telegram_drafts").select("id,prompt_message_id").eq("chat_id", chat_id).in_("state", ["awaiting_amount", "awaiting_site"]).neq("id", draft["id"]).execute().data or []:
        update_draft(db, stale["id"], state="cancelled")
        if stale.get("prompt_message_id"):
            edit(chat_id, stale["prompt_message_id"], "Skipped: a newer screenshot replaced this one.")

    tg("sendChatAction", chat_id=chat_id, action="typing")
    ocr = read_screenshot(file_id)
    changes: dict[str, Any] = {
        "paid_to": (ocr.get("paid_to") or None) and str(ocr["paid_to"])[:120],
        "reference": (ocr.get("reference") or None) and str(ocr["reference"])[:120],
        "payment_method": ocr.get("payment_method") or "UPI",
        "ocr_text": (ocr.get("text") or "")[:4000] or None,
    }
    if ocr.get("entry_date"):
        try:
            changes["entry_date"] = date.fromisoformat(ocr["entry_date"]).isoformat()
            changes["date_source"] = "screenshot"
        except ValueError:
            pass
    amount = parse_amount(str(ocr["amount"])) if ocr.get("amount") else None
    draft.update(changes)
    if amount is None:
        changes["state"] = "awaiting_amount"
        sent = send(chat_id, "I couldn't read the amount from that screenshot. Please type it (e.g. 1250).")
        changes["prompt_message_id"] = (sent or {}).get("message_id")
        update_draft(db, draft["id"], **changes)
        return
    changes["amount"] = str(amount)
    draft["amount"] = str(amount)
    update_draft(db, draft["id"], **changes)
    ask_site(db, chat_id, user_id, draft)


def read_screenshot(file_id: str) -> dict:
    """Run the screenshot through the OCR service; {} when it can't be read."""
    settings = get_settings()
    ocr_url = settings.ocr_url
    if not ocr_url and os.environ.get("VERCEL_PROJECT_PRODUCTION_URL"):
        # On Vercel the OCR function is deployed alongside the API.
        ocr_url = f"https://{os.environ['VERCEL_PROJECT_PRODUCTION_URL']}/api/ocr"
    if not ocr_url:
        logger.warning("OCR_URL is not set; asking for the amount instead")
        return {}
    try:
        image = download_file(file_id)
        response = _http.post(ocr_url, content=image, headers={"Content-Type": "application/octet-stream", "X-Internal-Secret": settings.internal_api_secret or ""})
        response.raise_for_status()
        return response.json()
    except Exception as exc:  # OCR is best effort: the user can type the amount.
        logger.warning("Screenshot OCR failed: %s", exc)
        return {}


def receive_amount(db, chat_id: int, user_id: str, draft: dict, text: str) -> None:
    amount = parse_amount(text)
    if amount is None:
        send(chat_id, "That doesn't look like an amount. Please type just the number, e.g. 1250 or 1,250.50.")
        return
    draft["amount"] = str(amount)
    update_draft(db, draft["id"], amount=str(amount), state="awaiting_site")
    ask_site(db, chat_id, user_id, draft)


def ask_site(db, chat_id: int, user_id: str, draft: dict, sites: list[dict] | None = None, intro: str | None = None) -> None:
    sites = sites if sites is not None else active_sites(db, user_id)
    if not sites:
        update_draft(db, draft["id"], state="cancelled")
        send(chat_id, f"{draft_headline(draft)}\n\nYou don't have any active sites in {esc(brand())} yet, so I can't record this. Create a site in the app, then send the screenshot again.")
        return
    buttons = [[button(s["name"][:60], f"s:{s['id']}")] for s in sites[:MAX_SITE_BUTTONS]]
    buttons.append([button("Cancel", "x")])
    more = "\n\nOr type the site name." if len(sites) > MAX_SITE_BUTTONS else "\n\nTap a site, or type its name."
    sent = send(chat_id, f"{intro or draft_headline(draft)}\n\n<b>Which site is this for?</b>{more}", buttons)
    update_draft(db, draft["id"], state="awaiting_site", prompt_message_id=(sent or {}).get("message_id"))


def receive_site_name(db, chat_id: int, user_id: str, draft: dict, text: str) -> None:
    sites = active_sites(db, user_id)
    needle = text.lower().strip()
    matches = [s for s in sites if (s.get("name") or "").lower() == needle]
    if not matches:
        matches = [s for s in sites if needle in (s.get("name") or "").lower()]
    if not matches:
        names = {(s.get("name") or "").lower(): s for s in sites}
        matches = [names[n] for n in difflib.get_close_matches(needle, list(names), n=5, cutoff=0.6)]
    if len(matches) == 1:
        if draft.get("prompt_message_id"):
            edit(chat_id, draft["prompt_message_id"], f"{draft_headline(draft)}\n\nSite: <b>{esc(matches[0]['name'])}</b>")
        sent = send(chat_id, "Saving…")
        save_entry(db, chat_id, user_id, draft, matches[0]["id"], (sent or {}).get("message_id"))
        return
    if matches:
        ask_site(db, chat_id, user_id, draft, matches, f"A few sites match “{esc(text)}”.")
        return
    ask_site(db, chat_id, user_id, draft, intro=f"I couldn't find a site called “{esc(text)}”.")


def save_entry(db, chat_id: int, user_id: str, draft: dict, site_id: str, message_id: int | None) -> None:
    def reply(text: str, buttons: list[list[dict]] | None = None) -> None:
        if message_id:
            edit(chat_id, message_id, text, buttons)
        else:
            send(chat_id, text, buttons)

    user = current_user(user_id)
    try:
        if not user:
            raise HTTPException(status_code=403, detail="Profile is not configured")
        site = ensure_site_access(site_id, user)
        ensure_site_active(site)
    except HTTPException as exc:
        reply(f"{draft_headline(draft)}\n\nCouldn't use that site: {esc(exc.detail)}")
        return

    # Only one press of the button gets to save the entry.
    claimed = db.table("telegram_drafts").update({"state": "done", "site_id": site_id, "prompt_message_id": message_id}).eq("id", draft["id"]).eq("state", "awaiting_site").execute().data
    if not claimed:
        return
    category = suggest_category(f"{draft.get('paid_to') or ''}\n{draft.get('ocr_text') or ''}", expense_categories(db, site))
    if not category:
        update_draft(db, draft["id"], state="awaiting_site")
        reply(f"{draft_headline(draft)}\n\n{esc(site['name'])} has no expense categories. Add one in the app and try again.")
        return
    try:
        entry = insert_ledger_entry(db, site, user.id, LedgerCreate(
            entry_type="expense",
            category_id=category["id"],
            amount=Decimal(str(draft["amount"])),
            entry_date=date.fromisoformat(draft["entry_date"]),
            paid_to=draft.get("paid_to"),
            description="Added via Telegram",
            payment_method=(draft.get("payment_method") or "UPI")[:40],
            reference=draft.get("reference"),
        ))
    except Exception:
        logger.exception("Saving Telegram entry failed")
        update_draft(db, draft["id"], state="awaiting_site")
        reply(f"{draft_headline(draft)}\n\nSomething went wrong saving this. Please try the site again.", [[button(site["name"][:60], f"s:{site_id}")], [button("Cancel", "x")]])
        return
    update_draft(db, draft["id"], ledger_entry_id=entry["id"])
    store_screenshot(db, draft, site_id, user.id, entry["id"])
    draft.update({"ledger_entry_id": entry["id"], "site_id": site_id})
    reply(summary_text(draft, site, category), summary_buttons())


def store_screenshot(db, draft: dict, site_id: str, user_id: str, entry_id: str) -> None:
    """Keep the screenshot as the entry's receipt. Best effort: the entry stands without it."""
    try:
        content = download_file(draft["file_id"])
        ext = "png" if draft.get("mime_type") == "image/png" else "jpg"
        file_name = f"telegram-{draft['entry_date']}.{ext}"
        path = f"{site_id}/{entry_id}/{datetime.now(timezone.utc).timestamp()}-{file_name}"
        db.storage.from_("receipts").upload(path, content, {"content-type": draft.get("mime_type") or "image/jpeg"})
        attach_receipt(db, site_id=site_id, user_id=user_id, ledger_entry_id=entry_id, storage_path=path, file_name=file_name, mime_type=draft.get("mime_type"), file_size=len(content))
    except Exception:
        logger.exception("Storing Telegram screenshot failed")


def summary_text(draft: dict, site: dict, category: dict) -> str:
    source = "from screenshot" if draft.get("date_source") == "screenshot" else "date sent"
    lines = [
        f"✅ Added expense to <b>{esc(site['name'])}</b>",
        "",
        f"Amount: <b>{format_inr(draft['amount'])}</b>",
        f"Date: {format_day(draft['entry_date'])} ({source})",
    ]
    if draft.get("paid_to"):
        lines.append(f"Paid to: {esc(draft['paid_to'])}")
    lines.append(f"Category: {esc(category['name'])}")
    if draft.get("reference"):
        lines.append(f"UTR: <code>{esc(draft['reference'])}</code>")
    return "\n".join(lines)


def summary_buttons() -> list[list[dict]]:
    return [[button("Change category", "c"), button("Undo", "u")]]


def handle_callback(db, query: dict) -> None:
    tg("answerCallbackQuery", callback_query_id=query["id"])
    message = query.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    message_id = message.get("message_id")
    data = query.get("data") or ""
    if not chat_id or not message_id:
        return
    user_id = linked_user_id(db, chat_id)
    draft = draft_for_message(db, chat_id, message_id)
    if not user_id or not draft or draft["user_id"] != user_id:
        edit(chat_id, message_id, "This message is out of date. Send the screenshot again.")
        return

    if data == "x":
        if draft["state"] in ("awaiting_amount", "awaiting_site"):
            update_draft(db, draft["id"], state="cancelled")
            edit(chat_id, message_id, "Cancelled.")
        return
    if data.startswith("s:"):
        if draft["state"] == "awaiting_site":
            edit(chat_id, message_id, "Saving…")
            save_entry(db, chat_id, user_id, draft, data[2:], message_id)
        return
    if draft["state"] != "done" or not draft.get("ledger_entry_id"):
        return
    entry, site = editable_entry(db, draft, user_id)
    if not entry:
        edit(chat_id, message_id, "This entry can no longer be changed here. Open the app to edit it.")
        return
    if data == "u":
        db.table("ledger_entries").update({"deleted_at": datetime.now(timezone.utc).isoformat(), "updated_by": user_id}).eq("id", entry["id"]).execute()
        record_audit(db, site_id=site["id"], actor_id=user_id, action="ledger_entry_deleted", entity_type="ledger_entry", entity_id=entry["id"], description="Undid expense added via Telegram")
        update_draft(db, draft["id"], state="cancelled")
        edit(chat_id, message_id, f"Undone: {format_inr(draft['amount'])} removed from <b>{esc(site['name'])}</b>.")
        return
    categories = expense_categories(db, site)
    if data == "c":
        rows = [[button(("• " if c["id"] == entry["category_id"] else "") + c["name"][:40], f"k:{c['id']}")] for c in categories[:20]]
        rows.append([button("Back", "b")])
        edit(chat_id, message_id, f"{draft_headline(draft)}\n\n<b>Pick a category:</b>", rows)
        return
    current = next((c for c in categories if c["id"] == entry["category_id"]), {"name": "—"})
    if data.startswith("k:"):
        chosen = next((c for c in categories if c["id"] == data[2:]), None)
        if chosen and chosen["id"] != entry["category_id"]:
            db.table("ledger_entries").update({"category_id": chosen["id"], "updated_by": user_id}).eq("id", entry["id"]).execute()
            record_audit(db, site_id=site["id"], actor_id=user_id, action="ledger_entry_updated", entity_type="ledger_entry", entity_id=entry["id"], description=f"Changed category to {chosen['name']} via Telegram", metadata={"before": {"category": current["name"]}, "after": {"category": chosen["name"]}})
            current = chosen
    edit(chat_id, message_id, summary_text(draft, site, current), summary_buttons())


def editable_entry(db, draft: dict, user_id: str) -> tuple[dict | None, dict | None]:
    entry = maybe_one(db.table("ledger_entries").select("*").eq("id", draft["ledger_entry_id"]).is_("deleted_at", "null"))
    if not entry:
        return None, None
    site = maybe_one(db.table("sites").select("*").eq("id", entry["site_id"]))
    if not site or site.get("status") == "archived":
        return None, None
    created = parse_ts(entry["created_at"])
    in_window = entry["created_by"] == user_id and datetime.now(timezone.utc) - created < EDIT_WINDOW
    if not in_window and site["owner_id"] != user_id:
        return None, None
    return entry, site


# ------------------------------------------------------------------ endpoints

@link_router.get("/link")
def read_link(user: User):
    row = maybe_one(get_admin_client().table("telegram_links").select("chat_id,telegram_username,linked_at").eq("user_id", user.id))
    linked = bool(row and row.get("chat_id"))
    return {
        "linked": linked,
        "username": row.get("telegram_username") if linked else None,
        "linked_at": row.get("linked_at") if linked else None,
        "bot_username": bot_username(),
    }


@link_router.post("/link")
def create_link(user: User):
    username = bot_username()
    if not username:
        raise HTTPException(status_code=503, detail="The Telegram bot is not reachable right now")
    code = secrets.token_urlsafe(12)
    get_admin_client().table("telegram_links").upsert({
        "user_id": user.id,
        "link_code": code,
        "code_expires_at": (datetime.now(timezone.utc) + LINK_CODE_TTL).isoformat(),
    }, on_conflict="user_id").execute()
    return {"url": f"https://t.me/{username}?start={code}", "expires_in": int(LINK_CODE_TTL.total_seconds())}


@link_router.delete("/link")
def delete_link(user: User):
    get_admin_client().table("telegram_links").update({"chat_id": None, "telegram_username": None, "linked_at": None, "link_code": None, "code_expires_at": None}).eq("user_id", user.id).execute()
    return {"linked": False}


@router.post("/webhook")
async def webhook(request: Request, x_telegram_bot_api_secret_token: Annotated[str | None, Header()] = None):
    expected = get_settings().telegram_webhook_secret
    if not expected or not secrets.compare_digest(x_telegram_bot_api_secret_token or "", expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad webhook secret")
    if not is_enabled(FEATURE_TELEGRAM):
        return {"ok": True}
    update = await request.json()
    try:
        # Sync DB/HTTP work: run it off the event loop.
        await run_in_threadpool(handle_update, update)
    except Exception:
        # Always 200: a failing update would otherwise be retried forever.
        logger.exception("Telegram update %s failed", update.get("update_id"))
    return {"ok": True}
