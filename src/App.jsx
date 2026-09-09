import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { api } from "./lib/api";
import { DEFAULT_FEATURES, loadFeatures } from "./lib/features";
import { brand } from "./lib/brand";
import AppLayout from "./components/AppLayout";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import SitesPage from "./pages/SitesPage";
import LedgerPage from "./pages/LedgerPage";
import ReportsPage from "./pages/ReportsPage";
import NotesPage from "./pages/NotesPage";
import CategoriesPage from "./pages/CategoriesPage";
import TeamPage from "./pages/TeamPage";
import ActivityPage from "./pages/ActivityPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState({
    full_name: "Ravi Kumar",
    role: "builder",
  });
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
  const [toast, setToast] = useState("");
  const token = session?.access_token;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        setSession(next);
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
    api
      .sites(token, { include_archived: true })
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

  const flash = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };
  const activeSites = sites.filter((item) => item.status !== "archived");
  const site = activeSites.find((item) => item.id === siteId) || null;
  const isBuilder = profile.role === "builder";

  if (!supabase) return <AuthPage configurationMissing features={features} />;
  if (authLoading)
    return <div className="auth-loading">Loading {brand.name}...</div>;
  if (!session) return <AuthPage features={features} />;

  const context = {
    token,
    profile,
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
  };
  const featureRoute = (flag, node) =>
    features[flag] === false ? <Navigate to="/" replace /> : node;
  return (
    <>
      <Routes>
        <Route element={<AppLayout {...context} />}>
          <Route index element={<DashboardPage {...context} />} />
          <Route path="sites" element={<SitesPage {...context} />} />
          <Route
            path="ledger"
            element={
              sitesLoading ? (
                <div className="auth-loading">Loading...</div>
              ) : site ? (
                <LedgerPage {...context} />
              ) : (
                <Navigate to="/sites" replace />
              )
            }
          />
          <Route
            path="reports"
            element={
              sitesLoading ? (
                <div className="auth-loading">Loading...</div>
              ) : site ? (
                <ReportsPage {...context} />
              ) : (
                <Navigate to="/sites" replace />
              )
            }
          />
          <Route
            path="notes"
            element={featureRoute(
              "notes",
              sitesLoading ? (
                <div className="auth-loading">Loading...</div>
              ) : site ? (
                <NotesPage {...context} />
              ) : (
                <Navigate to="/sites" replace />
              ),
            )}
          />
          <Route
            path="categories"
            element={featureRoute(
              "categories",
              sitesLoading ? (
                <div className="auth-loading">Loading...</div>
              ) : site && isBuilder ? (
                <CategoriesPage {...context} />
              ) : (
                <Navigate to="/" replace />
              ),
            )}
          />
          <Route
            path="team"
            element={
              sitesLoading ? (
                <div className="auth-loading">Loading...</div>
              ) : site && isBuilder ? (
                <TeamPage {...context} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="activity"
            element={featureRoute(
              "audit_log",
              sitesLoading ? (
                <div className="auth-loading">Loading...</div>
              ) : site && isBuilder ? (
                <ActivityPage {...context} />
              ) : (
                <Navigate to="/" replace />
              ),
            )}
          />
          <Route path="settings" element={<SettingsPage {...context} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {toast && (
        <div className="toast">
          <span className="toast-check">✓</span>
          {toast}
        </div>
      )}
    </>
  );
}
