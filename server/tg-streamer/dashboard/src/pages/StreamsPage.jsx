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
import StorageIcon from '@mui/icons-material/Storage';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
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

  const getQualityBadge = (quality) => {
    const q = (quality || '').toLowerCase();
    if (q.includes('4k') || q.includes('2160')) {
      return {
        bg: 'rgba(129, 140, 248, 0.12)',
        color: '#818CF8',
        border: 'rgba(129, 140, 248, 0.3)',
      };
    }
    if (q.includes('1080')) {
      return {
        bg: 'rgba(56, 189, 248, 0.12)',
        color: '#38BDF8',
        border: 'rgba(56, 189, 248, 0.3)',
      };
    }
    if (q.includes('720')) {
      return {
        bg: 'rgba(52, 211, 153, 0.12)',
        color: '#34D399',
        border: 'rgba(52, 211, 153, 0.3)',
      };
    }
    return {
      bg: 'rgba(251, 191, 36, 0.12)',
      color: '#FBBF24',
      border: 'rgba(251, 191, 36, 0.3)',
    };
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
            Persistent Stream Cache
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Manage pre-resolved Telegram MTProto video streams stored in database
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DeleteForeverIcon />}
            onClick={() => setClearAllOpen(true)}
            disabled={streams.length === 0}
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
            Clear All Cache
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchStreams}
            sx={{
              borderColor: 'rgba(148, 163, 184, 0.2)',
              color: '#F8FAFC',
              '&:hover': {
                borderColor: '#38BDF8',
                color: '#38BDF8',
              },
            }}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent sx={{ p: 2.5 }}>
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
                    startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: '#94A3B8' }} />,
                  }}
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
              </Grid>
              <Grid item xs={6} sm={3} md={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Quality Tier"
                  value={qualityFilter}
                  onChange={(e) => setQualityFilter(e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      bgcolor: '#090D16',
                      borderRadius: 2,
                      '& fieldset': { borderColor: 'rgba(148, 163, 184, 0.2)' },
                      '&:hover fieldset': { borderColor: 'rgba(56, 189, 248, 0.4)' },
                      '&.Mui-focused fieldset': { borderColor: '#38BDF8' },
                    },
                  }}
                >
                  <MenuItem value="">All Qualities</MenuItem>
                  <MenuItem value="4k">4K (2160p)</MenuItem>
                  <MenuItem value="1080p">Full HD (1080p)</MenuItem>
                  <MenuItem value="720p">HD (720p)</MenuItem>
                  <MenuItem value="sd">SD (480p/360p)</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={6} sm={3} md={2}>
                <Button type="submit" fullWidth variant="contained" sx={{ height: 40, borderRadius: 2 }}>
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
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#F8FAFC' }}>
                Cached Stream Records ({streams.length})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Pre-indexed file hashes and direct access channels
              </Typography>
            </Box>
            <Box
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: '8px',
                bgcolor: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Total Storage:
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, color: '#38BDF8' }}>
                {totalSize}
              </Typography>
            </Box>
          </Box>

          {loading ? (
            <LinearProgress sx={{ my: 3, borderRadius: 1 }} />
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: '#090D16', borderColor: 'rgba(148, 163, 184, 0.12)', borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Media Title</TableCell>
                    <TableCell>Quality & Size</TableCell>
                    <TableCell>Query Key</TableCell>
                    <TableCell>Resolver / Bot</TableCell>
                    <TableCell>DC</TableCell>
                    <TableCell align="right">Actions</TableCell>
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
                    streams.map((item, idx) => {
                      const badge = getQualityBadge(item.quality || item.qualityTier);
                      return (
                        <TableRow key={item.docId || idx} hover sx={{ '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.04) !important' } }}>
                          <TableCell sx={{ maxWidth: 320 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#F8FAFC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title || item.filename}>
                              🎬 {item.title || item.filename || 'Untitled Stream'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"JetBrains Mono", monospace' }}>
                              Doc ID: {item.docId || '--'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip
                                size="small"
                                label={(item.quality || item.qualityTier || '720p').toUpperCase()}
                                sx={{
                                  fontWeight: 800,
                                  fontSize: '0.72rem',
                                  bgcolor: badge.bg,
                                  color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                }}
                              />
                              <Typography variant="caption" sx={{ fontFamily: '"JetBrains Mono", monospace', color: '#38BDF8', fontWeight: 600 }}>
                                {item.sizeFormatted || item.size || '--'}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem', color: '#94A3B8' }}>
                            {item.queryKey || '--'}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              {item.resolver && (
                                <Chip
                                  size="small"
                                  label={item.resolver.toUpperCase()}
                                  sx={{
                                    fontSize: '0.7rem',
                                    height: 20,
                                    bgcolor: 'rgba(129, 140, 248, 0.1)',
                                    color: '#818CF8',
                                    border: '1px solid rgba(129, 140, 248, 0.25)',
                                    fontWeight: 700,
                                  }}
                                />
                              )}
                              {item.bot && (
                                <Chip
                                  size="small"
                                  label={`@${item.bot.replace(/^@/, '')}`}
                                  sx={{
                                    fontSize: '0.7rem',
                                    height: 20,
                                    bgcolor: 'rgba(148, 163, 184, 0.08)',
                                    color: '#94A3B8',
                                    border: '1px solid rgba(148, 163, 184, 0.15)',
                                  }}
                                />
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem', color: '#94A3B8' }}>
                            DC {item.dcId || 4}
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title="Copy Document ID">
                                <IconButton
                                  size="small"
                                  onClick={() => handleCopyDocId(item.docId)}
                                  sx={{ color: '#94A3B8', '&:hover': { color: '#38BDF8', bgcolor: 'rgba(56, 189, 248, 0.1)' } }}
                                >
                                  <ContentCopyIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Evict from cache">
                                <IconButton
                                  size="small"
                                  onClick={() => setSelectedItem(item)}
                                  sx={{ color: '#F43F5E', '&:hover': { bgcolor: 'rgba(244, 63, 94, 0.1)' } }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })
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
          <DialogContentText sx={{ color: 'text.secondary' }}>
            Are you sure you want to evict <strong>{selectedItem?.title || selectedItem?.filename || selectedItem?.queryKey}</strong> from the persistent cache database?
          </DialogContentText>
          {actionLoading && <LinearProgress sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSelectedItem(null)} disabled={actionLoading} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button onClick={handleEvict} color="error" variant="contained" disabled={actionLoading}>
            Evict Record
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear All Dialog */}
      <Dialog open={clearAllOpen} onClose={() => !actionLoading && setClearAllOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700, color: '#F43F5E' }}>
          DANGER: Clear All Cache
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            This action will physically purge and clear ALL cached stream records from the database. Any cached video references will need to be re-queried via Telegram bots.
          </DialogContentText>
          {actionLoading && <LinearProgress sx={{ mt: 2 }} />}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setClearAllOpen(false)} disabled={actionLoading} sx={{ color: 'text.secondary' }}>Cancel</Button>
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
