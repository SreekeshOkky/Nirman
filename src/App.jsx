import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { arrivedFromPasswordLink, supabase } from "./lib/supabase";
import { api } from "./lib/api";
import { DEFAULT_FEATURES, loadFeatures } from "./lib/features";
import { brand } from "./lib/brand";
import AppLayout from "./components/AppLayout";
import AuthPage from "./pages/AuthPage";
import SitesPage from "./pages/SitesPage";
import LedgerPage from "./pages/LedgerPage";
import ReportsPage from "./pages/ReportsPage";
import NotesPage from "./pages/NotesPage";
import CategoriesPage from "./pages/CategoriesPage";
import TeamPage from "./pages/TeamPage";
import ActivityPage from "./pages/ActivityPage";
import SettingsPage from "./pages/SettingsPage";
import ScanPage from "./pages/ScanPage";
import SetPasswordPage from "./pages/SetPasswordPage";
import HomePage from "./pages/HomePage";
import SitePage from "./pages/SitePage";
import MePage from "./pages/MePage";
import AddEntryPage from "./pages/AddEntryPage";
import UpdatesPage from "./pages/UpdatesPage";
import { updatesSeenAt } from "./lib/updates";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState({ full_name: "", role: "" });
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [siteId, setSiteId] = useState(null);
  const [overview, setOverview] = useState({
    totals: { income: 0, expenses: 0, balance: 0, budget: 0, entry_count: 0 },
    sites: [],
    monthly: [],
  });
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [needsPassword, setNeedsPassword] = useState(
    arrivedFromPasswordLink || window.location.pathname === "/welcome",
  );
  const [updates, setUpdates] = useState(null);
  const updatesFetchedAt = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  const token = session?.access_token;

  // What needs attention (badge counts, home panel, Updates page).
  const refreshUpdates = useCallback(() => {
    if (!token) return;
    updatesFetchedAt.current = Date.now();
    api
      .updates(token, updatesSeenAt())
      .then(setUpdates)
      .catch(() => {});
  }, [token]);
  // Refresh on sign-in and when moving around, at most every 30 seconds.
  useEffect(() => {
    if (token && Date.now() - updatesFetchedAt.current > 30000)
      refreshUpdates();
  }, [token, location.pathname, refreshUpdates]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setNeedsPassword(false);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, next) => {
        setSession(next);
        if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
        if (event === "SIGNED_OUT") setNeedsPassword(false);
        setAuthLoading(false);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadFeatures(import.meta.env.VITE_API_URL || "/api").then(setFeatures);
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .me(token)
      .then(setProfile)
      .catch((error) => flash(error.message));
    // Join any sites this account was invited to before loading the site list.
    api
      .acceptPendingInvitations(token)
      .catch(() => {})
      .then(() => api.sites(token, { include_archived: true }))
      .then((data) => {
        setSites(data);
        setSiteId(
          (current) =>
            current ||
            data.find((item) => item.status !== "archived")?.id ||
            null,
        );
      })
      .catch((error) => flash(error.message))
      .finally(() => setSitesLoading(false));
  }, [token]);

  // flash("Saved") or flash("Deleted", { label: "Undo", onClick }) for a
  // toast with an action button, which stays up a little longer.
  const flash = (message, action = null) => {
    window.clearTimeout(toastTimer.current);
    setToast({ message, action });
    toastTimer.current = window.setTimeout(
      () => setToast(null),
      action ? 6000 : 3000,
    );
  };
  const activeSites = sites.filter((item) => item.status !== "archived");
  const site = sites.find((item) => item.id === siteId) || null;
  const isBuilder = profile.role === "builder";

  if (!supabase) return <AuthPage configurationMissing features={features} />;
  if (authLoading)
    return <div className="auth-loading">Loading {brand.name}...</div>;
  if (!session) return <AuthPage features={features} />;
  if (needsPassword) {
    if (!profile.role)
      return <div className="auth-loading">Loading {brand.name}...</div>;
    return (
      <SetPasswordPage
        profile={profile}
        setProfile={setProfile}
        token={token}
        onDone={() => {
          setNeedsPassword(false);
          navigate("/", { replace: true });
        }}
      />
    );
  }

  const context = {
    token,
    profile,
    setProfile,
    site,
    siteId,
    sites,
    activeSites,
    setSites,
    setSiteId,
    overview,
    setOverview,
    isBuilder,
    features,
    flash,
    updates,
    refreshUpdates,
  };
  const featureRoute = (flag, node) =>
    features[flag] === false ? <Navigate to="/" replace /> : node;
  return (
    <>
      <Routes>
        <Route path="scan" element={<ScanPage />} />
        <Route element={<AppLayout {...context} />}>
          <Route
            index
            element={
              sitesLoading || !profile.role ? (
                <div className="auth-loading">Loading...</div>
              ) : !isBuilder && activeSites.length === 1 ? (
                // A supervisor with one site goes straight to it.
                <Navigate to={`/sites/${activeSites[0].id}`} replace />
              ) : (
                <HomePage {...context} />
              )
            }
          />
          <Route path="sites" element={<SitesPage {...context} />} />
          <Route
            path="sites/:siteId"
            element={<SitePage {...context} sitesLoading={sitesLoading} />}
          >
            <Route index element={<LedgerPage {...context} embedded />} />
            <Route
              path="summary"
              element={
                isBuilder ? (
                  <ReportsPage {...context} embedded />
                ) : (
                  <Navigate to=".." replace />
                )
              }
            />
            <Route
              path="notes"
              element={featureRoute(
                "notes",
                <NotesPage {...context} embedded />,
              )}
            />
            <Route
              path="team"
              element={
                isBuilder ? (
                  <TeamPage {...context} embedded />
                ) : (
                  <Navigate to=".." replace />
                )
              }
            />
          </Route>
          <Route
            path="add"
            element={
              <AddEntryPage
                activeSites={activeSites}
                sitesLoading={sitesLoading}
              />
            }
          />
          <Route path="updates" element={<UpdatesPage {...context} />} />
          <Route path="me" element={<MePage {...context} />} />
          <Route path="settings" element={<SettingsPage {...context} />} />
          <Route
            path="categories"
            element={featureRoute(
              "categories",
              isBuilder ? (
                <CategoriesPage {...context} />
              ) : (
                <Navigate to="/" replace />
              ),
            )}
          />
          <Route
            path="activity"
            element={featureRoute(
              "audit_log",
              isBuilder ? (
                <ActivityPage {...context} />
              ) : (
                <Navigate to="/" replace />
              ),
            )}
          />
          {/* Old addresses from before sites had their own pages. */}
          {[
            ["ledger", ""],
            ["reports", "/summary"],
            ["notes", "/notes"],
            ["team", "/team"],
          ].map(([path, tab]) => (
            <Route
              key={path}
              path={path}
              element={
                sitesLoading ? (
                  <div className="auth-loading">Loading...</div>
                ) : (
                  <Navigate
                    to={
                      site || activeSites[0]
                        ? `/sites/${(site || activeSites[0]).id}${tab}`
                        : "/"
                    }
                    replace
                  />
                )
              }
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">✓</span>
          {toast.message}
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                setToast(null);
                toast.action.onClick();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </>
  );
}
