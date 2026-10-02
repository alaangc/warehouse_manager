import { Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { scaledQuantity } from '../inventory/inventory-quantity.js';
import type { RouteDetail } from './route-types.js';

export interface ReturnValue {
  physicalReturnQuantity: string;
  differenceReason: string;
}
export const returnQuantityPattern = /^\d+(?:\.\d{1,3})?$/;
export function quantitiesMatch(actual: string, expected: string) {
  return returnQuantityPattern.test(actual) && scaledQuantity(actual) === scaledQuantity(expected);
}
export function expectedQuantity(detail: RouteDetail, productId: string, loaded: string) {
  return (
    detail.returnDeclaration?.lines.find((line) => line.productId === productId)
      ?.expectedQuantity ??
    detail.balances.find((balance) => balance.productId === productId)?.quantity ??
    loaded
  );
}
export function initialReturnValues(detail: RouteDetail): Record<string, ReturnValue> {
  return Object.fromEntries(
    (detail.load?.lines ?? []).map((line) => {
      const declared = detail.returnDeclaration?.lines.find(
        (row) => row.productId === line.productId,
      );
      return [
        line.productId,
        {
          physicalReturnQuantity:
            declared?.quantity ?? expectedQuantity(detail, line.productId, line.quantity),
          differenceReason: declared?.differenceReason ?? '',
        },
      ];
    }),
  );
}
export function returnLines(detail: RouteDetail, values: Record<string, ReturnValue>) {
  return (detail.load?.lines ?? []).map((line) => {
    const value = values[line.productId]!;
    return {
      productId: line.productId,
      physicalReturnQuantity: value.physicalReturnQuantity,
      ...(quantitiesMatch(
        value.physicalReturnQuantity,
        expectedQuantity(detail, line.productId, line.quantity),
      )
        ? {}
        : { differenceReason: value.differenceReason.trim() }),
    };
  });
}
export function ReturnFields({
  detail,
  values,
  onChange,
  disabled = false,
}: {
  detail: RouteDetail;
  values: Record<string, ReturnValue>;
  onChange: (productId: string, value: ReturnValue) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {detail.load?.lines.map((line) => {
        const expected = expectedQuantity(detail, line.productId, line.quantity);
        const value = values[line.productId] ?? {
          physicalReturnQuantity: expected,
          differenceReason: '',
        };
        const differs = !quantitiesMatch(value.physicalReturnQuantity, expected);
        const name =
          detail.balances.find((balance) => balance.productId === line.productId)?.productName ??
          detail.returnDeclaration?.lines.find((row) => row.productId === line.productId)
            ?.productName ??
          line.productId;
        return (
          <Stack
            component="fieldset"
            key={line.productId}
            spacing={2}
            disabled={disabled}
            sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
          >
            <Typography component="legend" sx={{ fontWeight: 600 }}>
              {name}
            </Typography>
            <TextField
              label={t('routes.physicalReturn', { expected })}
              required
              slotProps={{
                htmlInput: { inputMode: 'decimal', pattern: returnQuantityPattern.source },
              }}
              value={value.physicalReturnQuantity}
              onChange={(event) =>
                onChange(line.productId, { ...value, physicalReturnQuantity: event.target.value })
              }
            />
            <TextField
              label={t('routes.differenceReason')}
              required={differs}
              disabled={!differs || disabled}
              helperText={t(differs ? 'routes.reasonRequiredHelp' : 'routes.noDifferenceHelp')}
              slotProps={{ htmlInput: { pattern: '.*\\S.*', maxLength: 500 } }}
              value={value.differenceReason}
              onChange={(event) =>
                onChange(line.productId, { ...value, differenceReason: event.target.value })
              }
            />
          </Stack>
        );
      })}
    </>
  );
}
