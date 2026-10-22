"use client";

import { useCallback, useEffect, useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import { useTideConfigState } from "@/app/providers";

type Membership = { role: string; organizations: { id: string; name: string; category: string; status: string } };
type Application = { id: string; name: string; category: string; status: string; created_at: string };
type CaseItem = { id: string; subject: string; body: string; category: string; status: string; assigned_to?: string | null; created_at: string; case_contacts?: { name: string | null; email: string | null }[]; case_messages?: { id: string; sender_kind: string; message: string; created_at: string }[]; departments?: { name: string } | null };
type StaffMember = { user_subject: string; email: string | null; role: string };

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function PortalContent() {
  const { login, logout, authenticated, isInitializing, hasRealmRole } = useTideCloak();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedTab, setSelectedTab] = useState("workspace");
  const [appForm, setAppForm] = useState({ name: "", category: "College / university", description: "", officialEmail: "" });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [departmentName, setDepartmentName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [inviteHandled, setInviteHandled] = useState(false);

  const load = useCallback(async () => {
    if (!authenticated) return;
    setBusy(true); setNotice("");
    try {
      const [orgData, appData] = await Promise.all([jsonFetch("/api/organization"), jsonFetch("/api/organization-applications")]);
      setMemberships(orgData.memberships ?? []); setApplications(appData.applications ?? []);
      const firstOrg = orgData.memberships?.[0]?.organizations;
      if (firstOrg?.id) {
        setOrganizationId(firstOrg.id);
        const [caseData, deptData, staffData] = await Promise.all([jsonFetch(`/api/organization/cases?organizationId=${firstOrg.id}`), jsonFetch(`/api/organization/departments?organizationId=${firstOrg.id}`), jsonFetch(`/api/organization/members?organizationId=${firstOrg.id}`)]);
        setCases(caseData.cases ?? []); setDepartments(deptData.departments ?? []); setStaffMembers(staffData.members ?? []);
      } else { setOrganizationId(""); setCases([]); setDepartments([]); setStaffMembers([]); }
      if (hasRealmRole?.("platform-admin")) {
        const adminData = await jsonFetch("/api/admin/applications"); setPending(adminData.applications ?? []);
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not load the portal."); }
    finally { setBusy(false); }
  }, [authenticated, hasRealmRole]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!authenticated || inviteHandled) return;
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) { setInviteHandled(true); return; }
    setInviteHandled(true);
    jsonFetch("/api/organization/invites", { method: "PUT", body: JSON.stringify({ token }) }).then(async () => {
      window.history.replaceState({}, "", "/organization"); setNotice("Invitation accepted. Your organization membership is active."); await load();
    }).catch(e => { window.history.replaceState({}, "", "/organization"); setNotice(e instanceof Error ? e.message : "Could not accept invitation."); });
  }, [authenticated, inviteHandled, load]);

  async function apply(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setNotice("");
    try {
      if (!evidenceFile) throw new Error("Upload a PDF, PNG, or JPEG verification document first.");
      const uploadForm = new FormData(); uploadForm.append("evidence", evidenceFile); uploadForm.append("officialEmail", appForm.officialEmail);
      const uploadResponse = await fetch("/api/organization-applications/evidence", { method: "POST", body: uploadForm });
      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(uploadData.error || "Could not securely upload evidence.");
      await jsonFetch("/api/organization-applications", { method: "POST", body: JSON.stringify({ ...appForm, evidencePath: uploadData.evidencePath }) });
      setNotice("Application received. Its evidence is stored privately for administrator review."); setAppForm({ name: "", category: "College / university", description: "", officialEmail: "" }); setEvidenceFile(null); await load();
    }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not submit application."); }
    finally { setBusy(false); }
  }

  async function decide(applicationId: string, decision: "approve" | "reject") {
    setBusy(true); setNotice("");
    try { await jsonFetch("/api/admin/applications", { method: "POST", body: JSON.stringify({ applicationId, decision }) }); setNotice(`Organization application ${decision}d.`); await load(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not record decision."); }
    finally { setBusy(false); }
  }

  async function updateCase(item: CaseItem, status: string) {
    setBusy(true); setNotice("");
    try { await jsonFetch("/api/organization/cases", { method: "PATCH", body: JSON.stringify({ organizationId, caseId: item.id, status }) }); setNotice("Case status updated."); await load(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not update case."); }
    finally { setBusy(false); }
  }

  async function assignCase(item: CaseItem, assignedTo: string) {
    setBusy(true); setNotice("");
    try { await jsonFetch("/api/organization/cases", { method: "PATCH", body: JSON.stringify({ organizationId, caseId: item.id, status: item.status, assignedTo }) }); setNotice(assignedTo ? "Case assigned to an organization staff member." : "Case assignment cleared."); await load(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not assign the case."); }
    finally { setBusy(false); }
  }

  async function replyToCase(item: CaseItem) {
    const response = (responses[item.id] ?? "").trim();
    if (!response) return;
    setBusy(true); setNotice("");
    try { await jsonFetch("/api/organization/cases", { method: "PATCH", body: JSON.stringify({ organizationId, caseId: item.id, status: item.status, message: response }) }); setResponses({ ...responses, [item.id]: "" }); setNotice("Your response was added to the private case inbox."); await load(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not send the response."); }
    finally { setBusy(false); }
  }

  async function addDepartment(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await jsonFetch("/api/organization/departments", { method: "POST", body: JSON.stringify({ organizationId, name: departmentName }) }); setDepartmentName(""); setNotice("Department added."); await load(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not add department."); }
    finally { setBusy(false); }
  }

  async function inviteStaff(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setNotice(""); setInviteUrl("");
    try { const data = await jsonFetch("/api/organization/invites", { method: "POST", body: JSON.stringify({ organizationId, email: inviteEmail }) }); setInviteUrl(data.inviteUrl); setInviteEmail(""); setNotice("Invitation created. Copy the link and send it to the staff member; it expires in seven days."); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not create invitation."); }
    finally { setBusy(false); }
  }

  if (isInitializing) return <main className="portal-shell"><div className="portal-card">Checking TideCloak session…</div></main>;
  if (!authenticated) return <main className="portal-shell"><a className="brand" href="/"><span className="brand-mark">R</span> Resolve It</a><section className="portal-card"><div className="eyebrow">ORGANIZATION ACCESS</div><h1 className="portal-title">A private space<br/>to <em>resolve concerns.</em></h1><p>Sign in through TideCloak to apply for an organization workspace or manage an approved organization.</p><button className="submit-button" onClick={() => login()}>Continue with TideCloak <span>→</span></button><a className="back-link" href="/">← Back to public reporting</a></section></main>;

  const isAdmin = Boolean(hasRealmRole?.("platform-admin"));
  return <main className="portal-shell"><header className="portal-header"><a className="brand" href="/"><span className="brand-mark">R</span> Resolve It <span className="portal-badge">ORGANIZATION PORTAL</span></a><button className="quiet-button" onClick={() => logout()}>Sign out ↗</button></header><section className="portal-content"><div className="portal-heading"><div><div className="eyebrow">VERIFIED WORKSPACES</div><h1 className="portal-title">Welcome to your<br/><em>response desk.</em></h1></div><span className="secure-pill">● TideCloak session active</span></div>{notice && <div className="notice" role="status">{notice}</div>}
    <div className="portal-tabs"><button className={selectedTab === "workspace" ? "selected" : ""} onClick={() => setSelectedTab("workspace")}>My workspace</button><button className={selectedTab === "apply" ? "selected" : ""} onClick={() => setSelectedTab("apply")}>Apply for organization</button>{isAdmin && <button className={selectedTab === "admin" ? "selected" : ""} onClick={() => setSelectedTab("admin")}>Platform review <span className="count">{pending.length}</span></button>}</div>
    {selectedTab === "workspace" && <>{memberships.length ? <><div className="org-summary"><div className="org-symbol">{memberships[0].organizations.name.slice(0,1).toUpperCase()}</div><div><strong>{memberships[0].organizations.name}</strong><small>{memberships[0].organizations.category} · {memberships[0].role}</small></div><span className="approved-pill">APPROVED</span></div><div className="dash-grid"><section className="dashboard-panel"><div className="dash-title"><div><span className="side-kicker">INCOMING</span><h2>Concern queue</h2></div><span className="count">{cases.length}</span></div>{cases.length ? cases.map(item => <article className="case-row" key={item.id}><div className="case-top"><span className="status-pill">{item.status.replaceAll("_", " ")}</span><span className="case-date">{new Date(item.created_at).toLocaleDateString()}</span></div><h3>{item.subject}</h3><p className="case-copy">{item.body}</p><div className="case-meta">{item.category}{item.departments?.name ? ` · ${item.departments.name}` : " · Organization intake"}{item.case_contacts?.[0]?.email ? ` · Reply to ${item.case_contacts[0].email}` : " · Anonymous"}</div><div className="case-controls"><select aria-label="Update case status" value={item.status} onChange={e => void updateCase(item, e.target.value)}><option value="received">Received</option><option value="under_review">Under review</option><option value="referred">Referred</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><select aria-label="Assign case to organization staff" value={item.assigned_to ?? ""} onChange={e => void assignCase(item, e.target.value)}><option value="">Unassigned</option>{staffMembers.map(person => <option key={person.user_subject} value={person.user_subject}>{person.email || `${person.role} member`}</option>)}</select></div><form className="reply-form" onSubmit={e => { e.preventDefault(); void replyToCase(item); }}><label htmlFor={`response-${item.id}`}>Reply to reporter</label><textarea id={`response-${item.id}`} maxLength={3000} rows={2} value={responses[item.id] ?? ""} onChange={e => setResponses({ ...responses, [item.id]: e.target.value })} placeholder="Write a response visible in the reporter’s private inbox…"/><button className="submit-button" disabled={busy || !(responses[item.id] ?? "").trim()}>Send response <span>→</span></button></form>{item.case_messages?.length ? <div className="conversation">{item.case_messages.map(m => <p key={m.id}><b>{m.sender_kind === "submitter" ? "Submitter" : "Your team"}:</b> {m.message}</p>)}</div> : null}</article>) : <div className="empty-state"><span>✳</span><h3>No concerns yet</h3><p>New submissions routed to this organization will appear here.</p></div>}</section><aside className="dashboard-panel settings-panel"><span className="side-kicker">ORGANIZATION SETUP</span><h2>Departments</h2><p>Offer departments so submitters can direct a concern more precisely.</p>{departments.map(d => <div className="department-row" key={d.id}>{d.name}<span>ACTIVE</span></div>)}{memberships[0].role === "owner" && <form className="department-form" onSubmit={addDepartment}><input required maxLength={100} value={departmentName} onChange={e => setDepartmentName(e.target.value)} placeholder="New department name"/><button aria-label="Add department">+</button></form>}{memberships[0].role === "owner" && <form className="invite-form" onSubmit={inviteStaff}><h3>Invite staff</h3><p>Invites are tied to a verified email and expire after seven days. Share the generated link yourself.</p><div><input required type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="staff@organization.edu"/><button type="submit">Create link</button></div>{inviteUrl && <div className="invite-link"><input readOnly value={inviteUrl}/><button type="button" onClick={() => navigator.clipboard.writeText(inviteUrl)}>Copy</button></div>}</form>}<div className="privacy-callout"><b>Case access is scoped</b><span>This view contains cases for {memberships[0].organizations.name} only.</span></div></aside></div></> : <div className="empty-state application-empty"><span>⌂</span><h3>No organization workspace yet</h3><p>Apply with a verified organization email. Your workspace appears here only after a Resolve It administrator approves it.</p><button className="submit-button" onClick={() => setSelectedTab("apply")}>Apply for an organization <span>→</span></button>{applications.map(a => <div className="application-status" key={a.id}><b>{a.name}</b><span className={`status-pill ${a.status}`}>{a.status}</span></div>)}</div>}</>}
    {selectedTab === "apply" && <div className="apply-layout"><form className="dashboard-panel apply-form" onSubmit={apply}><span className="side-kicker">ORGANIZATION VERIFICATION</span><h2>Request a workspace</h2><p>We verify each organization before listing it or allowing it to receive concerns. Use a TideCloak account with a verified official email.</p><label>Organization name<input required maxLength={180} value={appForm.name} onChange={e => setAppForm({ ...appForm, name: e.target.value })} placeholder="College, agency, company…"/></label><label>Organization type<select value={appForm.category} onChange={e => setAppForm({ ...appForm, category: e.target.value })}>{["College / university", "School", "Construction company", "Non-profit / NGO", "Government office", "Other organization"].map(x => <option key={x}>{x}</option>)}</select></label><label>Short description<textarea maxLength={1000} rows={3} value={appForm.description} onChange={e => setAppForm({ ...appForm, description: e.target.value })} placeholder="What concerns should people send to this organization?"/></label><label>Official organization email<input required type="email" maxLength={254} value={appForm.officialEmail} onChange={e => setAppForm({ ...appForm, officialEmail: e.target.value })} placeholder="you@organization.edu"/></label><label>Verification document<input required type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => setEvidenceFile(e.target.files?.[0] ?? null)}/><small>PDF, PNG, or JPEG up to 10 MB. Stored privately; only Resolve It platform admins can review it.</small></label><button className="submit-button" disabled={busy}>Submit for review <span>→</span></button>{applications.map(a => <div className="application-status" key={a.id}><b>{a.name}</b><span className={`status-pill ${a.status}`}>{a.status}</span></div>)}</form><aside className="dashboard-panel side-short"><span className="side-kicker">WHAT HAPPENS NEXT</span><h2>Review before access</h2><ol className="review-steps"><li>We check the official email and evidence.</li><li>Your organization stays off the public directory while pending.</li><li>After approval, your account becomes the initial owner.</li></ol></aside></div>}
    {selectedTab === "admin" && isAdmin && <section className="dashboard-panel"><div className="dash-title"><div><span className="side-kicker">PLATFORM ADMIN</span><h2>Organization applications</h2></div><span className="count">{pending.length}</span></div>{pending.length ? pending.map(a => <article className="application-card" key={a.id}><span className="status-pill">PENDING REVIEW</span><h3>{a.name}</h3><p>{a.category} · Submitted {new Date(a.created_at).toLocaleDateString()}</p><p>{a.description}</p><dl><dt>Applicant email</dt><dd>{a.verified_email}</dd><dt>Official email</dt><dd>{a.official_email}</dd><dt>Evidence</dt><dd><a href={a.evidenceUrl} target="_blank" rel="noreferrer">Open private evidence ↗</a> (link expires after five minutes)</dd></dl><div className="decision-actions"><button disabled={busy} onClick={() => void decide(a.id, "approve")}>Approve and create workspace</button><button className="reject-button" disabled={busy} onClick={() => void decide(a.id, "reject")}>Reject</button></div></article>) : <div className="empty-state"><span>✓</span><h3>No applications awaiting review</h3><p>New organization requests will appear here.</p></div>}</section>}
  </section></main>;
}

export default function OrganizationPage() {
  const state = useTideConfigState();
  if (!state.ready) return <main className="portal-shell"><div className="portal-card">Loading organization access…</div></main>;
  if (!state.configured) return <main className="portal-shell"><a className="brand" href="/"><span className="brand-mark">R</span> Resolve It</a><section className="portal-card"><div className="eyebrow">TIDECLOAK SETUP NEEDED</div><h1 className="portal-title">Connect your<br/><em>staff identity.</em></h1><p>Staff access is not simulated. Add the TideCloak app adapter file and configure your realm before organization sign-in is enabled.</p><a className="back-link" href="/">← Back to public reporting</a></section></main>;
  return <PortalContent/>;
}
