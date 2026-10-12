# Why this, and how it was scored

Picked 12 October 2026 for the Enterprise DNA rebuild lane.

## The bill

Salesforce lists Rebate Management for Manufacturing Cloud at AU$14,000 per org per month, billed annually, with 500,000 transactions a year included. The B2B edition is AU$22,000 per org per month. The manufacturing edition requires 10 or more Manufacturing Cloud licences. Extra transactions, rebate management users and the Premier success plan (30% of net licence fees) are priced on top. Source: https://www.salesforce.com/au/manufacturing/rebate-management-software/pricing/ (checked 2026-10-12).

## Scores (1 to 5)

| Measure | Score | Why |
|---|---|---|
| Annual bill | 5 | AU$168,000 a year at list for the manufacturing edition, before licences it requires |
| Data-shaped | 5 | Accounts, products, programs, tiers, transactions, payouts, claims |
| Our buyers pay for it | 4 | NZ and AU suppliers selling through buying groups and grocery all run rebates; one Enterprise DNA client ranks rebates first in its finance work |
| Search demand | 3 | "rebate management software" and vendor alternatives searches exist; page one is vendor pages and listicles |
| One-session buildable | 4 | The calculation is one SQL function; the rest is lists and workflow |
| Import path | 4 | Salesforce Data Export gives a CSV per object, and the rebate data model is documented |

Total 25 of 30.

## What the field sales build leaves out

The field sales repo checks promotions in store. It does not hold rebate agreements, accruals or customer claims. This repo is that missing half.
