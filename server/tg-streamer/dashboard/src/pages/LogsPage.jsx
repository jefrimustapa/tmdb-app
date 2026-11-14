import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Paper,
  Button,
  TextField,
  Chip,
  IconButton,
  FormControlLabel,
  Checkbox,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  LinearProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SearchIcon from '@mui/icons-material/Search';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import TerminalIcon from '@mui/icons-material/Terminal';
import { api } from '../api/client';

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [sseStatus, setSseStatus] = useState('connecting'); // 'live' | 'connecting' | 'error'
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const terminalRef = useRef(null);

  // Initial Fetch
  useEffect(() => {
    let isMounted = true;
    const fetchInitial = async () => {
      try {
        const res = await api.get('/logs?lines=300');
        if (res.ok && res.data?.logs && isMounted) {
          setLogs(res.data.logs);
        }
      } catch (err) {
        console.error('Failed to load initial logs:', err);
      }
    };
    fetchInitial();

    // SSE Setup
    const sseUrl = api.getSSEUrl('/logs/stream');
    const es = new EventSource(sseUrl);

    es.onopen = () => {
      if (isMounted) setSseStatus('live');
    };

    es.onerror = () => {
      if (isMounted) setSseStatus('error');
    };

    es.addEventListener('log', (event) => {
      if (!isMounted) return;
      try {
        const line = JSON.parse(event.data);
        setLogs((prev) => [...prev.slice(-1000), line]);
      } catch (e) {
        setLogs((prev) => [...prev.slice(-1000), event.data]);
      }
    });

    return () => {
      isMounted = false;
      es.close();
    };
  }, []);

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleClearLog = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/logs/clear');
      if (res.ok && res.data?.success) {
        setLogs([]);
        setToast({ open: true, message: 'Log file truncated successfully.', severity: 'success' });
      } else {
        setToast({ open: true, message: res.data?.error || 'Clear failed', severity: 'error' });
      }
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setActionLoading(false);
      setClearDialogOpen(false);
    }
  };

  const getLineColor = (line) => {
    if (line.includes('[ERROR]') || line.includes('[FATAL]') || line.includes('Error:')) {
      return '#F43F5E'; // rose-500
    }
    if (line.includes('[WARN]')) {
      return '#FBBF24'; // amber-400
    }
    if (line.includes('[STREAM') || line.includes('[PIPELINE')) {
      return '#38BDF8'; // sky-400
    }
    if (line.includes('[SUPERVISOR')) {
      return '#34D399'; // emerald-400
    }
    if (line.includes('[TG]') || line.includes('[AUTH')) {
      return '#818CF8'; // indigo-400
    }
    if (line.includes('[MEMORY PURGE]') || line.includes('[SYSTEM]')) {
      return '#22D3EE'; // cyan-400
    }
    return '#94A3B8'; // slate-400
  };

  const filteredLogs = logs.filter((l) => {
    if (filterType && !l.includes(filterType)) return false;
    if (search && !l.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
            Live Log Console
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Real-time MTProto microservice streaming & diagnostic log stream
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DeleteSweepIcon />}
            onClick={() => setClearDialogOpen(true)}
            sx={{
              borderColor: 'rgba(244, 63, 94, 0.3)',
              color: '#F43F5E',
              bgcolor: 'rgba(244, 63, 94, 0.05)',
              '&:hover': {
                borderColor: '#F43F5E',
                bgcolor: 'rgba(244, 63, 94, 0.12)',
              },
            }}
          >
            Clear Log
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            href={api.getDownloadUrl('/logs/download')}
            target="_blank"
            rel="noopener"
            sx={{
              borderColor: 'rgba(148, 163, 184, 0.2)',
              color: '#F8FAFC',
              '&:hover': {
                borderColor: '#38BDF8',
                color: '#38BDF8',
              },
            }}
          >
            Download .log
          </Button>
        </Stack>
      </Box>

      {/* Filter and Control Bar */}
      <Card>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems="center">
            {/* Quick Filters */}
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {[
                { label: 'All', value: '' },
                { label: 'Streams', value: '[STREAM' },
                { label: 'Telegram', value: '[TG]' },
                { label: 'Errors', value: 'ERROR' },
                { label: 'Supervisor', value: '[SUPERVISOR]' },
              ].map((f) => {
                const active = filterType === f.value;
                return (
                  <Chip
                    key={f.label}
                    label={f.label}
                    size="small"
                    clickable
                    onClick={() => setFilterType(f.value)}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      bgcolor: active ? 'rgba(56, 189, 248, 0.15)' : '#090D16',
                      color: active ? '#38BDF8' : '#94A3B8',
                      border: active ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(148, 163, 184, 0.15)',
                      '&:hover': {
                        bgcolor: active ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      },
                    }}
                  />
                );
              })}
            </Stack>

            {/* Search and Auto-scroll */}
            <Stack direction="row" spacing={2} alignItems="center" sx={{ width: { xs: '100%', md: 'auto' } }}>
              <TextField
                size="small"
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5, color: '#94A3B8' }} />,
                }}
                sx={{
                  width: { xs: '100%', md: 240 },
                  '& .MuiOutlinedInput-root': {
                    bgcolor: '#090D16',
                    borderRadius: 2,
                    '& fieldset': { borderColor: 'rgba(148, 163, 184, 0.2)' },
                    '&:hover fieldset': { borderColor: 'rgba(56, 189, 248, 0.4)' },
                    '&.Mui-focused fieldset': { borderColor: '#38BDF8' },
                  },
                }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    color="primary"
                  />
                }
                label={<Typography variant="caption" sx={{ fontWeight: 600, color: '#94A3B8' }}>Auto-scroll</Typography>}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Terminal Container */}
      <Card
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#050811',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: 2.5,
          minHeight: 520,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Terminal Header Bar (macOS style 3-dots) */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 2,
            py: 1.25,
            bgcolor: '#090D16',
            borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: '#F43F5E', boxShadow: '0 0 6px rgba(244, 63, 94, 0.4)' }} />
            <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: '#FBBF24', boxShadow: '0 0 6px rgba(251, 191, 36, 0.4)' }} />
            <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: '#34D399', boxShadow: '0 0 6px rgba(52, 211, 153, 0.4)' }} />
            <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, color: '#94A3B8', ml: 1.5 }}>
              tg-streamer.log — console
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', color: '#94A3B8' }}>
              {filteredLogs.length} lines
            </Typography>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.35,
                borderRadius: '12px',
                fontSize: '0.7rem',
                fontWeight: 700,
                fontFamily: '"JetBrains Mono", monospace',
                bgcolor: sseStatus === 'live' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                color: sseStatus === 'live' ? '#34D399' : '#FBBF24',
                border: `1px solid ${sseStatus === 'live' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(251, 191, 36, 0.25)'}`,
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: sseStatus === 'live' ? '#34D399' : '#FBBF24',
                  boxShadow: sseStatus === 'live' ? '0 0 8px #34D399' : 'none',
                }}
              />
              {sseStatus === 'live' ? 'LIVE SSE' : sseStatus === 'error' ? 'RECONNECTING' : 'CONNECTING'}
            </Box>
          </Box>
        </Box>

        {/* Terminal Content */}
        <Box
          ref={terminalRef}
          sx={{
            flex: 1,
            p: 2.5,
            overflowY: 'auto',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.8rem',
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {filteredLogs.length === 0 ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic', fontFamily: '"JetBrains Mono", monospace' }}>
              No log lines matching criteria.
            </Typography>
          ) : (
            filteredLogs.map((line, idx) => (
              <Box key={idx} sx={{ color: getLineColor(line), py: 0.1 }}>
                {line}
              </Box>
            ))
          )}
        </Box>
      </Card>

      {/* Clear Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => !actionLoading && setClearDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Truncate Server Log</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            Are you sure you want to physically clear and truncate the live log file on the router? All current historical logs will be permanently deleted.
          </DialogContentText>
          {actionLoading && <LinearProgress sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setClearDialogOpen(false)} disabled={actionLoading} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button onClick={handleClearLog} color="error" variant="contained" disabled={actionLoading}>
            Clear Log
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast Feedback */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
      >
        <Alert severity={toast.severity} onClose={() => setToast({ ...toast, open: false })}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
