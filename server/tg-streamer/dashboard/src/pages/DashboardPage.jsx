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
      {/* Top Action Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
            System Overview & Stream Engine
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Live metrics, active sessions, and MTProto pipeline controls
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Tooltip title="Purge GC and release idle in-flight buffers">
            <Button
              variant="outlined"
              size="small"
              startIcon={<CleaningServicesIcon />}
              onClick={() => setDialogAction('purge')}
              sx={{
                borderColor: 'rgba(56, 189, 248, 0.3)',
                color: '#38BDF8',
                bgcolor: 'rgba(56, 189, 248, 0.05)',
                '&:hover': {
                  borderColor: '#38BDF8',
                  bgcolor: 'rgba(56, 189, 248, 0.12)',
                },
              }}
            >
              Purge Memory
            </Button>
          </Tooltip>
          <Tooltip title="Restart microservice process">
            <Button
              variant="outlined"
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={() => setDialogAction('restart')}
              sx={{
                borderColor: 'rgba(251, 191, 36, 0.3)',
                color: '#FBBF24',
                bgcolor: 'rgba(251, 191, 36, 0.05)',
                '&:hover': {
                  borderColor: '#FBBF24',
                  bgcolor: 'rgba(251, 191, 36, 0.12)',
                },
              }}
            >
              Restart
            </Button>
          </Tooltip>
        </Stack>
      </Box>

      {/* Metrics Row (Modern KPI Cards) */}
      <Grid container spacing={2}>
        {/* Metric 1: Service Status */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card
            sx={{
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: 'linear-gradient(90deg, #34D399, #10B981)',
              },
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Service Status
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    bgcolor: 'rgba(52, 211, 153, 0.12)',
                    color: '#34D399',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircleIcon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
                <Chip
                  size="small"
                  label={stats ? 'ONLINE' : 'CHECKING'}
                  sx={{
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    bgcolor: stats ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 191, 36, 0.12)',
                    color: stats ? '#34D399' : '#FBBF24',
                    border: `1px solid ${stats ? 'rgba(52, 211, 153, 0.25)' : 'rgba(251, 191, 36, 0.25)'}`,
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontFamily: '"JetBrains Mono", monospace' }}>
                Telegram MTProto
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 2: CPU Usage */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card
            sx={{
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: 'linear-gradient(90deg, #38BDF8, #0284C7)',
              },
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  CPU Usage
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    bgcolor: 'rgba(56, 189, 248, 0.12)',
                    color: '#38BDF8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SpeedIcon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
                <Typography variant="h5" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, color: '#38BDF8' }}>
                  {stats?.nodeCpuPercent ?? stats?.cpuPercent ?? '--'}%
                </Typography>
                {stats?.routerCpuPercent !== undefined && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"JetBrains Mono", monospace' }}>
                    [{stats.routerCpuPercent}% router]
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: '"JetBrains Mono", monospace' }}>
                {stats?.cpuCores ? `${stats.cpuCores} cores · load ${stats.loadAvg || '--'}` : 'System Load'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 3: RAM Usage */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card
            sx={{
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: 'linear-gradient(90deg, #818CF8, #6366F1)',
              },
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Node RAM / Cap
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    bgcolor: 'rgba(129, 140, 248, 0.12)',
                    color: '#818CF8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MemoryIcon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
                <Typography variant="h5" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, color: '#F8FAFC' }}>
                  {stats?.ramMb ?? '--'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  / {stats?.ramCapMb ?? 1024} MB ({stats?.ramPercent ?? '--'}%)
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: '"JetBrains Mono", monospace' }}>
                Heap: {stats?.heapMb ?? '--'} MB
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 4: Uptime */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card
            sx={{
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: 'linear-gradient(90deg, #FBBF24, #D97706)',
              },
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Service Uptime
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    bgcolor: 'rgba(251, 191, 36, 0.12)',
                    color: '#FBBF24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AccessTimeIcon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
              <Typography variant="h5" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, mt: 1, color: '#F8FAFC' }}>
                {stats?.uptimeFormatted || stats?.uptime || '--'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                active runtime
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 5: Active Streams */}
        <Grid item xs={12} sm={6} md={2.4}>
          <Card
            sx={{
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: 'linear-gradient(90deg, #38BDF8, #818CF8)',
              },
            }}
          >
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Active Streams
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    bgcolor: 'rgba(56, 189, 248, 0.12)',
                    color: '#38BDF8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <StorageIcon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
              <Typography variant="h5" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 800, mt: 1, color: '#38BDF8' }}>
                {clients.length} <Typography component="span" variant="body2" color="text.secondary">{clients.length === 1 ? 'Client' : 'Clients'}</Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: '"JetBrains Mono", monospace' }}>
                Log: {stats?.logSizeKB ?? 0} KB
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Buffering Performance Strip */}
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 1.5, borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, color: '#F8FAFC' }}>
              <BoltIcon sx={{ color: '#FBBF24', fontSize: 20 }} /> Stream Buffering & Engine Performance
            </Typography>
            <Button
              size="small"
              onClick={() => onNavigate('/settings')}
              sx={{ fontSize: '0.8rem', color: '#38BDF8', '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.1)' } }}
            >
              Configure Settings →
            </Button>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: '#090D16', borderColor: 'rgba(148, 163, 184, 0.12)', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  SD PIPELINE
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#38BDF8', mt: 0.5 }}>
                  {pipeline.sd || 2} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline.sd || 2) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: '#090D16', borderColor: 'rgba(148, 163, 184, 0.12)', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  720P HD
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#38BDF8', mt: 0.5 }}>
                  {pipeline['720p'] || 4} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline['720p'] || 4) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: '#090D16', borderColor: 'rgba(148, 163, 184, 0.12)', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  1080P FHD
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#38BDF8', mt: 0.5 }}>
                  {pipeline['1080p'] || 6} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline['1080p'] || 6) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: '#090D16', borderColor: 'rgba(148, 163, 184, 0.12)', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  4K UHD
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#818CF8', mt: 0.5 }}>
                  {pipeline['4k'] || 8} × 512KB
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {((pipeline['4k'] || 8) * 0.5).toFixed(1)} MB in-flight
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: '#090D16', borderColor: 'rgba(148, 163, 184, 0.12)', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  PREFETCH
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: stats?.overlapPrefetch ? '#34D399' : '#94A3B8', mt: 0.5 }}>
                  {stats?.overlapPrefetch ? 'Active' : 'Disabled'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Read-ahead stream
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <Paper variant="outlined" sx={{ p: 1.75, bgcolor: '#090D16', borderColor: 'rgba(148, 163, 184, 0.12)', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em', display: 'block' }}>
                  RAM CACHE
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#38BDF8', mt: 0.5 }}>
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
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#F8FAFC' }}>
                Connected Clients & Active Sessions ({clients.length})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Real-time MTProto pipe stream consumers
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={fetchStats}
              sx={{ color: '#94A3B8', '&:hover': { color: '#38BDF8', bgcolor: 'rgba(56, 189, 248, 0.1)' } }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Box>
          <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: '#090D16', borderColor: 'rgba(148, 163, 184, 0.12)', borderRadius: 2 }}>
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
                    <TableRow key={idx} hover sx={{ '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.04) !important' } }}>
                      <TableCell sx={{ fontWeight: 600, color: '#38BDF8' }}>
                        📺 {c.clientName || 'Client'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem', color: '#94A3B8' }}>
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
                            bgcolor: 'rgba(56, 189, 248, 0.08)',
                            color: '#38BDF8',
                            border: '1px solid rgba(56, 189, 248, 0.25)',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: '#818CF8', fontSize: '0.8rem', fontWeight: 600 }}>{c.mode || 'Direct'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={c.status === 'STREAMING' ? 'Streaming' : `Idle (${c.idleSec || 0}s)`}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            bgcolor: c.status === 'STREAMING' ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 191, 36, 0.12)',
                            color: c.status === 'STREAMING' ? '#34D399' : '#FBBF24',
                            border: `1px solid ${c.status === 'STREAMING' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(251, 191, 36, 0.25)'}`,
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem', color: '#94A3B8' }}>
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
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
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
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: '#090D16',
                  borderRadius: 2,
                  '& fieldset': { borderColor: 'rgba(148, 163, 184, 0.2)' },
                  '&:hover fieldset': { borderColor: 'rgba(56, 189, 248, 0.4)' },
                  '&.Mui-focused fieldset': { borderColor: '#38BDF8' },
                },
              }}
            />
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={handleRunDiagnostic}
              disabled={diagLoading || !diagQuery.trim()}
              sx={{ minWidth: 140, borderRadius: 2 }}
            >
              {diagLoading ? 'Querying...' : 'Test Query'}
            </Button>
          </Stack>

          {diagResults && (
            <Box sx={{ mt: 2 }}>
              {diagResults.error ? (
                <Alert severity="error" sx={{ bgcolor: 'rgba(244, 63, 94, 0.1)', color: '#F43F5E', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                  {diagResults.error}
                </Alert>
              ) : (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#F8FAFC', mb: 1.5 }}>
                    Found {diagResults.count || diagResults.buttons?.length || 0} results via {diagResults.resolver} (@{diagResults.targetBot}):
                  </Typography>
                  <Stack spacing={1}>
                    {(diagResults.buttons || []).map((b, i) => (
                      <Paper key={i} variant="outlined" sx={{ p: 1.75, bgcolor: '#090D16', borderColor: 'rgba(148, 163, 184, 0.12)', borderRadius: 2 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#F8FAFC' }}>
                          {b.text}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75 }}>
                          <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', color: '#38BDF8' }}>
                            {b.className || 'InlineKeyboardButton'}
                          </Typography>
                          {b.url && (
                            <Button
                              size="small"
                              href={b.url}
                              target="_blank"
                              rel="noopener"
                              endIcon={<OpenInNewIcon fontSize="small" />}
                              sx={{ fontSize: '0.75rem', py: 0.25, color: '#818CF8' }}
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
