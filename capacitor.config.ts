import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tmdb.streamer',
  appName: 'TMDB Streamer',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      launchFadeOutDuration: 400,
      backgroundColor: '#050508',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
