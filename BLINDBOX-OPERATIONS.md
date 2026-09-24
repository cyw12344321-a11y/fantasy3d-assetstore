# Free-pilot operations

## Current state

The gift experience is a local free preview. No payment provider is connected.
The original office and store remain separate. Do not promote legacy store checkout until independently reviewed.
The new privacy/service information is factual preview copy in English and Chinese, not legal certification. Other locale selectors explicitly label this destination as English.

## Public launch gate

Set NODE_ENV=production, a verified HTTPS BLINDBOX_PUBLIC_ORIGIN, and FANTASY3D_DATA_DIR on a durable mounted volume.
Only set BLINDBOX_PERSISTENT_STORAGE=true after testing redeploy persistence.
Configure the real BLINDBOX_SUPPORT_EMAIL and BLINDBOX_OPERATOR_NAME.
The user-approved public support email is 715341216@qq.com. The local preview uses it; production must set BLINDBOX_SUPPORT_EMAIL=715341216@qq.com in the hosting environment. Fantasy3D remains the brand, not a verified legal operator identity. Mailbox delivery and ownership have not been tested.
Run node scripts/blindbox-launch-check.cjs. It prints configuration blockers without secrets.
Public gift creation refuses to run without the persistence declaration. Public sharing requires production mode, persistence and a configured domain; the client also requires its current origin to match.
Do not reuse local-preview tokens on another deployment: they are signed with a different key.
Use one application instance for this JSON-file store. Concurrent writers/replicas are unsupported; migrate storage before scaling.
Set an exact ALLOWED_HOST. Keep production credentials and data outside frontend and source control.

## Backup and recovery

Stop the service for a consistent snapshot. Choose a strong backup passphrase in the secret manager and provide it through BLINDBOX_BACKUP_PASSPHRASE; never put the value in source, command arguments or chat.
Set BLINDBOX_BACKUP_OFFLINE=true after stopping the service.

```text
node scripts/blindbox-backup.cjs backup ABSOLUTE_DATA_DIR NEW_ENCRYPTED_ARCHIVE
node scripts/blindbox-backup.cjs verify ENCRYPTED_ARCHIVE
node scripts/blindbox-backup.cjs restore ENCRYPTED_ARCHIVE NEW_EMPTY_PATH
```

Restore creates a new directory and refuses existing destinations. It does not replace running data.
Backups cover gift accounts, gift receipts/revocations and the file-based signing key, not the legacy store database or media.
If BLINDBOX_SIGNING_KEY is supplied by the environment, preserve that secret separately and restore it unchanged. The file key is not the effective key in that configuration.
Encryption uses AES-256-GCM with a scrypt-derived key. Losing the passphrase loses access to the archive.
Tests verify synthetic-data round-trip, wrong-key rejection, corruption detection and overwrite rejection. A production restore drill has NOT been performed.
Decide retention and off-host backup ownership before inviting public users. No scheduled backup was silently enabled.
Deletion removes live account data and sessions. Before restoring an older backup, reconcile deletions since that snapshot; do not resurrect deleted accounts. This manual deletion reconciliation is an unresolved operational launch gate.

## Privacy and incident checklist

- Do not log gift paths/tokens, passwords, recovery codes, or message text in application analytics.
- Gift links are signed, not encrypted. Revocation prevents server access but cannot erase encoded text or downloaded copies.
- Gift pages return no-store and noindex/nofollow/noarchive. These directives are not access controls.
- Configure hosting access-log redaction/retention separately.
- Export contains only the authenticated user's public account fields, creation time and collection, not credential hashes or sessions.
- Account deletion rechecks the current password, deletes sessions and leaves unrelated anonymous gifts unchanged. Revoke gifts first.
- No third-party analytics or ad pixels are enabled. Do not claim conversion or retention results without evidence.

## Small pilot before monetization

Invite a small consenting group only after the public gate passes. Use two independent devices per send/receive test.
Observe whether they can select an occasion, preview, share, receive and optionally react without coaching.
Ask what felt confusing, whether they would really send it, and what would make it worth returning to.
Record aggregate task completion and failure reasons manually; do not record personal messages.
Test actual Safari/iPhone, Android and messenger in-app browsers, including video export.
Paid themed content requires a clear preview, fixed price, delivery scope, support/refund policy and an eligible provider. Keep free random draws separate from paid products.

## Remaining external decisions

Real operator/support identity, hosting volume, backup retention/recovery ownership, native-language review, asset rights review, applicable legal review, payment eligibility, and real pilot feedback remain unverified.
No public deployment, live payment or customer recruitment occurred in this increment.
