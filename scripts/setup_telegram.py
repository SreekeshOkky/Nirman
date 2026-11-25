#!/usr/bin/env python3
"""Configure the Telegram bot for this deployment.

Create the bot first: message @BotFather on Telegram, send /newbot, and copy
the token it gives you. Then:

  # Local (Docker): store the token + generated secrets in .env
  TELEGRAM_BOT_TOKEN=123:abc python3 scripts/setup_telegram.py --write-env

  # Cloud: point Telegram at the deployed webhook
  TELEGRAM_BOT_TOKEN=123:abc TELEGRAM_WEBHOOK_SECRET=... \
    python3 scripts/setup_telegram.py --webhook-url https://acme.vercel.app

Prints the bot's @username (set it as TELEGRAM_BOT_USERNAME). Never commit the
token: it lives only in .env or the platform's env vars.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import secrets
import sys
import urllib.request

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def call(token: str, method: str, **params) -> dict:
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(params).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.load(response)
    except urllib.error.HTTPError as exc:
        data = json.load(exc)
    if not data.get("ok"):
        sys.exit(f"Telegram {method} failed: {data.get('description')}")
    return data["result"]


def read_env() -> dict[str, str]:
    values = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value
    return values


def write_env(updates: dict[str, str]) -> None:
    lines = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    kept = [line for line in lines if line.split("=", 1)[0].strip() not in updates]
    kept += [f"{key}={value}" for key, value in updates.items()]
    ENV_FILE.write_text("\n".join(kept) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--webhook-url", help="deployed app URL; registers <url>/api/telegram/webhook")
    parser.add_argument("--write-env", action="store_true", help="save token, username and generated secrets to .env")
    args = parser.parse_args()

    env = read_env()
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or env.get("TELEGRAM_BOT_TOKEN")
    if not token:
        sys.exit("Set TELEGRAM_BOT_TOKEN (from @BotFather).")

    me = call(token, "getMe")
    username = me["username"]
    print(f"· Bot: @{username}")

    webhook_secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET") or env.get("TELEGRAM_WEBHOOK_SECRET") or secrets.token_hex(24)
    internal_secret = os.environ.get("INTERNAL_API_SECRET") or env.get("INTERNAL_API_SECRET") or secrets.token_hex(24)

    if args.write_env:
        write_env({
            "TELEGRAM_BOT_TOKEN": token,
            "TELEGRAM_BOT_USERNAME": username,
            "TELEGRAM_WEBHOOK_SECRET": webhook_secret,
            "INTERNAL_API_SECRET": internal_secret,
        })
        print(f"· Saved Telegram settings to {ENV_FILE.name}")

    call(token, "setMyCommands", commands=[
        {"command": "help", "description": "How to add a payment"},
        {"command": "cancel", "description": "Stop the payment in progress"},
    ])

    if args.webhook_url:
        url = args.webhook_url.rstrip("/") + "/api/telegram/webhook"
        call(token, "setWebhook", url=url, secret_token=webhook_secret, allowed_updates=["message", "callback_query"], drop_pending_updates=True)
        info = call(token, "getWebhookInfo")
        print(f"· Webhook: {info.get('url')}")
        if info.get("last_error_message"):
            print(f"! Last webhook error: {info['last_error_message']}")
    else:
        print("· No --webhook-url given: run `python -m api.telegram_poll` (or the Docker `bot` service) to receive messages.")


if __name__ == "__main__":
    main()
