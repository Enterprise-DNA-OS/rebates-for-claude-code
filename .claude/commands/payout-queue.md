---
description: "List settlements waiting on approval or payment"
---

Read CLAUDE.md. Run `npm run rebates -- payout-queue --json`.

Present the result as a short table with the numbers that matter. An empty list means no matching records, not that everything is fine.

Approval needs a second person: whoever approves cannot be whoever calculated. Flag anything past its settle-by date first.

Never send anything. Drafts go to drafts/ for a person to send. Never invent a rate, an amount or a claim.
