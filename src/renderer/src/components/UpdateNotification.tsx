import { useEffect, useState } from 'react';
import { Snackbar, Alert, Button, LinearProgress, Typography, Box } from '@mui/material';
import { Download, Update } from '@mui/icons-material';

interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseName?: string;
}

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set up event listeners
    window.electron.onUpdateAvailable((info: UpdateInfo) => {
      console.log('Update available:', info);
      setUpdateAvailable(true);
      setUpdateInfo(info);
    });

    window.electron.onUpdateNotAvailable(() => {
      console.log('No update available');
    });

    window.electron.onUpdateError((err: string) => {
      console.error('Update error:', err);
      setError(err);
      setDownloading(false);
    });

    window.electron.onUpdateDownloadProgress((progress: any) => {
      setDownloadProgress(progress.percent);
    });

    window.electron.onUpdateDownloaded((info: UpdateInfo) => {
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
      {/* Update Available Notification */}
      <Snackbar
        open={updateAvailable && !downloading && !updateDownloaded}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Alert
          severity="info"
          icon={<Update />}
          action={
            <Button color="inherit" size="small" onClick={handleDownload}>
              Download
            </Button>
          }
        >
          <Typography variant="body2">New version {updateInfo?.version} is available</Typography>
        </Alert>
      </Snackbar>

      {/* Downloading Progress */}
      <Snackbar open={downloading} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert severity="info" icon={<Download />}>
          <Box sx={{ width: 200 }}>
            <Typography variant="body2" gutterBottom>
              Downloading update... {Math.round(downloadProgress)}%
            </Typography>
            <LinearProgress variant="determinate" value={downloadProgress} />
          </Box>
        </Alert>
      </Snackbar>

      {/* Update Downloaded */}
      <Snackbar open={updateDownloaded} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert
          severity="success"
          action={
            <Button color="inherit" size="small" onClick={handleInstall}>
              Restart & Install
            </Button>
          }
        >
          <Typography variant="body2">
            Update downloaded! Restart to install version {updateInfo?.version}
          </Typography>
        </Alert>
      </Snackbar>

      {/* Error Notification */}
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
