# Major-language release

Supported gift-site locales: English, Simplified Chinese, Spanish, French, German and Japanese.

## Implementation

- Shared static resource: frontend/blindbox/locale-pack.json.
- Client adapters: i18n.js, locale-text.mjs and locale-policy.mjs.
- Server story localization: lib/blindbox-gifts.js. Signed gifts retain their selected language.
- Localized interface, character names, account messages, reactions, story captions and export progress.
- URL language overrides saved preference and browser language. Unsupported locales show an explicit fallback. Resource-load failure leaves English and Chinese available.
- Names and personal messages remain verbatim. No translation API or paid generation service is called.
- Existing office and store business routes are unchanged by this language increment.

## Verification

Run node --test tests/*.test.js with the existing dependency path.
Browser checks: ../test-major-languages.cjs and ../test-global-gifts.cjs.
Six-language browser checks cover automatic language selection, signed draws, personalized notes, receiving and reacting, mobile/desktop overflow, resource coverage and failed-resource fallback.
Screenshots are saved outside the repository under outputs/blindbox/language-*-mobile.png and language-*-desktop.png.

## Limits

Local preview: http://127.0.0.1:8770/. This increment has not been deployed publicly.
The new translations are model-authored, not professionally reviewed. Native-speaker review is required before polished regional commercial release.
The original office has its own language behavior; these six packs cover the gift experience, not every legacy page.
Browser speech availability depends on installed voices. New-language video exports and physical mobile devices have not received separate end-to-end certification.
Payments, public persistent storage, localized legal/support content and international SEO remain separate launch gates. This is not all-language support or global commercial approval.
