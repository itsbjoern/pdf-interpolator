import { Box, Button, Typography, Alert } from '@mui/material';
import { PictureAsPdf } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { useState } from 'react';

export default function PDFSelector() {
  const { t } = useTranslation();
  const { pdfPath, setPdfPath } = useAppStore();
  const [error, setError] = useState<string | null>(null);

  const handleSelectPDF = async () => {
    try {
      setError(null);
      const filePath = await window.electron.selectPDF();
      if (filePath) {
        setPdfPath(filePath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPdfPath(null);
    }
  };

  const getFileName = (path: string) => {
    return path.split('/').pop() || path.split('\\').pop() || path;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
        <Button variant="outlined" startIcon={<PictureAsPdf />} onClick={handleSelectPDF}>
          {t('pdf.selectButton')}
        </Button>

        {pdfPath && (
          <Typography variant="body2" color="text.secondary">
            {t('pdf.selectedFile', { fileName: getFileName(pdfPath) })}
          </Typography>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
