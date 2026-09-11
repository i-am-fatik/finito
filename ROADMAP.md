# Roadmap

Finito is a local-first point of sale. This file is the order of work: what
ships next, what it has to do to count as done, and which spec governs it.
Nothing is built here without a spec that was written first.

The target is a till a Czech venue can actually run on. The gap list comes from
a survey of 64 Czech POS systems and their public feature sets, kept in the
thunder monorepo under `docs/pos`. Every acceptance criterion below is repeated
here in full, so this file stands on its own.

## How we work

Spec-driven development, six rules.

1. No code without a spec. A milestone starts as `specs/<id>-<slug>.md` and the
   spec is reviewed before the first line of implementation.
2. A spec answers six things: the problem, the scope, what is out of scope, the
   data model change, the flow, and the acceptance criteria.
3. Acceptance criteria are testable statements, not intentions. Each one names
   the test that will prove it.
4. A test counts only after it has been mutation checked: break the production
   code, watch the test go red, restore it. A green test that was never seen red
   proves nothing.
5. Scope changes in the spec first. Implementation never widens past its spec,
   findings outside it are logged for a later milestone.
6. Status lives in the milestone table below and nowhere else.

### Spec shape

```
# S<NN> <title>

## Problem
## Scope
## Out of scope
## Data model
## Flow
## Acceptance criteria
## Open questions
```

## Where we are

Working today: bill with append-only item lines, split bill (to a new bill, an
existing bill, another table, or pay selected), tile and keypad entry, multi
currency with rates, cash and QR and Lightning charge, table QR with guest self
pay, receipts with number series, invoices with ISDOC export, reservations,
opening hours, menus published over Nostr, per item sales analytics, bank
reconciliation, offline-first sync through Evolu, MCP endpoint for agents.

Missing and blocking: VAT anywhere on a line, shift closing, receipt printing,
users and roles, discounts, stock, card payments.

## Milestones

| Id | Milestone | Why it blocks | Status |
|---|---|---|---|
| S01 | VAT on lines and documents | a Czech doc without a VAT breakdown is not usable | todo |
| S02 | Shift open and close | the till cannot be handed over or reconciled | todo |
| S03 | Receipt printing | a venue that hands out paper has no path | todo |
| S04 | Split payment across methods | a voucher rarely covers the whole bill | todo |
| S05 | Price list import and export | every customer arrives from another system | todo |
| S06 | Users, roles, waiter on the bill | nobody can be held to a void or a discount | todo |
| S07 | Discounts and voids | daily reality of any venue, and an audit trail | todo |
| S08 | Sales reports | the reason a venue buys a till at all | todo |
| S09 | Card payment and terminal | the most common payment method in the country | todo |
| S10 | Stock | retail is unsellable without it | todo |
| S11 | Table map and mobile waiter | table service core | todo |
| S12 | Kitchen display and order printing | an order has to reach the kitchen | todo |
| S13 | Recipes and stock deduction | there is no real margin without them | todo |
| S14 | Barcodes, labels, scales | retail counter speed | todo |
| S15 | Multiple venues and central reports | a second branch ends a single-venue till | todo |
| S16 | EET 2.0 | pilot 2027-01-01, live 2027-02-01, if the law passes | todo |

Phases are sequential, milestones inside a phase are not.

## Phase 1: sellable minimum

Until this phase closes, the till cannot be handed to a paying venue.

### S01 VAT on lines and documents

Tax rates exist in billing settings and are used nowhere. Item, invoice line,
bill line and receipt line all carry a bare amount.

- An item carries a tax rate, chosen from the rates in billing settings.
- A bill line snapshots the rate at the moment the line is recorded, so a later
  rate change never rewrites a closed bill.
- A receipt shows, per rate, the base, the tax and the total.
- An invoice shows the same breakdown and the ISDOC export carries it.
- A venue that is not a VAT payer sees no breakdown and no rate picker.

Depends on nothing. Blocks S02, S03, S08.

### S02 Shift open and close

- A shift opens with a named user and a counted opening float.
- Cash in and cash out are recorded against the open shift with a reason.
- Closing a shift produces totals per payment method, the counted cash, and the
  difference between counted and expected.
- A closed shift is immutable and can be reopened only as a new shift.
- Every bill closed during a shift is attributable to it.

Depends on S01 for the tax totals, S06 for the named user, and ships after both.

### S03 Receipt printing

- A receipt prints to an ESC/POS thermal printer over USB, network or Bluetooth.
- The layout is 58 mm and 80 mm, both proven on a real device.
- Printing is optional per device, and a venue that never prints loses nothing.
- The printed receipt carries the same numbers as the stored one, including the
  VAT breakdown from S01.
- A failed print is reported and the receipt stays available to reprint.

Depends on S01.

### S04 Split payment across methods

- One bill accepts more than one payment, each with its own method and amount.
- The bill closes only when the paid amount reaches the total.
- A partial payment is visible on the bill and survives a reload and a sync.
- The receipt lists each payment separately.
- Overpayment and change are recorded, not silently dropped.

