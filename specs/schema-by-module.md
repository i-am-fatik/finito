# A: the schema moves to one folder per module

Not a milestone. A refactor that pays for the sixteen milestones behind it, so
it is written down the same way and runs before S01 slice 2.

## Problem

`lib/evolu/index.ts` is 907 lines and holds 91 table definitions, five shared
schema fragments and the index list. Finding four tables for one feature means
reading the file, and every milestone from here on starts by adding columns to
tables that live nowhere near the code that reads them.

Payky arrived at one folder per module and it reads better. The part of that
shape which pays here is the table definition living with its concept. Payky's
`*-actions.ts` and `*-queries.ts` are a different, larger question and are not
in this plan.

## Scope

- Every table definition in `AppSchema` moves to `lib/modules/<concept>/<concept>.ts`.
- The five shared fragments move to `lib/modules/shared/schema.ts`.
- `lib/evolu/index.ts` keeps `AppSchema` as a composition, `createQuery`,
  `createAppEvolu` and the index list, and nothing else.

## Out of scope

- Actions, queries, hooks and services. They stay where they are and move with
  the milestone that touches them.
- The index list. Twenty lines in `createAppEvolu`, not the pain, and moving it
  needs an exported `IndexesConfig` this Evolu version may not have.
- The enums under `lib/evolu/model/`. Forty-six files import them directly, so
  moving them is its own change with its own diff.
- `DeviceSchema` in `lib/evolu/device.ts`. Ninety-nine lines, eight tables, one
  concept already. It moves when it hurts.

## The module map

Twenty-two modules for 91 tables. A satellite table lives with the row it
extends, because they are read together and never apart.

| Module | Tables |
|---|---|
| `shared` | `AddressSchema`, `ContactSchema`, `BillingInfoSchema`, `BillingInfoCzSchema`, `ItemSchema`, `NullableTableIdSchema` |
| `catalog-category` | category |
| `catalog-item` | catalogItem |
| `item` | item |
| `menu` | menu, menuCategory, menuItemLine |
| `table` | table, tableCode |
| `waiter` | waiter |
| `opening-hours` | openingHoursSettings, openingHoursRegularSlot, openingHoursExceptionDay, openingHoursExceptionSlot, `Weekday` |
| `pos-bill` | posBill, posBillItemLine, posBillRate |
| `reservation` | reservation, reservationBooking, reservationBlock |
| `account` | account, accountIban, accountLud16, accountThunderBridge, accountSpark, accountNwc, accountCashRegister |
| `transaction` | transaction, transactionIban, transactionLud16, transactionSpark, transactionNwc, transactionCashRegister |
| `reconciliation-claim` | reconciliationClaim, reconciliationClaimAllocation |
| `client` | client, clientAddress, clientCz |
| `contact` | contact, contactAccount, contactAccountIban, contactAccountLud16, contactNostr, contactAddress, contactBillingInfo, contactBillingInfoCz |
| `billing-info` | billingInfo, billingInfoAddress, billingInfoCz |
| `billing-settings` | billingSettings, invoiceSettings, invoiceEmailSettings |
| `tax-rate` | billingSettingsTaxRate (already moved) |
| `payment-default-method` | paymentDefaultMethod |
| `payment` | payment, paymentCounterparty, paymentWebData, paymentItemLine, paymentLnZap, paymentLnSpark, paymentLnNwc, paymentLnBridge, paymentBankTransferCZ, paymentCash, paymentWatchingState |
| `payment-receipt` | paymentReceipt, paymentReceiptSupplier, paymentReceiptSupplierAddress, paymentReceiptSupplierBillingInfo, paymentReceiptSupplierBillingInfoCz, paymentReceiptItemLine, paymentReceiptNumberSeries, paymentReceiptLastNumber |
| `invoice` | invoice, invoiceCustomer, invoiceCustomerAddress, invoiceCustomerBillingInfo, invoiceCustomerBillingInfoCz, invoiceSupplier, invoiceSupplierAddress, invoiceSupplierBillingInfo, invoiceSupplierBillingInfoCz, invoiceItemLine, invoiceWatchingState, invoiceNumberSeries, invoiceLastNumber |
| `fio-plugin` | fioPlugin, fioPluginToken |
| `smtp` | smtp |
| `ai-assistant` | aiAssistantSettings, aiAgent, aiAgentScope |
| `device` | device |

`billingSettingsTaxRate` keeps its table name inside the `tax-rate` module. The
name is data, the folder is code, and renaming a table orphans its rows.

## Rules a module follows

- One file, `lib/modules/<name>/<name>.ts`, exporting one `as const` per table.
- It imports from `@/lib/shared/types`, `@/lib/evolu/types` and
  `@/lib/modules/shared/schema`, and never from `@/lib/evolu`. That is what
  keeps the composition acyclic.
- The author's comments on a table move with it, word for word.

## Flow

1. **Pin the shape.** `lib/evolu/schema-shape.test.ts` snapshots every table
   name and its column names. It fails the moment a move drops a column, and it
   stays afterwards so the next accidental schema edit shows up in review.
2. **Shared fragments first.** Nothing else compiles without them.
3. **Four commits, by area.** Venue (catalog, menu, table, waiter, opening
   hours, pos bill, reservation). Money (account, transaction, reconciliation,
   payment, payment default method, payment receipt). Documents (invoice,
   client, contact, billing info). Settings (billing settings, fio, smtp, ai,
   device). `bun check` green on each.
4. **Read the result.** `lib/evolu/index.ts` should end around 120 lines: the
   imports, the composition, `createQuery`, `createAppEvolu` and the index list.

## Acceptance criteria

- The schema shape snapshot is identical before and after, table for table and
  column for column.
- `bun check` is green and the e2e suite passes, because a dropped column that
  the snapshot somehow misses still breaks a seed.
- `lib/evolu/index.ts` holds no table definition.
- No module imports `@/lib/evolu`.

## Risk

One file every session in this checkout touches, so it conflicts with anything
a peer session has open in `lib/evolu/index.ts`. It runs in one sitting and
lands in four commits, not over a day.
