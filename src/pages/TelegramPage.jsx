import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Send, Unlink } from "lucide-react";
import { PageHeading } from "../components/Shared";
import { api } from "../lib/api";
import { brand } from "../lib/brand";

// After "Connect", check every few seconds until the bot confirms the link.
const POLL_MS = 3000;
const POLL_FOR_MS = 3 * 60 * 1000;

export default function TelegramPage({ token, flash }) {
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef(null);

  async function refresh() {
    try {
      const next = await api.telegramLink(token);
      setLink(next);
      return next;
    } catch (error) {
      flash(error.message);
      return null;
    }
  }

  function stopPolling() {
    clearInterval(pollRef.current);
    pollRef.current = null;
    setWaiting(false);
  }

  useEffect(() => {
    refresh();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function connect() {
    // Open the tab synchronously so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const { url } = await api.createTelegramLink(token);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setWaiting(true);
      const started = Date.now();
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const next = await refresh();
        if (next?.linked) {
          stopPolling();
          flash("Telegram connected");
        } else if (Date.now() - started > POLL_FOR_MS) {
          stopPolling();
        }
      }, POLL_MS);
    } catch (error) {
      tab?.close();
      flash(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.deleteTelegramLink(token);
      await refresh();
      flash("Telegram disconnected");
    } catch (error) {
      flash(error.message);
    } finally {
      setBusy(false);
    }
  }

  const botName = link?.bot_username ? `@${link.bot_username}` : "the bot";

  return (
    <>
      <PageHeading
        title="Telegram"
        subtitle="Add expenses by sending UPI payment screenshots."
      />
      <div className="settings-grid">
        <div className="form-card">
          <h2>Your Telegram</h2>
          {!link ? (
            <p className="settings-copy">Checking…</p>
          ) : link.linked ? (
            <>
              <p className="settings-copy">
                <CheckCircle2 size={16} aria-hidden="true" /> Connected
                {link.username ? (
                  <>
                    {" "}
                    as <strong>@{link.username}</strong>
                  </>
                ) : null}
                . Screenshots you send to {botName} are added to your sites.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={disconnect}
                disabled={busy}
              >
                <Unlink size={16} /> Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="settings-copy">
                Connect once and Telegram opens a chat with {botName}. Tap{" "}
                <strong>Start</strong> there to finish.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={connect}
                disabled={busy}
              >
                <Send size={16} /> {busy ? "Opening…" : "Connect Telegram"}
              </button>
              {waiting && (
                <p className="field-hint">
                  Waiting for you to tap Start in Telegram…{" "}
                  <button
                    type="button"
                    className="text-link"
                    onClick={refresh}
                  >
                    Check again
                  </button>
                </p>
              )}
            </>
          )}
        </div>
        <div className="form-card">
          <h2>How it works</h2>
          <ol className="settings-copy">
            <li>Pay as usual with any UPI app and take a screenshot.</li>
            <li>
              Send the screenshot to {botName}. It reads the amount, who you
              paid and the date. If it can't find a date, it uses the day you
              sent it.
            </li>
            <li>
              Pick the site. The payment is added to {brand.name} as an expense
              with the screenshot attached, and you can change the category or
              undo it right from the chat.
            </li>
          </ol>
          {link?.bot_username && (
            <a
              className="secondary-button"
              href={`https://t.me/${link.bot_username}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} /> Open {botName}
            </a>
          )}
        </div>
      </div>
    </>
  );
}
