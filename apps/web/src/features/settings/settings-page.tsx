import { Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from './language-settings.js';
import { BusinessSettingsPanel } from '../administration/user-settings-pages.js';
import { PrinterPreferencePage } from '../printers/printer-preference-page.js';

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      <Typography variant="h4">{t('settings.title')}</Typography>
      <LanguageSelect />
      <BusinessSettingsPanel />
      <PrinterPreferencePage />
    </Stack>
  );
}
