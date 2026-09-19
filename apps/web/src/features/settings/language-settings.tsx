import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeAppLanguage, type AppLanguage } from '../../i18n/index.js';

export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  const labelId = useId();
  const language: AppLanguage = i18n.resolvedLanguage?.startsWith('es') ? 'es' : 'en';
  return (
    <FormControl fullWidth data-language-select>
      <InputLabel id={labelId}>{t('settings.language')}</InputLabel>
      <Select<AppLanguage>
        labelId={labelId}
        label={t('settings.language')}
        value={language}
        onChange={(event) => void changeAppLanguage(event.target.value)}
      >
        <MenuItem value="en">{t('settings.english')}</MenuItem>
        <MenuItem value="es">{t('settings.spanish')}</MenuItem>
      </Select>
      <FormHelperText>{t('settings.languageHelp')}</FormHelperText>
    </FormControl>
  );
}

// Keep the current page (including drafts and validation) mounted while choosing a language.
export function LanguageSettingsButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <>
      <Button
        color="inherit"
        aria-label={t('settings.languageSettings')}
        onClick={() => setOpen(true)}
      >
        {t('settings.language')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id={titleId}>{t('settings.languageSettings')}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <LanguageSelect />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
