import React from "react";
import {
  Building2,
  ChevronRight,
  History,
  LogOut,
  Send,
  Settings2,
  Tag,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getInitials } from "../components/Shared";

function MenuRow({ to, icon: Icon, title, detail }) {
  return (
    <Link to={to} className="menu-row">
      <span className="menu-row-icon" aria-hidden="true">
        <Icon size={19} />
      </span>
      <span className="menu-row-text">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </span>
      <ChevronRight
        size={18}
        className="menu-row-chevron"
        aria-hidden="true"
      />
    </Link>
  );
}

export default function MePage({ profile, isBuilder, features }) {
  const navigate = useNavigate();
  const enabled = (flag) => features?.[flag] !== false;
  async function signOut() {
    await supabase?.auth.signOut();
    navigate("/");
  }
  return (
    <>
      <div className="home-heading">
        <h1>Me</h1>
      </div>
      <div className="me-card">
        <span className="me-avatar" aria-hidden="true">
          {getInitials(profile?.full_name) || "?"}
        </span>
        <span className="me-name">
          <strong>{profile?.full_name || "Your account"}</strong>
          <span>{profile?.email}</span>
        </span>
        <span className="status-tag planning">
          {isBuilder ? "Builder" : "Supervisor"}
        </span>
      </div>

      {isBuilder && (
        <section className="menu-group">
          <h2>Workspace</h2>
          <div className="menu-card">
            {enabled("categories") && (
              <MenuRow
                to="/categories"
                icon={Tag}
                title="Categories"
                detail="Shared across all your sites"
              />
            )}
            {enabled("audit_log") && (
              <MenuRow
                to="/activity"
                icon={History}
                title="Activity log"
                detail="Every change, who made it and when"
              />
            )}
            <MenuRow
              to="/sites"
              icon={Building2}
              title="All sites"
              detail="Including finished sites"
            />
          </div>
        </section>
      )}

      <section className="menu-group">
        <h2>Account</h2>
        <div className="menu-card">
          <MenuRow
            to="/settings"
            icon={Settings2}
            title="Your name"
            detail="How you appear to your team"
          />
          {enabled("telegram") && (
            <MenuRow
              to="/me/telegram"
              icon={Send}
              title="Telegram"
              detail="Send UPI screenshots to add expenses"
            />
          )}
        </div>
      </section>

      <button
        type="button"
        className="secondary-button sign-out-button"
        onClick={signOut}
      >
        <LogOut size={18} /> Sign out
      </button>
    </>
  );
}
