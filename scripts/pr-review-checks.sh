#!/bin/bash
# Automated PR review security checks — used by Claude Code routine
# Trigger: trig_01L9aSRBeBEfSPon9Z9AJq1G (hourly cron + PR events)
set -euo pipefail

EXITCODE=0

echo "## Security Scan"
echo ""

# Check for Math.random in security-sensitive areas
echo "### Math.random() in security contexts"
if grep -rn "Math\.random" --include="*.ts" --include="*.tsx" lib/ app/api/ 2>/dev/null | grep -v node_modules | grep -v ".next"; then
  echo "⚠️  Found Math.random() — use crypto randomness for raffles/governance"
  EXITCODE=1
else
  echo "✅ No Math.random() in security-sensitive code"
fi
echo ""

# Check for 'any' types
echo "### TypeScript 'any' types"
ANY_COUNT=$(grep -rn ": any\b\|as any\b\|<any>" --include="*.ts" --include="*.tsx" lib/ app/ components/ 2>/dev/null | grep -v node_modules | grep -v ".next" | wc -l || echo "0")
if [ "$ANY_COUNT" -gt 0 ]; then
  echo "⚠️  Found $ANY_COUNT instances of 'any' type usage"
  grep -rn ": any\b\|as any\b\|<any>" --include="*.ts" --include="*.tsx" lib/ app/ components/ 2>/dev/null | grep -v node_modules | grep -v ".next" | head -10
else
  echo "✅ No 'any' types found"
fi
echo ""

# Check PR target branch
echo "### Branch targeting"
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Check for hardcoded secrets patterns
echo "### Hardcoded secrets scan"
if grep -rn "0x[a-fA-F0-9]\{64\}" --include="*.ts" --include="*.tsx" lib/ app/ components/ 2>/dev/null | grep -v node_modules | grep -v "CONTRACT\|ADDRESS\|SKRUMPEY_IDS\|example\|test\|mock" | head -5; then
  echo "⚠️  Possible hardcoded private keys detected"
  EXITCODE=1
else
  echo "✅ No hardcoded secrets detected"
fi
echo ""

# Run validation suite
echo "## Validation Suite"
echo ""
echo "### Type Check"
npm run type-check && echo "✅ Type check passed" || { echo "❌ Type check failed"; EXITCODE=1; }
echo ""
echo "### Lint"
npm run lint 2>&1 | tail -3
echo ""
echo "### Tests"
npm run test && echo "✅ All tests passed" || { echo "❌ Tests failed"; EXITCODE=1; }

exit $EXITCODE
