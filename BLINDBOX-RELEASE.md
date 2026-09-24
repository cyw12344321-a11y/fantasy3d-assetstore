# Fantasy3D Blindbox Preview

## Scope

- Homepage `/` and `/index.html` now serve `frontend/blindbox.html` through Express.
- `/office.html`, its original assets/navigation and all existing store/order APIs are retained.
- Twelve original procedural Three.js characters, two pools, 3-second countdown, animated reveal, browser speech synthesis (opt-in), signed reproducible share URLs, local-device collection and character previews.
- No cloud AI generation, paid model calls, premium purchases, pity counters, buybacks, subscriptions, NFT or live payment integration.
- These are procedural meshes and transform animations, NOT finished AI-generated GLBs or skeletal animation assets. Browser speech synthesis is not prerecorded commercial TTS.
- Recording/MP4 exports, accounts, cloud collections and custom social preview images remain out of scope for this preview.

## Payment Gate

User requested Payoneer on 2026-09-25. Payment is intentionally disabled. Payoneer's Request a Payment documentation excludes consumer ecommerce checkout; the Checkout public page currently requires a Hong Kong entity (or willingness to establish one) and monthly webstore volume above USD 20,000. The user's stated mainland individual account does not establish eligibility. Do not substitute an invoice link, mark orders paid locally, or claim this integration is live.

- https://pages.payoneer.com/request-payment-worldwide/
- https://www.payoneer.com/checkout/

## Operations

Run `npm start` as before. The new module has no new production npm dependency.
Draw and reveal APIs live under `/api/blindbox/`. Draws are free, independent, cryptographically random and limited to 20/minute per Express request IP. Behind a reverse proxy without trusted client IP configuration, this can become a shared limit; configure trusted proxies deliberately, never blindly trust arbitrary forwarded headers.
Set a strong `BLINDBOX_SIGNING_KEY` in the server environment for durable share links, or persist `FANTASY3D_DATA_DIR`. Without either, a redeploy that replaces the data directory invalidates old links. Never commit this key. Rotating it intentionally revokes all existing shares.
Share tokens contain the recipient nickname in decodable form; the UI discloses this. Anyone holding the URL can view it. No raw name is rendered as HTML.
Collections are browser-local convenience state, not purchased entitlements. No cash value or proof of ownership.

## Verification

`node --test tests/*.test.js`
Local Playwright evidence captured in `outputs/blindbox/` outside the repository: desktop, mobile, revealed character. Checks cover canvas movement, twelve character previews, result consistency in a second page, mobile overflow, and JS errors.
