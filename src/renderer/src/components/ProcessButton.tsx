import { Box, Button, Typography, LinearProgress, Paper } from '@mui/material';
import { PlayArrow, Save } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { useState, useEffect } from 'react';
import type { ProcessResult } from '@shared/types';
import ResultsDialog from './ResultsDialog';

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

  const [result, setResult] = useState<ProcessResult | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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
      const filePath = await window.electron.selectOutput();
      if (filePath) {
        setOutputPath(filePath);
      }
    } catch (err) {
      // Show error in dialog
      setResult({
        success: false,
        error: err instanceof Error ? err.message : String(err)
      });
      setDialogOpen(true);
    }
  };

  const handleProcess = async () => {
    if (!isReadyToProcess || !spreadsheetPath || !pdfPath || !outputPath) {
      setResult({
        success: false,
        error: t('errors.processingFailed')
      });
      setDialogOpen(true);
      return;
    }

    try {
      setProcessing(true);
      setResult(null);
      setProgress(0, t('process.processing'));

      // Convert sheetMappings to array
      const mappingsArray = Object.values(sheetMappings);

      // Call actual PDF processing
      const processResult = await window.electron.processPDF(
        pdfPath,
        spreadsheetPath,
        mappingsArray,
        outputPath
      );

      // Store result and open dialog
      setResult(processResult);
      setDialogOpen(true);

      // Update progress message
      if (processResult.success) {
        const failedCount =
          (processResult.totalMatches || 0) - (processResult.totalReplacements || 0);
        if (failedCount > 0) {
          setProgress(
            100,
            t('process.partialSuccess', {
              successful: processResult.totalReplacements,
              failed: failedCount
            })
          );
        } else {
          setProgress(100, t('process.success'));
        }
      }
    } catch (err) {
      const errorResult: ProcessResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
      setResult(errorResult);
      setDialogOpen(true);
      setProgress(0, '');
    } finally {
      setProcessing(false);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
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
          {outputPath ? t('process.changeOutput') : t('process.selectOutput')}
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

      {/* Results Dialog */}
      <ResultsDialog open={dialogOpen} onClose={handleCloseDialog} result={result} />
    </Box>
  );
}
