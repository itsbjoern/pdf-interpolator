import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { ArrowForward, FolderOpen } from '@mui/icons-material';
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

      // Don't allow deselecting all sheets
      if (newSelectedSheets.length === 0) {
        setError('At least one sheet must be selected');
        setLoading(false);
        return;
      }

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
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <FolderOpen />}
          onClick={handleSelectSpreadsheet}
          disabled={loading}
        >
          {t('spreadsheet.selectButton')}
        </Button>

        {spreadsheetData && (
          <Typography variant="body2" color="text.secondary">
            {t('spreadsheet.selectedFile', { fileName: spreadsheetData.fileName })}
          </Typography>
        )}
      </Box>

      {spreadsheetData && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('spreadsheet.selectSheets', {
              selected: spreadsheetData.selectedSheets.length,
              total: spreadsheetData.sheets.length
            })}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {spreadsheetData.sheets.map((sheet) => {
              const mapping = sheetMappings[sheet];
              const columns = spreadsheetData.columns[sheet] || [];

              return (
                <Box key={sheet}>
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

                  {spreadsheetData.selectedSheets.includes(sheet) ? (
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <FormControl sx={{ flex: 1 }}>
                        <InputLabel>{t('mapping.sourceColumn')}</InputLabel>
                        <Select
                          value={mapping.sourceColumn}
                          label={t('mapping.sourceColumn')}
                          onChange={(e) =>
                            updateSheetMapping(sheet, { sourceColumn: e.target.value })
                          }
                        >
                          <MenuItem value="">
                            <em>{t('mapping.selectColumn')}</em>
                          </MenuItem>
                          {columns.map((col) => (
                            <MenuItem key={col} value={col}>
                              {col}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <ArrowForward color="action" />

                      <FormControl sx={{ flex: 1 }}>
                        <InputLabel>{t('mapping.targetColumn')}</InputLabel>
                        <Select
                          value={mapping.targetColumn}
                          label={t('mapping.targetColumn')}
                          onChange={(e) =>
                            updateSheetMapping(sheet, { targetColumn: e.target.value })
                          }
                        >
                          <MenuItem value="">
                            <em>{t('mapping.selectColumn')}</em>
                          </MenuItem>
                          {columns.map((col) => (
                            <MenuItem key={col} value={col}>
                              {col}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
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
