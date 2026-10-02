import { Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from './language-settings.js';
import { BusinessSettingsPanel } from '../administration/user-settings-pages.js';
import { PrinterPreferencePage } from '../printers/printer-preference-page.js';

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <Stack spacing={3} sx={{ maxWidth: 760 }}>
      <Typography variant="h4">{t('settings.title')}</Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <LanguageSelect />
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <BusinessSettingsPanel />
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <PrinterPreferencePage />
      </Paper>
    </Stack>
  );
}
