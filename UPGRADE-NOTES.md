# Office Restoration and Security Fixes

The office entry is restored from 6e3b69f. The Three.js scene files and the
seven new portrait images remain intact. The public-host fix is preserved.

## Access

- Set ADMIN_API_TOKEN to a strong random secret in the deployment environment.
- Enter it on admin.html to manage products. The page does not persist it.
- Remote administration is denied without the token, even with ALLOWED_HOST set.
- Other operator API clients must send Authorization: Bearer <token>.
- Local desktop development permits direct loopback access only when no token
  is configured, no proxy headers exist, and the process is not in production.
- Storefront reads, checkout and the workshop's existing session-protected jobs
  remain public. Historical data and the existing product catalog are unchanged.

## Orders

Order lookup now requires the exact order ID and purchase email. Existing
confirmation messages include the order ID. An email address alone no longer
returns order history. PayPal captures must contain the exact expected USD amount.

## Verification

Run node --test tests/*.test.js with the project's dependencies installed.
The office entry regression test prevents replacing the 3D loader unnoticed.
Security tests cover operator authorization and malformed payment amounts.
Server tests cover public access, denied management requests and order lookup.

## Remaining Checks

This is a scoped security repair, not a complete penetration test. Production
deployment, browser rendering, real PayPal sandbox capture and authenticated
operator actions still need environment-level verification. Public model
previews and cross-visitor workshop/chat isolation require a separate review.
Do not represent a passing local test suite as evidence that Render has deployed.
