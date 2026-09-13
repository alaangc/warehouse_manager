import { Stack, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentHistory } from './document-history.js';

export function DocumentPage() {
  const { t } = useTranslation();
  const [collection, setCollection] = useState<'documents' | 'attempts'>('documents');
  return (
    <Stack spacing={3} sx={{ minWidth: 0 }}>
      <Typography component="h1" variant="h4">
        {t('documents.title')}
      </Typography>
      <Tabs
        value={collection}
        onChange={(_event, value: 'documents' | 'attempts') => setCollection(value)}
      >
        <Tab value="documents" label={t('documents.title')} />
        <Tab value="attempts" label={t('documents.attempts')} />
      </Tabs>
      <DocumentHistory collection={collection} />
    </Stack>
  );
}
