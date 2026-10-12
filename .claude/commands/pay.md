---
description: "Record payment of an approved settlement"
---

Read CLAUDE.md. Run `npm run rebates -- pay --json` with the flags the operator gave (--settlement=... --paid-on=YYYY-MM-DD --payment-ref=... [--credit-note=...] --actor=...).

Read the record first. If a name matches more than one record, show the list and ask which. Pass the operator's name as --actor. Report what changed from the result.

Record the payment reference. For AU customers record the adjustment note with --credit-note; for NZ customers on terms not in writing, the supply correction information. See docs/compliance.md.

Never send anything. Drafts go to drafts/ for a person to send. Never invent a rate, an amount or a claim.
