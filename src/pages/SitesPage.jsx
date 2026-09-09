import React, { useState } from "react";
import { Archive, Building2, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { money, PageHeading } from "../components/Shared";
import SiteModal from "../components/SiteModal";
import SiteStatusModal from "../components/SiteStatusModal";
import { api } from "../lib/api";
export default function SitesPage({
  sites,
  setSites,
  setSiteId,
  siteId,
  token,
  flash,
  isBuilder,
}) {
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("active");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const archivedCount = sites.filter(
    (site) => site.status === "archived",
  ).length;
  const visible = sites.filter((site) =>
    filter === "archived"
      ? site.status === "archived"
      : site.status !== "archived",
  );
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const data = {
        name: form.get("name"),
        location: form.get("location"),
        client_name: form.get("client_name"),
        budget: Number(form.get("budget")) || null,
      };
      const site = await api.createSite(data, token);
      setSites((current) => [...current, site]);
      setSiteId(site.id);
      setShow(false);
      flash("Site created");
      navigate("/");
    } finally {
      setSaving(false);
    }
  }
  async function handleConfirm() {
    if (!confirmTarget) return;
    setBusy(true);
    try {
      const { site, action } = confirmTarget;
      const updated =
        action === "archive"
          ? await api.archiveSite(site.id, token)
          : await api.activateSite(site.id, token);
      setSites((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (action === "archive" && site.id === siteId) {
        const next = sites.find(
          (item) => item.id !== site.id && item.status !== "archived",
        );
        setSiteId(next ? next.id : null);
      }
      flash(
        action === "archive"
          ? `${site.name} marked inactive`
          : `${site.name} reactivated`,
      );
      setConfirmTarget(null);
    } catch (error) {
      flash(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Sites"
        subtitle="Your construction projects, in one place."
      >
        {isBuilder && (
          <button className="primary-button" onClick={() => setShow(true)}>
            <Plus size={17} /> New site
          </button>
        )}
      </PageHeading>
      <div className="card collection-card">
        <div className="collection-head">
          <div>
            <h2>Your construction sites</h2>
            <p>
              {visible.length} workspace{visible.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="site-filter-head">
            <div className="type-toggle site-filter">
              <label>
                <input
                  type="radio"
                  name="site-filter"
                  value="active"
                  checked={filter === "active"}
                  onChange={(event) => setFilter(event.target.value)}
                />
                <span>Active</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="site-filter"
                  value="archived"
                  checked={filter === "archived"}
                  onChange={(event) => setFilter(event.target.value)}
                />
                <span>
                  Inactive{archivedCount ? ` (${archivedCount})` : ""}
                </span>
              </label>
            </div>
            <span className="secure-label">
              <ShieldCheck size={14} /> RLS protected
            </span>
          </div>
        </div>
        {visible.length ? (
          <div className="site-grid">
            {visible.map((site) => {
              const archived = site.status === "archived";
              return (
                <div
                  className={`site-card ${archived ? "archived" : ""}`}
                  key={site.id}
                >
                  {archived ? (
                    <div className="site-card-main">
                      <CardBody site={site} archived />
                    </div>
                  ) : (
                    <button
                      className="site-card-main"
                      onClick={() => {
                        setSiteId(site.id);
                        navigate("/reports");
                      }}
                    >
                      <CardBody site={site} />
                    </button>
                  )}
                  {isBuilder &&
                    (archived ? (
                      <button
                        className="secondary-button site-status-action"
                        onClick={() =>
                          setConfirmTarget({ site, action: "activate" })
                        }
                      >
                        <RotateCcw size={14} /> Reactivate
                      </button>
                    ) : (
                      <button
                        className="secondary-button site-status-action"
                        onClick={() =>
                          setConfirmTarget({ site, action: "archive" })
                        }
                      >
                        <Archive size={14} /> Mark inactive
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            {filter === "archived"
              ? "No inactive sites."
              : "No sites yet. Create your first construction site."}
          </div>
        )}
      </div>
      {show && (
        <SiteModal
          onClose={() => setShow(false)}
          onSubmit={submit}
          saving={saving}
        />
      )}
      {confirmTarget && (
        <SiteStatusModal
          site={confirmTarget.site}
          action={confirmTarget.action}
          token={token}
          busy={busy}
          onClose={() => setConfirmTarget(null)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}

function CardBody({ site, archived = false }) {
  return (
    <>
      <div className="site-card-top">
        <span className="site-icon">
          <Building2 size={18} />
        </span>
        <span className={`status-tag ${archived ? "archived" : "active"}`}>
          {archived ? "inactive" : site.status || "active"}
        </span>
      </div>
      <h3>{site.name}</h3>
      <p>{site.location || "Location not added"}</p>
      <div className="site-card-foot">
        <span>Budget</span>
        <strong>{site.budget ? money(site.budget) : "Not set"}</strong>
      </div>
    </>
  );
}
