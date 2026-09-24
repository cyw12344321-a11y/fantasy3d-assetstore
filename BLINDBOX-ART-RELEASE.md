# Character card art release - 2026-09-25

## Scope

All twelve catalogue characters now have distinct generated raster illustrations. Runtime cards use subtle whole-image zoom and pointer tilt, not skeletal motion or independently animated layers. Procedural 3D remains a fallback and the office is unchanged. This is a local art release, not a declaration of commercial readiness.

## Design decisions

- Keep each character recognizable through silhouette, expression, clothing and props; share soft material treatment, brass accents and a restrained coral/jade palette.
- Frame the experience as sending a personal gift. Recipient does not need an account. Reactions and return gifts remain optional. Do not invent urgency, scarcity or verified social proof.
- State that a sender preview has not yet been sent. Retain disclosed draw probabilities and no-paid-draw status. De-emphasize rarity in the catalogue rather than promoting compulsive collection.
- Hide 3D-only motion controls when an art card is visible. Provide a lightweight animation checkbox, respect OS reduced-motion preferences, preserve readable contrast and whole-character framing.

## Assets and performance

Full original PNGs and exact generation prompts for this batch are preserved under frontend/blindbox/art. WebP derivatives retain the full frame. Twelve 1536px-max art files plus twelve 360px-max thumbnails total 2,104,854 bytes. Thumbnails load lazily; full artwork decodes on selection. Recording waits for the matching artwork or reports an error. No paid Meshy calls were made.

## Verification and remaining gates

Browser coverage: all twelve images decode and draw, correct catalogue-to-art mapping, mobile overflow, pause/reduced-motion behavior, gift receipt/revoke loop, recording dimensions and decoded video content, account collection synchronization. Screenshot evidence is stored outside the repo in outputs/blindbox.

Still required before paid public release: persistent cloud storage and backups, real mobile-device testing, applicable commercial asset/IP review, privacy/account-deletion lifecycle, and an eligible payment provider with verified order/refund handling. No paid provider or infrastructure was provisioned in this release. Psychological design hypotheses have not been validated with real users or conversion experiments.
