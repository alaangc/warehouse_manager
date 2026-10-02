import { Tab, Tabs } from '@mui/material';
import { useTranslation } from 'react-i18next';

export function RouteScopeTabs({
  history,
  onChange,
}: {
  history: boolean;
  onChange: (history: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Tabs
      value={history ? 'closed' : 'active'}
      onChange={(_, value: string) => onChange(value === 'closed')}
    >
      <Tab value="active" label={t('routes.activeRoutes')} />
      <Tab value="closed" label={t('routes.closedRoutes')} />
    </Tabs>
  );
}
