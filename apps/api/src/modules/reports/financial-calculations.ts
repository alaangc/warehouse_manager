import { calculateLineAmount, calculatePartnerShare, sumMoney } from '../../shared/money.js';

export const REPORTING_GROUPS = ['SODAS', 'CHARCOAL', 'TOSTADAS', 'OTHER'] as const;
export type ReportingGroup = (typeof REPORTING_GROUPS)[number];

export interface FinancialLineInput {
  reportingGroup: ReportingGroup;
  unitPrice: string;
  quantity: string;
}

export interface FinancialLineResult extends FinancialLineInput {
  lineAmount: string;
}

export interface FinancialSummary {
  lines: FinancialLineResult[];
  groupTotals: Record<ReportingGroup, string>;
  grossTotal: string;
  partnerRate: '0.500000';
  partnerAmount: string;
  remainingAmount: string;
  roundingMode: 'HALF_AWAY_FROM_ZERO';
}

export function calculateFinancialSummary(inputs: readonly FinancialLineInput[]): FinancialSummary {
  const lines = inputs.map((input) => {
    if (!REPORTING_GROUPS.includes(input.reportingGroup)) {
      throw new Error('Invalid reporting group');
    }
    return { ...input, lineAmount: calculateLineAmount(input.unitPrice, input.quantity) };
  });
  const groupTotals = Object.fromEntries(
    REPORTING_GROUPS.map((group) => [
      group,
      sumMoney(
        lines.filter((line) => line.reportingGroup === group).map((line) => line.lineAmount),
      ),
    ]),
  ) as Record<ReportingGroup, string>;
  const grossTotal = sumMoney(REPORTING_GROUPS.map((group) => groupTotals[group]));
  const share = calculatePartnerShare(grossTotal);
  return {
    lines,
    groupTotals,
    grossTotal,
    partnerRate: '0.500000',
    ...share,
    roundingMode: 'HALF_AWAY_FROM_ZERO',
  };
}
