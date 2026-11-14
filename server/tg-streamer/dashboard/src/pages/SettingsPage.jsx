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
  Switch,
  FormControlLabel,
  Stack,
  Alert,
  Snackbar,
  LinearProgress,
  Chip,
  Paper,
  Divider,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BoltIcon from '@mui/icons-material/Bolt';
import MemoryIcon from '@mui/icons-material/Memory';
import SecurityIcon from '@mui/icons-material/Security';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import { api } from '../api/client';

export default function SettingsPage() {
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

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
    videoTranscodeMode: 'disabled',
    geoBlockEnabled: true,
    geoBlockWhitelistedIps: '',
  });

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.ok && res.data) {
        const d = res.data;
        setSettings({
          activeResolver: d.activeResolver || 'msm',
          targetBotUsernames: d.targetBotUsernames || { msm: d.targetBotUsername || 'msm34bot', pencuri: 'Pencuri_Movie_Bot' },
          targetBotUsername: d.targetBotUsername || 'msm34bot',
          pipelineBuffers: d.pipelineBuffers || { sd: 2, '720p': 4, '1080p': 6, '4k': 8 },
          overlapPrefetch: d.overlapPrefetch !== false,
          routerRamCacheMb: d.routerRamCacheMb || 16,
          nodeRamCapMb: d.nodeRamCapMb || 1024,
          nodeRamCapOptions: d.nodeRamCapOptions || [256, 512, 1024, 2048],
          videoTranscodeMode: d.videoTranscodeMode || 'disabled',
          geoBlockEnabled: d.geoBlockEnabled !== false,
          geoBlockWhitelistedIps: Array.isArray(d.geoBlockWhitelistedIps) ? d.geoBlockWhitelistedIps.join(', ') : (d.geoBlockWhitelistedIps || ''),
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

  const handleSave = async (overrideData) => {
    setSaving(true);
    try {
      const payload = {
        ...settings,
        ...overrideData,
      };
      if (typeof payload.geoBlockWhitelistedIps === 'string') {
        payload.geoBlockWhitelistedIps = payload.geoBlockWhitelistedIps
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const res = await api.post('/settings', payload);
      if (res.ok && res.data?.success) {
        setToast({ open: true, message: 'Settings saved and applied live!', severity: 'success' });
        fetchSettings();
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
    setSettings((prev) => ({
      ...prev,
      targetBotUsernames: {
        ...prev.targetBotUsernames,
        [prev.activeResolver]: bot,
      },
    }));
  };

  const currentBotHandle = settings.targetBotUsernames[settings.activeResolver] || '';

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#090D16',
      borderRadius: 2,
      '& fieldset': { borderColor: 'rgba(148, 163, 184, 0.2)' },
      '&:hover fieldset': { borderColor: 'rgba(56, 189, 248, 0.4)' },
      '&.Mui-focused fieldset': { borderColor: '#38BDF8' },
    },
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
          TGStrm Configuration
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Configure bot handles, stream buffer pipelines, memory limits, and access rules
        </Typography>
      </Box>

      {loading ? (
        <LinearProgress sx={{ my: 3, borderRadius: 1 }} />
      ) : (
        <Card>
          <Box sx={{ borderBottom: '1px solid rgba(148, 163, 184, 0.12)', bgcolor: '#090D16', px: 2 }}>
            <Tabs
              value={tabIndex}
              onChange={(e, val) => setTabIndex(val)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  minHeight: 48,
                  color: '#94A3B8',
                  '&.Mui-selected': {
                    color: '#38BDF8',
                    fontWeight: 700,
                  },
                },
                '& .MuiTabs-indicator': {
                  bgcolor: '#38BDF8',
                  height: 3,
                  borderRadius: '3px 3px 0 0',
                },
              }}
            >
              <Tab icon={<SmartToyIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Resolver & Bot" />
              <Tab icon={<BoltIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Buffer Pipelines" />
              <Tab icon={<MemoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Engine & RAM" />
              <Tab icon={<SecurityIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="GeoBlock" />
            </Tabs>
          </Box>

          <CardContent sx={{ p: 3.5 }}>
            {/* Tab 0: Resolver & Bot */}
            {tabIndex === 0 && (
              <Stack spacing={3.5} sx={{ maxWidth: 680 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
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
                    onChange={(e) => setSettings({ ...settings, activeResolver: e.target.value })}
                    sx={inputSx}
                  >
                    <MenuItem value="msm">MSM Bot (Inline Callbacks & Ad-Gate)</MenuItem>
                    <MenuItem value="pencuri">Pencuri Movie Bot (Search API & Mini App)</MenuItem>
                  </TextField>
                </Box>

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
                    Target Bot Username Handle
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    The target Telegram bot handle utilized by MTProto for querying and resolving streams.
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
                        targetBotUsernames: {
                          ...settings.targetBotUsernames,
                          [settings.activeResolver]: clean,
                        },
                      });
                    }}
                    InputProps={{
                      startAdornment: <Typography sx={{ mr: 0.5, color: '#94A3B8', fontFamily: '"JetBrains Mono", monospace' }}>@</Typography>,
                    }}
                    sx={inputSx}
                  />
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Quick Presets:
                    </Typography>
                    {(settings.activeResolver === 'pencuri' ? ['Pencuri_Movie_Bot', 'UnOfficialsBot'] : ['msm34bot', 'msm32bot']).map((bot) => (
                      <Chip
                        key={bot}
                        size="small"
                        clickable
                        label={`@${bot}`}
                        onClick={() => handlePresetBot(bot)}
                        sx={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: '0.75rem',
                          bgcolor: 'rgba(56, 189, 248, 0.08)',
                          color: '#38BDF8',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          '&:hover': { bgcolor: 'rgba(56, 189, 248, 0.16)' },
                        }}
                      />
                    ))}
                  </Box>
                </Box>

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave()}
                    disabled={saving}
                    sx={{ px: 3, py: 1, borderRadius: 2 }}
                  >
                    {saving ? 'Saving...' : 'Save Resolver Settings'}
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Tab 1: Buffer Pipelines */}
            {tabIndex === 1 && (
              <Stack spacing={3.5} sx={{ maxWidth: 680 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
                    Quality Tier Buffer Pipelines
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Parallel chunk download streams (× 512 KB per connection) allocated dynamically per video playback tier.
                  </Typography>

                  <Stack spacing={2}>
                    {[
                      { key: 'sd', label: 'SD (≤ 480p / 360p)', defaultVal: 2 },
                      { key: '720p', label: 'HD 720p', defaultVal: 4 },
                      { key: '1080p', label: 'Full HD 1080p', defaultVal: 6 },
                      { key: '4k', label: '4K Ultra HD (2160p)', defaultVal: 8 },
                    ].map((tier) => {
                      const val = settings.pipelineBuffers[tier.key] || tier.defaultVal;
                      return (
                        <Paper
                          key={tier.key}
                          variant="outlined"
                          sx={{
                            p: 2,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            bgcolor: '#090D16',
                            borderColor: 'rgba(148, 163, 184, 0.12)',
                            borderRadius: 2,
                          }}
                        >
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#F8FAFC' }}>
                              {tier.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"JetBrains Mono", monospace' }}>
                              {val} × 512 KB = {(val * 0.5).toFixed(1)} MB in-flight buffer
                            </Typography>
                          </Box>
                          <TextField
                            type="number"
                            size="small"
                            inputProps={{ min: 1, max: 16 }}
                            value={val}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (!isNaN(n)) {
                                setSettings({
                                  ...settings,
                                  pipelineBuffers: {
                                    ...settings.pipelineBuffers,
                                    [tier.key]: n,
                                  },
                                });
                              }
                            }}
                            sx={{ width: 90, ...inputSx }}
                          />
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave()}
                    disabled={saving}
                    sx={{ px: 3, py: 1, borderRadius: 2 }}
                  >
                    {saving ? 'Saving...' : 'Save Buffer Pipelines'}
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Tab 2: Engine & RAM */}
            {tabIndex === 2 && (
              <Stack spacing={3.5} sx={{ maxWidth: 680 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
                    Overlap Prefetch
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Preload the next byte range concurrently while delivering current video frames to the player client.
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.overlapPrefetch}
                        onChange={(e) => setSettings({ ...settings, overlapPrefetch: e.target.checked })}
                        color="primary"
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontWeight: 600, color: settings.overlapPrefetch ? '#34D399' : '#94A3B8' }}>
                        {settings.overlapPrefetch ? 'Enabled (Instant seeking & low jitter)' : 'Disabled'}
                      </Typography>
                    }
                  />
                </Box>

                <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.08)' }} />

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
                    Node RAM Cap & GC Purge Threshold
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Max memory ceiling for Node process before aggressive garbage collection kicks in.
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={settings.nodeRamCapMb}
                    onChange={(e) => setSettings({ ...settings, nodeRamCapMb: Number(e.target.value) })}
                    sx={inputSx}
                  >
                    {(settings.nodeRamCapOptions || [256, 512, 1024, 2048]).map((opt) => (
                      <MenuItem key={opt} value={opt}>
                        {opt >= 1024 ? `${opt / 1024} GB (${opt} MB)` : `${opt} MB`}
                        {opt === 1024 ? ' — Recommended' : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.08)' }} />

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
                    Router RAM Block Cache
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Allocated size for LRU memory blocks on router RAM disk for rapid seeking.
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={settings.routerRamCacheMb}
                    onChange={(e) => setSettings({ ...settings, routerRamCacheMb: Number(e.target.value) })}
                    sx={inputSx}
                  >
                    <MenuItem value={8}>8 MB (16 blocks)</MenuItem>
                    <MenuItem value={16}>16 MB (32 blocks — Recommended)</MenuItem>
                    <MenuItem value={32}>32 MB (64 blocks)</MenuItem>
                    <MenuItem value={64}>64 MB (128 blocks — High RAM)</MenuItem>
                  </TextField>
                </Box>

                <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.08)' }} />

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
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
                    sx={inputSx}
                  >
                    <MenuItem value="disabled">Disabled (100% Direct Copy — 0% CPU Load)</MenuItem>
                    <MenuItem value="desktop_hevc">Desktop PC Chrome Only (HEVC to H.264)</MenuItem>
                    <MenuItem value="always">Enabled for All Devices</MenuItem>
                  </TextField>
                </Box>

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave()}
                    disabled={saving}
                    sx={{ px: 3, py: 1, borderRadius: 2 }}
                  >
                    {saving ? 'Saving...' : 'Save Engine Settings'}
                  </Button>
                </Box>
              </Stack>
            )}

            {/* Tab 3: GeoBlock */}
            {tabIndex === 3 && (
              <Stack spacing={3.5} sx={{ maxWidth: 680 }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
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
                        color="primary"
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontWeight: 600, color: settings.geoBlockEnabled ? '#34D399' : '#94A3B8' }}>
                        {settings.geoBlockEnabled ? 'GeoBlock Protection Enabled' : 'GeoBlock Disabled (All IPs Allowed)'}
                      </Typography>
                    }
                  />
                </Box>

                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5, color: '#F8FAFC' }}>
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
                    sx={inputSx}
                  />
                </Box>

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={() => handleSave()}
                    disabled={saving}
                    sx={{ px: 3, py: 1, borderRadius: 2 }}
                  >
                    {saving ? 'Saving...' : 'Save GeoBlock Settings'}
                  </Button>
                </Box>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

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
