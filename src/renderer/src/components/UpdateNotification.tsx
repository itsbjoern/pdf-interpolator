import { Download, Update } from '@mui/icons-material';
import { Alert, Box, Button, LinearProgress, Snackbar, Typography } from '@mui/material';
import type { UpdateInfo } from 'electron-updater';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function UpdateNotification() {
  const { t } = useTranslation();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electron.onUpdateAvailable((info) => {
      console.log('Update available:', info);
      setUpdateAvailable(true);
      setUpdateInfo(info);
    });

    window.electron.onUpdateNotAvailable(() => {
      console.log('No update available');
    });

    window.electron.onUpdateError((err) => {
      console.error('Update error:', err);
      setError(err);
      setDownloading(false);
    });

    window.electron.onUpdateDownloadProgress((progress) => {
      setDownloadProgress(progress.percent);
    });

    window.electron.onUpdateDownloaded((info) => {
      console.log('Update downloaded:', info);
      setDownloading(false);
      setUpdateDownloaded(true);
    });

    // Cleanup on unmount
    return () => {
      window.electron.removeUpdateListeners();
    };
  }, []);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setError(null);
      await window.electron.downloadUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download update');
      setDownloading(false);
    }
  };

  const handleInstall = async () => {
    try {
      await window.electron.installUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install update');
    }
  };

  return (
    <>
      <Snackbar
        open={updateAvailable && !downloading && !updateDownloaded}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Alert
          severity="info"
          icon={<Update />}
          action={
            <Button color="inherit" size="small" onClick={handleDownload}>
              {t('update.download')}
            </Button>
          }
        >
          <Typography variant="body2">
            {t('update.available', { version: updateInfo?.version })}
          </Typography>
        </Alert>
      </Snackbar>

      <Snackbar open={downloading} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert severity="info" icon={<Download />}>
          <Box sx={{ width: 200 }}>
            <Typography variant="body2" gutterBottom>
              {t('update.downloading', { percent: Math.round(downloadProgress) })}
            </Typography>
            <LinearProgress variant="determinate" value={downloadProgress} />
          </Box>
        </Alert>
      </Snackbar>

      <Snackbar open={updateDownloaded} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert
          severity="success"
          action={
            <Button color="inherit" size="small" onClick={handleInstall}>
              {t('update.restartAndInstall')}
            </Button>
          }
        >
          <Typography variant="body2">
            {t('update.downloaded', { version: updateInfo?.version })}
          </Typography>
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          <Typography variant="body2">{error}</Typography>
        </Alert>
      </Snackbar>
    </>
  );
}
