import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { takeSharedFile } from "../lib/shareTarget";

// Landing route for the Web Share Target. Reads the shared screenshot from the
// cache (written by the service worker) and hands off to the Ledger page, which
// opens the review form.
export default function ScanPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    takeSharedFile().finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  if (!ready) return <div className="auth-loading">Preparing your screenshot…</div>;
  return <Navigate to="/ledger" replace />;
}
