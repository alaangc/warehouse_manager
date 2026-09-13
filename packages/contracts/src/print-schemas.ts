import { z } from 'zod';
import { DocumentPrintMetadataSchema } from './document-schemas.js';

const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
const text = z.string().min(1);
const line = z.object({ productName: text, unitCode: text, quantity: decimal });
const ticket = z.object({
  ticketNumber: text,
  saleNumber: text,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  paymentMethod: z.string().optional(),
  lines: z.array(line.extend({ unitPrice: decimal, lineAmount: decimal })).min(1),
  total: decimal,
});
const load = z.object({ loadNumber: text, routeNumber: text, lines: z.array(line).min(1) });
const cash = z.object({
  closeNumber: text,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  grossTotal: decimal,
  partnerShare: decimal,
  ownerShare: decimal,
  expensesTotal: decimal.optional(),
  netTotal: decimal.optional(),
  partnerRate: decimal.optional(),
  periodKind: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  businessTimezone: z.string().optional(),
  correctionReason: z.string().nullable().optional(),
  supersedesCashCloseId: z.uuid().nullable().optional(),
  lines: z.array(z.object({ reportingGroup: text, total: decimal })).optional(),
});
export const ThermalDocumentSchema = z.discriminatedUnion('documentType', [
  DocumentPrintMetadataSchema.extend({ documentType: z.literal('TICKET'), snapshot: ticket }),
  DocumentPrintMetadataSchema.extend({ documentType: z.literal('ROUTE_LOAD'), snapshot: load }),
  DocumentPrintMetadataSchema.extend({ documentType: z.literal('CASH_CLOSE'), snapshot: cash }),
]);
