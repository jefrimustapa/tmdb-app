package com.tmdb.streamer;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.OrientationEventListener;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private boolean isCurrentlyFullscreen = false;
    private boolean isWatchPageActive = false;
    private OrientationEventListener orientationListener;

    private boolean isTV() {
        android.app.UiModeManager uiModeManager = (android.app.UiModeManager) getSystemService(UI_MODE_SERVICE);
        return uiModeManager != null && uiModeManager.getCurrentModeType() == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION;
    }

    private boolean isTablet() {
        return getResources().getConfiguration().smallestScreenWidthDp >= 600;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        try {
            PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            Log.i("TMDB_APP", "==================================================");
            Log.i("TMDB_APP", "[TMDB Streamer Native] Startup Version: " + pInfo.versionName + " (Code: " + pInfo.versionCode + ")");
            Log.i("TMDB_APP", "==================================================");
        } catch (Exception e) {
            Log.e("TMDB_APP", "Failed to retrieve package info: " + e.getMessage());
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // On TV, lock orientation to landscape. On mobile phone, lock to portrait. On tablet, allow unspecified.
        if (isTV()) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        } else if (!isTablet()) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            // Block multi-window creation and automated popup opening
            settings.setSupportMultipleWindows(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            // Allow unmuted autoplay and media playback without touch gesture
            settings.setMediaPlaybackRequiresUserGesture(false);
            // Enable HTML5 DOM & Database storage for modern player buffering (Hls.js, Plyr, JWPlayer)
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            // Allow mixed content so HLS streams over http/https load smoothly
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            // Set modern Chrome mobile user agent to prevent 403 bot-blocking by embed providers
            settings.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36");

            // Register JS Bridge
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void setFullscreen(boolean fullscreen) {
                    isCurrentlyFullscreen = fullscreen;
                    runOnUiThread(() -> applyFullscreenState(fullscreen));
                }

                @JavascriptInterface
                public boolean isAudioPlaying() {
                    android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
                    return audioManager != null && audioManager.isMusicActive();
                }

                @JavascriptInterface
                public void onNativePlaybackState(boolean isPlaying, float currentTime, float duration) {
                    runOnUiThread(() -> {
                        WebView wv = bridge.getWebView();
                        if (wv != null) {
                            String jsEvent = String.format(
                                "window.dispatchEvent(new CustomEvent('tmdb_playback_state_changed', { detail: { isPlaying: %b, currentTime: %f, duration: %f } }));",
                                isPlaying, currentTime, duration
                            );
                            wv.evaluateJavascript(jsEvent, null);
                        }
                    });
                }

                @JavascriptInterface
                public void setWatchPage(boolean active) {
                    isWatchPageActive = active;
                    runOnUiThread(() -> {
                        if (isTV()) return;
                        if (active) {
                            // On watch page, allow the device to freely rotate with sensor
                            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
                            updateSystemBarsForWatchPage(getResources().getConfiguration().orientation);
                        } else {
                            // On catalog pages, lock back to portrait (phone) or unspecified (tablet)
                            isCurrentlyFullscreen = false;
                            applyFullscreenState(false);
                            if (!isTablet()) {
                                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                            }
                        }
                    });
                }

                @JavascriptInterface
                public void simulateTouchAt(float x, float y) {
                    runOnUiThread(() -> {
                        WebView wv = bridge.getWebView();
                        if (wv != null) {
                            float density = getResources().getDisplayMetrics().density;
                            float physicalX = x * density;
                            float physicalY = y * density;

                            long downTime = SystemClock.uptimeMillis();
                            long eventTime = SystemClock.uptimeMillis();

                            MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[1];
                            properties[0] = new MotionEvent.PointerProperties();
                            properties[0].id = 0;
                            properties[0].toolType = MotionEvent.TOOL_TYPE_FINGER;

                            MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[1];
                            coords[0] = new MotionEvent.PointerCoords();
                            coords[0].x = physicalX;
                            coords[0].y = physicalY;
                            coords[0].pressure = 1.0f;
                            coords[0].size = 0.45f;
                            // Physical finger contact radius
                            coords[0].touchMajor = 40.0f;
                            coords[0].touchMinor = 40.0f;

                            MotionEvent downEvent = MotionEvent.obtain(
                                downTime, eventTime, MotionEvent.ACTION_DOWN, 1,
                                properties, coords, 0, 0, 1.0f, 1.0f, 0, 0,
                                android.view.InputDevice.SOURCE_TOUCHSCREEN, 0
                            );
                            wv.dispatchTouchEvent(downEvent);

                            wv.postDelayed(() -> {
                                MotionEvent upEvent = MotionEvent.obtain(
                                    downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, 1,
                                    properties, coords, 0, 0, 1.0f, 1.0f, 0, 0,
                                    android.view.InputDevice.SOURCE_TOUCHSCREEN, 0
                                );
                                wv.dispatchTouchEvent(upEvent);
                                downEvent.recycle();
                                upEvent.recycle();
                            }, 80);
                        }
                    });
                }

                @JavascriptInterface
                public boolean isAccessibilityEnabled() {
                    return StreamAccessibilityService.isRunning();
                }

                @JavascriptInterface
                public void openAccessibilitySettings() {
                    runOnUiThread(() -> {
                        try {
                            android.content.Intent intent = new android.content.Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);
                            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                        } catch (Exception e) {}
                    });
                }

                @JavascriptInterface
                public boolean isTabletDevice() {
                    return isTablet();
                }

                @JavascriptInterface
                public boolean isTVDevice() {
                    return isTV();
                }
            }, "AndroidBridge");

            // Intercept and drop any child window or popup requests + forward console logs
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    // Drop all popup requests from third-party players
                    return false;
                }

                @Override
                public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                    if (consoleMessage != null && consoleMessage.message() != null) {
                        String msg = consoleMessage.message();
                        if (msg.contains("[TMDB Streamer]") || msg.contains("Build #")) {
                            Log.i("TMDB_APP", "[WebView JS] " + msg);
                        }
                    }
                    return super.onConsoleMessage(consoleMessage);
                }
            });

            // Intercept URL loading to prevent app redirects or external intent popups
            webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request != null && request.getUrl() != null) {
                        String url = request.getUrl().toString().toLowerCase();

                        // Block external app intents (Play Store, Telegram, APK downloaders, dialer, etc.)
                        if (url.startsWith("intent://") || url.startsWith("market://") || 
                            url.startsWith("vnd.") || url.startsWith("tg://") || 
                            url.startsWith("whatsapp://") || url.startsWith("tel:") ||
                            url.startsWith("mailto:") || url.startsWith("sms:")) {
                            return true; // Block external app launch
                        }

                        // Prevent third-party embedded frames from hijacking the main top-level app frame
                        if (request.isForMainFrame()) {
                            boolean isAppHost = url.contains("localhost") || 
                                                url.startsWith("capacitor://") || 
                                                url.startsWith("file:///");
                            if (!isAppHost) {
                                // Block top-level navigation to external ad sites
                                return true;
                            }
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (request != null && request.getUrl() != null) {
                        String rawUrl = request.getUrl().toString();
                        String lower = rawUrl.toLowerCase();

                        // Sniff and capture direct HLS (.m3u8) and MP4 video stream feeds
                        if ((lower.contains(".m3u8") || lower.contains(".mp4")) && 
                            !lower.contains("localhost") && 
                            !lower.startsWith("capacitor://")) {
                            runOnUiThread(() -> {
                                String jsDispatch = String.format(
                                    "window.dispatchEvent(new CustomEvent('tmdb_direct_stream_found', { detail: { streamUrl: '%s' } }));",
                                    rawUrl.replace("'", "\\'")
                                );
                                view.evaluateJavascript(jsDispatch, null);
                            });
                        }
                    }
                    return super.shouldInterceptRequest(view, request);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    // Automatically find any HTML5 video/audio elements in the DOM/frames and attach state listeners + un-mute
                    String mediaMonitorScript = 
                        "(function() {" +
                        "  function monitorMedia() {" +
                        "    try {" +
                        "      document.querySelectorAll('video, audio').forEach(function(el) {" +
                        "        if (!el.__tmdb_monitored) {" +
                        "          el.__tmdb_monitored = true;" +
                        "          el.muted = false;" +
                        "          el.volume = 1.0;" +
                        "          function notifyState(playing) {" +
                        "            try {" +
                        "              if (window.AndroidBridge && window.AndroidBridge.onNativePlaybackState) {" +
                        "                window.AndroidBridge.onNativePlaybackState(playing, el.currentTime || 0, el.duration || 0);" +
                        "              }" +
                        "            } catch(e) {}" +
                        "          }" +
                        "          el.addEventListener('play', function() { notifyState(true); });" +
                        "          el.addEventListener('playing', function() { notifyState(true); });" +
                        "          el.addEventListener('pause', function() { notifyState(false); });" +
                        "          el.addEventListener('ended', function() { notifyState(false); });" +
                        "          el.addEventListener('timeupdate', function() {" +
                        "            if (!el.paused && Math.floor(el.currentTime) % 5 === 0) {" +
                        "              notifyState(true);" +
                        "            }" +
                        "          });" +
                        "          if (!el.paused) { notifyState(true); }" +
                        "        }" +
                        "      });" +
                        "    } catch(e) {}" +
                        "  }" +
                        "  monitorMedia();" +
                        "  setInterval(monitorMedia, 1000);" +
                        "})();";
                    view.evaluateJavascript(mediaMonitorScript, null);
                }
            });
        }
    }

    private void applyFullscreenState(boolean fullscreen) {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            if (fullscreen) {
                controller.hide(WindowInsetsCompat.Type.systemBars());
                controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars());
                if (!isTablet()) {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                } else {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                }
            }
        }
    }

    private void updateSystemBarsForWatchPage(int orientation) {
        if (!isWatchPageActive) return;
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            if (orientation == Configuration.ORIENTATION_LANDSCAPE) {
                // In landscape on watch page, completely hide OS bottom navigation bar and status bar
                controller.hide(WindowInsetsCompat.Type.systemBars());
                controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            } else {
                // In portrait, show system bars
                if (!isCurrentlyFullscreen) {
                    controller.show(WindowInsetsCompat.Type.systemBars());
                }
            }
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (isWatchPageActive) {
            updateSystemBarsForWatchPage(newConfig.orientation);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            if (isCurrentlyFullscreen || (isWatchPageActive && getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE)) {
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                if (controller != null) {
                    controller.hide(WindowInsetsCompat.Type.systemBars());
                    controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            }
        }
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (ev.getAction() == MotionEvent.ACTION_DOWN && isWatchPageActive) {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_screen_touched'));", null);
            }
        }
        return super.dispatchTouchEvent(ev);
    }



    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (isTV() && isWatchPageActive && event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            WebView webView = bridge.getWebView();

            if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                if (webView != null) {
                    webView.evaluateJavascript(
                        "(function() {" +
                        "  var header = document.querySelector('[data-watch-header=\"true\"]');" +
                        "  var isHeaderFocused = header && header.contains(document.activeElement);" +
                        "  if (!isHeaderFocused) {" +
                        "    var iframe = document.querySelector('iframe');" +
                        "    if (iframe && iframe.contentWindow) {" +
                        "      try { iframe.contentWindow.postMessage({ type: 'play' }, '*'); } catch(e){}" +
                        "      try { iframe.contentWindow.postMessage({ action: 'play' }, '*'); } catch(e){}" +
                        "      try { iframe.contentWindow.postMessage({ event: 'command', func: 'playVideo' }, '*'); } catch(e){}" +
                        "    }" +
                        "    if (typeof window.AndroidBridge !== 'undefined' && typeof window.AndroidBridge.simulateTouchAt === 'function') {" +
                        "      window.AndroidBridge.simulateTouchAt(window.innerWidth / 2, window.innerHeight / 2);" +
                        "    }" +
                        "  } else {" +
                        "    if (document.activeElement && typeof document.activeElement.click === 'function') {" +
                        "      document.activeElement.click();" +
                        "    }" +
                        "  }" +
                        "})();",
                        null
                    );
                    return true;
                }
            } else if (keyCode == KeyEvent.KEYCODE_BACK) {
                if (webView != null) {
                    // Check if header is already focused; if not, reveal header & focus back button; if already focused, exit watch page
                    webView.evaluateJavascript(
                        "(function() {" +
                        "  var header = document.querySelector('[data-watch-header=\"true\"]');" +
                        "  var isHeaderFocused = header && header.contains(document.activeElement);" +
                        "  var backBtn = header ? header.querySelector('button[aria-label=\"Back\"], .tv-focus-target') : null;" +
                        "  if (!isHeaderFocused) {" +
                        "    window.dispatchEvent(new CustomEvent('tmdb_screen_touched'));" +
                        "    if (backBtn) {" +
                        "      backBtn.focus();" +
                        "    }" +
                        "    return 'FOCUSED_HEADER';" +
                        "  } else {" +
                        "    if (backBtn && typeof backBtn.click === 'function') {" +
                        "      backBtn.click();" +
                        "    } else {" +
                        "      window.history.back();" +
                        "    }" +
                        "    return 'EXITED_WATCH';" +
                        "  }" +
                        "})();",
                        null
                    );
                    return true;
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (orientationListener != null) {
            orientationListener.disable();
        }
    }
}



