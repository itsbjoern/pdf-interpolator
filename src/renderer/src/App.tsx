import {
  Box,
  Container,
  CssBaseline,
  createTheme,
  Divider,
  Paper,
  Step,
  StepLabel,
  Stepper,
  ThemeProvider,
  Typography
} from '@mui/material';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PDFSelector from './components/PDFSelector';
import ProcessButton from './components/ProcessButton';
import SpreadsheetSelector from './components/SpreadsheetSelector';
import UpdateNotification from './components/UpdateNotification';
import { getSystemLanguage } from './i18n/config';
import { useAppStore } from './store/useAppStore';

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
  const { t, i18n } = useTranslation();
  const { spreadsheetData, sheetMappings, pdfPath } = useAppStore();

  useEffect(() => {
    const initializeLanguage = async () => {
      try {
        if (window.electron?.env?.LOCALE) {
          await i18n.changeLanguage(window.electron.env.LOCALE);
          return;
        }

        const systemLanguage = getSystemLanguage();
        await i18n.changeLanguage(systemLanguage);
      } catch (error) {
        console.error('Failed to initialize language:', error);
      }
    };

    initializeLanguage();
  }, [i18n]);

  const getActiveStep = () => {
    if (!spreadsheetData) return 0;

    const allMappingsComplete =
      Object.keys(sheetMappings).length > 0 &&
      spreadsheetData.selectedSheets.every(
        (sheetName) =>
          sheetMappings[sheetName]?.sourceColumn && sheetMappings[sheetName]?.targetColumn
      );
    if (!allMappingsComplete) return 1;

    if (!pdfPath) return 2;
    return 3;
  };

  const activeStep = getActiveStep();

  const steps = [
    t('steps.selectSpreadsheet'),
    t('steps.setupMappings'),
    t('steps.selectPDF'),
    t('steps.process')
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 2 }}>
        <Box
          sx={{
            mb: 2,
            py: 2,
            position: 'sticky',
            top: 0,
            zIndex: 10,
            bgcolor: 'background.paper'
          }}
        >
          <Stepper activeStep={activeStep}>
            {steps.map((label, index) => (
              <Step key={label} completed={activeStep > index}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
          <Typography variant="body1" gutterBottom>
            {t('steps.selectSpreadsheet')} & {t('steps.setupMappings')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <SpreadsheetSelector />
        </Paper>

        <Paper
          elevation={3}
          sx={{
            p: 2,
            mb: 3,
            opacity: activeStep < 2 ? 0.5 : 1,
            pointerEvents: activeStep < 2 ? 'none' : 'auto'
          }}
        >
          <Typography variant="body1" gutterBottom>
            {t('steps.selectPDF')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <PDFSelector />
        </Paper>

        <Paper
          elevation={3}
          sx={{
            p: 2,
            opacity: activeStep < 3 ? 0.5 : 1,
            pointerEvents: activeStep < 3 ? 'none' : 'auto'
          }}
        >
          <Typography variant="body1" gutterBottom>
            {t('steps.process')}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <ProcessButton />
        </Paper>
      </Container>

      <UpdateNotification />
    </ThemeProvider>
  );
}

export default App;
