import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import {
  Container,
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Paper,
  Divider
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAppStore } from './store/useAppStore';
import SpreadsheetSelector from './components/SpreadsheetSelector';
import PDFSelector from './components/PDFSelector';
import ProcessButton from './components/ProcessButton';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2'
    },
    secondary: {
      main: '#dc004e'
    }
  }
});

function App() {
  const { t } = useTranslation();
  const { spreadsheetData, sheetMappings, pdfPath } = useAppStore();

  // Determine active step based on completed steps
  const getActiveStep = () => {
    if (!spreadsheetData) return 0;

    // Check if all selected sheets have complete mappings
    const allMappingsComplete = spreadsheetData.selectedSheets.every(
      (sheetName) =>
        sheetMappings[sheetName]?.sourceColumn && sheetMappings[sheetName]?.targetColumn
    );
    if (!allMappingsComplete) return 1;

    if (!pdfPath) return 2;
    return 3;
  };

  const activeStep = getActiveStep();

  const steps = [t('steps.selectSpreadsheet'), t('steps.selectPDF'), t('steps.process')];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label, index) => (
              <Step key={label} completed={activeStep > index}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t('steps.selectSpreadsheet')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <SpreadsheetSelector />
        </Paper>

        <Paper
          elevation={3}
          sx={{
            p: 3,
            mb: 3,
            opacity: activeStep < 2 ? 0.5 : 1,
            pointerEvents: activeStep < 2 ? 'none' : 'auto'
          }}
        >
          <Typography variant="h6" gutterBottom>
            {t('steps.selectPDF')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <PDFSelector />
        </Paper>

        <Paper
          elevation={3}
          sx={{
            p: 3,
            opacity: activeStep < 3 ? 0.5 : 1,
            pointerEvents: activeStep < 3 ? 'none' : 'auto'
          }}
        >
          <Typography variant="h6" gutterBottom>
            {t('steps.process')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <ProcessButton />
        </Paper>
      </Container>
    </ThemeProvider>
  );
}

export default App;
