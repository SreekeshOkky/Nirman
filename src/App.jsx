import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { api } from "./lib/api";
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
    if (!token) return;
    api
      .me(token)
      .then(setProfile)
      .catch((error) => flash(error.message));
    api
      .sites(token)
      .then((data) => {
        setSites(data);
        setSiteId((current) => current || data[0]?.id || null);
      })
      .catch((error) => flash(error.message))
      .finally(() => setSitesLoading(false));
  }, [token]);

  const flash = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };
  const site = sites.find((item) => item.id === siteId) || null;
  const isBuilder = profile.role === "builder";

  if (!supabase) return <AuthPage configurationMissing />;
  if (authLoading)
    return <div className="auth-loading">Loading Nirmanam...</div>;
  if (!session) return <AuthPage />;

  const context = {
    token,
    profile,
    site,
    siteId,
    sites,
    setSites,
    setSiteId,
    overview,
    setOverview,
    isBuilder,
    flash,
  };
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
            element={
              sitesLoading ? (
                <div className="auth-loading">Loading...</div>
              ) : site ? (
                <NotesPage {...context} />
              ) : (
                <Navigate to="/sites" replace />
              )
            }
          />
          <Route
            path="categories"
            element={
              sitesLoading ? (
                <div className="auth-loading">Loading...</div>
              ) : site && isBuilder ? (
                <CategoriesPage {...context} />
              ) : (
                <Navigate to="/" replace />
              )
            }
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
            element={
              sitesLoading ? (
                <div className="auth-loading">Loading...</div>
              ) : site && isBuilder ? (
                <ActivityPage {...context} />
              ) : (
                <Navigate to="/" replace />
              )
            }
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
