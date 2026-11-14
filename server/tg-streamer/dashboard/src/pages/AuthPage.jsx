import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Stack,
  Alert,
  Snackbar,
  LinearProgress,
  Chip,
  Paper,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import { api } from '../api/client';

export default function AuthPage({ onStatusUpdate }) {
  const [authStatus, setAuthStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1); // 1: Phone, 2: Code/2FA, 3: Success Session
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [sessionString, setSessionString] = useState('');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  const checkStatus = async () => {
    try {
      const res = await api.get('/auth/status');
      if (res.ok && res.data) {
        setAuthStatus(res.data);
        if (onStatusUpdate) {
          onStatusUpdate(res.data);
        }
      }
    } catch (err) {
      console.error('Failed to check auth status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleSendCode = async () => {
    const phone = phoneNumber.trim();
    if (!phone) {
      setToast({ open: true, message: 'Please enter your phone number with country code.', severity: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/auth/send-code', { phoneNumber: phone });
      if (res.ok && res.data?.success) {
        setToast({ open: true, message: res.data.message || 'Verification code sent to your Telegram app.', severity: 'success' });
        setStep(2);
      } else {
        setToast({ open: true, message: res.data?.error || 'Failed to send code.', severity: 'error' });
      }
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    const code = phoneCode.trim();
    if (!code) {
      setToast({ open: true, message: 'Please enter the verification code.', severity: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/auth/verify-code', { phoneCode: code, password });
      if (res.ok && res.data) {
        if (res.data.needPassword) {
          setNeedPassword(true);
          setToast({ open: true, message: '2FA Cloud Password required. Please enter your password.', severity: 'warning' });
        } else if (res.data.success) {
          setSessionString(res.data.session || '');
          setStep(3);
          setToast({ open: true, message: 'Telegram authentication successful! Server is active.', severity: 'success' });
          checkStatus();
        } else {
          setToast({ open: true, message: res.data.error || 'Verification failed.', severity: 'error' });
        }
      } else {
        setToast({ open: true, message: res.data?.error || 'Verification failed.', severity: 'error' });
      }
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySession = async () => {
    if (!sessionString) return;
    try {
      await navigator.clipboard.writeText(sessionString);
      setToast({ open: true, message: 'Copied TG_SESSION string to clipboard!', severity: 'success' });
    } catch (err) {
      setToast({ open: true, message: 'Failed to copy to clipboard', severity: 'info' });
    }
  };

  return (
    <Box sx={{ maxWidth: 480, mx: 'auto', width: '100%', py: { xs: 2, sm: 4 } }}>
      {/* Centered Sneat Auth Card */}
      <Card sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: '10px' }}>
        {/* Brand Icon Header */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: '12px',
              bgcolor: 'rgba(105, 108, 255, 0.16)',
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
              boxShadow: '0 4px 12px 0 rgba(105, 108, 255, 0.2)',
            }}
          >
            <VpnKeyIcon sx={{ fontSize: 28 }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, textAlign: 'center', color: 'text.primary', mb: 0.5 }}>
            Welcome to TGStrm 👋
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
            Authenticate your Telegram MTProto gateway session
          </Typography>
        </Box>

        {/* Live Status Pill */}
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 3,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            bgcolor: 'background.default',
            borderRadius: '8px',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              size="small"
              label={authStatus?.isConnected ? 'ONLINE' : 'OFFLINE'}
              sx={{
                fontWeight: 700,
                fontSize: '0.7rem',
                borderRadius: '4px',
                bgcolor: authStatus?.isConnected ? 'rgba(113, 221, 55, 0.16)' : 'rgba(255, 62, 29, 0.16)',
                color: authStatus?.isConnected ? '#71DD37' : '#FF3E1D',
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {authStatus?.isConnected && authStatus.user
                ? `@${authStatus.user.username || authStatus.user.firstName}`
                : 'Session Required'}
            </Typography>
          </Box>
          {authStatus?.isConnected && (
            <Button size="small" onClick={() => setStep(1)} sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'primary.main' }}>
              Re-login
            </Button>
          )}
        </Paper>

        {/* Step 1: Send Code */}
        {step === 1 && (
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.primary' }}>
                Telegram Phone Number
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Include international country code prefix (e.g. +60 for Malaysia, +62 for Indonesia).
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="tel"
                placeholder="+60123456789"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                inputProps={{
                  style: { fontFamily: '"JetBrains Mono", monospace' },
                }}
              />
            </Box>
            <Button
              variant="contained"
              fullWidth
              size="large"
              startIcon={<SendIcon />}
              onClick={handleSendCode}
              disabled={submitting || !phoneNumber.trim()}
              sx={{ borderRadius: '8px', py: 1.25 }}
            >
              {submitting ? 'Sending Code...' : 'Send Verification Code'}
            </Button>
          </Stack>
        )}

        {/* Step 2: Verify Code */}
        {step === 2 && (
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.primary' }}>
                Login Code from Telegram
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Enter the 5-digit code sent to your Telegram application.
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="12345"
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                inputProps={{
                  maxLength: 8,
                  style: { textAlign: 'center', letterSpacing: '0.3em', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 },
                }}
              />
            </Box>

            {needPassword && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.primary' }}>
                  2FA Cloud Password
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  type="password"
                  placeholder="Enter your 2FA password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                />
              </Box>
            )}

            <Button
              variant="contained"
              fullWidth
              size="large"
              startIcon={<LockOpenIcon />}
              onClick={handleVerifyCode}
              disabled={submitting || !phoneCode.trim()}
              sx={{ borderRadius: '8px', py: 1.25 }}
            >
              {submitting ? 'Verifying...' : 'Verify & Activate Server'}
            </Button>

            <Button
              variant="text"
              size="small"
              startIcon={<ArrowBackIcon />}
              onClick={() => setStep(1)}
              sx={{ color: 'text.secondary' }}
            >
              Change Phone Number
            </Button>
          </Stack>
        )}

        {/* Step 3: Session Box */}
        {step === 3 && (
          <Stack spacing={2.5}>
            <Alert
              severity="success"
              icon={<CheckCircleIcon />}
              sx={{ bgcolor: 'rgba(113, 221, 55, 0.16)', color: '#71DD37' }}
            >
              Server is now ACTIVE in memory! Video streaming gateway is live.
            </Alert>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.primary' }}>
                Permanent TG_SESSION String
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                size="small"
                value={sessionString}
                InputProps={{
                  readOnly: true,
                  sx: { fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem' },
                }}
              />
            </Box>

            <Button
              variant="contained"
              startIcon={<ContentCopyIcon />}
              onClick={handleCopySession}
              sx={{ borderRadius: '8px' }}
            >
              Copy TG_SESSION to Clipboard
            </Button>

            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              💡 To persist this login permanently across Docker or cloud container rebuilds, paste this value into your environment as <strong>TG_SESSION</strong>.
            </Typography>
          </Stack>
        )}
      </Card>

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
