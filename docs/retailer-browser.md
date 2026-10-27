# Retailer browser worker

The price reader can use an ordinary anonymous Chromium browser with JavaScript and cookies. IGA may reuse an anonymous store session after its branch has been independently verified; other lookups have fresh sessions. It does not import accounts, copy a user's browser cookies, change browser identity, solve CAPTCHAs or repeatedly refresh a security check.

The service accepts only local server requests on `127.0.0.1:8794`. Do not expose this port through the website's reverse proxy. `POST /render` (or `/`) requires `Content-Type: application/json` and a body such as:

```json
{"url":"https://www.coles.com.au/search?q=chicken"}
```

IGA may also receive `store:{id,name,area,address?,lat?,lon?}`. The application must derive this from its verified nearby-store results. The browser verifies the visible selected branch and refuses a different store. Generic IGA search URLs do not identify a branch. Cache entries include all store details.

At most four verified IGA contexts are retained for five idle minutes. The initial ordinary store-selection flow is coalesced, and only its exact branch address/card/header proof establishes reusable canonical metadata. Every later query opens a new page, waits for that canonical header, then waits up to five seconds for its current product requests to settle before extracting product cards. Known advertising/analytics requests still load normally but do not hold that readiness timer open. Unfinished branch data returns no quotes. Different store identities/addresses never share a context. A cancelled query closes its own page; initial selection stops when all waiting readers cancel. No cookies are exposed in responses or logs.

For a website verified by the application's nearby-store discovery, the server may send `source:"local-shop"` with its public HTTPS URL. This mode permits only same-host page navigation (including a `www` alias), while retaining the public-IP-pinned network boundary. Do not forward arbitrary user-supplied URLs to this endpoint.

Local-shop discovery pages may contain product links before any selling prices. Meaningful, non-gated HTML is returned for that discovery step; it does not establish a price. The local product parser must still verify one published AUD product/offer, a compatible ingredient and a usable quantity.

Successful responses contain `html`, `url`, HTTP page `status`, and `providerStatus:"ready"`. Controlled failures return empty HTML, a message, and `providerStatus:"needs-browser"`, `"needs-store"`, `"not-configured"` or `"unavailable"`. A human check needs the user to open the retailer and complete its normal steps. An anonymous online guide does not confirm prices or stock at the user's branch.

`GET /health` reports service health, whether Chromium is installed/connected, active/queued jobs and cached pages. An installed browser still needs an actual lookup to prove that its sandbox launches correctly.

## Install on the host

Install the project dependencies with its pinned package lock, including `playwright-core`, and install the distribution's supported Chromium package. The example service uses `/usr/bin/chromium` and `/usr/bin/node` and reads the checkout from `/opt/fusion-table`. Adjust these three paths to the actual server installation. The service user needs read and directory-traversal access to the checkout and its dependencies.

Create a dedicated system account `fusion-retailer`, install `scripts/retailer-browser.service` as `/etc/systemd/system/fusion-retailer-browser.service`, reload systemd, and enable/start `fusion-retailer-browser.service`. Configure the application with `FUSION_BROWSER_PRICE_URL=http://127.0.0.1:8794/render`.

Run as the dedicated unprivileged service user. Chromium's sandbox is explicitly enabled. If the host prohibits its sandbox or user namespaces, repair that host configuration; do not add `--no-sandbox`. The provided systemd template gives it private temporary files, a writable state directory and a 1.5 GiB memory limit.

Confirm `/health`, then check one ordinary product search and inspect the returned status and current page. An HTML response alone is not proof of product prices: the retailer-specific parser must still verify product identity, pack size, selling price and store scope.

## Network and resource bounds

Retailer entry navigation is restricted to official Australian Coles, ALDI, IGA and Woolworths hosts; the explicit local-shop mode stays on the verified shop's host. Subresources must use public HTTPS on port 443. Chromium connects through a loopback-only CONNECT proxy which resolves every destination, rejects every private/reserved/mixed DNS answer, and opens the tunnel to a pinned public IP. It rechecks DNS for each connection. WebSockets and service workers are disabled; QUIC and non-proxied WebRTC UDP are disabled. Popup pages are closed.

The worker runs at most two pages, with at most sixteen waiting jobs. Each job has a twenty-second budget including queue time. Connections have bounded time/traffic. Returned DOM is at most 3 MB; executable scripts, SVG and styles are removed. Valid inert JSON product data is retained for current retailer parsers. Ready pages are cached for ten minutes (up to 32 entries); a human check backs off that retailer for two minutes.

A page explicitly asking to refresh after JavaScript/cookies are enabled receives at most one ordinary refresh. Explicit human/security challenges are returned immediately without interaction. No login or checkout actions are performed.
