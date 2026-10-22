# Resolve It

Resolve It is a public concern reporting platform. People can submit concerns without creating an account, choose an approved organization, and optionally provide contact details. Organization staff use private workspaces to review and resolve cases. Organization applications stay out of the public directory until a platform administrator approves them.

## Run locally

### Requirements

- Node.js 20.9 or later
- npm
- A Supabase project for database-backed features

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and edit the local copy:

```bash
cp .env.example .env.local
```

Set the following values in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL, such as `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key; safe for browser use when database policies are configured |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key used by API routes. Never expose or commit it. |
| `RATE_LIMIT_SECRET` | Long random secret used to hash network identifiers for rate limiting |
| `NEXT_PUBLIC_APP_URL` | Canonical app origin, for example `http://localhost:3000` locally |
| `TIDECLOAK_CONFIG_PATH` | Path to a local TideCloak adapter JSON file; defaults to `./tidecloak.json` |
| `TIDECLOAK_CONFIG_JSON` | Optional server-only alternative containing the adapter JSON as a single-line JSON string; takes precedence over the path |

Do not commit `.env.local` or `tidecloak.json`. The service-role key and TideCloak configuration must remain server-side.

### 3. Create the database schema

In the Supabase dashboard, open the SQL Editor and run [`supabase/migrations/0001_resolve_it.sql`](supabase/migrations/0001_resolve_it.sql). The migration creates schema objects and policies; it does not insert example organizations, users, or cases. Keep the service-role key restricted to server-side deployment variables.

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The landing page is at `/`, reporting is at `/report`, case tracking is at `/track`, the organization workspace is at `/organization`, and the privacy page is at `/privacy`.

Without valid Supabase settings, database-backed routes are unavailable. Staff sign-in and organization management also require a reachable TideCloak realm and valid adapter configuration; the app does not provide a fake-authentication bypass or a public platform-admin signup.

## Build and run for production

```bash
npm run build
npm run start
```

Configure the same environment variables in the hosting provider. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS origin. Configure the TideCloak client for that origin and its exact callback/logout URLs, including `/auth/redirect` and any SDK-required silent SSO check URL. Provision the first trusted platform administrator manually in TideCloak with the `platform-admin` role.

## Data and access

- **Supabase PostgreSQL** stores organizations, verification applications, departments, memberships, invitations, cases, messages, workflow events, separately stored optional contact details, and short-lived rate-limit hashes.
- **Supabase private Storage** holds organization verification documents in the `organization-evidence` bucket. Case attachments are not supported in this version.
- **TideCloak** manages staff identity and IAM. It does not store Resolve It cases or provide the application database. Server routes verify staff identity and organization membership before returning organization data.
- Anonymous follow-up credentials are shown once; only a salted scrypt verifier is stored. Identifying details included in the report text can still reveal a reporter's identity.
- The public directory lists approved organizations only. A fresh setup intentionally has no user-facing records until real organizations and reports are submitted.

Before inviting real users, confirm the migration and storage policies, test tenant isolation and admin approval, and configure provider logging, retention, backups, and report/document deletion policies.
