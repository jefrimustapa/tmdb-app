import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  MenuItem,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  LinearProgress,
  Alert,
  Snackbar,
  Stack,
  Tooltip,
  Grid,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import { api } from '../api/client';

export default function StreamsPage() {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [qualityFilter, setQualityFilter] = useState('');
  const [totalSize, setTotalSize] = useState('0 B');
  const [selectedItem, setSelectedItem] = useState(null); // for single evict dialog
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  const fetchStreams = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search) q.append('search', search);
      if (qualityFilter) q.append('quality', qualityFilter);
      const res = await api.get(`/cache?${q.toString()}`);
      if (res.ok && res.data) {
        setStreams(res.data.items || res.data.cachedStreams || []);
        if (res.data.totalSizeBytesFormatted) {
          setTotalSize(res.data.totalSizeBytesFormatted);
        } else if (res.data.totalSize) {
          setTotalSize(res.data.totalSize);
        }
      }
    } catch (err) {
      console.error('Failed to load streams:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStreams();
  }, [qualityFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchStreams();
  };

  const handleCopyDocId = async (docId) => {
    if (!docId) return;
    try {
      await navigator.clipboard.writeText(docId);
      setToast({ open: true, message: `Copied Doc ID: ${docId}`, severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: `Doc ID: ${docId}`, severity: 'info' });
    }
  };

  const handleEvict = async () => {
    if (!selectedItem) return;
    setActionLoading(true);
    try {
      const { queryKey, docId } = selectedItem;
      const res = await api.delete(`/cache?key=${encodeURIComponent(queryKey || '')}&docId=${encodeURIComponent(docId || '')}`);
      if (res.ok && res.data?.success) {
        setToast({ open: true, message: `Evicted stream record successfully.`, severity: 'success' });
        fetchStreams();
      } else {
        setToast({ open: true, message: res.data?.error || 'Evict failed', severity: 'error' });
      }
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setActionLoading(false);
      setSelectedItem(null);
    }
  };

  const handleClearAll = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/cache/clear');
      if (res.ok) {
        setToast({ open: true, message: 'All persistent cache records cleared.', severity: 'warning' });
        fetchStreams();
      } else {
        setToast({ open: true, message: res.data?.error || 'Clear failed', severity: 'error' });
      }
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setActionLoading(false);
      setClearAllOpen(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Persistent Stream Cache
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage pre-resolved Telegram MTProto video streams stored in database
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<DeleteForeverIcon />}
            onClick={() => setClearAllOpen(true)}
            disabled={streams.length === 0}
          >
            Clear All Cache
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchStreams}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {/* Filter and Search Bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2 }}>
          <form onSubmit={handleSearchSubmit}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={7}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search by title, query key, docId..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
                  }}
                />
              </Grid>
              <Grid item xs={6} sm={3} md={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Quality Tier"
                  value={qualityFilter}
                  onChange={(e) => setQualityFilter(e.target.value)}
                >
                  <MenuItem value="">All Qualities</MenuItem>
                  <MenuItem value="4k">4K (2160p)</MenuItem>
                  <MenuItem value="1080p">Full HD (1080p)</MenuItem>
                  <MenuItem value="720p">HD (720p)</MenuItem>
                  <MenuItem value="sd">SD (480p/360p)</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={6} sm={3} md={2}>
                <Button type="submit" fullWidth variant="contained" sx={{ height: 40 }}>
                  Search
                </Button>
              </Grid>
            </Grid>
          </form>
        </CardContent>
      </Card>

      {/* Streams Table */}
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Cached Stream Records ({streams.length})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Storage: <Box component="span" sx={{ fontWeight: 700, color: 'primary.light' }}>{totalSize}</Box>
            </Typography>
          </Box>

          {loading ? (
            <LinearProgress sx={{ my: 3 }} />
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: 'background.default' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Media Title</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Quality & Size</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Query Key</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Resolver / Bot</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>DC</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {streams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No cached streams matching your filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    streams.map((item, idx) => (
                      <TableRow key={item.docId || idx} hover>
                        <TableCell sx={{ maxWidth: 320 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title || item.filename}>
                            🎬 {item.title || item.filename || 'Untitled Stream'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            Doc ID: {item.docId || '--'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip
                              size="small"
                              label={item.quality || item.qualityTier || '720p'}
                              color={item.quality === '1080p' || item.quality === '4k' ? 'primary' : 'default'}
                              sx={{ fontWeight: 700, textTransform: 'uppercase' }}
                            />
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'primary.light' }}>
                              {item.sizeFormatted || item.size || '--'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                          {item.queryKey || '--'}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            {item.resolver && (
                              <Chip
                                size="small"
                                label={item.resolver.toUpperCase()}
                                sx={{ fontSize: '0.7rem', height: 20, bgcolor: 'rgba(52, 211, 153, 0.1)', color: 'secondary.main' }}
                              />
                            )}
                            {item.bot && (
                              <Chip
                                size="small"
                                label={`@${item.bot.replace(/^@/, '')}`}
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                          DC {item.dcId || 4}
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Tooltip title="Copy Document ID">
                              <IconButton
                                size="small"
                                onClick={() => handleCopyDocId(item.docId)}
                                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                              >
                                <ContentCopyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Evict from cache">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => setSelectedItem(item)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Evict Dialog */}
      <Dialog open={selectedItem !== null} onClose={() => !actionLoading && setSelectedItem(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Cache Eviction</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to evict <strong>{selectedItem?.title || selectedItem?.filename || selectedItem?.queryKey}</strong> from the persistent cache database?
          </DialogContentText>
          {actionLoading && <LinearProgress sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedItem(null)} disabled={actionLoading}>Cancel</Button>
          <Button onClick={handleEvict} color="error" variant="contained" disabled={actionLoading}>
            Evict Record
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear All Dialog */}
      <Dialog open={clearAllOpen} onClose={() => !actionLoading && setClearAllOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700, color: 'error.main' }}>
          DANGER: Clear All Cache
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This action will physically purge and clear ALL cached stream records from the database. Any cached video references will need to be re-queried via Telegram bots.
          </DialogContentText>
          {actionLoading && <LinearProgress sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearAllOpen(false)} disabled={actionLoading}>Cancel</Button>
          <Button onClick={handleClearAll} color="error" variant="contained" disabled={actionLoading}>
            Yes, Purge Entire Cache
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
