import React from "react";
import { Building2, ChevronRight } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";

// Target of the "Add" button when no site is open: go straight to the only
// active site, or ask which site the payment is for. A screenshot shared from
// a UPI app arrives with ?shared=1; the ledger picks the file up itself, so
// the empty add form is not opened in that case.
export default function AddEntryPage({ activeSites, sitesLoading }) {
  const [params] = useSearchParams();
  const suffix = params.get("shared") === "1" ? "" : "?add=1";

  if (sitesLoading) return <div className="auth-loading">Loading...</div>;
  if (activeSites.length === 1)
    return <Navigate to={`/sites/${activeSites[0].id}${suffix}`} replace />;

  return (
    <>
      <div className="home-heading">
        <h1>Which site is this for?</h1>
      </div>
      {activeSites.length ? (
        <div className="card menu-card">
          {activeSites.map((site) => (
            <Link
              key={site.id}
              to={`/sites/${site.id}${suffix}`}
              className="menu-row"
            >
              <span className="menu-row-icon">
                <Building2 size={19} />
              </span>
              <span className="menu-row-text">
                <strong>{site.name}</strong>
                {site.location && <span>{site.location}</span>}
              </span>
              <ChevronRight size={18} className="menu-row-chevron" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="card empty-state">
          There’s no active site to add to yet.{" "}
          <Link to="/" className="text-link">
            Go to your sites
          </Link>
        </div>
      )}
    </>
  );
}
