import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  LinearProgress,
  Alert,
  Snackbar,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MemoryIcon from '@mui/icons-material/Memory';
import SpeedIcon from '@mui/icons-material/Speed';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StorageIcon from '@mui/icons-material/Storage';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { api } from '../api/client';

export default function DashboardPage({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [diagQuery, setDiagQuery] = useState('');
  const [diagResults, setDiagResults] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [dialogAction, setDialogAction] = useState(null); // 'purge' | 'restart'
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  const fetchStats = async () => {
    try {
      const res = await api.get('/system/stats');
      if (res.ok && res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Error fetching system stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const handlePurgeMemory = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/system/purge-memory');
      if (res.ok && res.data?.success) {
        setToast({ open: true, message: 'Memory purge executed successfully.', severity: 'success' });
        fetchStats();
      } else {
        setToast({ open: true, message: res.data?.error || 'Purge failed', severity: 'error' });
      }
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setActionLoading(false);
      setDialogAction(null);
    }
  };

  const handleRestart = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/system/restart');
      if (res.ok) {
        setToast({ open: true, message: 'Restart initiated. Service will reload in a few seconds.', severity: 'warning' });
      }
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setActionLoading(false);
      setDialogAction(null);
    }
  };

  const handleRunDiagnostic = async () => {
    if (!diagQuery.trim()) return;
    setDiagLoading(true);
    try {
      const res = await api.get(`/debug-search?q=${encodeURIComponent(diagQuery.trim())}`);
      if (res.ok && res.data) {
        setDiagResults(res.data);
      } else {
        setDiagResults({ error: res.data?.error || 'Diagnostic query failed' });
      }
    } catch (err) {
      setDiagResults({ error: err.message });
    } finally {
      setDiagLoading(false);
    }
  };

  const clients = stats?.activeClients || [];
  const pipeline = stats?.pipelineBuffers || {};

  return (
    <Box sx={{ spaceY: 3 }}>
      {/* Top Action Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            System Overview & Stream Engine
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Live metrics, active sessions, and MTProto pipeline controls
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Tooltip title="Purge GC and release idle in-flight buffers">
            <Button
              variant="outlined"
              color="info"
              size="small"
              startIcon={<CleaningServicesIcon />}
              onClick={() => setDialogAction('purge')}
            >
              Purge Memory
            </Button>
          </Tooltip>
          <Tooltip title="Restart microservice process">
            <Button
              variant="outlined"
              color="warning"
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={() => setDialogAction('restart')}
            >
              Restart
            </Button>
          </Tooltip>
        </Stack>
      </Box>

      {/* Metrics Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700 }}>
                Service Status
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Chip
                  size="small"
                  label={stats ? 'Online' : 'Checking'}
                  color={stats ? 'success' : 'warning'}
                  sx={{ fontWeight: 700 }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Telegram MTProto
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700 }}>
                CPU Usage
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
                <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'success.main' }}>
                  {stats?.nodeCpuPercent ?? stats?.cpuPercent ?? '--'}%
                </Typography>
                {stats?.routerCpuPercent !== undefined && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    [{stats.routerCpuPercent}% router]
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}>
                {stats?.cpuCores ? `${stats.cpuCores} cores · load ${stats.loadAvg || '--'}` : 'System Load'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700 }}>
                Node RAM / Cap
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
                <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}>
                  {stats?.ramMb ?? '--'} / {stats?.ramCapMb ?? 1024} MB
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  ({stats?.ramPercent ?? '--'}%)
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}>
                Heap: {stats?.heapMb ?? '--'} MB
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700 }}>
                Microservice Uptime
              </Typography>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, mt: 1 }}>
                {stats?.uptimeFormatted || stats?.uptime || '--'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                active runtime
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700 }}>
                Active Streams
              </Typography>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, mt: 1, color: 'secondary.main' }}>
                {clients.length} {clients.length === 1 ? 'Client' : 'Clients'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Log Size: {stats?.logSizeKB ?? 0} KB
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Buffering Performance Strip */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              ⚡ Stream Buffering & Engine Performance
            </Typography>
            <Button size="small" onClick={() => onNavigate('/settings')} sx={{ fontSize: '0.8rem' }}>
              Configure Settings →
            </Button>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
                  SD PIPELINE
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.light', mt: 0.5 }}>
                  {pipeline.sd || 2} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline.sd || 2) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
                  720p HD
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.light', mt: 0.5 }}>
                  {pipeline['720p'] || 4} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline['720p'] || 4) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
                  1080p FHD
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.light', mt: 0.5 }}>
                  {pipeline['1080p'] || 6} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline['1080p'] || 6) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
                  4K UHD
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.light', mt: 0.5 }}>
                  {pipeline['4k'] || 8} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline['4k'] || 8) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
                  OVERLAP PREFETCH
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: stats?.overlapPrefetch ? 'success.main' : 'text.secondary', mt: 0.5 }}>
                  {stats?.overlapPrefetch ? 'Active' : 'Disabled'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Read-ahead stream
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
                  RAM BLOCK CACHE
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.light', mt: 0.5 }}>
                  {stats?.routerRamCacheMb || 16} MB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {(stats?.routerRamCacheMb || 16) * 2} blocks cap
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Active Clients Table */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Connected Clients & Active Sessions ({clients.length})
            </Typography>
            <IconButton size="small" onClick={fetchStats}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Box>
          <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: 'background.default' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Client / Device</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>IP Address</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Media Filename</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Quality & Buffer</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Mode</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Connected</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                      No active playback sessions.
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((c, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontWeight: 600, color: 'primary.light' }}>
                        📺 {c.clientName || 'Client'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                        {c.ip || '--'}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 280, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={c.filename}>
                        {c.filename || '--'}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={`${c.qualityTier || '720p'} · ${c.concurrency || 4}x512KB`}
                          sx={{ fontFamily: 'monospace', fontSize: '0.75rem', bgcolor: 'rgba(56, 189, 248, 0.1)', color: 'primary.main' }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: 'secondary.main', fontSize: '0.8rem' }}>{c.mode || 'Direct'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={c.status === 'STREAMING' ? 'Streaming' : `Idle (${c.idleSec || 0}s)`}
                          color={c.status === 'STREAMING' ? 'success' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                        {c.connectedSec || 0}s
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Query Diagnostic Tool */}
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            🔍 MTProto Search Diagnostic Tool
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Simulate query resolution directly against the active bot resolver handle to verify button callbacks and metadata.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="e.g. Kelas Cikgu Hiragi, Spiderman, Breaking Bad..."
              value={diagQuery}
              onChange={(e) => setDiagQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunDiagnostic()}
            />
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={handleRunDiagnostic}
              disabled={diagLoading || !diagQuery.trim()}
              sx={{ minWidth: 140 }}
            >
              {diagLoading ? 'Querying...' : 'Test Query'}
            </Button>
          </Stack>

          {diagResults && (
            <Box sx={{ mt: 2 }}>
              {diagResults.error ? (
                <Alert severity="error">{diagResults.error}</Alert>
              ) : (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
                    Found {diagResults.count || diagResults.buttons?.length || 0} results via {diagResults.resolver} (@{diagResults.targetBot}):
                  </Typography>
                  <Stack spacing={1}>
                    {(diagResults.buttons || []).map((b, i) => (
                      <Paper key={i} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {b.text}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'primary.main' }}>
                            {b.className || 'InlineKeyboardButton'}
                          </Typography>
                          {b.url && (
                            <Button
                              size="small"
                              href={b.url}
                              target="_blank"
                              rel="noopener"
                              endIcon={<OpenInNewIcon fontSize="small" />}
                              sx={{ fontSize: '0.75rem', py: 0 }}
                            >
                              Open URL
                            </Button>
                          )}
                        </Box>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      <Dialog open={dialogAction !== null} onClose={() => !actionLoading && setDialogAction(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {dialogAction === 'purge' ? 'Confirm Memory Purge' : 'Confirm Service Restart'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {dialogAction === 'purge'
              ? 'This will trigger garbage collection, clear non-essential LRU memory blocks, and release in-flight memory pipelines. Active streams will continue uninterrupted.'
              : 'This will gracefully restart the TGStrm microservice process. Connected video streaming sessions may pause momentarily while the process respawns (approximately 2–3 seconds).'}
          </DialogContentText>
          {actionLoading && <LinearProgress sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogAction(null)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            onClick={dialogAction === 'purge' ? handlePurgeMemory : handleRestart}
            variant="contained"
            color={dialogAction === 'purge' ? 'info' : 'warning'}
            disabled={actionLoading}
          >
            {dialogAction === 'purge' ? 'Purge Memory' : 'Restart Service'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast Snackbar */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast({ ...toast, open: false })}
      >
        <Alert severity={toast.severity} onClose={() => setToast({ ...toast, open: false })}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
