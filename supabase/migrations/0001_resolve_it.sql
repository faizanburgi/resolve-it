create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  official_email text not null,
  evidence_path text not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  reviewed_by text,
  review_note text
);
create index if not exists organizations_directory_idx on public.organizations(status, name);

create table if not exists public.organization_applications (
  id uuid primary key default gen_random_uuid(),
  requested_by text not null,
  verified_email text not null,
  name text not null,
  category text not null,
  description text not null default '',
  official_email text not null,
  evidence_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decision_note text,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
create index if not exists org_applications_status_idx on public.organization_applications(status, created_at);

-- Private verification uploads are accessed only through server-side routes
-- after a TideCloak platform-admin check. No browser storage policies are added.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('organization-evidence', 'organization-evidence', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_subject text not null,
  email text,
  role text not null default 'staff' check (role in ('owner','staff')),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_subject)
);
create index if not exists organization_membership_subject_idx on public.organization_memberships(user_subject, status);

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invited_email text not null,
  token_salt text not null,
  token_hash text not null,
  created_by text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists organization_invites_org_idx on public.organization_invites(organization_id, created_at desc);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  category text not null,
  subject text not null,
  body text not null,
  status text not null default 'received' check (status in ('received','under_review','referred','resolved','closed')),
  assigned_to text,
  code text not null unique,
  secret_salt text not null,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(subject) between 1 and 120),
  check (length(body) between 10 and 5000)
);
create index if not exists cases_org_created_idx on public.cases(organization_id, created_at desc);
create index if not exists cases_department_created_idx on public.cases(department_id, created_at desc);

create table if not exists public.case_contacts (
  case_id uuid primary key references public.cases(id) on delete cascade,
  name text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('submitter','organization')),
  sender_subject text,
  message text not null check (length(message) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists case_messages_case_idx on public.case_messages(case_id, created_at);

create table if not exists public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('system','submitter','organization','platform_admin')),
  actor_subject text,
  event_type text not null,
  public_message text,
  visible_to_submitter boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists case_events_case_idx on public.case_events(case_id, created_at);

create table if not exists public.public_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0
);

create or replace view public.organization_directory as
  select id, name, category, description from public.organizations where status = 'approved';
create or replace view public.organization_department_directory as
  select d.id, d.organization_id, d.name from public.departments d
  join public.organizations o on o.id = d.organization_id
  where d.active and o.status = 'approved';

create unique index if not exists one_active_application_per_applicant
  on public.organization_applications(requested_by) where status in ('pending','approved');

