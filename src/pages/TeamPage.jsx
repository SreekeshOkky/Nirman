import React, { useEffect, useState } from "react";
import { Mail, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { PageHeading, getInitials } from "../components/Shared";
import InviteModal from "../components/InviteModal";
import { api } from "../lib/api";
export default function TeamPage({ siteId, token, flash, profile }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const load = () =>
    Promise.all([api.members(siteId, token), api.invitations(siteId, token)]);
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    load()
      .then(([memberRows, inviteRows]) => {
        if (cancelled) return;
        setMembers(memberRows);
        setInvites(inviteRows);
      })
      .catch((error) => {
        if (!cancelled) flash(error.message);
      })
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
      const [memberRows, inviteRows] = await load();
      setMembers(memberRows);
      setInvites(inviteRows);
      setShow(false);
      flash(
        invitation.added
          ? `${invitation.email} added to this site`
          : `Invitation sent to ${invitation.email}`,
      );
    } catch (error) {
      flash(error.message);
    } finally {
      setSaving(false);
    }
  }
  async function run(id, action, message) {
    setBusyId(id);
    try {
      await action();
      flash(message);
    } catch (error) {
      flash(error.message);
    } finally {
      setBusyId(null);
    }
  }
  function remove(member) {
    const who =
      member.profiles?.full_name || member.profiles?.email || "this supervisor";
    if (
      !window.confirm(
        `Remove ${who} from this site? They will lose access immediately.`,
      )
    )
      return;
    run(
      member.id,
      async () => {
        await api.removeMember(siteId, member.id, token);
        setMembers((current) =>
          current.filter((item) => item.id !== member.id),
        );
      },
      `${who} removed`,
    );
  }
  function resend(item) {
    run(
      item.id,
      () => api.resendInvitation(siteId, item.id, token),
      `Invitation re-sent to ${item.email}`,
    );
  }
  function cancel(item) {
    run(
      item.id,
      async () => {
        await api.cancelInvitation(siteId, item.id, token);
        setInvites((current) => current.filter((row) => row.id !== item.id));
      },
      `Invitation to ${item.email} cancelled`,
    );
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
            {getInitials(profile?.full_name) || "?"}
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
          <>
            {members.map((member) => (
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
                      "Supervisor"}
                  </strong>
                  <small>{member.profiles?.email}</small>
                </div>
                <span className="role-tag supervisor">Supervisor</span>
                <button
                  className="row-action danger"
                  title="Remove from site"
                  aria-label="Remove from site"
                  disabled={busyId === member.id}
                  onClick={() => remove(member)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!members.length && !invites.length && (
              <div className="empty-state">
                No supervisors yet. Invite someone to let them add entries from
                site.
              </div>
            )}
          </>
        )}
        {!loading && invites.length > 0 && (
          <>
            <div className="collection-head team-pending-head">
              <div>
                <h2>Pending invitations</h2>
                <p>
                  They'll join this site as soon as they sign in for the first
                  time.
                </p>
              </div>
            </div>
            {invites.map((item) => (
              <div className="member-row" key={item.id}>
                <div className="avatar avatar-blue">
                  {item.email[0].toUpperCase()}
                </div>
                <div>
                  <strong>{item.email}</strong>
                  <small>
                    Invited{" "}
                    {new Date(item.created_at).toLocaleDateString("en-IN")}
                    {new Date(item.expires_at) < new Date()
                      ? " · expired, resend to renew"
                      : ""}
                  </small>
                </div>
                <button
                  className="secondary-button"
                  disabled={busyId === item.id}
                  onClick={() => resend(item)}
                >
                  <Mail size={14} /> Resend
                </button>
                <button
                  className="row-action danger"
                  title="Cancel invitation"
                  aria-label="Cancel invitation"
                  disabled={busyId === item.id}
                  onClick={() => cancel(item)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </>
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
