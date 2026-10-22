"use client";

import { useCallback, useEffect, useState } from "react";

type Organization = { id: string; name: string; category: string; description: string; departments: { id: string; name: string }[] };

export default function Home({ initialMode = "report" }: { initialMode?: "report" | "track" }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [directoryState, setDirectoryState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const mode = initialMode;
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [result, setResult] = useState<{ code: string; secret: string } | null>(null);
  const [track, setTrack] = useState<{ code: string; secret: string }>({ code: "", secret: "" });
  const [tracked, setTracked] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [form, setForm] = useState({ organizationId: "", departmentId: "", category: "Complaint", subject: "", body: "", contactName: "", contactEmail: "" });

  const loadOrganizations = useCallback(async () => {
    setDirectoryState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/organizations", { cache: "no-store" });
      const data = await responseData(response);
      if (!response.ok) throw new Error(data.error || "The organization directory is unavailable right now.");
      const available = Array.isArray(data.organizations) ? data.organizations : [];
      setOrgs(available);
      setDirectoryState(available.length ? "ready" : "empty");
    } catch (error) {
      setDirectoryState("error");
      setMessage(error instanceof Error ? error.message : "The organization directory is unavailable right now.");
    }
  }, []);

  useEffect(() => { if (initialMode === "report") void loadOrganizations(); }, [initialMode, loadOrganizations]);

  async function responseData(response: Response) {
    return response.json().catch(() => ({} as Record<string, any>));
  }

  async function submitConcern(e: React.FormEvent) {
    e.preventDefault(); setMessage(""); setResult(null); setSubmitting(true);
    try {
      const response = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await responseData(response);
      if (!response.ok) { setMessage(data.error ?? "Could not submit. Please try again."); return; }
      setResult({ code: data.code, secret: data.secret });
      setMessage("Your concern was submitted securely. Save both credentials now; the secret will not be shown again.");
    } catch { setMessage("We could not reach the server. Check your connection and try again."); }
    finally { setSubmitting(false); }
  }

  async function lookupCase(e: React.FormEvent) {
    e.preventDefault(); setMessage(""); setTracked(null); setLookingUp(true);
    try {
      const response = await fetch("/api/cases/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(track) });
      const data = await responseData(response);
      if (!response.ok) { setMessage(data.error ?? "We could not find that case. Check your code and secret."); return; }
      setTracked(data.case);
    } catch { setMessage("We could not reach the server. Check your connection and try again."); }
    finally { setLookingUp(false); }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault(); setMessage(""); setSendingReply(true);
    try {
      const response = await fetch("/api/cases/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...track, message: reply }) });
      const data = await responseData(response);
      if (!response.ok) { setMessage(data.error ?? "Could not send reply."); return; }
      setReply(""); setMessage("Your reply is in the private case inbox.");
      const lookupResponse = await fetch("/api/cases/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(track) });
      if (lookupResponse.ok) setTracked((await responseData(lookupResponse)).case);
    } catch { setMessage("We could not reach the server. Check your connection and try again."); }
    finally { setSendingReply(false); }
  }

  const selected = orgs.find(o => o.id === form.organizationId);

  return <main>
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">R</span> Resolve It</a><nav><a className={mode === "report" ? "nav-active" : ""} href="/report#form">Send a concern</a><a className={mode === "track" ? "nav-active" : ""} href="/track#form">Track a case</a><a className="org-link" href="/organization">Organization portal <span>↗</span></a></nav></header>
    <section className="hero" id="top"><div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> A clearer way to be heard</div><h1>Say what needs<br/>to be <em>resolved.</em></h1><p>Send a concern to the organization best placed to help. No account needed. Your contact details are always optional.</p><div className="hero-actions"><a href="/report#form" className="primary-link">Share a concern <span>→</span></a><span className="privacy-note"><span className="lock">⌑</span> Private by design</span></div></div><div className="hero-art" aria-label="Decorative abstract illustration"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="core">R<span>•</span></div><div className="art-label label-one">Your voice <b>heard</b></div><div className="art-label label-two">A clear path <b>forward</b></div><div className="art-label label-three">Privacy <b>first</b></div></div></section>
    <section className="steps"><div><span className="step-num">01</span><strong>Choose who can help</strong><small>Find the right organization and department.</small></div><div><span className="step-num">02</span><strong>Tell them what happened</strong><small>Share only the details you choose.</small></div><div><span className="step-num">03</span><strong>Follow the resolution</strong><small>Use your private case credentials to check in.</small></div></section>
    <section className="workspace" id="form"><div className="section-heading"><div><div className="eyebrow">YOUR NEXT STEP</div><h2>{mode === "report" ? "Start with your concern" : "Check your case"}</h2></div><div className="step-chip"><span>●</span> {mode === "report" ? "No sign-in required" : "Private case access"}</div></div>
      {mode === "report" && <div className="form-layout"><form className="panel report-form" onSubmit={submitConcern}><div className="panel-title"><span className="panel-icon">✳</span><div><h3>Tell us where to send it</h3><p>Your message goes directly to the organization you select.</p></div></div>
        <label>Organization<select required value={form.organizationId} onChange={e => setForm({ ...form, organizationId: e.target.value, departmentId: "" })}><option value="">Choose an approved organization</option>{orgs.map(o => <option key={o.id} value={o.id}>{o.name} · {o.category}</option>)}</select></label>
        {selected && selected.departments.length > 0 && <label>Department<select required value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}><option value="">Choose a department</option>{selected.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
        <label>What kind of message is this?<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option>Complaint</option><option>Safety report</option><option>Suggestion</option><option>Request for help</option><option>Other concern</option></select></label>
        <label>Short summary<input required maxLength={120} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="What is this about?"/></label>
        <label>What would you like them to know?<textarea required minLength={10} maxLength={5000} rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Describe the concern and what outcome would help…"/></label>
        <div className="optional-box"><div className="optional-title"><span>Optional</span><strong>Would you like a reply?</strong></div><p>You can leave these blank and still follow up privately with your case code and secret.</p><div className="two-col"><label>Your name<input maxLength={120} value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} placeholder="Name (optional)"/></label><label>Email address<input type="email" maxLength={254} value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} placeholder="Email (optional)"/></label></div><small>If provided, contact details are shared only with authorized staff handling this case.</small></div>
        <p className="disclosure">Avoid including details that identify you if you want to stay anonymous. Resolve It is not an emergency service.</p><button className="submit-button" type="submit" disabled={submitting || directoryState !== "ready"}>{submitting ? "Sending…" : directoryState === "loading" ? "Loading organizations…" : directoryState === "error" ? "Directory unavailable" : directoryState === "empty" ? "No approved organizations yet" : "Send concern"} <span>→</span></button>{directoryState === "error" && <button className="text-button" type="button" onClick={() => void loadOrganizations()}>Retry loading organizations</button>}{directoryState === "empty" && <p className="form-message">No verified organizations are listed yet. An organization must be approved before it can receive reports.</p>}{message && <p className="form-message" role="status">{message}</p>}{result && <div className="credentials"><strong>Save these now</strong><div>Case code <code>{result.code}</code><button type="button" onClick={() => navigator.clipboard.writeText(result.code)}>Copy</button></div><div>Secret <code>{result.secret}</code><button type="button" onClick={() => navigator.clipboard.writeText(result.secret)}>Copy</button></div><small>Both are required to access the private case inbox. <a href="/track">Track this case</a> after saving them.</small></div>}</form>
        <aside className="side-panel"><div className="side-kicker">HOW IT WORKS</div><h3>Your concern.<br/><em>Your choice.</em></h3><div className="side-rule"/><ul><li><b>Stay anonymous</b><span>No account, name, or email required.</span></li><li><b>Choose the destination</b><span>Only approved organizations appear here.</span></li><li><b>Keep access private</b><span>Your code and secret are yours alone.</span></li></ul><div className="emergency"><span>!</span><p><b>Need urgent help?</b><br/>Contact local emergency services directly.</p></div></aside></div>}
      {mode === "track" && <div className="track-layout"><form className="panel track-form" onSubmit={lookupCase}><div className="panel-title"><span className="panel-icon">⌕</span><div><h3>Open your private inbox</h3><p>Enter the two credentials you received when you submitted.</p></div></div><label>Case code<input required autoComplete="off" value={track.code} onChange={e => setTrack({ ...track, code: e.target.value })} placeholder="Your case code"/></label><label>Secret<input required type="password" autoComplete="off" value={track.secret} onChange={e => setTrack({ ...track, secret: e.target.value })} placeholder="Your private access secret"/></label><button className="submit-button" type="submit" disabled={lookingUp}>{lookingUp ? "Checking…" : "Check case"} <span>→</span></button>{message && <p className="form-message" role="status">{message}</p>}</form>{tracked && <article className="panel tracked"><div className="status-pill">{tracked.status.replaceAll("_", " ")}</div><h3>{tracked.subject}</h3><p>{tracked.category}</p><div className="timeline">{tracked.updates.map((u: any, i: number) => <div key={i}><span/><b>{u.status.replaceAll("_", " ")}</b><small>{new Date(u.created_at).toLocaleString()}</small>{u.message && <p>{u.message}</p>}</div>)}</div><div className="conversation"><h4>Private conversation</h4>{tracked.messages?.length ? tracked.messages.map((m: any, i: number) => <p key={i}><b>{m.sender_kind === "submitter" ? "You" : "Organization"}:</b> {m.message}<small>{new Date(m.created_at).toLocaleString()}</small></p>) : <p>No replies yet. Your messages will appear here.</p>}<form className="reply-form" onSubmit={sendReply}><label htmlFor="case-reply">Send a reply</label><textarea id="case-reply" required maxLength={3000} rows={3} value={reply} onChange={e => setReply(e.target.value)} placeholder="Add information or ask a question…"/><button className="submit-button" type="submit" disabled={sendingReply}>{sendingReply ? "Sending…" : "Send reply"} <span>→</span></button>{message && <p className="form-message" role="status">{message}</p>}</form></div></article>}<aside className="side-panel side-short"><div className="side-kicker">ONLY YOU CAN OPEN IT</div><h3>Two keys.<br/><em>One private case.</em></h3><p>The case code identifies the case. The separate secret proves it’s yours. Keep both somewhere safe.</p></aside></div>}
    </section><footer><a className="brand" href="#top"><span className="brand-mark">R</span> Resolve It</a><span>Concerns deserve a response.</span><span className="footer-links"><a href="/privacy">Privacy</a> · No account needed</span></footer>
  </main>;
}