Depends on nothing.

### S05 Price list import and export

- Items, categories, prices, tax rates and product codes export to CSV.
- The same shape imports back, and an import reports rejected rows with the
  reason rather than failing whole.
- An import never duplicates an item that already carries the same product code.
- A dry run reports what would change before anything is written.

Depends on S01 for the rate column.

## Phase 2: what the market treats as given

### S06 Users, roles, waiter on the bill

The `waiter` table exists and nothing references it.

- A user signs in on the device with a PIN and stays signed in for a shift.
- A bill records who opened it and who closed it.
- Roles gate voids, discounts, cash withdrawals, price changes and reports.
- Every gated action is recorded with the user, the device and the time.

Depends on nothing. Blocks S02 and S07.

### S07 Discounts and voids

- A discount applies to a line, to a bill, or to a category, as a percentage or
  an amount.
- A void removes a line from an open bill and stays in the record as an event.
- Both carry the user from S06 and a reason where the role config demands one.
- Discounts appear on the receipt and in the reports as their own figure.

Depends on S06.

### S08 Sales reports

Per item analytics exist, nothing else does.

- Revenue by day, by hour, by item, by category, by payment method, by user.
- Average bill and bill count for a chosen range.
- A report exports to CSV.
- Every figure reconciles with the shift closings from S02.

Depends on S01 and S02.

### S09 Card payment and terminal

- Card is a payment method of its own, next to cash and the existing rails.
- The bill total is sent to a terminal and the authorization result comes back
  without the operator retyping anything.
- A declined or cancelled authorization leaves the bill open and says why.
- At least one terminal integration works end to end on real hardware.
- A venue with no terminal keeps a manual card method for an external device.

Depends on S04.

### S10 Stock

The inventory page is a placeholder.

- An item carries a stock card with a quantity and a unit.
- Goods receipts and issues change the quantity and keep the history.
- A sale deducts stock at the moment the bill closes.
- A stocktake records counted against expected and posts the difference.
- Stock is visible on the item and in a stock report.

Depends on S01 and S05.

## Phase 3: segment fit

### S11 Table map and mobile waiter

- Tables are placed on a floor plan that mirrors the room.
- The plan shows which table is occupied, its bill total and how long it has
  been open.
- A waiter takes an order at the table on a phone and it lands on the bill.
- Moving a guest between tables keeps the bill.
- Merging two bills into one is as reachable as splitting one.

Depends on S06.

### S12 Kitchen display and order printing

- A bill line is routed to a preparation place by its category.
- An order appears on a kitchen screen with its time and its state.
- The same order can print to a kitchen printer instead of, or besides, a screen.
- A line added after the order was sent is marked as a later course.

Depends on S11.

### S13 Recipes and stock deduction

- A sold item consumes named ingredients in stated quantities.
- Closing a bill deducts the ingredients from stock.
- The margin per item is computed from ingredient cost.
- A missing ingredient is reported, never silently negative.

Depends on S10.

### S14 Barcodes, labels, scales

- A scanned barcode adds the item to the bill, with no keyboard.
- The same scan works in goods receipt and in a stocktake.
- Labels and shelf tags print from the item list.
- A certified scale sends the weight and the price follows.

Depends on S10.

### S15 Multiple venues and central reports

- A venue is a first-class record and every bill, shift and stock move belongs
  to one.
- Catalog, prices and users can be shared or kept local, chosen per field.
- Reports consolidate across venues and drill down into one.
- A venue keeps selling while it is cut off from the others.

Depends on S08 and S10.

## Phase 4: regulation

### S16 EET 2.0

The law was passed by the lower house on 2026-07-15 and sent to the senate. It
is not in force. Pilot operation starts 2027-01-01 and live operation
2027-02-01 if it passes. Verify the state before this milestone opens.

- Contact payments, meaning cash, card at the counter and a QR scanned on the
  spot, are reported. Transfers and remote payments are not.
- The message is signed with a till certificate from CA EET and sent over the
  documented SOAP interface.
- A failed send is queued and retried, and selling never stops because of it.
- The playground environment is proven before production is touched.
- The technical reference is the eet-kb vault, not this file.

Depends on S01 and S04.

## Not doing

Held deliberately, each one for a stated reason.

| Item | Why not |
|---|---|
| Loyalty programme | worth doing, but no venue refuses the till without it |
| Delivery platform integration | gastro only, and it waits for S12 to be worth wiring |
| Self-service kiosk | needs S12 first, and accessibility rules of its own |
| Shared stock with an e-shop | the e-shop lives in thunder-shop, not here |
| Hotel PMS | a small market and each integration is bespoke |

## Links

- `AGENTS.md` for the rules any change follows.
- `ARCHITECTURE.md` for where things live.
- `skills/` for the workflows: forms, tables, i18n, e2e, commit.
