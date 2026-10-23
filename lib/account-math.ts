export type DirectionTotal = {
  accountId: number;
  direction: "CREDIT" | "DEBIT";
  amountCents: number;
  count: number;
};

/** Balance = opening balance + credits − debits. Credit cards go negative while money is owed. */
export function balanceFromTotals(
  openingBalanceCents: number,
  totals: Pick<DirectionTotal, "direction" | "amountCents">[],
): number {
  return totals.reduce(
    (balance, t) => balance + (t.direction === "CREDIT" ? t.amountCents : -t.amountCents),
    openingBalanceCents,
  );
}

/** Attaches balance and transaction count to each account from per-account, per-direction totals. */
export function withBalances<A extends { id: number; openingBalanceCents: number }>(
  accounts: A[],
  totals: DirectionTotal[],
): (A & { balanceCents: number; transactionCount: number })[] {
  const byAccount = new Map<number, DirectionTotal[]>();
  for (const t of totals) {
    const list = byAccount.get(t.accountId) ?? [];
    list.push(t);
    byAccount.set(t.accountId, list);
  }
  return accounts.map((a) => {
    const own = byAccount.get(a.id) ?? [];
    return {
      ...a,
      balanceCents: balanceFromTotals(a.openingBalanceCents, own),
      transactionCount: own.reduce((n, t) => n + t.count, 0),
    };
  });
}
