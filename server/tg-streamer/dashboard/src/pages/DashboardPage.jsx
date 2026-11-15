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
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BoltIcon from '@mui/icons-material/Bolt';
import StreamIcon from '@mui/icons-material/Stream';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Sneat Analytics Welcome Banner */}
      <Card
        sx={{
          p: { xs: 2.5, sm: 3 },
          position: 'relative',
          overflow: 'hidden',
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? 'linear-gradient(135deg, rgba(105, 108, 255, 0.14) 0%, rgba(43, 44, 64, 0.6) 100%)'
              : 'linear-gradient(135deg, rgba(105, 108, 255, 0.08) 0%, rgba(255, 255, 255, 0.9) 100%)',
          border: '1px solid',
          borderColor: 'rgba(105, 108, 255, 0.2)',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ maxWidth: 680 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.75, color: 'text.primary' }}>
              Welcome to TGStrm Gateway 👋
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6, mb: 2 }}>
              High-performance Telegram MTProto streaming proxy. Active pipeline buffering, multi-quality chunk resolvers, and instant cache management.
            </Typography>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Button
                variant="contained"
                size="small"
                endIcon={<ArrowForwardIcon />}
                onClick={() => onNavigate('/streams')}
                sx={{
                  bgcolor: 'primary.main',
                  color: '#FFFFFF',
                  px: 2,
                  py: 0.75,
                  boxShadow: '0 2px 6px 0 rgba(105, 108, 255, 0.4)',
                }}
              >
                View Streams ({clients.length})
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CleaningServicesIcon />}
                onClick={() => setDialogAction('purge')}
                sx={{
                  borderColor: 'rgba(105, 108, 255, 0.4)',
                  color: 'primary.main',
                  bgcolor: 'rgba(105, 108, 255, 0.06)',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'rgba(105, 108, 255, 0.12)',
                  },
                }}
              >
                Purge Memory
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RestartAltIcon />}
                onClick={() => setDialogAction('restart')}
                sx={{
                  borderColor: 'rgba(255, 171, 0, 0.4)',
                  color: '#FFAB00',
                  bgcolor: 'rgba(255, 171, 0, 0.06)',
                  '&:hover': {
                    borderColor: '#FFAB00',
                    bgcolor: 'rgba(255, 171, 0, 0.12)',
                  },
                }}
              >
                Restart Process
              </Button>
            </Stack>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Refresh Real-Time Stats">
              <IconButton
                onClick={fetchStats}
                sx={{
                  bgcolor: 'rgba(105, 108, 255, 0.08)',
                  color: 'primary.main',
                  '&:hover': { bgcolor: 'rgba(105, 108, 255, 0.16)' },
                }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Card>

      {/* Sneat Analytics KPI Stat Cards */}
      <Grid container spacing={2.5}>
        {/* Metric 1: Service Status */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '8px',
                    bgcolor: 'rgba(113, 221, 55, 0.16)',
                    color: '#71DD37',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircleIcon sx={{ fontSize: 24 }} />
                </Box>
                <Chip
                  size="small"
                  label={stats ? 'ONLINE' : 'CONNECTING'}
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    bgcolor: stats ? 'rgba(113, 221, 55, 0.16)' : 'rgba(255, 171, 0, 0.16)',
                    color: stats ? '#71DD37' : '#FFAB00',
                    borderRadius: '4px',
                  }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Service Status
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.5, mb: 0.5 }}>
                {stats ? 'Gateway Live' : 'Checking'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: '"JetBrains Mono", monospace' }}>
                Telegram MTProto
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 2: CPU Usage */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '8px',
                    bgcolor: 'rgba(105, 108, 255, 0.16)',
                    color: 'primary.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SpeedIcon sx={{ fontSize: 24 }} />
                </Box>
                {stats?.cpuPercent !== undefined && (
                  <Chip
                    size="small"
                    label={`${stats.cpuPercent}%`}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      bgcolor: 'rgba(105, 108, 255, 0.16)',
                      color: 'primary.main',
                      borderRadius: '4px',
                    }}
                  />
                )}
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                CPU Load
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.5, mb: 0.5, fontFamily: '"JetBrains Mono", monospace' }}>
                {stats?.nodeCpuPercent ?? stats?.cpuPercent ?? '--'}%
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: '"JetBrains Mono", monospace' }}>
                {stats?.cpuCores ? `${stats.cpuCores} cores · load ${stats.loadAvg || '--'}` : 'System Thread Load'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 3: RAM Usage */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '8px',
                    bgcolor: 'rgba(3, 195, 236, 0.16)',
                    color: '#03C3EC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MemoryIcon sx={{ fontSize: 24 }} />
                </Box>
                <Chip
                  size="small"
                  label={`${stats?.ramPercent ?? 0}%`}
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    bgcolor: 'rgba(3, 195, 236, 0.16)',
                    color: '#03C3EC',
                    borderRadius: '4px',
                  }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Node RAM / Cap
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.5, mb: 0.5, fontFamily: '"JetBrains Mono", monospace' }}>
                {stats?.ramMb ?? '--'}{' '}
                <Typography component="span" variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                  / {stats?.ramCapMb ?? 1024} MB
                </Typography>
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: '"JetBrains Mono", monospace' }}>
                Heap: {stats?.heapMb ?? '--'} MB
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 4: Uptime */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '8px',
                    bgcolor: 'rgba(255, 171, 0, 0.16)',
                    color: '#FFAB00',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AccessTimeIcon sx={{ fontSize: 24 }} />
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Service Uptime
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.5, mb: 0.5, fontFamily: '"JetBrains Mono", monospace' }}>
                {stats?.uptimeFormatted || stats?.uptime || '--'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                continuous uptime
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 5: Active Streams */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '8px',
                    bgcolor: 'rgba(105, 108, 255, 0.16)',
                    color: 'primary.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <StreamIcon sx={{ fontSize: 24 }} />
                </Box>
                <Chip
                  size="small"
                  label={clients.length > 0 ? 'STREAMING' : 'IDLE'}
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    bgcolor: clients.length > 0 ? 'rgba(113, 221, 55, 0.16)' : 'rgba(133, 146, 163, 0.16)',
                    color: clients.length > 0 ? '#71DD37' : 'text.secondary',
                    borderRadius: '4px',
                  }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Active Streams
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.5, mb: 0.5, fontFamily: '"JetBrains Mono", monospace' }}>
                {clients.length}{' '}
                <Typography component="span" variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                  {clients.length === 1 ? 'Client' : 'Clients'}
                </Typography>
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: '"JetBrains Mono", monospace' }}>
                Log buffer: {stats?.logSizeKB ?? 0} KB
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Buffering Performance Strip */}
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, color: 'text.primary' }}>
              <BoltIcon sx={{ color: '#FFAB00', fontSize: 22 }} /> Stream Buffering & Engine Performance
            </Typography>
            <Button
              size="small"
              onClick={() => onNavigate('/settings')}
              sx={{ fontSize: '0.8rem', color: 'primary.main', '&:hover': { bgcolor: 'rgba(105, 108, 255, 0.08)' } }}
            >
              Configure Settings →
            </Button>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'background.default', borderRadius: '8px' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  SD PIPELINE
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'primary.main', mt: 0.5 }}>
                  {pipeline.sd || 2} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline.sd || 2) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'background.default', borderRadius: '8px' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  720P HD
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'primary.main', mt: 0.5 }}>
                  {pipeline['720p'] || 4} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline['720p'] || 4) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'background.default', borderRadius: '8px' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  1080P FHD
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: 'primary.main', mt: 0.5 }}>
                  {pipeline['1080p'] || 6} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline['1080p'] || 6) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'background.default', borderRadius: '8px' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  4K UHD
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#8587FF', mt: 0.5 }}>
                  {pipeline['4k'] || 8} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline['4k'] || 8) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'background.default', borderRadius: '8px' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  PREFETCH
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: stats?.overlapPrefetch ? '#71DD37' : 'text.secondary', mt: 0.5 }}>
                  {stats?.overlapPrefetch ? 'Active' : 'Disabled'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Read-ahead stream
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'background.default', borderRadius: '8px' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  RAM CACHE
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#03C3EC', mt: 0.5 }}>
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
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                Connected Clients & Active Sessions ({clients.length})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Real-time MTProto pipe stream consumers
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={fetchStats}
              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'rgba(105, 108, 255, 0.08)' } }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Box>
          <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: 'background.default', borderRadius: '8px' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Client / Device</TableCell>
                  <TableCell>IP Address</TableCell>
                  <TableCell>Media Filename</TableCell>
                  <TableCell>Quality & Buffer</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Connected</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No active playback sessions.
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((c, idx) => (
                    <TableRow key={idx} hover sx={{ '&:hover': { bgcolor: 'rgba(105, 108, 255, 0.04) !important' } }}>
                      <TableCell sx={{ fontWeight: 600, color: 'primary.main' }}>
                        📺 {c.clientName || 'Client'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                        {c.ip || '--'}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 280, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={c.filename}>
                        {c.filename || '--'}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={`${c.qualityTier || '720p'} · ${c.concurrency || 4}x512KB`}
                          sx={{
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: '0.75rem',
                            bgcolor: 'rgba(105, 108, 255, 0.12)',
                            color: 'primary.main',
                            borderRadius: '4px',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: '#8587FF', fontSize: '0.8rem', fontWeight: 600 }}>{c.mode || 'Direct'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={c.status === 'STREAMING' ? 'Streaming' : `Idle (${c.idleSec || 0}s)`}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            bgcolor: c.status === 'STREAMING' ? 'rgba(113, 221, 55, 0.16)' : 'rgba(255, 171, 0, 0.16)',
                            color: c.status === 'STREAMING' ? '#71DD37' : '#FFAB00',
                            borderRadius: '4px',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
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
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
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
              sx={{ minWidth: 140, borderRadius: '8px' }}
            >
              {diagLoading ? 'Querying...' : 'Test Query'}
            </Button>
          </Stack>

          {diagResults && (
            <Box sx={{ mt: 2 }}>
              {diagResults.error ? (
                <Alert severity="error" sx={{ bgcolor: 'rgba(255, 62, 29, 0.12)', color: '#FF3E1D' }}>
                  {diagResults.error}
                </Alert>
              ) : (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1.5 }}>
                    Found {diagResults.count || diagResults.buttons?.length || 0} results via {diagResults.resolver} (@{diagResults.targetBot}):
                  </Typography>
                  <Stack spacing={1}>
                    {(diagResults.buttons || []).map((b, i) => (
                      <Paper key={i} variant="outlined" sx={{ p: 1.75, bgcolor: 'background.default', borderRadius: '8px' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {b.text}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75 }}>
                          <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'primary.main' }}>
                            {b.className || 'InlineKeyboardButton'}
                          </Typography>
                          {b.url && (
                            <Button
                              size="small"
                              href={b.url}
                              target="_blank"
                              rel="noopener"
                              endIcon={<OpenInNewIcon fontSize="small" />}
                              sx={{ fontSize: '0.75rem', py: 0.25, color: 'primary.main' }}
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
          <DialogContentText sx={{ color: 'text.secondary' }}>
            {dialogAction === 'purge'
              ? 'This will trigger garbage collection, clear non-essential LRU memory blocks, and release in-flight memory pipelines. Active streams will continue uninterrupted.'
              : 'This will gracefully restart the TGStrm microservice process. Connected video streaming sessions may pause momentarily while the process respawns (approximately 2–3 seconds).'}
          </DialogContentText>
          {actionLoading && <LinearProgress sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialogAction(null)} disabled={actionLoading} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            onClick={dialogAction === 'purge' ? handlePurgeMemory : handleRestart}
            variant="contained"
            color={dialogAction === 'purge' ? 'primary' : 'warning'}
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
