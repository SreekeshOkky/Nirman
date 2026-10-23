import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHeading, getInitials } from "../components/Shared";
import { api } from "../lib/api";

const formatTime = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};
export default function ActivityPage({ token }) {
  const [audit, setAudit] = useState([]);
  useEffect(() => {
    let cancelled = false;
    api
      .workspaceAudit(token)
      .then((result) => {
        if (!cancelled && result.items) setAudit(result.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  return (
    <>
      <PageHeading
        title="Activity log"
        subtitle="A record of every change across your sites. It can’t be edited or deleted."
      />
      <div className="collection activity-card">
        <div className="card-head">
          <div>
            <h2>Audit history</h2>
            <p>Every important change is recorded.</p>
          </div>
          <span className="secure-label">
            <ShieldCheck size={14} aria-hidden="true" /> Builder only
          </span>
        </div>
        <div className="activity-list">
          {audit.map((item) => (
            <div className="activity-item" key={item.id}>
              <div className="avatar" aria-hidden="true">
                {getInitials(item.profiles?.full_name) ||
                  getInitials(item.actor) ||
                  item.profiles?.email?.[0]?.toUpperCase() ||
                  "?"}
              </div>
              <div className="activity-copy">
                <div>
                  <strong>{item.action}</strong>
                  <time className="figure" dateTime={item.created_at}>
                    {formatTime(item.created_at)}
                  </time>
                </div>
                <span>{item.description}</span>
                <small>
                  {item.sites?.name ? `${item.sites.name} · ` : ""}by{" "}
                  {item.profiles?.full_name || item.actor || "You"}
                </small>
              </div>
            </div>
          ))}
          {!audit.length && (
            <div className="empty-state">No activity recorded yet.</div>
          )}
        </div>
      </div>
    </>
  );
}
