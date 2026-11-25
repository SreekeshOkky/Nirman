from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from test_api import BUILDER, SITE, _FakeDB, feature_flags_env  # noqa: F401 (fixture); also sets the test env
from api.config import get_settings
from api.bot import app as bot_app
from api.main import app
import api.dependencies as dependencies
import api.telegram as telegram

CHAT = 777
# 2026-10-22 20:00 UTC is already 23 Oct in India.
SENT_AT = int(datetime(2026, 10, 22, 20, 0, tzinfo=timezone.utc).timestamp())
MISC, MATERIALS = "00000000-0000-4000-8000-00000000000a", "00000000-0000-4000-8000-00000000000b"
CATEGORIES = [
    {"id": "00000000-0000-4000-8000-00000000000a", "site_id": "site-1", "name": "Miscellaneous", "type": "expense", "is_active": True},
    {"id": "00000000-0000-4000-8000-00000000000b", "site_id": "site-1", "name": "Materials", "type": "expense", "is_active": True},
    {"id": "00000000-0000-4000-8000-00000000000c", "site_id": "site-1", "name": "Client payment", "type": "income", "is_active": True},
    {"id": "00000000-0000-4000-8000-00000000000d", "site_id": "site-2", "name": "Miscellaneous", "type": "expense", "is_active": True},
]
OTHER_SITE = {"id": "site-2", "owner_id": "builder-1", "name": "Villa Kochi", "status": "active"}


class _Bucket:
    def __init__(self, db):
        self.db = db

    def upload(self, path, content, _options):
        self.db.uploads.append(path)


class _Storage:
    def __init__(self, db):
        self.db = db

    def from_(self, _bucket):
        return _Bucket(self.db)


@pytest.fixture
def bot(monkeypatch, feature_flags_env):
    feature_flags_env("")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "hook-secret")
    monkeypatch.setenv("OCR_URL", "http://ocr.test")
    get_settings.cache_clear()
    dependencies._profiles.clear()
    calls = []
    ocr = {"result": {"amount": 1250, "entry_date": "2026-10-21", "paid_to": "Ramesh Cement Traders", "reference": "123456789012", "payment_method": "UPI", "text": "Paid to Ramesh Cement Traders"}}

    def fake_tg(method, **params):
        calls.append((method, params))
        if method == "sendMessage":
            return {"message_id": 100 + len(calls)}
        return True

    db = _FakeDB({
        "profiles": [BUILDER],
        "sites": [SITE, OTHER_SITE],
        "categories": CATEGORIES,
        "telegram_links": [{"user_id": "builder-1", "chat_id": CHAT}],
    })
    db.storage = _Storage(db)
    db.uploads = []
    monkeypatch.setattr(dependencies, "get_admin_client", lambda: db)
    monkeypatch.setattr(telegram, "get_admin_client", lambda: db)
    monkeypatch.setattr(telegram, "tg", fake_tg)
    monkeypatch.setattr(telegram, "download_file", lambda _id: b"img")
    monkeypatch.setattr(telegram, "read_screenshot", lambda _id: dict(ocr["result"]))

    class Bot:
        pass

    b = Bot()
    b.db, b.calls, b.ocr = db, calls, ocr
    b.sent = lambda: [p for m, p in calls if m in ("sendMessage", "editMessageText")]
    b.last_text = lambda: b.sent()[-1]["text"]
    yield b
    get_settings.cache_clear()


def photo(update_id, chat=CHAT):
    return {"update_id": update_id, "message": {"message_id": 1, "date": SENT_AT, "chat": {"id": chat, "type": "private"}, "photo": [{"file_id": "small"}, {"file_id": "big"}]}}


def text(update_id, body, chat=CHAT):
    return {"update_id": update_id, "message": {"message_id": 2, "date": SENT_AT, "chat": {"id": chat, "type": "private"}, "text": body, "from": {"username": "ramu"}}}


def press(data, message_id):
    return {"update_id": 999, "callback_query": {"id": "cb", "data": data, "message": {"message_id": message_id, "chat": {"id": CHAT}}}}


def prompt_id(bot):
    return bot.db.tables["telegram_drafts"][-1]["prompt_message_id"]


def test_webhook_rejects_a_bad_secret(bot):
    client = TestClient(app)
    assert client.post("/api/telegram/webhook", json=photo(1)).status_code == 401
    assert client.post("/api/telegram/webhook", json=photo(1), headers={"X-Telegram-Bot-Api-Secret-Token": "nope"}).status_code == 401
    ok = client.post("/api/telegram/webhook", json=text(1, "/help"), headers={"X-Telegram-Bot-Api-Secret-Token": "hook-secret"})
    assert ok.status_code == 200


def test_bot_function_serves_only_the_webhook(bot):
    paths = {route.path for route in bot_app.routes}
    assert "/api/telegram/webhook" in paths
    assert "/api/telegram/link" not in paths and "/api/sites" not in paths

    client = TestClient(bot_app)
    assert client.post("/api/telegram/webhook", json=photo(1)).status_code == 401
    ok = client.post("/api/telegram/webhook", json=text(1, "/help"), headers={"X-Telegram-Bot-Api-Secret-Token": "hook-secret"})
    assert ok.status_code == 200
    assert "Send me a screenshot" in bot.last_text()