create or replace function public.create_case_with_contact(
  p_organization_id uuid,
  p_department_id uuid,
  p_category text,
  p_subject text,
  p_body text,
  p_code text,
  p_secret_salt text,
  p_secret_hash text,
  p_contact_name text,
  p_contact_email text
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not exists (select 1 from organizations where id = p_organization_id and status = 'approved') then
    raise exception 'organization_not_available';
  end if;
  if p_department_id is not null and not exists (select 1 from departments where id = p_department_id and organization_id = p_organization_id and active) then
    raise exception 'department_not_available';
  end if;
  insert into cases(organization_id, department_id, category, subject, body, status, code, secret_salt, secret_hash)
  values (p_organization_id, p_department_id, p_category, p_subject, p_body, 'received', p_code, p_secret_salt, p_secret_hash)
  returning id into new_id;
  if nullif(p_contact_name, '') is not null or nullif(p_contact_email, '') is not null then
    insert into case_contacts(case_id, name, email) values (new_id, nullif(p_contact_name, ''), nullif(p_contact_email, ''));
  end if;
  insert into case_events(case_id, actor_kind, event_type, public_message) values (new_id, 'system', 'received', 'Your concern was received.');
  return new_id;
end $$;

create or replace function public.approve_organization_application(p_application_id uuid, p_admin_subject text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare application_row public.organization_applications%rowtype; new_org uuid;
begin
  select * into application_row from organization_applications where id = p_application_id and status = 'pending' for update;
  if not found then raise exception 'application_not_pending'; end if;
  insert into organizations(name, category, description, status, official_email, evidence_path, approved_at, reviewed_by, review_note)
  values(application_row.name, application_row.category, application_row.description, 'approved', application_row.official_email, application_row.evidence_path, now(), p_admin_subject, left(coalesce(p_note, ''), 1000))
  returning id into new_org;
  insert into organization_memberships(organization_id, user_subject, email, role)
  values(new_org, application_row.requested_by, application_row.verified_email, 'owner');
  update organization_applications set status = 'approved', decision_note = left(coalesce(p_note, ''), 1000), organization_id = new_org, decided_at = now(), decided_by = p_admin_subject where id = application_row.id;
  return new_org;
end $$;

create or replace function public.accept_organization_invite(p_invite_id uuid, p_subject text, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare invite_row public.organization_invites%rowtype;
begin
  select * into invite_row from organization_invites where id = p_invite_id and accepted_at is null and expires_at > now() for update;
  if not found or lower(invite_row.invited_email) <> lower(p_email) then return false; end if;
  insert into organization_memberships(organization_id, user_subject, email, role, status)
  values(invite_row.organization_id, p_subject, p_email, 'staff', 'active')
  on conflict(organization_id, user_subject) do update set email = excluded.email, role = 'staff', status = 'active';
  update organization_invites set accepted_at = now() where id = invite_row.id;
  return true;
end $$;

create or replace function public.append_submitter_reply(p_case_id uuid, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into case_messages(case_id, sender_kind, message) values(p_case_id, 'submitter', left(p_message, 3000));
  insert into case_events(case_id, actor_kind, event_type, public_message) values(p_case_id, 'submitter', 'submitter_reply', 'You sent a reply.');
end $$;

create or replace function public.update_organization_case(p_case_id uuid, p_organization_id uuid, p_status text, p_message text, p_subject text, p_assignee text)
returns void language plpgsql security definer set search_path = public as $$
declare case_row public.cases%rowtype; public_message text;
begin
  if p_status not in ('received','under_review','referred','resolved','closed') then raise exception 'invalid_status'; end if;
  update cases set status = p_status, assigned_to = coalesce(nullif(p_assignee, ''), assigned_to), updated_at = now()
    where id = p_case_id and organization_id = p_organization_id returning * into case_row;
  if not found then raise exception 'case_not_found'; end if;
  public_message := nullif(left(trim(coalesce(p_message, '')), 3000), '');
  if public_message is not null then
    insert into case_messages(case_id, sender_kind, sender_subject, message) values(p_case_id, 'organization', p_subject, public_message);
  else
    public_message := 'Case status updated to ' || replace(p_status, '_', ' ') || '.';
  end if;
  insert into case_events(case_id, actor_kind, actor_subject, event_type, public_message)
    values(p_case_id, 'organization', p_subject, p_status, public_message);
end $$;

create or replace function public.consume_public_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare current_window public.public_rate_limits%rowtype;
begin
  delete from public.public_rate_limits where window_started_at < now() - interval '1 day';
  insert into public.public_rate_limits(key_hash, window_started_at, request_count)
  values (p_key, now(), 1)
  on conflict (key_hash) do update
    set window_started_at = case when public.public_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) then now() else public.public_rate_limits.window_started_at end,
        request_count = case when public.public_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) then 1 else public.public_rate_limits.request_count + 1 end;
  select * into current_window from public.public_rate_limits where key_hash = p_key;
  return current_window.request_count <= p_max;
end $$;

alter table public.organizations enable row level security;
alter table public.organization_applications enable row level security;
alter table public.departments enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invites enable row level security;
alter table public.cases enable row level security;
alter table public.case_contacts enable row level security;
alter table public.case_messages enable row level security;
alter table public.case_events enable row level security;
alter table public.public_rate_limits enable row level security;

-- Server routes use the Supabase service-role key only after Tide token and
-- organization membership checks. Browser/anon access is intentionally denied.
create policy "public approved directory" on public.organizations for select to anon, authenticated using (status = 'approved');
create policy "public active departments" on public.departments for select to anon, authenticated using (active and exists (select 1 from public.organizations o where o.id = organization_id and o.status = 'approved'));
revoke all on public.organization_applications, public.organization_memberships, public.organization_invites, public.cases, public.case_contacts, public.case_messages, public.case_events, public.public_rate_limits from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on public.organizations from anon, authenticated;
revoke all on public.departments from anon, authenticated;
grant select on public.organization_directory, public.organization_department_directory to anon, authenticated;
revoke all on function public.consume_public_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, integer, integer) to service_role;
revoke all on function public.create_case_with_contact(uuid, uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_case_with_contact(uuid, uuid, text, text, text, text, text, text, text, text) to service_role;
revoke all on function public.approve_organization_application(uuid, text, text) from public, anon, authenticated;
grant execute on function public.approve_organization_application(uuid, text, text) to service_role;
revoke all on function public.accept_organization_invite(uuid, text, text) from public, anon, authenticated;
grant execute on function public.accept_organization_invite(uuid, text, text) to service_role;
revoke all on function public.append_submitter_reply(uuid, text) from public, anon, authenticated;
grant execute on function public.append_submitter_reply(uuid, text) to service_role;
revoke all on function public.update_organization_case(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_organization_case(uuid, uuid, text, text, text, text) to service_role;

-- Keep ephemeral throttling keys short-lived. Configure a scheduled cleanup:
-- delete from public_rate_limits where window_started_at < now() - interval '1 day';
