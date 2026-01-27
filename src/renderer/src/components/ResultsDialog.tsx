import {
  Error as ErrorIcon,
  Info as InfoIcon,
  CheckCircle as SuccessIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableRow
} from '@mui/material';
import type { ProcessResult } from '@shared/types';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

interface ResultsDialogProps {
  open: boolean;
  onClose: () => void;
  result: ProcessResult | null;
}

export default function ResultsDialog({ open, onClose, result }: ResultsDialogProps) {
  const { t } = useTranslation();
  const [expandedPage, setExpandedPage] = useState<number | false>(false);

  if (!result) {
    return null;
  }

  const handlePageAccordionChange =
    (pageNumber: number) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedPage(isExpanded ? pageNumber : false);
    };

  const hasWarnings = result.warnings && result.warnings.length > 0;
  const totalMatches = result.totalMatches || 0;
  const totalReplacements = result.totalReplacements || 0;
  const failedReplacements = totalMatches - totalReplacements;
  const hasFailures = failedReplacements > 0;

  // Determine overall status
  const isSuccess = result.success && !hasFailures;
  const isPartialSuccess = result.success && hasFailures;
  const isError = !result.success;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '60vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          {isSuccess && <SuccessIcon color="success" fontSize="large" />}
          {isPartialSuccess && <WarningIcon color="warning" fontSize="large" />}
          {isError && <ErrorIcon color="error" fontSize="large" />}
          <Typography variant="h5" component="span">
            {t('results.title')}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Error Message */}
        {isError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <AlertTitle>{t('results.error')}</AlertTitle>
            {result.error}
          </Alert>
        )}

        {/* Success/Warning Summary */}
        {!isError && (
          <>
            {/* Statistics Cards */}
            <Box display="flex" gap={2} mb={3} flexWrap="wrap">
              {/* Successful Replacements */}
              <Paper
                elevation={2}
                sx={{
                  flex: 1,
                  minWidth: 150,
                  p: 2,
                  textAlign: 'center',
                  bgcolor: 'success.light',
                  color: 'success.contrastText'
                }}
              >
                <Typography variant="h3" fontWeight="bold">
                  {totalReplacements}
                </Typography>
                <Typography variant="body2">{t('results.successfulReplacements')}</Typography>
              </Paper>

              {/* Failed Replacements */}
              {hasFailures && (
                <Paper
                  elevation={3}
                  sx={{
                    flex: 1,
                    minWidth: 150,
                    p: 2,
                    textAlign: 'center',
                    bgcolor: 'error.main',
                    color: 'error.contrastText',
                    border: 3,
                    borderColor: 'error.dark'
                  }}
                >
                  <Typography variant="h3" fontWeight="bold">
                    {failedReplacements}
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {t('results.failedReplacements')}
                  </Typography>
                </Paper>
              )}
            </Box>

            {/* Overall Status Message */}
            {isSuccess && (
              <Alert severity="success" sx={{ mb: 3 }}>
                <AlertTitle>{t('results.successTitle')}</AlertTitle>
                {t('results.successMessage', {
                  count: totalReplacements,
                  total: totalMatches
                })}
              </Alert>
            )}

            {isPartialSuccess && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                <AlertTitle>{t('results.warningTitle')}</AlertTitle>
                {t('results.partialSuccessMessage', {
                  successful: totalReplacements,
                  failed: failedReplacements,
                  total: totalMatches
                })}
              </Alert>
            )}

            {/* Output Path */}
            {result.outputPath && (
              <Box mb={3}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {t('results.outputLocation')}
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                  <Typography variant="body2" fontFamily="monospace">
                    {result.outputPath}
                  </Typography>
                </Paper>
              </Box>
            )}

            <Divider sx={{ my: 3 }} />

            {/* Detailed Statistics by Mapping */}
            {result.stats && result.stats.length > 0 && (
              <Box mb={3}>
                <Typography variant="h6" gutterBottom>
                  {t('results.detailedStats')}
                </Typography>
                <List disablePadding>
                  {result.stats.map((stat, index) => {
                    const hasMappingFailures = stat.failedCount > 0;
                    return (
                      <Paper
                        key={index}
                        variant="outlined"
                        sx={{
                          mb: 1,
                          p: 2,
                          bgcolor: hasMappingFailures ? 'warning.light' : 'background.paper'
                        }}
                      >
                        <Box display="flex" alignItems="center" justifyContent="space-between">
                          <Box flex={1}>
                            <Typography variant="subtitle1" fontWeight="medium">
                              {stat.sourceColumn} → {stat.targetColumn}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {stat.mappingId}
                            </Typography>
                          </Box>
                          <Box display="flex" gap={1} alignItems="center">
                            <Chip
                              icon={<InfoIcon />}
                              label={`${stat.matchCount} ${t('results.matches')}`}
                              size="small"
                              color="info"
                            />
                            <Chip
                              icon={<SuccessIcon />}
                              label={`${stat.replacementCount} ${t('results.replaced')}`}
                              size="small"
                              color="success"
                            />
                            {hasMappingFailures && (
                              <Chip
                                icon={<ErrorIcon />}
                                label={`${stat.failedCount} ${t('results.failed')}`}
                                size="small"
                                color="error"
                              />
                            )}
                          </Box>
                        </Box>
                      </Paper>
                    );
                  })}
                </List>
              </Box>
            )}

            {/* Warnings Section */}
            {hasWarnings && (
              <Box>
                <Alert severity="error" sx={{ mb: 2 }}>
                  <AlertTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                      <WarningIcon />
                      {t('results.warningsTitle')} (
                      {result.warnings!.reduce((sum, w) => sum + w.characterIssues.length, 0)}{' '}
                      characters on {result.warnings!.length} pages)
                    </Box>
                  </AlertTitle>
                  {t('results.warningsDescription')}
                </Alert>
                <Box>
                  {result.warnings!.map((warning, warningIndex) => (
                    <Accordion
                      key={warningIndex}
                      expanded={expandedPage === warning.pageNumber}
                      onChange={handlePageAccordionChange(warning.pageNumber)}
                      sx={{ mb: 1 }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        sx={{
                          bgcolor: 'error.light',
                          '&:hover': { bgcolor: 'error.main' },
                          color: 'error.contrastText'
                        }}
                      >
                        <Typography fontWeight="medium">
                          {t('results.page')} {warning.pageNumber} -{' '}
                          {warning.characterIssues.length} character
                          {warning.characterIssues.length !== 1 ? 's' : ''} failed
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ p: 0 }}>
                        {warning.characterIssues.map((issue, issueIndex) => (
                          <Box key={issueIndex} display="flex" gap={2} p={2}>
                            <Chip
                              label={issue.character}
                              size="small"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '1.2rem',
                                fontWeight: 'bold'
                              }}
                              color="error"
                            />
                            <Box
                              display="flex"
                              flexDirection="column"
                              gap={1}
                              flex={1}
                              flexWrap="wrap"
                            >
                              <Typography variant="caption" color="text.secondary" display="block">
                                Found in {issue.strings.length} string
                                {issue.strings.length !== 1 ? 's' : ''}:
                              </Typography>
                              <Box display="flex" flex={1} gap={1} flexWrap="wrap">
                                {issue.strings.map((str) => (
                                  <Chip key={str} label={str} />
                                ))}
                              </Box>
                            </Box>
                          </Box>
                        ))}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                </Box>
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="contained" size="large" fullWidth>
          {t('results.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
