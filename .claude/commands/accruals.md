---
description: "Show the rebate liability to book at month end"
---

Read CLAUDE.md. Run `npm run rebates -- accruals --json`.

Present the result as a short table with the numbers that matter. An empty list means no matching records, not that everything is fine.

Liability is settled but unpaid, plus ended periods not yet calculated, plus what has been earned so far in the open period. Totals are per currency; never add NZD to AUD.

Never send anything. Drafts go to drafts/ for a person to send. Never invent a rate, an amount or a claim.
