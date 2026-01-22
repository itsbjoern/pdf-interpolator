import { Box, Button, Typography, Alert, LinearProgress, Paper } from '@mui/material';
import { PlayArrow, Save } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { useState } from 'react';

export default function ProcessButton() {
  const { t } = useTranslation();
  const {
    spreadsheetPath,
    spreadsheetData,
    sheetMappings,
    pdfPath,
    outputPath,
    setOutputPath,
    isProcessing,
    progress,
    progressMessage,
    setProcessing,
    setProgress
  } = useAppStore();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if all selected sheets have complete mappings
  const allMappingsComplete =
    spreadsheetData &&
    spreadsheetData.selectedSheets.every(
      (sheetName) =>
        sheetMappings[sheetName]?.sourceColumn && sheetMappings[sheetName]?.targetColumn
    );

  const isReadyToProcess =
    spreadsheetPath && spreadsheetData && allMappingsComplete && pdfPath && outputPath;

  const handleSelectOutput = async () => {
    try {
      setError(null);
      const filePath = await window.electron.selectOutput();
      if (filePath) {
        setOutputPath(filePath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleProcess = async () => {
    if (!isReadyToProcess || !spreadsheetPath || !pdfPath || !outputPath) {
      setError(t('errors.processingFailed'));
      return;
    }

    try {
      setProcessing(true);
      setError(null);
      setSuccess(false);
      setProgress(0, t('process.processing'));

      // Simulate progress for now - will be replaced with actual PDF processing
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        setProgress(i, `${t('process.processing')} ${i}%`);
      }

      // TODO: Call actual PDF processing here
      // const result = await window.electron.processPDF(pdfPath, spreadsheetPath, mappings, outputPath);

      setSuccess(true);
      setProgress(100, t('process.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  };

  const getFileName = (path: string) => {
    return path.split('/').pop() || path.split('\\').pop() || path;
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<Save />}
          onClick={handleSelectOutput}
          disabled={isProcessing}
          fullWidth
          sx={{ mb: 2 }}
        >
          {t('process.selectOutput')}
        </Button>

        {outputPath && (
          <Typography variant="body2" color="text.secondary">
            {t('process.outputPath', { path: getFileName(outputPath) })}
          </Typography>
        )}
      </Box>

      <Button
        variant="contained"
        size="large"
        startIcon={<PlayArrow />}
        onClick={handleProcess}
        disabled={!isReadyToProcess || isProcessing}
        fullWidth
      >
        {isProcessing ? t('process.processing') : t('process.startButton')}
      </Button>

      {isProcessing && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={progress} />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            {progressMessage}
          </Typography>
        </Box>
      )}

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {t('process.success')}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {!isReadyToProcess && !isProcessing && (
        <Paper variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'grey.50' }}>
          <Typography variant="caption" color="text.secondary">
            Please complete all previous steps:
            {!spreadsheetData && <Typography component="div">- Select a spreadsheet</Typography>}
            {!allMappingsComplete && (
              <Typography component="div">- Configure mappings for all selected sheets</Typography>
            )}
            {!pdfPath && <Typography component="div">- Select a PDF file</Typography>}
            {!outputPath && <Typography component="div">- Select an output location</Typography>}
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
