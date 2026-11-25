"""Run the Telegram bot without a public webhook URL (local Docker/dev):

    python -m api.telegram_poll

It removes any webhook (Telegram allows one delivery mode at a time), then
long-polls for updates and hands each to the same handler the webhook uses.
Run scripts/setup_telegram.py again afterwards to switch back to the webhook.
"""

from __future__ import annotations

import logging
import time

from .config import get_settings
from .telegram import handle_update, tg

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("nirmanam.telegram.poll")


def main() -> None:
    if not get_settings().telegram_bot_token:
        raise SystemExit("TELEGRAM_BOT_TOKEN is not set")
    tg("deleteWebhook")
    me = tg("getMe") or {}
    logger.info("Polling as @%s (Ctrl+C to stop)", me.get("username"))
    offset = None
    while True:
        try:
            updates = tg("getUpdates", offset=offset, timeout=50, allowed_updates=["message", "callback_query"]) or []
        except Exception as exc:
            logger.warning("getUpdates failed: %s", exc)
            time.sleep(3)
            continue
        for update in updates:
            offset = update["update_id"] + 1
            try:
                handle_update(update)
            except Exception:
                logger.exception("Update %s failed", update.get("update_id"))


if __name__ == "__main__":
    main()
