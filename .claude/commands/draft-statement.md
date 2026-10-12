---
description: "Draft a rebate statement for the customer"
---

Read CLAUDE.md. Run `npm run rebates -- draft-statement --json` with the flags the operator gave (--settlement=... (a rebate statement for the customer, to drafts/)).

Present the result as a short table with the numbers that matter. An empty list means no matching records, not that everything is fine.

Never send anything. Drafts go to drafts/ for a person to send. Never invent a rate, an amount or a claim.
