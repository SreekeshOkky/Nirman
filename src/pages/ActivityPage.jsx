import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHeading, getInitials } from "../components/Shared";
import { api } from "../lib/api";
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
        subtitle="Immutable history across all your sites."
      />
      <div className="card activity-card full-card">
        <div className="card-head">
          <div>
            <h2>Audit history</h2>
            <p>Every important change is recorded.</p>
          </div>
          <span className="secure-label">
            <ShieldCheck size={14} /> Builder only
          </span>
        </div>
        <div className="activity-list">
          {audit.map((item) => (
            <div className="activity-item" key={item.id}>
              <div className="avatar avatar-dark">
                {getInitials(item.profiles?.full_name) ||
                  getInitials(item.actor) ||
                  "RK"}
              </div>
              <div className="activity-copy">
                <div>
                  <strong>{item.action}</strong>
                  <time>{item.created_at}</time>
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
