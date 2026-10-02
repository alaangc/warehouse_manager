# Production HTTP security

Run the API behind a TLS-terminating reverse proxy, with the application port
reachable only from that proxy and internal health probes. Set NODE_ENV=production,
APP_ORIGIN to the exact public HTTPS origin (no trailing slash/path), and TRUST_PROXY
to the proxy's explicit comma-separated IP addresses or CIDRs. For a same-host proxy,
use 127.0.0.1/32,::1/128. An unset value trusts no forwarded headers. Do not use public
networks, hop counts, true, or an all-address CIDR. The proxy must overwrite
X-Forwarded-For, X-Forwarded-Host and X-Forwarded-Proto; client-supplied values must
not survive. Match the allowlist to the actual deployment topology.

Plaintext production API requests receive 400 HTTPS_REQUIRED before body parsing,
session lookup or business operations. Only GET /api/v1/health permits internal
HTTP readiness probes. Redirect public HTTP to HTTPS at the edge; do not redirect
mutation requests inside the API. The API sets HSTS for one year, nosniff,
no-referrer, frame restrictions and private, no-store. Development keeps local HTTP
working and disables HSTS and CSP upgrade-insecure-requests.

## Frontend and proxy headers

API response headers do not protect a separately served HTML document. Configure
the static frontend's HTTPS server to emit the following headers as well, including
on error responses. Keep frontend and API on the same origin. Example Nginx TLS
server directives (TLS certificates, server_name and upstream are deployment-owned):

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Frame-Options "DENY" always;
add_header Permissions-Policy "bluetooth=(self), camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests" always;

location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

Review includeSubDomains before enabling HSTS on a domain with other services.
Inline styles are allowed for MUI/Emotion; inline scripts and eval are not allowed.
Blob/data images support local assets; object embedding is blocked. PDF downloads
remain available. bluetooth=(self) permits this origin to request a device, but
does not grant permission, bypass the browser chooser, or prove hardware support.
Do not load the application in a third-party frame. Use the production build for
CSP checks; the development HMR server has a separate local security context.

## Request limits and cookies

Limits apply in every environment: 600 API requests/minute per IP, 30 login
requests/minute per IP before body parsing, and 10 login attempts/minute per
IP plus normalized username. IPv6 addresses use the library's /56 grouping.
Excess requests return 429 application/problem+json, Retry-After and draft-8
RateLimit headers. Limits include successful requests; GET /api/v1/health is
exempt so readiness probes do not compete with user traffic. Protect probes at
the network edge. The application limits
are in-memory, per process, and reset on restart; multi-replica deployments must
also enforce an aggregate edge/shared-store limit. Size limits and edge connection
timeouts remain necessary. Account authorization and CSRF checks remain mandatory.

Production login and logout use __Host-wm_session with Secure, HttpOnly,
SameSite=Strict, Path=/ and no Domain. Session lifetime is at most 12 hours, with
30-minute idle expiry enforced by the database. Development/test uses wm_session
without Secure for local HTTP. Never deploy with a nonproduction NODE_ENV.

## Secrets and logging

Generate SESSION_SECRET with a cryptographic random generator (at least 32 random
bytes, encoded as hex/base64url). Store it in the deployment secret manager, not
the frontend, Git, screenshots or shell history. Startup rejects short values,
known placeholders, repetitive values and non-HTTPS production origins. These
checks detect configuration mistakes, not entropy; randomness is an operator duty.
Rotating this key invalidates signed document history cursors; existing opaque
database sessions are separate and require explicit revocation when appropriate.

HTTP logs allow only request ID, method, path and response status plus timing.
Headers, bodies and query strings are omitted. Unexpected errors record a generic
error type without database messages, stack traces or connection strings. Existing
secret-field redaction is retained as defense in depth. Do not add raw request,
SQL parameter or secret-bearing error logging. Request IDs remain available for
correlation; handle infrastructure diagnostics through access-controlled tooling.

## Verification and references

Run the security/config/logger unit tests and foundation HTTP contracts. Verify
the actual public HTML and API headers after deployment, and test HTTPS through
the real proxy plus a denied direct connection. Local tests cannot certify the
deployed proxy or actual Bluetooth hardware.

- [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/)
- [Helmet CSP and headers](https://github.com/helmetjs/helmet)
- [Rate limit configuration](https://express-rate-limit.mintlify.app/reference/configuration)
