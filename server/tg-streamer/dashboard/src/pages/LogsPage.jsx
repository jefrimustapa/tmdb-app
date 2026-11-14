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
  ButtonGroup,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SearchIcon from '@mui/icons-material/Search';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
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

    es.onmessage = (e) => {
      if (!isMounted) return;
      try {
        const data = JSON.parse(e.data);
        if (data.lines && data.lines.length > 0) {
          setLogs((prev) => {
            const next = [...prev, ...data.lines];
            return next.length > 2500 ? next.slice(-2000) : next;
          });
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };

    es.onerror = () => {
      if (isMounted) setSseStatus('error');
    };

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
      return '#f43f5e'; // rose-500
    }
    if (line.includes('[WARN]')) {
      return '#fbbf24'; // amber-400
    }
    if (line.includes('[STREAM') || line.includes('[PIPELINE')) {
      return '#38bdf8'; // sky-400
    }
    if (line.includes('[SUPERVISOR')) {
      return '#34d399'; // emerald-400
    }
    if (line.includes('[TG]') || line.includes('[AUTH')) {
      return '#c084fc'; // purple-400
    }
    if (line.includes('[MEMORY PURGE]') || line.includes('[SYSTEM]')) {
      return '#22d3ee'; // cyan-400
    }
    return '#94a3b8'; // slate-400
  };

  const filteredLogs = logs.filter((l) => {
    if (filterType && !l.includes(filterType)) return false;
    if (search && !l.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Live Log Console
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Real-time MTProto microservice streaming & diagnostic log stream
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            size="small"
            color="error"
            startIcon={<DeleteSweepIcon />}
            onClick={() => setClearDialogOpen(true)}
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
          >
            Download .log
          </Button>
        </Stack>
      </Box>

      {/* Filter and Control Bar */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems="center">
            {/* Quick Filters */}
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {[
                { label: 'All', value: '' },
                { label: 'Streams', value: '[STREAM' },
                { label: 'Telegram', value: '[TG]' },
                { label: 'Errors', value: 'ERROR' },
                { label: 'Supervisor', value: '[SUPERVISOR]' },
              ].map((f) => (
                <Chip
                  key={f.label}
                  label={f.label}
                  size="small"
                  clickable
                  color={filterType === f.value ? 'primary' : 'default'}
                  variant={filterType === f.value ? 'filled' : 'outlined'}
                  onClick={() => setFilterType(f.value)}
                  sx={{ fontWeight: 600 }}
                />
              ))}
            </Stack>

            {/* Search and Auto-scroll */}
            <Stack direction="row" spacing={2} alignItems="center" sx={{ width: { xs: '100%', md: 'auto' } }}>
              <TextField
                size="small"
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />,
                }}
                sx={{ width: { xs: '100%', md: 240 } }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                  />
                }
                label={<Typography variant="caption">Auto-scroll</Typography>}
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
          bgcolor: '#06090e',
          border: '1px solid #1e293b',
          minHeight: 520,
        }}
      >
        {/* Terminal Header Bar */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 2,
            py: 1,
            bgcolor: '#0B0F17',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f43f5e' }} />
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#fbbf24' }} />
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#34d399' }} />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', ml: 1 }}>
              tg-streamer.log
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
              {filteredLogs.length} lines
            </Typography>
            <Chip
              size="small"
              icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important' }} />}
              label={sseStatus === 'live' ? 'Live Stream' : sseStatus === 'error' ? 'Reconnecting...' : 'Connecting'}
              color={sseStatus === 'live' ? 'success' : sseStatus === 'error' ? 'warning' : 'default'}
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          </Box>
        </Box>

        {/* Terminal Content */}
        <Box
          ref={terminalRef}
          sx={{
            flex: 1,
            p: 2,
            overflowY: 'auto',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.78rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {filteredLogs.length === 0 ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              No log lines matching criteria.
            </Typography>
          ) : (
            filteredLogs.map((line, idx) => (
              <Box key={idx} sx={{ color: getLineColor(line) }}>
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
          <DialogContentText>
            Are you sure you want to physically clear and truncate the live log file on the router? All current historical logs will be permanently deleted.
          </DialogContentText>
          {actionLoading && <LinearProgress sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)} disabled={actionLoading}>Cancel</Button>
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
