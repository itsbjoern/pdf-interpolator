import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Paper,
  Autocomplete,
  TextField,
  ButtonGroup
} from '@mui/material';
import {
  ArrowForward as ArrowForwardIcon,
  FolderOpen as FolderOpenIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { useState } from 'react';

export default function SpreadsheetSelector() {
  const { t } = useTranslation();
  const {
    spreadsheetPath,
    spreadsheetData,
    setSpreadsheetPath,
    setSpreadsheetData,
    sheetMappings,
    updateSheetMapping
  } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectSpreadsheet = async () => {
    try {
      setLoading(true);
      setError(null);

      const filePath = await window.electron.selectSpreadsheet();
      if (!filePath) return;

      setSpreadsheetPath(filePath);

      // Read the spreadsheet
      const data = await window.electron.readSpreadsheet(filePath);
      setSpreadsheetData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSpreadsheetPath(null);
      setSpreadsheetData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSheetToggle = async (sheetName: string, checked: boolean) => {
    if (!spreadsheetPath || !spreadsheetData) return;

    try {
      setLoading(true);
      setError(null);

      // Update selected sheets
      const newSelectedSheets = checked
        ? [...spreadsheetData.selectedSheets, sheetName]
        : spreadsheetData.selectedSheets.filter((s) => s !== sheetName);

      // Re-read spreadsheet with new selection
      const data = await window.electron.readSpreadsheet(spreadsheetPath, newSelectedSheets);
      setSpreadsheetData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
        <ButtonGroup variant="outlined">
          <Button
            startIcon={
              loading ? <CircularProgress size={20} color="inherit" /> : <FolderOpenIcon />
            }
            onClick={handleSelectSpreadsheet}
            disabled={loading}
          >
            {spreadsheetData ? t('spreadsheet.changeButton') : t('spreadsheet.selectButton')}
          </Button>
          {spreadsheetPath ? (
            <Button
              size="small"
              onClick={() => {
                setSpreadsheetPath(null);
                setSpreadsheetData(null);
              }}
            >
              <CloseIcon />
            </Button>
          ) : null}
        </ButtonGroup>

        {spreadsheetData && (
          <Typography variant="body2" color="text.secondary">
            {t('spreadsheet.selectedFile', { fileName: spreadsheetData.fileName })}
          </Typography>
        )}
      </Box>

      {spreadsheetData && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          {spreadsheetData.sheets.length === 1 ? null : (
            <Typography variant="subtitle2" gutterBottom>
              {t('spreadsheet.selectSheets', {
                selected: spreadsheetData.selectedSheets.length,
                total: spreadsheetData.sheets.length
              })}
            </Typography>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {spreadsheetData.sheets.map((sheet) => {
              const mapping = sheetMappings[sheet];
              const columns = spreadsheetData.columns[sheet] || [];

              return (
                <Box key={sheet}>
                  {spreadsheetData.sheets.length === 1 ? null : (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={spreadsheetData.selectedSheets.includes(sheet)}
                          onChange={(e) => handleSheetToggle(sheet, e.target.checked)}
                          disabled={loading}
                        />
                      }
                      label={sheet}
                    />
                  )}

                  {spreadsheetData.selectedSheets.includes(sheet) ? (
                    <Box sx={{ ml: 4, display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Autocomplete
                        disablePortal
                        size="small"
                        options={columns}
                        sx={{ flex: 1 }}
                        renderInput={(params) => (
                          <TextField {...params} label={t('mapping.sourceColumn')} />
                        )}
                        value={mapping.sourceColumn || null}
                        onChange={(_, value) =>
                          updateSheetMapping(sheet, { sourceColumn: value || '' })
                        }
                      />

                      <ArrowForwardIcon color="action" />

                      <Autocomplete
                        disablePortal
                        options={columns}
                        sx={{ flex: 1 }}
                        size="small"
                        renderInput={(params) => (
                          <TextField {...params} label={t('mapping.targetColumn')} />
                        )}
                        value={mapping.targetColumn || null}
                        onChange={(_, value) =>
                          updateSheetMapping(sheet, { targetColumn: value || '' })
                        }
                      />
                    </Box>
                  ) : null}
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
