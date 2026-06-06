/**
 * Print the Cloudflare WAF custom rule for the `/casino/*` geo blocklist.
 *
 * Single source of truth: the rule is generated from `BLOCKED_COUNTRIES` in
 * `lib/casino/geo.ts`, the same set the Next.js middleware enforces. Run this
 * whenever the blocklist changes and paste the output into the Cloudflare
 * dashboard / Terraform / Rulesets API as documented in
 * `docs/casino/CASINO_GEO_WAF.md`.
 *
 *   npx tsx scripts/casino/print-waf-rule.ts            # human-readable
 *   npx tsx scripts/casino/print-waf-rule.ts --expr     # bare expression
 *   npx tsx scripts/casino/print-waf-rule.ts --terraform # cloudflare_ruleset
 *   npx tsx scripts/casino/print-waf-rule.ts --json      # Rulesets API body
 */

import {
  blockedCountryList,
  casinoWafExpression,
  casinoWafRule,
} from '../../lib/casino/geo';

function terraform(): string {
  const rule = casinoWafRule();
  return [
    'resource "cloudflare_ruleset" "casino_geo_block" {',
    '  zone_id     = var.cloudflare_zone_id',
    '  name        = "SWO casino geo blocklist"',
    '  description = "OFAC + 9 licensed jurisdictions blocked at the edge for /casino/*"',
    '  kind        = "zone"',
    '  phase       = "http_request_firewall_custom"',
    '',
    '  rules {',
    `    action      = "${rule.action}"`,
    `    description = "${rule.description}"`,
    `    expression  = ${JSON.stringify(rule.expression)}`,
    '    enabled     = true',
    '  }',
    '}',
  ].join('\n');
}

function apiJson(): string {
  const rule = casinoWafRule();
  return JSON.stringify(
    {
      name: 'SWO casino geo blocklist',
      kind: 'zone',
      phase: 'http_request_firewall_custom',
      rules: [
        {
          action: rule.action,
          description: rule.description,
          expression: rule.expression,
          enabled: true,
        },
      ],
    },
    null,
    2,
  );
}

function main(): void {
  const arg = process.argv[2];
  switch (arg) {
    case '--expr':
      console.log(casinoWafExpression());
      return;
    case '--terraform':
      console.log(terraform());
      return;
    case '--json':
      console.log(apiJson());
      return;
    default: {
      const list = blockedCountryList();
      console.log('Cloudflare WAF custom rule — /casino/* geo blocklist');
      console.log('='.repeat(56));
      console.log(`Blocked countries (${list.length}): ${list.join(', ')}`);
      console.log('');
      console.log('Filter expression:');
      console.log(`  ${casinoWafExpression()}`);
      console.log('Action: block');
      console.log('');
      console.log('Flags: --expr | --terraform | --json');
    }
  }
}

main();
