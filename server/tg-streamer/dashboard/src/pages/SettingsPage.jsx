import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Tabs,
  Tab,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Switch,
  FormControlLabel,
  Stack,
  Alert,
  Snackbar,
  LinearProgress,
  Chip,
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BoltIcon from '@mui/icons-material/Bolt';
import MemoryIcon from '@mui/icons-material/Memory';
import SpeedIcon from '@mui/icons-material/Speed';
import SecurityIcon from '@mui/icons-material/Security';
import BuildIcon from '@mui/icons-material/Build';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StorageIcon from '@mui/icons-material/Storage';
import { api, getBasePath } from '../api/client';

export default function SettingsPage() {
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  // Dialog States
  const [restartDialogOpen, setRestartDialogOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartStatusText, setRestartStatusText] = useState('');
  const [clearCacheConfirmOpen, setClearCacheConfirmOpen] = useState(false);
  const [clearLogConfirmOpen, setClearLogConfirmOpen] = useState(false);

  // Settings State
  const [settings, setSettings] = useState({
    activeResolver: 'msm',
    targetBotUsernames: { msm: 'msm34bot', pencuri: 'Pencuri_Movie_Bot' },
    targetBotUsername: 'msm34bot',
    pipelineBuffers: { sd: 2, '720p': 4, '1080p': 6, '4k': 8 },
    overlapPrefetch: true,
    routerRamCacheMb: 16,
    nodeRamCapMb: 1024,
    nodeRamCapOptions: [256, 512, 1024, 2048],
    maxNodeRamCapMb: 2048,
    idlePurgeThresholdMb: 410,
    videoTranscodeMode: 'disabled',
    minTvSizeMb: 80,
    minMovieSizeMb: 180,
    resolverMaxPages: 3,
    speedTestMb: 16,
    speedTestBudgetMbPerMin: 150,
    geoBlockEnabled: true,
    geoBlockAllowedCountries: ['MY'],
    geoBlockWhitelistedIps: '',
    cachedStreams: 0,
    blockCacheEntries: 0,
    blockCacheMaxEntries: 32,
  });

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.ok && res.data) {
        const d = res.data;
        setSettings({
          activeResolver: d.activeResolver || 'msm',
          targetBotUsernames: d.targetBotUsernames || {
            msm: d.targetBotUsername || 'msm34bot',
            pencuri: 'Pencuri_Movie_Bot',
          },
          targetBotUsername: d.targetBotUsername || 'msm34bot',
          pipelineBuffers: d.pipelineBuffers || { sd: 2, '720p': 4, '1080p': 6, '4k': 8 },
          overlapPrefetch: d.overlapPrefetch !== false,
          routerRamCacheMb: d.routerRamCacheMb || 16,
          nodeRamCapMb: d.nodeRamCapMb || 1024,
          nodeRamCapOptions: d.nodeRamCapOptions || [256, 512, 1024, 2048],
          maxNodeRamCapMb: d.maxNodeRamCapMb || 2048,
          idlePurgeThresholdMb: d.idlePurgeThresholdMb || Math.round((d.nodeRamCapMb || 1024) * 0.4),
          videoTranscodeMode: d.videoTranscodeMode || 'disabled',
          minTvSizeMb: d.minTvSizeMb ?? 80,
          minMovieSizeMb: d.minMovieSizeMb ?? 180,
          resolverMaxPages: d.resolverMaxPages ?? 3,
          speedTestMb: d.speedTestMb ?? 16,
          speedTestBudgetMbPerMin: d.speedTestBudgetMbPerMin ?? 150,
          geoBlockEnabled: d.geoBlockEnabled !== false,
          geoBlockAllowedCountries: d.geoBlockAllowedCountries || ['MY'],
          geoBlockWhitelistedIps: Array.isArray(d.geoBlockWhitelistedIps)
            ? d.geoBlockWhitelistedIps.join(', ')
            : (d.geoBlockWhitelistedIps || ''),
          cachedStreams: d.cachedStreams ?? 0,
          blockCacheEntries: d.blockCacheEntries ?? 0,
          blockCacheMaxEntries: d.blockCacheMaxEntries ?? 32,
        });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (overrideData = {}) => {
    setSaving(true);
    try {
      const merged = {
        ...settings,
        ...overrideData,
      };

      const payload = {
        activeResolver: merged.activeResolver,
        targetBotUsername: merged.targetBotUsername,
        targetBotUsernames: merged.targetBotUsernames,
        pipelineBuffers: merged.pipelineBuffers,
        overlapPrefetch: merged.overlapPrefetch,
        routerRamCacheMb: merged.routerRamCacheMb,
        nodeRamCapMb: merged.nodeRamCapMb,
        videoTranscodeMode: merged.videoTranscodeMode,
        minTvSizeMb: merged.minTvSizeMb,
        minMovieSizeMb: merged.minMovieSizeMb,
        resolverMaxPages: merged.resolverMaxPages,
        speedTestMb: merged.speedTestMb,
        speedTestBudgetMbPerMin: merged.speedTestBudgetMbPerMin,
        geoBlockEnabled: merged.geoBlockEnabled,
        geoBlockWhitelistedIps: typeof merged.geoBlockWhitelistedIps === 'string'
          ? merged.geoBlockWhitelistedIps.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
          : merged.geoBlockWhitelistedIps,
      };

      const res = await api.post('/settings', payload);
      if (res.ok && res.data?.success) {
        setToast({ open: true, message: 'Settings saved and applied live!', severity: 'success' });
        await fetchSettings();
      } else {
        setToast({ open: true, message: res.data?.error || 'Save failed', severity: 'error' });
      }
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handlePresetBot = (bot) => {
    const updatedUsernames = {
      ...settings.targetBotUsernames,
      [settings.activeResolver]: bot,
    };
    setSettings((prev) => ({
      ...prev,
      targetBotUsername: bot,
      targetBotUsernames: updatedUsernames,
    }));
  };

  const handleResolverChange = (newResolver) => {
    const defaultBot =
      settings.targetBotUsernames[newResolver] ||
      (newResolver === 'pencuri' ? 'Pencuri_Movie_Bot' : 'msm34bot');
    setSettings((prev) => ({
      ...prev,
      activeResolver: newResolver,
      targetBotUsername: defaultBot,
      targetBotUsernames: {
        ...prev.targetBotUsernames,
        [newResolver]: defaultBot,
      },
    }));
  };

  const adjustPipelineBuf = (tier, delta) => {
    const current = Number(settings.pipelineBuffers[tier] || 2);
    const updated = Math.max(1, Math.min(16, current + delta));
    setSettings((prev) => ({
      ...prev,
      pipelineBuffers: {
        ...prev.pipelineBuffers,
        [tier]: updated,
      },
    }));
  };

  const handleExecuteRestart = async () => {
    setRestarting(true);
    setRestartStatusText('Initiating service reboot...');
    try {
      await api.post('/system/restart');
    } catch (e) {
      // Ignored: server may terminate connection immediately on restart
    }

    let remaining = 4;
    const interval = setInterval(async () => {
      remaining -= 1;
      if (remaining > 0) {
        setRestartStatusText(`Restarting microservice in ${remaining}s...`);
      } else {
        setRestartStatusText('Checking server connection...');
        try {
          const res = await api.get('/settings');
          if (res.ok) {
            clearInterval(interval);
            setRestartStatusText('✓ Service back online! Reloading...');
            setTimeout(() => {
              setRestartDialogOpen(false);
              setRestarting(false);
              window.location.reload();
            }, 1000);
          }
        } catch (pingErr) {
          // Keep waiting for respawn
        }
      }
    }, 1000);
  };

  const handleClearCache = async () => {
    setClearCacheConfirmOpen(false);
    try {
      const res = await api.post('/cache/clear');
      if (res.ok) {
        setToast({ open: true, message: res.data?.message || 'Cache cleared successfully', severity: 'success' });
        await fetchSettings();
      } else {
        setToast({ open: true, message: res.data?.error || 'Failed to clear cache', severity: 'error' });
      }
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleClearLogs = async () => {
    setClearLogConfirmOpen(false);
    try {
      const res = await api.post('/logs/clear');
      if (res.ok) {
        setToast({ open: true, message: res.data?.message || 'Log file truncated successfully', severity: 'success' });
      } else {
        setToast({ open: true, message: res.data?.error || 'Failed to clear logs', severity: 'error' });
      }
    } catch (e) {
      setToast({ open: true, message: e.message, severity: 'error' });
    }
  };

  const currentBotHandle =
    settings.targetBotUsernames[settings.activeResolver] || settings.targetBotUsername || '';

  const resolverPresets =
    settings.activeResolver === 'pencuri'
      ? ['Pencuri_Movie_Bot', 'UnOfficialsBot']
      : ['msm34bot', 'msm32bot'];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Page Title & Status Pill */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            TGStrm Configuration
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Configure bot handles, stream buffer pipelines, engine cache, analytics, and system maintenance
          </Typography>
        </Box>
        <Chip
          label={`${settings.activeResolver === 'pencuri' ? 'Pencuri' : 'MSM'}: @${currentBotHandle}`}
          color="primary"
          variant="outlined"
          sx={{
            fontFamily: 'monospace',
            fontWeight: 700,
            bgcolor: 'primary.soft',
            borderColor: 'primary.main',
          }}
        />
      </Box>

      {loading ? (
        <LinearProgress sx={{ my: 3, borderRadius: 1 }} />
      ) : (
        <Card>
          {/* Sneat Pill Tabs */}
          <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 2.5, py: 1.5, bgcolor: 'background.default' }}>
            <Tabs
              value={tabIndex}
              onChange={(e, val) => setTabIndex(val)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: 40,
                '& .MuiTabs-indicator': { display: 'none' },
                '& .MuiTab-root': {
                  minHeight: 38,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  borderRadius: '8px',
                  mr: 1,
                  px: 2,
                  color: 'text.secondary',
                  transition: 'all 0.18s ease-in-out',
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: '#FFFFFF !important',
                    boxShadow: '0 2px 6px 0 rgba(105, 108, 255, 0.4)',
                  },
                },
              }}
            >
              <Tab icon={<SmartToyIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Resolver & Bot" />
              <Tab icon={<BoltIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Buffer Pipelines" />
              <Tab icon={<MemoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Engine & RAM" />
              <Tab icon={<SpeedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Speed Test" />
              <Tab icon={<SecurityIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="GeoBlock" />
              <Tab icon={<BuildIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Maintenance & System" />
            </Tabs>
          </Box>

          <CardContent sx={{ p: 3.5 }}>
            {/* Tab 0: Resolver & Bot */}
            {tabIndex === 0 && (
              <Stack spacing={3.5} sx={{ maxWidth: 680 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Active Resolver Engine
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Choose the primary Telegram MTProto search and playback resolver engine.
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={settings.activeResolver}
                    onChange={(e) => handleResolverChange(e.target.value)}
                  >
                    <MenuItem value="msm">MSM Bot (Inline Callbacks & Ad-Gate)</MenuItem>
                    <MenuItem value="pencuri">Pencuri Movie Bot (Search API & Mini App)</MenuItem>
                  </TextField>
                </Box>

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Target Bot Username Handle
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Telegram bot username without the leading @ symbol.
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="bot_username"
                    value={currentBotHandle}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/^@/, '');
                      setSettings({
                        ...settings,
                        targetBotUsername: clean,
                        targetBotUsernames: {
                          ...settings.targetBotUsernames,
                          [settings.activeResolver]: clean,
                        },
                      });
                    }}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <Typography variant="body2" sx={{ color: 'text.secondary', mr: 0.5, fontWeight: 700 }}>
                            @
                          </Typography>
                        ),
                      },
                    }}
                  />
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
                    Quick Presets:
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {resolverPresets.map((bot) => (
                      <Chip
                        key={bot}
                        label={`@${bot}`}
                        size="small"
                        clickable
                        onClick={() => handlePresetBot(bot)}
                        sx={{
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          bgcolor: currentBotHandle === bot ? 'primary.soft' : 'background.default',
                          borderColor: currentBotHandle === bot ? 'primary.main' : 'divider',
                          border: '1px solid',
                        }}
                      />
                    ))}
                  </Stack>
                </Box>

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave()}
                    disabled={saving}
                    sx={{ px: 3, py: 1, borderRadius: '8px' }}
                  >
                    {saving ? 'Saving...' : 'Save Resolver & Bot'}
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Tab 1: Buffer Pipelines */}
            {tabIndex === 1 && (
              <Stack spacing={3.5} sx={{ maxWidth: 680 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Stream Buffer Pipelines (Per-Quality Concurrency)
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Parallel MTProto download pipelines (× 512 KB per chunk). Applied dynamically across all player streams.
                  </Typography>
                </Box>

                {[
                  { key: 'sd', label: 'SD (≤ 480p / 360p)', desc: 'Mobile and low-bandwidth streams' },
                  { key: '720p', label: 'HD 720p', desc: 'Standard high-definition video playback' },
                  { key: '1080p', label: 'Full HD 1080p', desc: 'High-definition video with optimal seek buffer' },
                  { key: '4k', label: '4K UHD (2160p)', desc: 'Ultra-high bitrate 4K video playback' },
                ].map(({ key, label, desc }) => {
                  const val = settings.pipelineBuffers[key] || 2;
                  const inFlightMb = (val * 0.5).toFixed(1);
                  return (
                    <Paper
                      key={key}
                      elevation={0}
                      sx={{
                        p: 2,
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.default',
                      }}
                    >
                      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                            {label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {desc}
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main', display: 'block', mt: 0.5 }}>
                            {val} × 512 KB = {inFlightMb} MB in-flight buffer
                          </Typography>
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <IconButton
                            size="small"
                            onClick={() => adjustPipelineBuf(key, -1)}
                            disabled={val <= 1}
                            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                          >
                            <RemoveIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                          <TextField
                            size="small"
                            type="number"
                            value={val}
                            onChange={(e) => {
                              const num = Math.max(1, Math.min(16, Number(e.target.value) || 1));
                              setSettings({
                                ...settings,
                                pipelineBuffers: { ...settings.pipelineBuffers, [key]: num },
                              });
                            }}
                            sx={{ width: 68 }}
                            slotProps={{
                              input: {
                                inputProps: { min: 1, max: 16, style: { textAlign: 'center', fontWeight: 700 } },
                              },
                            }}
                          />
                          <IconButton
                            size="small"
                            onClick={() => adjustPipelineBuf(key, 1)}
                            disabled={val >= 16}
                            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                          >
                            <AddIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave()}
                    disabled={saving}
                    sx={{ px: 3, py: 1, borderRadius: '8px' }}
                  >
                    {saving ? 'Saving...' : 'Save Pipeline Buffers'}
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Tab 2: Engine & RAM */}
            {tabIndex === 2 && (
              <Stack spacing={3.5} sx={{ maxWidth: 680 }}>
                {/* Overlap Prefetch */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Overlap Prefetch
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Starts the read-ahead window as soon as the first chunk arrives (before it is sent to the player).
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.overlapPrefetch}
                        onChange={(e) => setSettings({ ...settings, overlapPrefetch: e.target.checked })}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontWeight: 600, color: settings.overlapPrefetch ? '#71DD37' : 'text.secondary' }}>
                        {settings.overlapPrefetch ? 'Enabled (Fast Playback & Low Jitter)' : 'Disabled (After First Chunk Is Sent)'}
                      </Typography>
                    }
                  />
                </Box>

                <Divider />

                {/* Node Process RAM Cap */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Node Process RAM Cap & GC Purge Threshold
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Max memory ceiling for Node process before aggressive garbage collection kicks in (Purge threshold: ~{Math.round(settings.nodeRamCapMb * 0.4)} MB).
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={settings.nodeRamCapMb}
                    onChange={(e) => setSettings({ ...settings, nodeRamCapMb: Number(e.target.value) })}
                  >
                    {(settings.nodeRamCapOptions || [256, 512, 1024, 2048]).map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt >= 1024 ? `${opt / 1024} GB (${opt} MB)` : `${opt} MB`}
                        {opt === 256 ? ' — Default' : ''}
                        {opt === 1024 ? ' — Recommended' : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <Divider />

                {/* Router RAM Block Cache */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Router RAM Block Cache
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    In-memory LRU block caching ({settings.routerRamCacheMb * 2} blocks of 512 KB).
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={settings.routerRamCacheMb}
                    onChange={(e) => setSettings({ ...settings, routerRamCacheMb: Number(e.target.value) })}
                  >
                    <MenuItem value={8}>8 MB (16 blocks)</MenuItem>
                    <MenuItem value={16}>16 MB (32 blocks — Recommended)</MenuItem>
                    <MenuItem value={32}>32 MB (64 blocks)</MenuItem>
                    <MenuItem value={64}>64 MB (128 blocks — High RAM)</MenuItem>
                  </TextField>
                </Box>

                <Divider />

                {/* Video Transcoding Mode */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Video Transcoding Mode
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Controls whether FFmpeg transcode is invoked for HEVC/H.265 files.
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={settings.videoTranscodeMode}
                    onChange={(e) => setSettings({ ...settings, videoTranscodeMode: e.target.value })}
                  >
                    <MenuItem value="disabled">Disabled (100% Direct Copy — 0% CPU Load) [Recommended]</MenuItem>
                    <MenuItem value="desktop_hevc">Desktop PC Chrome Only (HEVC/AVI to H.264)</MenuItem>
                    <MenuItem value="always">Enabled for All Devices</MenuItem>
                  </TextField>
                </Box>

                <Divider />

                {/* TV Series Minimum File Size */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    TV Series Minimum Size
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Files &lt; {settings.minTvSizeMb} MB are treated as clips/trailers and skipped during series playback resolution.
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <IconButton
                      size="small"
                      onClick={() => setSettings({ ...settings, minTvSizeMb: Math.max(10, settings.minTvSizeMb - 5) })}
                      disabled={settings.minTvSizeMb <= 10}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                    >
                      <RemoveIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <TextField
                      size="small"
                      type="number"
                      value={settings.minTvSizeMb}
                      onChange={(e) => setSettings({ ...settings, minTvSizeMb: Math.max(10, Math.min(500, Number(e.target.value) || 10)) })}
                      sx={{ width: 100 }}
                      slotProps={{
                        input: {
                          endAdornment: <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>MB</Typography>,
                          inputProps: { min: 10, max: 500, step: 5, style: { textAlign: 'center', fontWeight: 700 } },
                        },
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setSettings({ ...settings, minTvSizeMb: Math.min(500, settings.minTvSizeMb + 5) })}
                      disabled={settings.minTvSizeMb >= 500}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                    >
                      <AddIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                </Box>

                <Divider />

                {/* Movie Minimum File Size */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Movie Minimum Size
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Files &lt; {settings.minMovieSizeMb} MB are treated as clips/trailers and skipped during movie playback resolution.
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <IconButton
                      size="small"
                      onClick={() => setSettings({ ...settings, minMovieSizeMb: Math.max(20, settings.minMovieSizeMb - 5) })}
                      disabled={settings.minMovieSizeMb <= 20}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                    >
                      <RemoveIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <TextField
                      size="small"
                      type="number"
                      value={settings.minMovieSizeMb}
                      onChange={(e) => setSettings({ ...settings, minMovieSizeMb: Math.max(20, Math.min(2000, Number(e.target.value) || 20)) })}
                      sx={{ width: 100 }}
                      slotProps={{
                        input: {
                          endAdornment: <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>MB</Typography>,
                          inputProps: { min: 20, max: 2000, step: 5, style: { textAlign: 'center', fontWeight: 700 } },
                        },
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setSettings({ ...settings, minMovieSizeMb: Math.min(2000, settings.minMovieSizeMb + 5) })}
                      disabled={settings.minMovieSizeMb >= 2000}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                    >
                      <AddIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                </Box>

                <Divider />

                {/* Resolver Max Paging */}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Resolver Max Paging
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Traverse up to {settings.resolverMaxPages} pages per search query during media resolution.
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <IconButton
                      size="small"
                      onClick={() => setSettings({ ...settings, resolverMaxPages: Math.max(1, settings.resolverMaxPages - 1) })}
                      disabled={settings.resolverMaxPages <= 1}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                    >
                      <RemoveIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <TextField
                      size="small"
                      type="number"
                      value={settings.resolverMaxPages}
                      onChange={(e) => setSettings({ ...settings, resolverMaxPages: Math.max(1, Math.min(15, Number(e.target.value) || 1)) })}
                      sx={{ width: 100 }}
                      slotProps={{
                        input: {
                          endAdornment: <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>pages</Typography>,
                          inputProps: { min: 1, max: 15, step: 1, style: { textAlign: 'center', fontWeight: 700 } },
                        },
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setSettings({ ...settings, resolverMaxPages: Math.min(15, settings.resolverMaxPages + 1) })}
                      disabled={settings.resolverMaxPages >= 15}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                    >
                      <AddIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                </Box>

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave()}
                    disabled={saving}
                    sx={{ px: 3, py: 1, borderRadius: '8px' }}
                  >
                    {saving ? 'Saving...' : 'Save Engine Settings'}
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Tab 3: Speed Test */}
            {tabIndex === 3 && (
              <Stack spacing={3.5} sx={{ maxWidth: 680 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Network Speed Test Analytics Limits
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Limits for the app's Network Speed Analytics (Settings &gt; Telegram Provider &gt; TGStrm).
                  </Typography>
                </Box>

                {/* Speed Test Size */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        Speed Test Size
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                        Data read per quality in the app's Network Speed Analytics (12–64 MB; smaller never fills the read-ahead window).
                      </Typography>
                    </Box>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={() => setSettings({ ...settings, speedTestMb: Math.max(12, settings.speedTestMb - 4) })}
                        disabled={settings.speedTestMb <= 12}
                        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                      >
                        <RemoveIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <TextField
                        size="small"
                        type="number"
                        value={settings.speedTestMb}
                        onChange={(e) => setSettings({ ...settings, speedTestMb: Math.max(12, Math.min(64, Number(e.target.value) || 12)) })}
                        sx={{ width: 90 }}
                        slotProps={{
                          input: {
                            endAdornment: <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>MB</Typography>,
                            inputProps: { min: 12, max: 64, step: 4, style: { textAlign: 'center', fontWeight: 700 } },
                          },
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => setSettings({ ...settings, speedTestMb: Math.min(64, settings.speedTestMb + 4) })}
                        disabled={settings.speedTestMb >= 64}
                        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                      >
                        <AddIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Paper>

                {/* Speed Test Rate Limit Budget */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        Speed Test Budget
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                        Speed test rate limit per client IP address (10–2000 MB/min).
                      </Typography>
                    </Box>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={() => setSettings({ ...settings, speedTestBudgetMbPerMin: Math.max(10, settings.speedTestBudgetMbPerMin - 10) })}
                        disabled={settings.speedTestBudgetMbPerMin <= 10}
                        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                      >
                        <RemoveIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <TextField
                        size="small"
                        type="number"
                        value={settings.speedTestBudgetMbPerMin}
                        onChange={(e) => setSettings({ ...settings, speedTestBudgetMbPerMin: Math.max(10, Math.min(2000, Number(e.target.value) || 10)) })}
                        sx={{ width: 120 }}
                        slotProps={{
                          input: {
                            endAdornment: <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>MB/min</Typography>,
                            inputProps: { min: 10, max: 2000, step: 10, style: { textAlign: 'center', fontWeight: 700 } },
                          },
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => setSettings({ ...settings, speedTestBudgetMbPerMin: Math.min(2000, settings.speedTestBudgetMbPerMin + 10) })}
                        disabled={settings.speedTestBudgetMbPerMin >= 2000}
                        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}
                      >
                        <AddIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Paper>

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave()}
                    disabled={saving}
                    sx={{ px: 3, py: 1, borderRadius: '8px' }}
                  >
                    {saving ? 'Saving...' : 'Save Speed Test Settings'}
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Tab 4: GeoBlock */}
            {tabIndex === 4 && (
              <Stack spacing={3.5} sx={{ maxWidth: 680 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Geographic Access Filtering
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Restrict public stream playback access by client IP country origin (Default: Malaysia / MY).
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.geoBlockEnabled}
                        onChange={(e) => setSettings({ ...settings, geoBlockEnabled: e.target.checked })}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontWeight: 600, color: settings.geoBlockEnabled ? '#71DD37' : 'text.secondary' }}>
                        {settings.geoBlockEnabled ? 'GeoBlock Protection Enabled' : 'GeoBlock Disabled (All IPs Allowed)'}
                      </Typography>
                    }
                  />
                </Box>

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Allowed Countries
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Streams are exclusively permitted to viewers originating from these verified ISO country codes:
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {(settings.geoBlockAllowedCountries || ['MY']).map((country) => (
                      <Chip
                        key={country}
                        label={`${country} (Malaysia)`}
                        color="success"
                        variant="outlined"
                        sx={{ fontWeight: 700, bgcolor: 'success.soft', borderColor: 'success.main' }}
                      />
                    ))}
                  </Stack>
                </Box>

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
                    Whitelisted IP Addresses
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Comma-separated list of IP addresses or subnets that bypass GeoBlock verification.
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    size="small"
                    placeholder="192.168.0.1, 10.0.0.0/24..."
                    value={settings.geoBlockWhitelistedIps}
                    onChange={(e) => setSettings({ ...settings, geoBlockWhitelistedIps: e.target.value })}
                  />
                </Box>

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave()}
                    disabled={saving}
                    sx={{ px: 3, py: 1, borderRadius: '8px' }}
                  >
                    {saving ? 'Saving...' : 'Save GeoBlock Settings'}
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Tab 5: Maintenance & System */}
            {tabIndex === 5 && (
              <Stack spacing={4} sx={{ maxWidth: 720 }}>
                {/* Stream Cache Storage */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                    <StorageIcon sx={{ color: 'primary.main', fontSize: 22 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      Stream Cache Storage
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                    Central database mapping cached video stream documents in <code style={{ color: '#8587FF' }}>streams.json</code>.
                  </Typography>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2.5 }}>
                    <Button
                      variant="outlined"
                      component="a"
                      href={`${getBasePath()}/streams`}
                      sx={{ flex: 1, borderRadius: '8px', fontWeight: 600 }}
                    >
                      Browse Cached Videos
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteSweepIcon />}
                      onClick={() => setClearCacheConfirmOpen(true)}
                      sx={{ borderRadius: '8px', fontWeight: 600 }}
                    >
                      Clear All Cache
                    </Button>
                  </Stack>

                  <Divider sx={{ my: 1.5 }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      Total stored items:
                    </Typography>
                    <Chip
                      label={`${settings.cachedStreams} videos`}
                      size="small"
                      color="primary"
                      variant="filled"
                      sx={{ fontWeight: 700 }}
                    />
                  </Stack>
                </Paper>

                {/* Maintenance & Telegram Auth */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.default',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                    <BuildIcon sx={{ color: 'primary.main', fontSize: 22 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      Maintenance & Telegram Auth
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                    Manage server stdout/stderr diagnostic log files or update your active Telegram phone session.
                  </Typography>

                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <Button
                        variant="outlined"
                        component="a"
                        href={api.getDownloadUrl('/logs/download')}
                        target="_blank"
                        startIcon={<DownloadIcon />}
                        sx={{ flex: 1, borderRadius: '8px', fontWeight: 600 }}
                      >
                        Download Log File
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteSweepIcon />}
                        onClick={() => setClearLogConfirmOpen(true)}
                        sx={{ borderRadius: '8px', fontWeight: 600 }}
                      >
                        Clear Log
                      </Button>
                    </Stack>

                    <Button
                      variant="contained"
                      color="warning"
                      component="a"
                      href={`${getBasePath()}/auth`}
                      endIcon={<OpenInNewIcon />}
                      sx={{
                        width: '100%',
                        borderRadius: '8px',
                        fontWeight: 600,
                        bgcolor: 'warning.main',
                        color: '#000000',
                        '&:hover': { bgcolor: 'warning.light' },
                      }}
                    >
                      Open Telegram Phone Auth Portal →
                    </Button>
                  </Stack>
                </Paper>

                {/* Service Management */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: 'warning.main',
                    bgcolor: 'warning.soft',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                    <RestartAltIcon sx={{ color: 'warning.main', fontSize: 24 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      Service Management
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Reboot the TGStrm microservice. The router supervisor loop will automatically respawn the process with clean memory in ~3 seconds.
                  </Typography>

                  <Alert severity="warning" sx={{ mb: 2.5, borderRadius: '8px', bgcolor: 'background.paper' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      ⚠️ Note on Active Streams
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Rebooting will briefly interrupt in-flight downloads. Active video players will automatically retry and reconnect.
                    </Typography>
                  </Alert>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      color="warning"
                      startIcon={<RestartAltIcon />}
                      onClick={() => setRestartDialogOpen(true)}
                      sx={{
                        borderRadius: '8px',
                        fontWeight: 700,
                        bgcolor: 'warning.main',
                        color: '#000000',
                        '&:hover': { bgcolor: 'warning.light' },
                      }}
                    >
                      Restart TGStrm Service
                    </Button>
                  </Box>
                </Paper>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {/* Restart TGStrm Confirmation Dialog */}
      <Dialog
        open={restartDialogOpen}
        onClose={() => !restarting && setRestartDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Restart TGStrm Service</DialogTitle>
        <DialogContent>
          {restarting ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress color="warning" size={36} sx={{ mb: 2 }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {restartStatusText}
              </Typography>
            </Box>
          ) : (
            <DialogContentText variant="body2" sx={{ color: 'text.secondary' }}>
              Are you sure you want to reboot the TGStrm server process? The router supervisor loop will respawn the service automatically within ~3 seconds.
            </DialogContentText>
          )}
        </DialogContent>
        {!restarting && (
          <DialogActions sx={{ p: 2.5, pt: 0 }}>
            <Button onClick={() => setRestartDialogOpen(false)} sx={{ color: 'text.secondary' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="warning"
              onClick={handleExecuteRestart}
              sx={{ fontWeight: 700, color: '#000000' }}
            >
              Yes, Restart Now
            </Button>
          </DialogActions>
        )}
      </Dialog>

      {/* Clear Cache Confirmation Dialog */}
      <Dialog
        open={clearCacheConfirmOpen}
        onClose={() => setClearCacheConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Clear Stream Cache?</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2" sx={{ color: 'text.secondary' }}>
            Are you sure you want to clear the entire stream cache? All cached video links and metadata will be removed.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0 }}>
          <Button onClick={() => setClearCacheConfirmOpen(false)} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleClearCache}>
            Clear All Cache
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Log Confirmation Dialog */}
      <Dialog
        open={clearLogConfirmOpen}
        onClose={() => setClearLogConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Clear Diagnostic Logs?</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2" sx={{ color: 'text.secondary' }}>
            Are you sure you want to truncate the log file? All previous stdout/stderr diagnostics will be cleared.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0 }}>
          <Button onClick={() => setClearLogConfirmOpen(false)} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleClearLogs}>
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
