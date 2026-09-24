# Fantasy3D global gift strategy

## Positioning

A thoughtful digital gift for someone on your mind. The product is emotional expression, not a promise of advanced AI, financial luck or valuable random rewards. Start with English, Simplified Chinese, Spanish, French, German and Japanese; these languages do not imply legal availability in every country. Keep the existing office as a separate destination.

## Hypotheses to validate

1. Relevance: occasion and relationship let visitors recognize their own situation. Test birthday and just-because entry points before adding more categories.
2. Authorship: an optional personal sentence gives the sender ownership of the message. Show the complete gift before sharing.
3. Curiosity: a wrapped gift and a short reveal create anticipation, without fake expiry, payment pressure or a blocked exit.
4. Connection: a recipient may react or send a gift back. Neither action is required to view the original gift.
5. Trust: disclose link visibility, real expiry, free-preview status, data location and lack of active checkout. Avoid fake reviews, invented customer counts or claimed conversion lifts.

These are design hypotheses, not measured psychological or business outcomes. Do not describe the product as proven to increase happiness, intimacy or conversion.

## Implemented in this round

- Six-language interface selection using URL, saved preference and browser language; localized character display names, gift stories, common errors and account interface.
- Sender-selected language preserved in signed gift data and shared URL. Names and personal messages remain user-authored text, never HTML.
- Optional 60-character personal sentence as the final story beat; available in the recipient experience and captioned video.
- Explicit local-preview notice: localhost and LAN links are not publicly shareable. Payments remain disabled.
- No third-party analytics, ad pixels, email capture campaign or recurring subscription was enabled.
- Added authenticated account export and password-confirmed account deletion with session invalidation.
- Added explicit local/public sharing gates, production persistence guard and private-link noindex/no-store headers.
- Added factual English/Chinese privacy/service information, without inventing operator or support details.
- Added encrypted offline backup/restore tools and a configuration launch checker. Production backup scheduling, retention and recovery ownership remain unconfigured; see BLINDBOX-OPERATIONS.md.

## Learning before monetization

Recruit a small consent-based pilot with senders and recipients in the intended regions. Observe time to first preview, preview-to-share rate, successful recipient opens, optional reactions and technical failures. Separate internal test traffic, browser votes and real people; do not treat reactions as read receipts. Ask why people chose not to share. Do not log personal message text, passwords, recovery codes or signed gift tokens into analytics. Any future tracking requires a documented purpose, retention and appropriate consent handling.

## Launch gates still open

Language coverage is English, Simplified Chinese, Spanish, French, German and Japanese. Regional BCP 47 codes are normalized; unsupported languages get an explicit English fallback. Traditional Chinese is not silently labeled as supported by a Simplified Chinese translation. RTL direction is unit-tested in the locale policy and CSS support is prepared, but no Arabic/Hebrew translated release has passed visual QA. This is not all-language support.

No translation-service configuration was detected in the current environment. Browser-native translation is not a universal substitute: availability is device, browser and language-pair dependent. The four added language packs are model-authored, bundled locally, and shared by interface and server stories. No external translation service receives names or private messages. Native-speaker review is still required before a polished regional commercial launch. Expansion requires translated interface/error/character/story resources and language-specific QA. Do not add untranslated languages to the supported-language selector merely to increase its count.

- Public HTTPS domain, durable storage/backups, restore drill, monitoring and incident ownership.
- Real iOS/Android, Safari and in-app messenger browser testing, including video download and non-WebGL fallback.
- Operating entity, customer-support contact, applicable terms/privacy/data-deletion process, and review of asset rights and regional obligations.
- Eligible checkout provider, transparent currency/price/tax totals, payment verification, delivery, refunds and chargeback procedures. Existing legacy store payment links require separate review before paid promotion.
- Actual performance and accessibility testing across target devices and network conditions. No worldwide uptime, compliance or conversion claim is justified yet.
- Server-rendered localized metadata, search indexing/canonical language URLs, social-share image previews and a content/distribution plan for the chosen regions. Current language switching is client-side; it is not a complete international SEO implementation.

## Reference principles

FTC, Bringing Dark Patterns to Light: https://www.ftc.gov/reports/bringing-dark-patterns-light

EDPB, Guidelines 03/2022 on deceptive design patterns in social media interfaces: https://www.edpb.europa.eu/documents/guideline/guidelines-032022-on-deceptive-design-patterns-in-social-media-platform_en

These sources inform avoidance of deceptive design. They are not a legal opinion or certification for this website.
