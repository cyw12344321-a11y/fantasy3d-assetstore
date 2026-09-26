# Free Render + persistent PostgreSQL

## Scope

`BLINDBOX_DATABASE_URL` enables PostgreSQL for gift accounts, sessions, cloud
collections, gift reactions/revocations, and the signing key. Payment remains
disabled. The legacy asset-store/office file storage is unchanged; this is not
a migration of those systems.

No connection string: existing local-file behavior and production storage guards
remain. Configured but unreachable database: operations return 503, with no
ephemeral fallback. Sharing is advertised only after a successful database probe.

## Provision without upgrading Render

1. Create a Neon **Free** project in your own account, choosing a region close to
   Render Singapore when available. Do not select Launch or Scale.
2. Copy its pooled PostgreSQL connection string. Keep this secret out of chat,
   screenshots, source control, and frontend files.
3. In the existing Render service, Environment, add `BLINDBOX_DATABASE_URL` with
   that connection string as its value. Save and redeploy.
4. Keep `BLINDBOX_PUBLIC_ORIGIN=https://fantasy3d-assetstores.onrender.com`.
   Do NOT set `BLINDBOX_PERSISTENT_STORAGE=true` for an ephemeral Render disk.
   That flag is only for installations with an actual persistent local disk.
5. Check config sharingEnabled, register a test account, create a gift, open its
   recipient URL in another browser, react, inspect the receipt, and revoke.
6. Restart/redeploy Render. Confirm the account, collection, and revocation still
   exist and a non-revoked gift still opens. Delete the test account afterwards.

These last steps are an external acceptance gate, not implied by local tests.
The database credentials/account have not been provisioned by the code change.

## Quota checked 2026-09-26

Neon's official FAQ lists per Free project: 0.5 GB database storage,
100 CU-hours/month, 5 GB public network transfer/month, and scale-to-zero after
five inactive minutes. Restore history is six hours, capped at 1 GB of changes.
Source: https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md

Render remains Free and can sleep. Both services can have cold starts. Quota
exhaustion or a provider outage can suspend availability; free does not mean
unlimited capacity or an SLA. Monitor usage in the provider console; do not
auto-upgrade. Arrange encrypted offsite database backups before commercial use;
short restore history is not a complete backup policy.

## Implementation and limits

The adapter preserves the existing bounded JSON structures in separate JSONB
rows (accounts, receipts, signingKey). PostgreSQL row locks serialize mutations,
and responses/cookies are held until commit. This is a small-volume compatibility
implementation, not a high-throughput normalized account database. Large account
sets amplify transfer and lock contention; normalize individual users/sessions/
receipts before scaling. Current application caps (10,000 users, 5,000 receipts,
100 reactions per gift) are upper bounds, not guaranteed free-tier capacity.

TLS certificate verification is required, the pool is limited to three
connections, and timeouts prevent indefinite waits. Images/videos are not stored
in the database. Do not poll database health continuously to keep it awake.

Existing local accounts or gifts are NOT automatically uploaded. Before switching
an installation with existing data, stop writes, take a private backup, and
migrate its account/receipt documents and original signing key together. Starting
with a new database key invalidates links made with the old key. Do not delete or
overwrite the original files. Existing BLINDBOX_SIGNING_KEY overrides must remain
unchanged across deployment. No historic user data is migrated by this patch.

For that one-time migration, BEFORE starting the database-backed application,
set the connection URL privately in the environment and run
`node scripts/import-gift-database.js <original-data-directory>`.
The importer requires an empty destination, refuses overwrite, uses one atomic
transaction, and leaves all source files unchanged. It never prints credentials.
Test it against a separate database first; keep the private original backup.
