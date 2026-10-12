---
description: "Add an account, product, agreement, tier, sale or claim"
---

Read CLAUDE.md. Run `npm run rebates -- add --json` with the flags the operator gave (--type=account|product|agreement|tier|sale|claim --actor=... (fields: see README)).

Read the record first. If a name matches more than one record, show the list and ask which. Pass the operator's name as --actor. Report what changed from the result.

Ask for any field the operator did not give. Never invent a rate, tier or date. An agreement is not live until it has at least one tier.

Never send anything. Drafts go to drafts/ for a person to send. Never invent a rate, an amount or a claim.
