# Blindbox upgrade (2026-09-25)

## Delivered locally

- Twelve enhanced original procedural characters with accessories, separate materials, nine-bone weighted skins and AnimationMixer clips: Idle, Dance, Wave. No paid AI generation and no third-party model redistribution. These are authored stylized models, not claimed to match an image reference by any percentage.
- A 15-second, 1080x1920 or 1920x1080 recording with original synthesized music, story captions and branding. WebM/VP9 or VP8 is preferred, MP4 is a browser-dependent fallback; the extension matches the actual container. Browser speech synthesis is not captured. Cancel/background-tab interruption releases render/audio resources. Visible download link remains available when automatic download is blocked.
- Personalized four-beat stories for everyday, birthday, encouragement and apology gifts, with sender and relationship context. Receiver-first wrapped gifts, anonymous reactions, return gifts, sender-only receipt counts and revocable 30-day links. Stories are templates, not a claim of external AI generation. Reaction counts represent browser votes, not verified unique people or read receipts.
- Sender receipt capabilities are stored locally in the sending browser and never included in public reveals. Clearing browser storage loses receipt access. Revocation prevents future server reveals; it cannot erase downloaded videos or already opened content. Receipt data also needs the durable storage described below.
- Username/password registration, login/logout, recovery-code password reset, server-authoritative draw collections, and multi-device account reads. Salted scrypt passwords, hashed session/recovery tokens, HttpOnly SameSite cookies, session expiry/revocation, same-origin checks and rate limiting. Recovery codes are shown once and not logged.
- Guest collections remain local and cannot be submitted as account entitlements. Viewing a share never increments a collection. Public reveals do not include account data.

## Persistence and deployment gate

Account data is a single-process atomic JSON store in FANTASY3D_DATA_DIR. Do not deploy public registration on an ephemeral filesystem, do not run multiple server instances writing the same file, and do not advertise off-network phone sync before deployment. Production needs a durable volume plus backups, or migration to a managed transactional database. Production/Render registration is blocked unless BLINDBOX_PERSISTENT_STORAGE=true; set it only after verifying durability. No paid disk/database plan was purchased. Secure cookies are forced on Render/production; HTTPS is required.

The current preview listens on port 8770. A phone on the same trusted Wi-Fi can use the computer's LAN address (currently 192.168.31.17). This HTTP preview is for test accounts/passwords only. Windows firewall and wireless client isolation may prevent phone access. No global firewall disable or router port forwarding is performed. The computer must remain running. LAN IP can change.

## Evidence

- Account tests cover cross-account isolation, restart persistence, cookie flags, secret non-disclosure, wrong-password rejection, cross-origin rejection, recovery-code rotation and revocation of old sessions.
- Browser tests verify a second independent browser context sees the same account collection; all 12 characters have skinned meshes and three clips; 1080x1920 video metadata, decoded nonblank frame, cancellation and responsive overflow.
- Screenshots and test video are in the workspace outputs/blindbox directory, outside version control. Recordings generated during QA are not customer assets.
- Browser code still needs real iOS/Safari and physical phone testing; headless Edge desktop/mobile viewports are not proof of those devices.

## Still not provided

Public cloud hosting/persistent database provisioning, email login or email password recovery, paid checkout, premium entitlements, MP4 transcoding service, externally generated high-end character meshes, and guaranteed 30fps recording on every phone.

## Start and test

Use `npm start` for the normal application. `node --test tests/*.test.js` runs regression tests. The existing office, product files, orders and payment code were not replaced; the CSP now permits local blob video playback without adding remote script origins.
