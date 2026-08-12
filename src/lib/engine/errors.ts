/**
 * Typed errors for the accounting engine, so the UI layer can distinguish
 * "this voucher doesn't balance" from "this period is closed" from "you
 * can't do that to an entry in this state" without parsing message strings.
 */

export class EngineError extends Error {}

/** Debits don't equal credits, or a voucher has no real amount. */
export class UnbalancedEntryError extends EngineError {}

/** An operation tried to touch a period that isn't open for posting. */
export class ClosedPeriodError extends EngineError {}

/** An operation isn't valid for the entry's/period's current status. */
export class InvalidStatusError extends EngineError {}

/** A Check Disbursement voucher was posted without check number/date. */
export class MissingCheckDetailsError extends EngineError {}
