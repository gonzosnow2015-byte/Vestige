# Vestige

Company register for lifting gear: shackles, slings, wire batches, and the inspections that keep them in service.

The name is Vestige.

## What you get

- A company is created when someone signs up. That person is the admin.
- Roles are `admin`, `inspector`, and `viewer`. Viewers can read. Inspectors can change gear and record exams. Admins can also rename the company and remove assets.
- Part numbers are unique inside a company, ignoring letter case.
- An inspection writes the next due date and status back onto the asset.
- Certificate rows store a storage path (`files.file_path`). The file bytes are not stored yet.

## Stack

This preview runs on TanStack Start, Postgres, and Better Auth (email and password, plus Google and X). That is the database and sign-in this environment actually provisions.

The table shapes match the requested register: `companies`, `users`, `assets`, `inspections`, `files`. `users.id` is the auth account id (text, not uuid) because that is what the auth tables use.

There is no `.env` file. In the preview the database is embedded Postgres and sign-in needs nothing configured. On deploy the platform injects `DATABASE_URL` plus the auth secrets (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET`). Do not put those in the client.

## Invites

Add user saves a pending invite for one email address and tries to email a link. The platform does not provide a mail account, so the published app sends through [Resend](https://resend.com) when these are set in the deploy environment (never commit them):

- `RESEND_API_KEY` — API key from Resend.
- `INVITE_FROM` — a verified sender on that Resend account, for example `Vestige <invites@yourdomain.com>`.

`onboarding@resend.dev` only delivers to the Resend account owner, so it will not reach the person you invite. If either variable is missing, or Resend rejects the message, Add user still keeps the invite, shows that error, and offers a copyable link (`/?invite=…`). The invited person has to sign in or create an account with that exact email.

## Schema and isolation

`migrations/0002_lifttrack.sql` is the schema. It enables row level security and adds a policy per table that allows only the company returned by `app_company_id()` (read from the `app.user_id` setting).

The app connects as the table owner, and a pooled connection does not keep session settings. Owners bypass RLS, so those policies are the contract for a future restricted role. The live boundary is `src/lib/lift/server.ts`: every server function takes the signed-in user from auth middleware and filters by that user's `company_id`. A company id sent from the browser is ignored.

## Run

```bash
npm run dev
```

The dev server listens on port 8080. `npm run build` applies migrations when `DATABASE_URL` is set.
