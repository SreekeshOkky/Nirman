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
  const [siteLoading, setSiteLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [audit, setAudit] = useState([]);
  const [notes, setNotes] = useState([]);
  const [members, setMembers] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [summary, setSummary] = useState({
    income: 0,
    expenses: 0,
    balance: 0,
    entry_count: 0,
  });
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
    Promise.all([api.sites(token), api.overview(token)])
      .then(([data, aggregate]) => {
        setSites(data);
        setSiteId((current) => current || data[0]?.id || null);
        setOverview(aggregate);
      })
      .catch((error) => flash(error.message))
      .finally(() => setSitesLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || profile.role !== "builder") return;
    api
      .workspaceAudit(token)
      .then((result) => {
        if (result.items) setAudit(result.items);
      })
      .catch(() => {});
  }, [token, profile.role]);

  useEffect(() => {
    if (!siteId) {
      setSiteLoading(false);
      return;
    }
    setSiteLoading(true);
    Promise.allSettled([
      api.categories(siteId, token),
      api.ledger(siteId, {}, token),
      api.summary(siteId, token),
      api.notes(siteId, token),
      api.monthly(siteId, token),
      profile.role === "builder"
        ? api.members(siteId, token)
        : Promise.resolve([]),
    ])
      .then((results) => {
        const value = (index) =>
          results[index].status === "fulfilled" ? results[index].value : null;
        const nextCategories = value(0);
        const ledger = value(1);
        const totals = value(2);
        const siteNotes = value(3);
        const months = value(4);
        const siteMembers = value(5);
        if (nextCategories) setCategories(nextCategories);
        if (ledger) setEntries(ledger.items);
        if (totals) setSummary(totals);
        if (siteNotes) setNotes(siteNotes);
        if (months) setMonthly(months);
        if (siteMembers) setMembers(siteMembers);
        const failed = results.find((result) => result.status === "rejected");
        if (failed)
          flash(failed.reason?.message || "Some site data could not be loaded");
      })
      .finally(() => setSiteLoading(false));
  }, [siteId, token, profile.role]);

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
    siteLoading,
    sites,
    setSites,
    setSiteId,
    entries,
    setEntries,
    categories,
    setCategories,
    notes,
    setNotes,
    members,
    setMembers,
    summary,
    setSummary,
    monthly,
    overview,
    audit,
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
