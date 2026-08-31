import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { changeAppLanguage, type AppLanguage } from '../../i18n/index.js';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const language: AppLanguage = i18n.resolvedLanguage?.startsWith('es') ? 'es' : 'en';

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      <Typography variant="h4">{t('settings.title')}</Typography>
      <FormControl fullWidth>
        <InputLabel id="language-label">{t('settings.language')}</InputLabel>
        <Select<AppLanguage>
          labelId="language-label"
          label={t('settings.language')}
          value={language}
          onChange={(event) => void changeAppLanguage(event.target.value)}
        >
          <MenuItem value="en">{t('settings.english')}</MenuItem>
          <MenuItem value="es">{t('settings.spanish')}</MenuItem>
        </Select>
        <FormHelperText>{t('settings.languageHelp')}</FormHelperText>
      </FormControl>
    </Stack>
  );
}
