import { Box, Button, Typography, Alert, LinearProgress, Paper } from '@mui/material';
import { PlayArrow, Save } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { useState, useEffect } from 'react';

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

  // Set up progress listener
  useEffect(() => {
    window.electron.onProcessProgress((progress, message) => {
      setProgress(progress, message);
    });
  }, [setProgress]);

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

      // Convert sheetMappings to array
      const mappingsArray = Object.values(sheetMappings);

      // Call actual PDF processing
      const result = await window.electron.processPDF(
        pdfPath,
        spreadsheetPath,
        mappingsArray,
        outputPath
      );

      if (result.success) {
        setSuccess(true);
        setProgress(100, t('process.success'));

        // Show statistics if available
        if (result.stats && result.stats.length > 0) {
          const totalReplacements = result.stats.reduce(
            (sum, stat) => sum + stat.replacementCount,
            0
          );
          setProgress(100, `${t('process.success')} ${totalReplacements} replacements made.`);
        }
      } else {
        throw new Error(result.error || t('errors.processingFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress(0, '');
    } finally {
      setProcessing(false);
    }
  };

  const getFileName = (path: string) => {
    return path.split('/').pop() || path.split('\\').pop() || path;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<Save />}
          onClick={handleSelectOutput}
          disabled={isProcessing}
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
