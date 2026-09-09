import React, { useEffect, useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { PageHeading, getInitials } from "../components/Shared";
import InviteModal from "../components/InviteModal";
import { api } from "../lib/api";
export default function TeamPage({ siteId, token, flash, profile }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    api
      .members(siteId, token)
      .then((data) => {
        if (!cancelled) setMembers(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, token]);
  async function invite(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const email = new FormData(event.currentTarget).get("email");
      const invitation = await api.inviteMember(siteId, { email }, token);
      setMembers((current) => [
        ...current,
        { id: invitation.id, profiles: { email }, invitation },
      ]);
      setShow(false);
      flash("Invitation sent");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Team & access"
        subtitle="Manage who can contribute to this site."
      >
        <button className="primary-button" onClick={() => setShow(true)}>
          <UserPlus size={17} /> Invite supervisor
        </button>
      </PageHeading>
      <div className="card collection-card">
        <div className="collection-head">
          <div>
            <h2>Team members</h2>
            <p>Supervisors can add entries and notes only.</p>
          </div>
        </div>
        <div className="member-row">
          <div className="avatar avatar-dark">
            {getInitials(profile?.full_name) || "RK"}
          </div>
          <div>
            <strong>{profile?.full_name || "Site owner"}</strong>
            <small>Builder</small>
          </div>
          <span className="role-tag">Full access</span>
        </div>
        {loading ? (
          <div className="empty-state">Loading team…</div>
        ) : (
          members.map((member) => (
            <div className="member-row" key={member.id}>
              <div className="avatar avatar-blue">
                {getInitials(member.profiles?.full_name) ||
                  (member.profiles?.email
                    ? member.profiles.email[0].toUpperCase()
                    : "?")}
              </div>
              <div>
                <strong>
                  {member.profiles?.full_name ||
                    member.profiles?.email ||
                    "Pending supervisor"}
                </strong>
                <small>{member.profiles?.email || "Invitation pending"}</small>
              </div>
              <span className="role-tag supervisor">Supervisor</span>
            </div>
          ))
        )}
        <div className="soft-callout">
          <ShieldCheck size={18} />
          <span>
            Audit logs and site settings are visible only to builders.
          </span>
        </div>
      </div>
      {show && (
        <InviteModal
          onClose={() => setShow(false)}
          onSubmit={invite}
          saving={saving}
        />
      )}
    </>
  );
}
