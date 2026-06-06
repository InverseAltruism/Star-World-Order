# Casino geo blocklist — Cloudflare WAF (edge layer)

> Task: `[SWO_CASINO_GEO_BLOCKLIST]` (G3) — OFAC + 9-country block at the
> `/casino/*` route layer **+ Cloudflare WAF**. This doc covers the WAF
> (edge) half. The application (route) half is the Next.js middleware in
> [`middleware.ts`](../../middleware.ts).

## Why two layers

The blocklist is enforced in **two independent places** (defense in depth):

| Layer | Where it runs | What it catches |
|-------|---------------|-----------------|
| **Application** — `middleware.ts` + `lib/casino/geo.ts` | Origin / Vercel edge function | Normal traffic; renders `/region-not-supported` copy. |
| **Network** — Cloudflare WAF custom rule (this doc) | Cloudflare CDN, before the origin | Drops blocked regions at the edge so a misconfigured rewrite, a cold-started middleware, or a direct-to-origin request can't slip a blocked jurisdiction through. |

Both layers read the **same** `BLOCKED_COUNTRIES` set in
[`lib/casino/geo.ts`](../../lib/casino/geo.ts). The WAF rule is **generated**
from that set — it is never hand-maintained — so the edge can't silently drift
from the in-app blocklist. A test
(`lib/casino/__tests__/geo.test.ts` → "Cloudflare WAF rule") asserts the
generated rule covers every blocked country and nothing else.

## The blocklist

14 jurisdictions, carried over verbatim from the BunnyBagz reference:

- **9 licensed/regulated** (we don't hold a local licence): `US GB FR IT ES NL SG AU IL`
- **5 OFAC-sanctioned** (review quarterly): `IR KP SY CU RU`

`UNKNOWN` (CDN couldn't resolve a country) is intentionally **allowed** — we
log a false-negative rather than 403 a legit player whose request wasn't tagged.

## Regenerating the rule

The blocklist lives in code. Whenever it changes, regenerate:

```sh
npm run casino:waf-rule              # human-readable summary
npm run casino:waf-rule -- --expr        # bare filter expression
npm run casino:waf-rule -- --terraform   # cloudflare_ruleset resource
npm run casino:waf-rule -- --json        # Rulesets API request body
```

Current filter expression (Cloudflare Rules language):

```
(http.request.uri.path matches "^/casino(/|$)") and (ip.geoip.country in {"AU" "CU" "ES" "FR" "GB" "IL" "IR" "IT" "KP" "NL" "RU" "SG" "SY" "US"})
```

`ip.geoip.country` is Cloudflare's edge-resolved ISO-3166-1 alpha-2 code — the
same value Cloudflare forwards to the origin as the `cf-ipcountry` header that
`countryFromHeaders()` reads. The path is anchored so `/casino` and
`/casino/<game>` match but `/casinox` does not.

## Deploying the rule

### Option A — Dashboard

1. Cloudflare dashboard → your zone → **Security → WAF → Custom rules**.
2. **Create rule** → name `SWO casino geo blocklist`.
3. Switch the expression builder to **Edit expression** and paste the filter
   expression above (regenerate with `--expr` if the blocklist changed).
4. Action: **Block**. Deploy.

### Option B — Terraform (recommended; matches the rest of infra-as-code)

```sh
npm run casino:waf-rule -- --terraform
```

produces a `cloudflare_ruleset` resource for the
`http_request_firewall_custom` phase. Commit it to the infra repo and
`terraform apply`. Example shape:

```hcl
resource "cloudflare_ruleset" "casino_geo_block" {
  zone_id     = var.cloudflare_zone_id
  name        = "SWO casino geo blocklist"
  description = "OFAC + 9 licensed jurisdictions blocked at the edge for /casino/*"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules {
    action      = "block"
    description = "SWO casino geo blocklist (OFAC + 9 licensed jurisdictions)"
    expression  = "..."   # from --terraform / --expr
    enabled     = true
  }
}
```

### Option C — Rulesets API

```sh
ZONE_ID=...   # Cloudflare zone id
CF_TOKEN=...  # API token with Zone WAF:Edit

npm run casino:waf-rule -- --json > /tmp/casino-waf.json

curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/phases/http_request_firewall_custom/entrypoint" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data @/tmp/casino-waf.json
```

## Soft-launch / counsel gate

The **application** layer ships in `log` mode by default and only enforces
when an operator sets `SWO_CASINO_GEO_MODE=enforce` after counsel signs off on
the current blocklist (see the header note in `lib/casino/geo.ts`).

The **WAF** rule has no `log` mode of its own — deploying it with action
`block` enforces immediately at the edge. Before enabling it in production:

1. Confirm the blocklist is current and counsel-reviewed (same gate as the app
   layer).
2. Optionally stage with action **Log** first to observe match volume in the
   Cloudflare Security Events dashboard, then flip to **Block**.

## Keeping the two layers in sync

- Edit the blocklist **only** in `lib/casino/geo.ts` (`BLOCKED_COUNTRIES`).
- Re-run `npm run casino:waf-rule -- --terraform` (or `--json`) and redeploy.
- `npm run test` fails if the generated WAF rule and the blocklist diverge.