def test_start_code_links_the_chat(bot):
    expires = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    bot.db.tables["telegram_links"] = [{"user_id": "builder-1", "chat_id": None, "link_code": "abc", "code_expires_at": expires}]
    telegram.handle_update(text(1, "/start abc", chat=555))

    link = bot.db.tables["telegram_links"][0]
    assert link["chat_id"] == 555 and link["telegram_username"] == "ramu" and link["link_code"] is None
    assert "Connected" in bot.last_text()


def test_expired_code_does_not_link(bot):
    expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    bot.db.tables["telegram_links"] = [{"user_id": "builder-1", "chat_id": None, "link_code": "abc", "code_expires_at": expired}]
    telegram.handle_update(text(1, "/start abc", chat=555))

    assert bot.db.tables["telegram_links"][0]["chat_id"] is None
    assert "expired" in bot.last_text()


def test_unlinked_chat_is_told_how_to_connect(bot):
    telegram.handle_update(photo(1, chat=4242))
    assert "isn't connected" in bot.last_text()
    assert "telegram_drafts" not in bot.db.tables


def test_screenshot_then_site_button_adds_expense(bot):
    telegram.handle_update(photo(1))
    draft = bot.db.tables["telegram_drafts"][0]
    assert draft["state"] == "awaiting_site" and draft["entry_date"] == "2026-10-21" and draft["date_source"] == "screenshot"
    assert "Which site" in bot.last_text() and "₹1,250" in bot.last_text()

    telegram.handle_update(press("s:site-1", prompt_id(bot)))
    entry = bot.db.tables["ledger_entries"][0]
    assert entry["entry_type"] == "expense" and entry["site_id"] == "site-1" and float(entry["amount"]) == 1250
    assert entry["entry_date"] == "2026-10-21" and entry["paid_to"] == "Ramesh Cement Traders"
    # "cement" hints at Materials.
    assert entry["category_id"] == MATERIALS
    assert bot.db.tables["attachments"][0]["ledger_entry_id"] == entry["id"]
    assert bot.db.uploads[0].startswith("site-1/")
    assert "Added expense" in bot.last_text() and "from screenshot" in bot.last_text()

    # A second press of the same button doesn't add it twice.
    telegram.handle_update(press("s:site-1", prompt_id(bot)))
    assert len(bot.db.tables["ledger_entries"]) == 1


def test_missing_date_falls_back_to_message_day_in_india(bot):
    bot.ocr["result"]["entry_date"] = None
    telegram.handle_update(photo(1))
    draft = bot.db.tables["telegram_drafts"][0]
    assert draft["entry_date"] == "2026-10-23" and draft["date_source"] == "message"


def test_unread_amount_is_asked_for(bot):
    bot.ocr["result"]["amount"] = None
    telegram.handle_update(photo(1))
    assert bot.db.tables["telegram_drafts"][0]["state"] == "awaiting_amount"
    assert "couldn't read the amount" in bot.last_text()

    telegram.handle_update(text(2, "twelve"))
    assert "doesn't look like an amount" in bot.last_text()

    telegram.handle_update(text(3, "₹1,250.50"))
    draft = bot.db.tables["telegram_drafts"][0]
    assert draft["amount"] == "1250.50" and draft["state"] == "awaiting_site"
    assert "Which site" in bot.last_text()


def test_typed_site_name_is_fuzzy_matched(bot):
    telegram.handle_update(photo(1))
    telegram.handle_update(text(2, "vila kochi"))
    assert bot.db.tables["ledger_entries"][0]["site_id"] == "site-2"


def test_repeated_update_is_ignored(bot):
    telegram.handle_update(photo(1))
    telegram.handle_update(photo(1))
    assert len(bot.db.tables["telegram_drafts"]) == 1


def test_undo_and_change_category(bot):
    telegram.handle_update(photo(1))
    telegram.handle_update(press("s:site-1", prompt_id(bot)))
    entry = bot.db.tables["ledger_entries"][0]

    telegram.handle_update(press("c", prompt_id(bot)))
    telegram.handle_update(press(f"k:{MISC}", prompt_id(bot)))
    assert entry["category_id"] == MISC

    telegram.handle_update(press("u", prompt_id(bot)))
    assert entry["deleted_at"] is not None
    assert "Undone" in bot.last_text()


def test_supervisor_cannot_undo_after_the_window(bot):
    supervisor = {"id": "super-1", "email": "s@example.com", "role": "supervisor", "full_name": "Sup"}
    bot.db.tables["profiles"].append(supervisor)
    bot.db.tables["site_members"] = [{"id": "m-1", "site_id": "site-1", "user_id": "super-1"}]
    bot.db.tables["telegram_links"] = [{"user_id": "super-1", "chat_id": CHAT}]
    telegram.handle_update(photo(1))
    telegram.handle_update(press("s:site-1", prompt_id(bot)))
    entry = bot.db.tables["ledger_entries"][0]
    entry["created_at"] = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()

    telegram.handle_update(press("u", prompt_id(bot)))
    assert entry.get("deleted_at") is None
    assert "can no longer be changed" in bot.last_text()


def test_format_inr_uses_indian_grouping():
    assert telegram.format_inr("1250000") == "₹12,50,000"
    assert telegram.format_inr("825.5") == "₹825.50"
    assert telegram.format_inr("400") == "₹400"
