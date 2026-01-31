import {
  Close as CloseIcon,
  PlayArrow as PlayArrowIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { Box, Button, ButtonGroup, LinearProgress, Paper, Typography } from '@mui/material';
import type { ProcessResult } from '@shared/types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
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

  useEffect(() => {
    window.electron.onProcessProgress((progress, message) => {
      setProgress(progress, message);
    });
  }, [setProgress]);

  const allMappingsComplete = spreadsheetData?.selectedSheets.every(
    (sheetName) => sheetMappings[sheetName]?.sourceColumn && sheetMappings[sheetName]?.targetColumn
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

      const mappingsArray = Object.values(sheetMappings);
      const processResult = await window.electron.processPDF(
        pdfPath,
        spreadsheetPath,
        mappingsArray,
        outputPath
      );

      setResult(processResult);
      setDialogOpen(true);

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
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 6 }}>
        <ButtonGroup variant="outlined">
          <Button startIcon={<SaveIcon />} onClick={handleSelectOutput} disabled={isProcessing}>
            {outputPath ? t('process.changeOutput') : t('process.selectOutput')}
          </Button>
          {outputPath ? (
            <Button size="small" onClick={() => setOutputPath(null)} disabled={isProcessing}>
              <CloseIcon />
            </Button>
          ) : null}
        </ButtonGroup>

        {outputPath && (
          <Typography variant="body2" color="text.secondary">
            {t('process.outputPath', { path: getFileName(outputPath) })}
          </Typography>
        )}
      </Box>

      <Button
        variant="contained"
        size="large"
        startIcon={<PlayArrowIcon />}
        onClick={handleProcess}
        disabled={!isReadyToProcess || isProcessing}
        sx={{
          position: 'fixed',
          bottom: 32,
          right: 40,
          zIndex: 1000
        }}
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

      <ResultsDialog open={dialogOpen} onClose={handleCloseDialog} result={result} />
    </Box>
  );
}
