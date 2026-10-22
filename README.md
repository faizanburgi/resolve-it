# Resolve It

Resolve It is a public concern reporting service with private organization workspaces. Public users can submit without an account and can optionally leave contact details. Organization workspaces stay unpublished until a platform administrator approves the application.

## Data ownership

- **Supabase PostgreSQL** stores the approved organization directory, applications, departments, memberships, invitations, cases, separately held optional contacts, messages, workflow events, and temporary rate-limit hashes. Run `supabase/migrations/0001_resolve_it.sql` in the Supabase SQL Editor. It creates schema objects only; it inserts no organizations, people, or cases.
- **Supabase private Storage** holds organization verification documents in the `organization-evidence` bucket. Browser access is not granted; the application server uploads documents, and platform admins receive five-minute signed review links. Case attachments are not supported.
- **TideCloak** manages staff identity and IAM: sign-in, realm/client configuration, and platform-admin role. It does not store Resolve It cases or provide the application database. Resolve It stores TideCloak subject identifiers in memberships and audit events.
- **Tide Raziel MCP** is a development-time assistant integration, not an application runtime dependency. It does not receive or store Resolve It records.

Case text and verification documents are stored in Supabase by the app. Contact details are written to the separate `case_contacts` table and are returned only by the organization API after staff identity and active organization membership checks. Anonymous follow-up secrets are shown once; only a salted scrypt verifier is persisted. Request throttling stores a keyed hash of the caller network address, cleaned after one day. Hosting, database, identity, and network providers can have their own operational logs and retention settings; configure those for the deployment.

## Local setup

1. Install the Node.js version supported by the current Next.js release and run `npm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL, public anon key, service-role key, and a long random `RATE_LIMIT_SECRET`. Keep the service-role key server-only.
3. Run the SQL migration against a new Supabase project. Enable TLS and keep database backups and access limited to project operators. The migration uses RLS as defense in depth; server routes use the service-role key only after their own checks.
4. Create a TideCloak client using Tide's supported Next.js setup. For local development, place its generated adapter configuration at `tidecloak.json` (or set `TIDECLOAK_CONFIG_PATH`). For Vercel, set the full adapter JSON in the server-only `TIDECLOAK_CONFIG_JSON` environment variable so the config is present in serverless functions. Keep it out of source control. Configure the hosted realm/client and exact allowed callback/logout URLs for the deployment, including `/auth/redirect` and the SDK's silent SSO check URL. Configure the `platform-admin` realm role and manually grant it to the first trusted Resolve It administrator. Never add a public platform-admin registration path.
5. Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS site origin. Add all environment variables to the hosting provider (for example Vercel) and deploy the Next.js app. Add the deployed origin and callback URLs to TideCloak. Do not enable organization applications until sign-in and server-side token verification have been confirmed against the hosted realm.
6. Register an organization through the organization portal. The administrator checks the official email and evidence before approving. Then the owner can create departments and invite staff. Staff can assign cases to active members, respond in the private case inbox, and update case status. No seed or demo records are needed.

## Production configuration checklist

- Supabase project with the migration applied and secrets configured.
- Hosted TideCloak realm/client, verified email flow, client adapter file, HTTPS callback/logout URLs, and manually assigned platform-admin role.
- Public HTTPS deployment with `NEXT_PUBLIC_APP_URL`, Supabase keys, Tide config path, and strong `RATE_LIMIT_SECRET` configured as server environment variables.
- Confirm browser pages never receive the service-role key or raw anonymous secret; confirm pending/rejected organizations do not appear in the public directory; review provider logs and retention before inviting real users.

The application is not publicly deployed by this source setup. A working live sign-in and database require the project credentials and hosted configurations above. The app intentionally reports setup unavailable until those are supplied; it does not use fake authentication or seeded sample data. Set a retention and deletion schedule for reports and verification documents before broad public use; this version does not automatically purge either.
