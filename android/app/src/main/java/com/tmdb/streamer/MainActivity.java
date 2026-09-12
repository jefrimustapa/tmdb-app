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
import android.text.TextUtils;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.Executors;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private boolean isCurrentlyFullscreen = false;
    private boolean isWatchPageActive = false;
    private volatile boolean isDropdownOpen = false;
    private volatile boolean isVirtualCursorActive = false;
    private volatile boolean isSimulatingTouch = false;
    private volatile boolean isAdShieldActive = true;
    private OrientationEventListener orientationListener;

    private static final String[] AD_BLOCK_PATTERNS = new String[] {
        "propellerads", "adsterra", "monetag", "exoclick", "popcash", "popads",
        "juicyads", "clickadu", "trafficjunky", "trafficfactory", "tsyndicate",
        "adservice", "doubleclick", "googlesyndication", "googleadservices",
        "histats", "statcounter", "coinhive", "cpmstar", "hilltopads",
        "adclick", "ad-delivery", "adform", "adkernel", "admarvel", "admixer",
        "adnxs", "adroll", "adsystem", "adtrue", "adzerk",
        "bidvertiser", "clickguard", "disqusads",
        "infolinks", "media.net", "mgid", "outbrain", "revcontent",
        "scorecardresearch", "taboola", "yieldmo", "zergnet",
        "vdo.ai", "aniview", "smartadserver", "serving-sys", "rubiconproject",
        "openx", "pubmatic", "lijit", "casalemedia", "sovrn",
        "criteo", "amazon-adsystem", "advertising.com",
        "betweendigital", "onclick", "pushsdk", "webpush"
    };

    private boolean isAdOrTrackerUrl(String lowerUrl) {
        if (!isAdShieldActive) return false;
        if (lowerUrl.contains("localhost") || lowerUrl.startsWith("capacitor://") || lowerUrl.startsWith("file://")) {
            return false;
        }
        if (lowerUrl.contains(".m3u8") || lowerUrl.contains(".mp4") || lowerUrl.contains(".ts") || 
            lowerUrl.contains(".vtt") || lowerUrl.contains(".srt") || lowerUrl.contains("tmdb.org")) {
            return false;
        }
        for (String pattern : AD_BLOCK_PATTERNS) {
            if (lowerUrl.contains(pattern)) {
                return true;
            }
        }
        return false;
    }

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

        // Set immediate dark neon window and root background to prevent white screen flash
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.parseColor("#050508")));

        // On TV, lock orientation to landscape. On mobile phone, lock to portrait. On tablet, allow unspecified.
        if (isTV()) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        } else if (!isTablet()) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            webView.setBackgroundColor(android.graphics.Color.parseColor("#050508"));
            WebSettings settings = webView.getSettings();
            // Block multi-window creation and automated popup opening
            settings.setSupportMultipleWindows(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            // Allow unmuted autoplay and media playback without touch gesture
            settings.setMediaPlaybackRequiresUserGesture(false);
            // Enable HTML5 DOM & Database storage for modern player buffering (Hls.js, Plyr, JWPlayer)
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            if (isTV() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Disable offscreen pre-rasterization on TV to save GPU fill rate on Mali-450
                settings.setOffscreenPreRaster(false);
            }
            // Allow mixed content so HLS streams over http/https load smoothly
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            // Enable third-party cookies so Cloudflare / cf_clearance / session cookies persist across iframes
            android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(webView, true);
            // Enable cross-frame access for DOM styling and bridge inspection
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
            // Set modern Chrome mobile user agent to prevent 403 bot-blocking by embed providers
            settings.setUserAgentString("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

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
                            isSimulatingTouch = true;
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
                                isSimulatingTouch = false;
                            }, 80);
                        }
                    });
                }

                @JavascriptInterface
                public String fetchHttp(String targetUrl, String referer, String origin) {
                    try {
                        URL url = new URL(targetUrl);
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestMethod("GET");
                        conn.setConnectTimeout(4000);
                        conn.setReadTimeout(5000);
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
                        conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
                        conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9,id;q=0.8");
                        if (referer != null && !referer.isEmpty()) {
                            conn.setRequestProperty("Referer", referer);
                        }
                        if (origin != null && !origin.isEmpty()) {
                            conn.setRequestProperty("Origin", origin);
                        }
                        // Do NOT pass stale/corrupted cookies (especially stale cf_clearance) to videonode.de
                        if (!targetUrl.contains("videonode.de")) {
                            String cookie = android.webkit.CookieManager.getInstance().getCookie(targetUrl);
                            if (cookie != null && !cookie.isEmpty()) {
                                conn.setRequestProperty("Cookie", cookie);
                            }
                        }
                        conn.connect();

                        int statusCode = conn.getResponseCode();
                        Log.i("TMDB_APP", "[AndroidBridge] fetchHttp " + targetUrl + " -> " + statusCode);
                        for (Map.Entry<String, java.util.List<String>> header : conn.getHeaderFields().entrySet()) {
                            if (header.getKey() != null && header.getKey().equalsIgnoreCase("set-cookie")) {
                                for (String cookieVal : header.getValue()) {
                                    android.webkit.CookieManager.getInstance().setCookie(targetUrl, cookieVal);
                                }
                            }
                        }

                        InputStream in = (statusCode >= 400) ? conn.getErrorStream() : conn.getInputStream();
                        if (in == null) return null;

                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        byte[] buffer = new byte[8192];
                        int len;
                        while ((len = in.read(buffer)) != -1) {
                            baos.write(buffer, 0, len);
                        }
                        in.close();
                        return baos.toString("UTF-8");
                    } catch (Exception e) {
                        Log.w("TMDB_APP", "[AndroidBridge] fetchHttp error for " + targetUrl + ": " + e.getMessage());
                        return null;
                    }
                }


                @JavascriptInterface
                public String fetchHttpPost(String targetUrl, String postBody, String contentType, String referer, String origin) {
                    try {
                        URL url = new URL(targetUrl);
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestMethod("POST");
                        conn.setDoOutput(true);
                        conn.setConnectTimeout(4000);
                        conn.setReadTimeout(5000);
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
                        if (contentType != null && !contentType.isEmpty()) {
                            conn.setRequestProperty("Content-Type", contentType);
                        }
                        if (referer != null && !referer.isEmpty()) {
                            conn.setRequestProperty("Referer", referer);
                        }
                        if (origin != null && !origin.isEmpty()) {
                            conn.setRequestProperty("Origin", origin);
                        }
                        if (!targetUrl.contains("playcdn.de") && !targetUrl.contains("videonode.de")) {
                            String cookie = android.webkit.CookieManager.getInstance().getCookie(targetUrl);
                            if (cookie != null && !cookie.isEmpty()) {
                                conn.setRequestProperty("Cookie", cookie);
                            }
                        }
                        if (postBody != null) {
                            byte[] outBytes = postBody.getBytes(StandardCharsets.UTF_8);
                            conn.setRequestProperty("Content-Length", String.valueOf(outBytes.length));
                            try (OutputStream os = conn.getOutputStream()) {
                                os.write(outBytes);
                                os.flush();
                            }
                        }

                        int statusCode = conn.getResponseCode();
                        Log.i("TMDB_APP", "[AndroidBridge] fetchHttpPost " + targetUrl + " -> " + statusCode);
                        for (Map.Entry<String, java.util.List<String>> header : conn.getHeaderFields().entrySet()) {
                            if (header.getKey() != null && header.getKey().equalsIgnoreCase("set-cookie")) {
                                for (String cookieVal : header.getValue()) {
                                    android.webkit.CookieManager.getInstance().setCookie(targetUrl, cookieVal);
                                }
                            }
                        }

                        InputStream in = (statusCode >= 400) ? conn.getErrorStream() : conn.getInputStream();
                        if (in == null) return null;

                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        byte[] buffer = new byte[8192];
                        int len;
                        while ((len = in.read(buffer)) != -1) {
                            baos.write(buffer, 0, len);
                        }
                        in.close();
                        return baos.toString("UTF-8");
                    } catch (Exception e) {
                        Log.w("TMDB_APP", "[AndroidBridge] fetchHttpPost error for " + targetUrl + ": " + e.getMessage());
                        return null;
                    }
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

                @JavascriptInterface
                public void setDropdownOpen(boolean open) {
                    isDropdownOpen = open;
                    Log.i("TMDB_APP", "[AndroidBridge] setDropdownOpen: " + open);
                }

                @JavascriptInterface
                public void setVirtualCursorActive(boolean active) {
                    isVirtualCursorActive = active;
                    Log.i("TMDB_APP", "[AndroidBridge] setVirtualCursorActive: " + active);
                }

                @JavascriptInterface
                public void setAdShieldEnabled(boolean enabled) {
                    isAdShieldActive = enabled;
                    Log.i("TMDB_APP", "[AndroidBridge] setAdShieldEnabled: " + enabled);
                }

                @JavascriptInterface
                public void downloadAndInstallApk(String downloadUrl, String apkFileName) {
                    Executors.newSingleThreadExecutor().execute(() -> {
                        try {
                            Log.i("TMDB_APP", "[Update] Starting APK download from: " + downloadUrl);
                            URL url = new URL(downloadUrl);
                            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) TMDBStreamer");
                            connection.setConnectTimeout(15000);
                            connection.setReadTimeout(30000);
                            connection.connect();

                            // Follow HTTP redirects (301, 302, 303, 307, 308) from GitHub to AWS S3 storage
                            int responseCode = connection.getResponseCode();
                            int redirectCount = 0;
                            while ((responseCode == HttpURLConnection.HTTP_MOVED_TEMP || 
                                    responseCode == HttpURLConnection.HTTP_MOVED_PERM || 
                                    responseCode == HttpURLConnection.HTTP_SEE_OTHER || 
                                    responseCode == 307 || responseCode == 308) && redirectCount < 6) {
                                String newUrl = connection.getHeaderField("Location");
                                Log.i("TMDB_APP", "[Update] Following redirect (" + responseCode + ") to: " + newUrl);
                                connection.disconnect();
                                url = new URL(newUrl);
                                connection = (HttpURLConnection) url.openConnection();
                                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) TMDBStreamer");
                                connection.setConnectTimeout(15000);
                                connection.setReadTimeout(30000);
                                connection.connect();
                                responseCode = connection.getResponseCode();
                                redirectCount++;
                            }

                            if (responseCode != HttpURLConnection.HTTP_OK) {
                                throw new Exception("Server returned HTTP " + responseCode + " " + connection.getResponseMessage());
                            }

                            int fileLength = connection.getContentLength();
                            
                            // Use app-scoped external files directory (no WRITE_EXTERNAL_STORAGE permission required)
                            File downloadDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                            if (downloadDir == null) {
                                downloadDir = new File(getCacheDir(), "updates");
                            }
                            if (!downloadDir.exists()) {
                                downloadDir.mkdirs();
                            }
                            File outputFile = new File(downloadDir, apkFileName);
                            if (outputFile.exists()) {
                                outputFile.delete();
                            }

                            InputStream input = connection.getInputStream();
                            FileOutputStream output = new FileOutputStream(outputFile);

                            byte[] data = new byte[8192];
                            long total = 0;
                            int count;
                            long lastProgressUpdate = 0;

                            while ((count = input.read(data)) != -1) {
                                total += count;
                                output.write(data, 0, count);

                                long now = System.currentTimeMillis();
                                if (now - lastProgressUpdate > 250) {
                                    lastProgressUpdate = now;
                                    final int progress = fileLength > 0 ? (int) (total * 100 / fileLength) : 50;
                                    final long currentTotal = total;
                                    final int totalLen = fileLength;
                                    runOnUiThread(() -> {
                                        WebView wv = bridge.getWebView();
                                        if (wv != null) {
                                            String statusStr = String.format(
                                                "%.1f MB / %.1f MB", 
                                                (currentTotal / (1024.0 * 1024.0)), 
                                                (totalLen > 0 ? (totalLen / (1024.0 * 1024.0)) : (currentTotal / (1024.0 * 1024.0)))
                                            );
                                            String js = String.format(
                                                "window.dispatchEvent(new CustomEvent('tmdb_update_download_progress', { detail: { percent: %d, downloaded: %d, total: %d, status: '%s' } }));",
                                                progress, currentTotal, totalLen, statusStr
                                            );
                                            wv.evaluateJavascript(js, null);
                                        }
                                    });
                                }
                            }

                            output.flush();
                            output.close();
                            input.close();
                            Log.i("TMDB_APP", "[Update] APK downloaded successfully to: " + outputFile.getAbsolutePath());

                            runOnUiThread(() -> {
                                WebView wv = bridge.getWebView();
                                if (wv != null) {
                                    wv.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_update_download_complete', { detail: { path: '" + outputFile.getAbsolutePath().replace("\\", "\\\\") + "' } }));", null);
                                }
                                promptInstallApk(outputFile);
                            });

                        } catch (Exception e) {
                            Log.e("TMDB_APP", "[Update] Download failed: " + e.getMessage(), e);
                            runOnUiThread(() -> {
                                WebView wv = bridge.getWebView();
                                if (wv != null) {
                                    String safeErr = (e.getMessage() != null ? e.getMessage() : "Download error").replace("'", "\\'");
                                    wv.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_update_download_error', { detail: { error: '" + safeErr + "' } }));", null);
                                }
                            });
                        }
                    });
                }

                @JavascriptInterface
                public boolean savePersistentBackup(String jsonContent) {
                    if (jsonContent == null || jsonContent.trim().isEmpty()) return false;
                    try {
                        File backupFile = getPersistentBackupFile(true);
                        if (backupFile == null) {
                            Log.e("TMDB_APP", "[PersistentStorage] Could not resolve backup file path");
                            return false;
                        }
                        File tempFile = new File(backupFile.getParentFile(), backupFile.getName() + ".tmp");
                        try (FileOutputStream fos = new FileOutputStream(tempFile)) {
                            fos.write(jsonContent.getBytes(StandardCharsets.UTF_8));
                            fos.flush();
                        }
                        if (backupFile.exists()) {
                            backupFile.delete();
                        }
                        boolean renamed = tempFile.renameTo(backupFile);
                        Log.i("TMDB_APP", "[PersistentStorage] Backup saved successfully to " + backupFile.getAbsolutePath() + " (success=" + renamed + ")");
                        return renamed;
                    } catch (Exception e) {
                        Log.e("TMDB_APP", "[PersistentStorage] Failed to save backup: " + e.getMessage(), e);
                        return false;
                    }
                }

                @JavascriptInterface
                public String readPersistentBackup() {
                    try {
                        File backupFile = getPersistentBackupFile(false);
                        if (backupFile == null || !backupFile.exists() || backupFile.length() == 0) {
                            return null;
                        }
                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        try (InputStream is = new java.io.FileInputStream(backupFile)) {
                            byte[] buf = new byte[8192];
                            int read;
                            while ((read = is.read(buf)) != -1) {
                                baos.write(buf, 0, read);
                            }
                        }
                        String json = baos.toString("UTF-8");
                        Log.i("TMDB_APP", "[PersistentStorage] Read backup (" + json.length() + " chars) from " + backupFile.getAbsolutePath());
                        return json;
                    } catch (Exception e) {
                        Log.e("TMDB_APP", "[PersistentStorage] Failed to read backup: " + e.getMessage(), e);
                        return null;
                    }
                }

                @JavascriptInterface
                public boolean hasPersistentBackup() {
                    File backupFile = getPersistentBackupFile(false);
                    return backupFile != null && backupFile.exists() && backupFile.length() > 0;
                }

                @JavascriptInterface
                public long getPersistentBackupTimestamp() {
                    File backupFile = getPersistentBackupFile(false);
                    if (backupFile != null && backupFile.exists()) {
                        return backupFile.lastModified();
                    }
                    return 0L;
                }

                @JavascriptInterface
                public String getPersistentBackupLocation() {
                    File backupFile = getPersistentBackupFile(false);
                    return backupFile != null ? backupFile.getAbsolutePath() : "";
                }

                @JavascriptInterface
                public void shareDeepLink(String title, String text, String deepLinkUrl) {
                    runOnUiThread(() -> {
                        try {
                            Intent shareIntent = new Intent(Intent.ACTION_SEND);
                            shareIntent.setType("text/plain");
                            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                            String fullMessage = text;
                            if (!TextUtils.isEmpty(deepLinkUrl)) {
                                fullMessage = (TextUtils.isEmpty(text) ? "" : text + "\n") + deepLinkUrl;
                            }
                            shareIntent.putExtra(Intent.EXTRA_TEXT, fullMessage);
                            Intent chooser = Intent.createChooser(shareIntent, "Share " + title);
                            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(chooser);
                        } catch (Exception e) {
                            Log.e("TMDB_APP", "Failed to share deep link: " + e.getMessage(), e);
                        }
                    });
                }
            }, "AndroidBridge");

            // Handle alert, confirm, and multi-window popups
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                    // Drop all popup requests from third-party players
                    return false;
                }

                @Override
                public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                    if (consoleMessage != null && consoleMessage.message() != null) {
                        Log.i("TMDB_APP", "[WebView JS] " + consoleMessage.message());
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

                        // Asian Stream, VidSrc & TurboVIP Anti-Hotlinking, CSP Frame Shield and X-Frame-Options removal
                        if ((lower.contains("videonode.de") || lower.contains("playcdn.de") || lower.contains("turbovid") || lower.contains("turboviplay") || lower.contains("turbosplayer") || lower.contains("layaricon21.com") || lower.contains("abyssplayer.com") || lower.contains("embed4me.vip") || lower.contains("vidsrc.su") || lower.contains("vidsrc.stream") || lower.contains("vidsrc.net") || lower.contains("vidmoly") || lower.contains("streamtape.com") || lower.contains("mixdrop") || lower.contains("vidbasic.top") || lower.contains("kisskh.space") || lower.contains("dramacool.net.my")) &&
                            !lower.contains("/cdn-cgi/")) {
                            try {
                                URL url = new URL(rawUrl);
                                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                                conn.setRequestMethod(request.getMethod());
                                Map<String, String> reqHeaders = request.getRequestHeaders();
                                if (reqHeaders != null) {
                                    for (Map.Entry<String, String> entry : reqHeaders.entrySet()) {
                                        String k = entry.getKey().toLowerCase();
                                        if (!k.equals("referer") && !k.equals("origin") && !k.equals("host") && !k.equals("user-agent")) {
                                            conn.setRequestProperty(entry.getKey(), entry.getValue());
                                        }
                                    }
                                }
                                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
                                if (lower.contains("turbosplayer") || lower.contains("turboviplay")) {
                                    conn.setRequestProperty("Referer", "https://turbovidhls.com/");
                                    conn.setRequestProperty("Origin", "https://turbovidhls.com");
                                } else if (lower.contains("turbovid")) {
                                    conn.setRequestProperty("Referer", "https://layaricon21.com/");
                                    conn.setRequestProperty("Origin", "https://layaricon21.com");
                                } else if (lower.contains("playcdn.de")) {
                                    conn.setRequestProperty("Referer", "https://videonode.de/");
                                    conn.setRequestProperty("Origin", "https://videonode.de");
                                } else if (lower.contains("vidsrc.su") || lower.contains("vidsrc.stream") || lower.contains("vidsrc.net")) {
                                    conn.setRequestProperty("Referer", "https://vidsrc.su/");
                                    conn.setRequestProperty("Origin", "https://vidsrc.su");
                                } else if (lower.contains("vidmoly") || lower.contains("streamtape.com") || lower.contains("mixdrop")) {
                                    conn.setRequestProperty("Referer", "https://kisskh.space/");
                                    conn.setRequestProperty("Origin", "https://kisskh.space");
                                } else if (lower.contains("kisskh.space") || lower.contains("vidbasic.top")) {
                                    conn.setRequestProperty("Referer", "https://dramacool.net.my/");
                                    conn.setRequestProperty("Origin", "https://dramacool.net.my");
                                } else {
                                    conn.setRequestProperty("Referer", "https://layaricon21.com/");
                                    conn.setRequestProperty("Origin", "https://layaricon21.com");
                                }

                                if (!lower.contains("videonode.de") && !lower.contains("playcdn.de")) {
                                    String cookie = android.webkit.CookieManager.getInstance().getCookie(rawUrl);
                                    if (cookie != null && !cookie.isEmpty()) {
                                        conn.setRequestProperty("Cookie", cookie);
                                    }
                                }

                                int statusCode = conn.getResponseCode();
                                String contentType = conn.getContentType();
                                String mimeType = "text/html";
                                String encoding = "UTF-8";
                                if (contentType != null) {
                                    String[] parts = contentType.split(";");
                                    mimeType = parts[0].trim();
                                    for (String part : parts) {
                                        if (part.trim().toLowerCase().startsWith("charset=")) {
                                            encoding = part.trim().substring(8).trim();
                                        }
                                    }
                                }

                                Map<String, String> responseHeaders = new HashMap<>();
                                responseHeaders.put("Access-Control-Allow-Origin", "*");
                                responseHeaders.put("Access-Control-Allow-Headers", "*");
                                // Strip frame-ancestors / Content-Security-Policy to prevent iframe blocking
                                for (Map.Entry<String, java.util.List<String>> header : conn.getHeaderFields().entrySet()) {
                                    if (header.getKey() != null) {
                                        String hKey = header.getKey().toLowerCase();
                                        if (hKey.equals("set-cookie")) {
                                            for (String cookieVal : header.getValue()) {
                                                android.webkit.CookieManager.getInstance().setCookie(rawUrl, cookieVal);
                                            }
                                        }
                                        if (!hKey.equals("content-security-policy") && !hKey.equals("x-frame-options")) {
                                            responseHeaders.put(header.getKey(), TextUtils.join(", ", header.getValue()));
                                        }
                                    }
                                }

                                InputStream in = statusCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
                                if (lower.contains("vidsrc.su") && mimeType != null && mimeType.contains("html") && statusCode < 400) {
                                    try {
                                        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                                        StringBuilder sb = new StringBuilder();
                                        String l;
                                        while ((l = reader.readLine()) != null) {
                                            sb.append(l).append("\n");
                                        }
                                        String html = sb.toString();
                                        // Inject client-side anti-webview and desktop environment spoofing
                                        String vidsrcSpoofScript = "<script>\n" +
                                            "(function() {\n" +
                                            "  try {\n" +
                                            "    var desktopBrands = [\n" +
                                            "      { brand: 'Google Chrome', version: '131' },\n" +
                                            "      { brand: 'Chromium', version: '131' },\n" +
                                            "      { brand: 'Not_A Brand', version: '24' }\n" +
                                            "    ];\n" +
                                            "    Object.defineProperty(navigator, 'userAgentData', {\n" +
                                            "      get: function() { return { brands: desktopBrands, mobile: false, platform: 'Windows' }; },\n" +
                                            "      configurable: true\n" +
                                            "    });\n" +
                                            "    Object.defineProperty(navigator, 'userAgent', {\n" +
                                            "      get: function() { return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'; },\n" +
                                            "      configurable: true\n" +
                                            "    });\n" +
                                            "    Object.defineProperty(window, 'frameElement', { get: function() { return null; }, configurable: true });\n" +
                                            "  } catch(e){}\n" +
                                            "})();\n" +
                                            "</script>\n";
                                        html = html.replace("<head>", "<head>\n" + vidsrcSpoofScript);
                                        in = new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
                                    } catch (Exception e) {}
                                } else if (lower.contains("vidsrc.su") && (lower.endsWith(".js") || lower.contains("/assets/index-")) && statusCode < 400) {
                                    try {
                                        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                                        StringBuilder sb = new StringBuilder();
                                        String l;
                                        while ((l = reader.readLine()) != null) {
                                            sb.append(l).append("\n");
                                        }
                                        String js = sb.toString();
                                        // Neutralize the in-app browser check by replacing the detection logic with 'return false;'
                                        js = js.replace("return!!(null==r?void 0:r.some(e=>\"Android WebView\"===e.brand))", "return false");
                                        js = js.replace("if(/; wv\\)/.test(t)||/\\(.*\\bwv\\b.*\\)/.test(t))return!0;", "/* bypassed */");
                                        js = js.replace("if(/Version\\/\\d+\\.\\d+/.test(t)&&/Chrome\\/\\d/.test(t))return!0", "/* bypassed */");
                                        in = new ByteArrayInputStream(js.getBytes(StandardCharsets.UTF_8));
                                    } catch (Exception e) {}
                                } else if (lower.contains("turbovid") && mimeType != null && mimeType.contains("html") && statusCode < 400) {
                                    try {
                                        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                                        StringBuilder sb = new StringBuilder();
                                        String l;
                                        while ((l = reader.readLine()) != null) {
                                            sb.append(l).append("\n");
                                        }
                                        String html = sb.toString();
                                        String mockScript = "<script>\n" +
                                            "try {\n" +
                                            "  Object.defineProperty(document, 'referrer', { get: function() { return 'https://videonode.de/'; } });\n" +
                                            "} catch(e){}\n" +
                                            "window.open = function() { return null; };\n" +
                                            "window.openNewTab = function() { return null; };\n" +
                                            "window.addEventListener('DOMContentLoaded', function() {\n" +
                                            "  setTimeout(function() {\n" +
                                            "    var preloader = document.querySelector('.preloader');\n" +
                                            "    if (preloader) preloader.style.display = 'none';\n" +
                                            "    if (typeof loadPlayer === 'function') {\n" +
                                            "      var el = document.getElementById('video_player');\n" +
                                            "      var f = (el && el.getAttribute('data-hash')) || (typeof urlPlay !== 'undefined' ? urlPlay : '');\n" +
                                            "      if (f) loadPlayer(f);\n" +
                                            "    }\n" +
                                            "  }, 350);\n" +
                                            "});\n" +
                                            "</script>\n";
                                        html = html.replace("<head>", "<head>\n" + mockScript);
                                        in = new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
                                    } catch (Exception e) {}
                                } else if ((lower.contains("vidmoly") || lower.contains("streamtape.com") || lower.contains("mixdrop") || lower.contains("kisskh.space")) && mimeType != null && mimeType.contains("html") && statusCode < 400) {
                                    try {
                                        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                                        StringBuilder sb = new StringBuilder();
                                        String l;
                                        while ((l = reader.readLine()) != null) {
                                            sb.append(l).append("\n");
                                        }
                                        String html = sb.toString();
                                        String dramacoolTrackerScript = "<script id=\"tmdb-dramacool-tracker\">\n" +
                                            "// 1. Block popup redirects and unwanted new tabs\n" +
                                            "window.open = function() { return null; };\n" +
                                            "window.openNewTab = function() { return null; };\n" +
                                            "// 2. Playback State Broadcaster\n" +
                                            "(function setupDramacoolTracker() {\n" +
                                            "  function sendMsg(evt, cur, dur) {\n" +
                                            "    try {\n" +
                                            "      var payload = { type: 'dramacool', channel: 'dramacool', event: evt, currentTime: cur, duration: dur };\n" +
                                            "      if (window.parent && window.parent !== window) {\n" +
                                            "        window.parent.postMessage(payload, '*');\n" +
                                            "      }\n" +
                                            "      if (window.AndroidBridge && typeof window.AndroidBridge.onNativePlaybackState === 'function') {\n" +
                                            "        window.AndroidBridge.onNativePlaybackState(evt === 'timeupdate' || evt === 'play', cur, dur);\n" +
                                            "      }\n" +
                                            "    } catch(e) {}\n" +
                                            "  }\n" +
                                            "  function getInitialResumeTime() {\n" +
                                            "    try {\n" +
                                            "      var m = window.location.hash.match(/t=(\\d+)/) || window.location.search.match(/[?&]t=(\\d+)/);\n" +
                                            "      if (m && m[1]) return parseFloat(m[1]);\n" +
                                            "    } catch(e) {}\n" +
                                            "    return 0;\n" +
                                            "  }\n" +
                                            "  var initialSeekDone = false;\n" +
                                            "  var pollTimer = setInterval(function() {\n" +
                                            "    // Hook JWPlayer\n" +
                                            "    if (typeof jwplayer === 'function') {\n" +
                                            "      try {\n" +
                                            "        var p = jwplayer('vplayer') || (typeof jwplayer === 'function' ? jwplayer() : null);\n" +
                                            "        if (p && typeof p.on === 'function') {\n" +
                                            "          clearInterval(pollTimer);\n" +
                                            "          p.on('play', function() {\n" +
                                            "            sendMsg('play', p.getPosition() || 0, p.getDuration() || 0);\n" +
                                            "            if (!initialSeekDone) {\n" +
                                            "              var resume = getInitialResumeTime();\n" +
                                            "              if (resume > 0) {\n" +
                                            "                initialSeekDone = true;\n" +
                                            "                p.seek(resume);\n" +
                                            "              }\n" +
                                            "            }\n" +
                                            "          });\n" +
                                            "          p.on('time', function(e) {\n" +
                                            "            if (e.position > 0) {\n" +
                                            "              sendMsg('timeupdate', e.position, e.duration || 0);\n" +
                                            "            }\n" +
                                            "          });\n" +
                                            "          p.on('pause', function() {\n" +
                                            "            sendMsg('pause', p.getPosition() || 0, p.getDuration() || 0);\n" +
                                            "          });\n" +
                                            "          p.on('complete', function() {\n" +
                                            "            var dur = p.getDuration() || 0;\n" +
                                            "            sendMsg('ended', dur, dur);\n" +
                                            "          });\n" +
                                            "          return;\n" +
                                            "        }\n" +
                                            "      } catch(e) {}\n" +
                                            "    }\n" +
                                            "    // Hook HTML5 <video> tag fallback\n" +
                                            "    var v = document.querySelector('video');\n" +
                                            "    if (v) {\n" +
                                            "      clearInterval(pollTimer);\n" +
                                            "      v.addEventListener('playing', function() {\n" +
                                            "        sendMsg('play', v.currentTime || 0, v.duration || 0);\n" +
                                            "        if (!initialSeekDone) {\n" +
                                            "          var resume = getInitialResumeTime();\n" +
                                            "          if (resume > 0) {\n" +
                                            "            initialSeekDone = true;\n" +
                                            "            v.currentTime = resume;\n" +
                                            "          }\n" +
                                            "        }\n" +
                                            "      });\n" +
                                            "      v.addEventListener('timeupdate', function() {\n" +
                                            "        if (v.duration > 0 && v.currentTime > 0) {\n" +
                                            "          sendMsg('timeupdate', v.currentTime, v.duration);\n" +
                                            "        }\n" +
                                            "      });\n" +
                                            "      v.addEventListener('pause', function() {\n" +
                                            "        sendMsg('pause', v.currentTime || 0, v.duration || 0);\n" +
                                            "      });\n" +
                                            "      v.addEventListener('ended', function() {\n" +
                                            "        sendMsg('ended', v.duration || 0, v.duration || 0);\n" +
                                            "      });\n" +
                                            "    }\n" +
                                            "  }, 200);\n" +
                                            "})();\n" +
                                            "</script>\n";
                                        String cleanCss = "<style id=\"tmdb-vidmoly-clean\">\n" +
                                            "html, body { width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #000 !important; }\n" +
                                            "#vidmolyadblocktest, #lo_dlsm, #resume-overlay, .resume-container, .resume-progress-bar, .ad, .ads, [id*='banner'] { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; height: 0 !important; width: 0 !important; }\n" +
                                            "#vplayer, .jwplayer, video { width: 100vw !important; height: 100vh !important; max-width: 100vw !important; max-height: 100vh !important; position: absolute !important; inset: 0 !important; }\n" +
                                            "/* Center play / pause display notification icon on screen */\n" +
                                            ".jwplayer .jw-display-controls, .jw-display-controls { display: flex !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: 100% !important; position: absolute !important; inset: 0 !important; pointer-events: none !important; }\n" +
                                            ".jwplayer .jw-display-icon-container, .jw-display-icon-container { position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; margin: 0 !important; pointer-events: auto !important; }\n" +
                                            "</style>\n";
                                        html = html.replace("<head>", "<head>\n" + cleanCss + dramacoolTrackerScript);
                                        // Neutralize inline function that creates and displays the resume overlay
                                        html = html.replace("overlay.style.display = 'block';", "overlay.style.display = 'none';");
                                        html = html.replace("showResumeDialog(", "void(0);//");
                                        in = new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
                                    } catch (Exception e) {}
                                }
                                return new WebResourceResponse(
                                    mimeType,
                                    encoding,
                                    statusCode,
                                    conn.getResponseMessage() != null ? conn.getResponseMessage() : "OK",
                                    responseHeaders,
                                    in
                                );
                            } catch (Exception ignored) {}
                        }

                        // KissKH Embed Player Isolation & Anti-Hotlinking Shield
                        if (lower.contains("kisskh.do") && (lower.contains("/drama/") || lower.contains("/player")) && !lower.contains("/api/") && !lower.contains("/cdn-cgi/")) {
                            try {
                                URL url = new URL(rawUrl);
                                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                                conn.setRequestMethod(request.getMethod());
                                conn.setConnectTimeout(15000);
                                conn.setReadTimeout(15000);
                                Map<String, String> reqHeaders = request.getRequestHeaders();
                                if (reqHeaders != null) {
                                    for (Map.Entry<String, String> entry : reqHeaders.entrySet()) {
                                        String k = entry.getKey().toLowerCase();
                                        if (!k.equals("referer") && !k.equals("origin") && !k.equals("host") && !k.equals("user-agent")) {
                                            conn.setRequestProperty(entry.getKey(), entry.getValue());
                                        }
                                    }
                                }
                                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
                                conn.setRequestProperty("Referer", "https://kisskh.do/");
                                conn.setRequestProperty("Origin", "https://kisskh.do");

                                int statusCode = conn.getResponseCode();
                                String contentType = conn.getContentType();
                                String mimeType = "text/html";
                                String encoding = "UTF-8";
                                if (contentType != null) {
                                    String[] parts = contentType.split(";");
                                    mimeType = parts[0].trim();
                                }

                                Map<String, String> responseHeaders = new HashMap<>();
                                responseHeaders.put("Access-Control-Allow-Origin", "*");
                                responseHeaders.put("Access-Control-Allow-Headers", "*");
                                for (Map.Entry<String, java.util.List<String>> header : conn.getHeaderFields().entrySet()) {
                                    if (header.getKey() != null) {
                                        String hKey = header.getKey().toLowerCase();
                                        if (!hKey.equals("content-security-policy") && !hKey.equals("x-frame-options")) {
                                            responseHeaders.put(header.getKey(), TextUtils.join(", ", header.getValue()));
                                        }
                                    }
                                }

                                InputStream in = statusCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
                                if (mimeType != null && mimeType.contains("html") && statusCode < 400) {
                                    try {
                                        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                                        StringBuilder sb = new StringBuilder();
                                        String l;
                                        while ((l = reader.readLine()) != null) {
                                            sb.append(l).append("\n");
                                        }
                                        String html = sb.toString();
                                        
                                        // Show ONLY <app-watch> fullscreen, reset margin of main parent to 0, hide <mat-toolbar> & next episode button
                                        String isolatedCss = "<style id=\"tmdb-isolated-player\">\n" +
                                            "/* 1. Reset root & containers to 0 margin/padding */\n" +
                                            "html, body, app-root, mat-sidenav-container, mat-sidenav-content { width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #000 !important; }\n" +
                                            "/* 2. Set margin of <main> parent to 0 for all sides & remove min-height offset */\n" +
                                            "mat-sidenav-content > div, main:has(app-drama), main:has(router-outlet), mat-sidenav-content main { margin: 0 !important; padding: 0 !important; min-height: 100vh !important; height: 100vh !important; width: 100vw !important; }\n" +
                                            "/* 3. Hide mat-toolbar */\n" +
                                            "mat-toolbar, .mat-toolbar, app-footer, footer { display: none !important; height: 0 !important; max-height: 0 !important; visibility: hidden !important; margin: 0 !important; padding: 0 !important; }\n" +
                                            "/* 4. Hide Next Episode button in player */\n" +
                                            "#nextEP, [mattooltip='Next Episode'], button[routerlink*='Episode-'] { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }\n" +
                                            "/* 5. Hide all non-player sibling elements (info card, comments, related episodes, footer) */\n" +
                                            "app-drama > .row > div:not(:first-child), app-drama mat-card, app-drama .list, app-drama .action-btn, .comments, .comment-section, .related-list { display: none !important; height: 0 !important; visibility: hidden !important; margin: 0 !important; padding: 0 !important; }\n" +
                                            "/* 6. Stretch <app-watch>, <mat-video>, and videoplayer to fill fullscreen */\n" +
                                            "app-drama, app-drama > .row, app-drama > .row > div:first-child { width: 100vw !important; height: 100vh !important; max-width: 100vw !important; max-height: 100vh !important; flex: 0 0 100vw !important; margin: 0 !important; padding: 0 !important; }\n" +
                                            "app-watch, app-watch mat-video, app-watch .videoplayer, app-watch video, app-watch iframe, app-watch .embed-responsive, app-watch .embed-responsive-item { display: block !important; width: 100vw !important; height: 100vh !important; max-width: 100vw !important; max-height: 100vh !important; margin: 0 !important; padding: 0 !important; }\n" +
                                            "/* 7. Ensure mat-caption-button matches bottom control toolbar styling */\n" +
                                            ".videoplayer .controls .right mat-caption-button { display: inline-flex !important; align-items: center !important; justify-content: center !important; }\n" +
                                            "/* 8. Hide mat-fullscreen-button in player */\n" +
                                            "mat-fullscreen-button, .videoplayer mat-fullscreen-button { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; width: 0 !important; height: 0 !important; }\n" +
                                            "</style>\n";

                                        String injectScript = "<script>\n" +
                                            "window.open = function() { return null; };\n" +
                                            "window.openNewTab = function() { return null; };\n" +
                                            "// 1. Move <mat-caption-button> next to <mat-quality-control>\n" +
                                            "(function moveCaptionBtn() {\n" +
                                            "  var timer = setInterval(function() {\n" +
                                            "    var caption = document.querySelector('mat-caption-button');\n" +
                                            "    var quality = document.querySelector('mat-quality-control');\n" +
                                            "    if (caption && quality && quality.parentElement) {\n" +
                                            "      if (caption.parentElement !== quality.parentElement) {\n" +
                                            "        quality.parentElement.insertBefore(caption, quality);\n" +
                                            "      }\n" +
                                            "    }\n" +
                                            "  }, 200);\n" +
                                            "})();\n" +
                                            "// 2. Playback Observer & Seek Bridge for Progress Tracking\n" +
                                            "(function setupKisskhBridge() {\n" +
                                            "  var attachedVideo = null;\n" +
                                            "  var initialSeekDone = false;\n" +
                                            "  function getInitialResumeTime() {\n" +
                                            "    try {\n" +
                                            "      var match = window.location.hash.match(/t=(\\d+)/) || window.location.search.match(/[?&]t=(\\d+)/);\n" +
                                            "      if (match && match[1]) return parseFloat(match[1]);\n" +
                                            "    } catch (e) {}\n" +
                                            "    return 0;\n" +
                                            "  }\n" +
                                            "  function sendMsg(evt, cur, dur) {\n" +
                                            "    try {\n" +
                                            "      var payload = { type: 'kisskh', channel: 'kisskh', event: evt, currentTime: cur, duration: dur };\n" +
                                            "      if (window.parent && window.parent !== window) {\n" +
                                            "        window.parent.postMessage(payload, '*');\n" +
                                            "      }\n" +
                                            "      if (window.AndroidBridge && typeof window.AndroidBridge.onNativePlaybackState === 'function') {\n" +
                                            "        window.AndroidBridge.onNativePlaybackState(evt === 'timeupdate' || evt === 'play', cur, dur);\n" +
                                            "      }\n" +
                                            "    } catch (e) {}\n" +
                                            "  }\n" +
                                            "  function attach(v) {\n" +
                                            "    if (!v || v === attachedVideo) return;\n" +
                                            "    attachedVideo = v;\n" +
                                            "    v.addEventListener('timeupdate', function() {\n" +
                                            "      if (v.duration > 0 && v.currentTime > 0) {\n" +
                                            "        sendMsg('timeupdate', v.currentTime, v.duration);\n" +
                                            "      }\n" +
                                            "    });\n" +
                                            "    v.addEventListener('playing', function() {\n" +
                                            "      sendMsg('play', v.currentTime, v.duration || 0);\n" +
                                            "      if (!initialSeekDone) {\n" +
                                            "        var resumeTime = getInitialResumeTime();\n" +
                                            "        if (resumeTime !== null && resumeTime >= 0) {\n" +
                                            "          initialSeekDone = true;\n" +
                                            "          v.currentTime = resumeTime;\n" +
                                            "        }\n" +
                                            "      }\n" +
                                            "    });\n" +
                                            "    v.addEventListener('pause', function() {\n" +
                                            "      sendMsg('pause', v.currentTime, v.duration || 0);\n" +
                                            "    });\n" +
                                            "    v.addEventListener('ended', function() {\n" +
                                            "      sendMsg('ended', v.duration || v.currentTime, v.duration || v.currentTime);\n" +
                                            "    });\n" +
                                            "  }\n" +
                                            "  window.addEventListener('message', function(e) {\n" +
                                            "    try {\n" +
                                            "      var d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;\n" +
                                            "      if (d && (d.type === 'seek' || d.type === 'SEEK' || d.event === 'seek') && (d.time !== undefined && d.time !== null)) {\n" +
                                            "        var target = parseFloat(d.time);\n" +
                                            "        var vid = attachedVideo || document.querySelector('video');\n" +
                                            "        if (vid && !isNaN(target) && target >= 0) {\n" +
                                            "          initialSeekDone = true;\n" +
                                            "          vid.currentTime = target;\n" +
                                            "        }\n" +
                                            "      }\n" +
                                            "    } catch (e) {}\n" +
                                            "  });\n" +
                                            "  setInterval(function() {\n" +
                                            "    var vid = document.querySelector('video');\n" +
                                            "    if (vid && vid !== attachedVideo) attach(vid);\n" +
                                            "  }, 500);\n" +
                                            "})();\n" +
                                            "</script>\n";

                                        html = html.replace("<head>", "<head>\n" + isolatedCss + injectScript);
                                        in = new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
                                    } catch (Exception e) {}
                                }

                                return new WebResourceResponse(
                                    mimeType,
                                    encoding,
                                    statusCode,
                                    conn.getResponseMessage() != null ? conn.getResponseMessage() : "OK",
                                    responseHeaders,
                                    in
                                );
                            } catch (Exception ignored) {}
                        }

                        // Note: KissKH video streams (.ts, .m3u8) are NOT intercepted here.
                        // When played inside an <iframe>, the iframe's native browser context handles
                        // all HLS byte-ranges, cookies, and Cloudflare streaming directly without middleman stalls.

                        // MegaPlay Anti-Hotlinking Shield: Inject required Referer/Origin headers
                        if (lower.contains("megaplay.buzz") || lower.contains("imgnex.top")) {
                            try {
                                URL url = new URL(rawUrl);
                                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                                conn.setRequestMethod(request.getMethod());
                                Map<String, String> reqHeaders = request.getRequestHeaders();
                                if (reqHeaders != null) {
                                    for (Map.Entry<String, String> entry : reqHeaders.entrySet()) {
                                        conn.setRequestProperty(entry.getKey(), entry.getValue());
                                    }
                                }
                                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36");
                                conn.setRequestProperty("Referer", "https://megaplay.buzz/");
                                conn.setRequestProperty("Origin", "https://megaplay.buzz");

                                int statusCode = conn.getResponseCode();
                                String contentType = conn.getContentType();
                                String mimeType = "text/html";
                                String encoding = "UTF-8";
                                if (contentType != null) {
                                    String[] parts = contentType.split(";");
                                    mimeType = parts[0].trim();
                                }

                                Map<String, String> responseHeaders = new HashMap<>();
                                responseHeaders.put("Access-Control-Allow-Origin", "*");
                                responseHeaders.put("Access-Control-Allow-Headers", "*");

                                InputStream in = statusCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
                                return new WebResourceResponse(
                                    mimeType,
                                    encoding,
                                    statusCode,
                                    conn.getResponseMessage() != null ? conn.getResponseMessage() : "OK",
                                    responseHeaders,
                                    in
                                );
                            } catch (Exception ignored) {}
                        }

                        // CineSrc CSS Interceptor: Append hide rules directly to CineSrc stylesheets
                        // This bypasses Same-Origin Policy completely and does NOT affect HTML or API tokens!
                        if (lower.contains("cinesrc.st") && lower.contains(".css")) {
                            try {
                                URL url = new URL(rawUrl);
                                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                                conn.setRequestMethod(request.getMethod());
                                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
                                conn.setRequestProperty("Referer", "https://cinesrc.st/");
                                int statusCode = conn.getResponseCode();
                                InputStream in = statusCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
                                if (in != null && statusCode < 400) {
                                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                    byte[] buffer = new byte[8192];
                                    int len;
                                    while ((len = in.read(buffer)) != -1) {
                                        baos.write(buffer, 0, len);
                                    }
                                    in.close();
                                    String extraCss = "\n#base-ui-_r_8_, [id='base-ui-_r_8_'] { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important; max-width: 0 !important; max-height: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }\n";
                                    baos.write(extraCss.getBytes(StandardCharsets.UTF_8));
                                    Map<String, String> headers = new HashMap<>();
                                    headers.put("Access-Control-Allow-Origin", "*");
                                    return new WebResourceResponse(
                                        "text/css",
                                        "UTF-8",
                                        200,
                                        "OK",
                                        headers,
                                        new ByteArrayInputStream(baos.toByteArray())
                                    );
                                }
                            } catch (Exception ignored) {}
                        }

                        // VidLink Auto-Unmute Injector (Option A)
                        // Intercepts vidlink.pro HTML pages and injects a script that:
                        // 1. Pre-sets mediaSettings localStorage to {volume:1, muted:false} before Vidstack reads it
                        // 2. Polls every 500ms to click the mute button if the player initializes muted
                        if (lower.contains("vidlink.pro") && !lower.contains(".js") && !lower.contains(".css")
                                && !lower.contains(".png") && !lower.contains(".jpg") && !lower.contains(".svg")
                                && !lower.contains(".woff") && !lower.contains(".ico") && !lower.contains(".json")
                                && !lower.contains(".m3u8") && !lower.contains(".ts") && !lower.contains(".mp4")) {
                            try {
                                URL url = new URL(rawUrl);
                                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                                conn.setRequestMethod(request.getMethod());
                                conn.setConnectTimeout(12000);
                                conn.setReadTimeout(15000);
                                Map<String, String> reqHeaders = request.getRequestHeaders();
                                if (reqHeaders != null) {
                                    for (Map.Entry<String, String> entry : reqHeaders.entrySet()) {
                                        String k = entry.getKey().toLowerCase();
                                        if (!k.equals("host")) {
                                            conn.setRequestProperty(entry.getKey(), entry.getValue());
                                        }
                                    }
                                }
                                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
                                String vidlinkCookie = android.webkit.CookieManager.getInstance().getCookie(rawUrl);
                                if (vidlinkCookie != null && !vidlinkCookie.isEmpty()) {
                                    conn.setRequestProperty("Cookie", vidlinkCookie);
                                }

                                int statusCode = conn.getResponseCode();
                                String contentType = conn.getContentType();
                                String mimeType = "text/html";
                                String encoding = "UTF-8";
                                if (contentType != null) {
                                    String[] parts = contentType.split(";");
                                    mimeType = parts[0].trim();
                                    for (String part : parts) {
                                        if (part.trim().toLowerCase().startsWith("charset=")) {
                                            encoding = part.trim().substring(8).trim();
                                        }
                                    }
                                }

                                // Store cookies from response
                                for (Map.Entry<String, java.util.List<String>> header : conn.getHeaderFields().entrySet()) {
                                    if (header.getKey() != null && header.getKey().equalsIgnoreCase("set-cookie")) {
                                        for (String cookieVal : header.getValue()) {
                                            android.webkit.CookieManager.getInstance().setCookie(rawUrl, cookieVal);
                                        }
                                    }
                                }

                                InputStream in = statusCode >= 400 ? conn.getErrorStream() : conn.getInputStream();
                                if (in != null && mimeType != null && mimeType.contains("html") && statusCode < 400) {
                                    try {
                                        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                                        StringBuilder sb = new StringBuilder();
                                        String l;
                                        while ((l = reader.readLine()) != null) {
                                            sb.append(l).append("\n");
                                        }
                                        String html = sb.toString();

                                        // Auto-unmute injection script for VidLink (Vidstack player)
                                        // Runs BEFORE Next.js hydration so localStorage is pre-set before player reads it
                                        String vidlinkUnmuteScript = "<script>\n" +
                                            "(function() {\n" +
                                            "  // 1. Pre-set VidLink mediaSettings in localStorage BEFORE Vidstack reads it\n" +
                                            "  try {\n" +
                                            "    var ms = { volume: 1, muted: false, lang: 'English', captions: false };\n" +
                                            "    localStorage.setItem('mediaSettings', JSON.stringify(ms));\n" +
                                            "    console.log('[TMDB] VidLink mediaSettings pre-set to unmuted');\n" +
                                            "  } catch(e) {}\n" +
                                            "\n" +
                                            "  // 2. Poll every 500ms to click mute button if player initializes muted\n" +
                                            "  var vidlinkUnmuteTimer = setInterval(function() {\n" +
                                            "    try {\n" +
                                            "      // Re-enforce localStorage every poll cycle in case player resets it\n" +
                                            "      var stored = localStorage.getItem('mediaSettings');\n" +
                                            "      if (!stored) {\n" +
                                            "        localStorage.setItem('mediaSettings', JSON.stringify({ volume: 1, muted: false, lang: 'English', captions: false }));\n" +
                                            "      } else {\n" +
                                            "        try {\n" +
                                            "          var parsed = JSON.parse(stored);\n" +
                                            "          if (parsed.muted !== false || parsed.volume !== 1) {\n" +
                                            "            parsed.muted = false;\n" +
                                            "            parsed.volume = 1;\n" +
                                            "            localStorage.setItem('mediaSettings', JSON.stringify(parsed));\n" +
                                            "          }\n" +
                                            "        } catch(pe) {}\n" +
                                            "      }\n" +
                                            "\n" +
                                            "      // Click the mute button if it is in muted state\n" +
                                            "      var muteBtn = document.querySelector('button[data-media-mute-button][data-state=\"muted\"]');\n" +
                                            "      if (muteBtn) {\n" +
                                            "        muteBtn.click();\n" +
                                            "        console.log('[TMDB] VidLink mute button clicked to unmute');\n" +
                                            "      }\n" +
                                            "\n" +
                                            "      // Also directly set video element muted=false and volume=1 if accessible\n" +
                                            "      var videos = document.querySelectorAll('video');\n" +
                                            "      videos.forEach(function(v) {\n" +
                                            "        if (v.muted) {\n" +
                                            "          v.muted = false;\n" +
                                            "          v.volume = 1.0;\n" +
                                            "          console.log('[TMDB] VidLink video element unmuted directly');\n" +
                                            "        }\n" +
                                            "      });\n" +
                                            "    } catch(e) {}\n" +
                                            "  }, 500);\n" +
                                            "\n" +
                                            "  // 3. Stop aggressive polling after 30s (player should be initialized by then)\n" +
                                            "  setTimeout(function() {\n" +
                                            "    clearInterval(vidlinkUnmuteTimer);\n" +
                                            "    // Start a lighter maintenance poll every 5s for unmute persistence\n" +
                                            "    setInterval(function() {\n" +
                                            "      try {\n" +
                                            "        var muteBtn = document.querySelector('button[data-media-mute-button][data-state=\"muted\"]');\n" +
                                            "        if (muteBtn) muteBtn.click();\n" +
                                            "        var videos = document.querySelectorAll('video');\n" +
                                            "        videos.forEach(function(v) { if (v.muted) { v.muted = false; v.volume = 1.0; } });\n" +
                                            "      } catch(e) {}\n" +
                                            "    }, 5000);\n" +
                                            "  }, 30000);\n" +
                                            "})();\n" +
                                            "</script>\n";

                                        // Inject as the very FIRST script in <head> so it runs before Next.js bundles
                                        if (html.contains("<head>")) {
                                            html = html.replace("<head>", "<head>\n" + vidlinkUnmuteScript);
                                        } else if (html.contains("<HEAD>")) {
                                            html = html.replace("<HEAD>", "<HEAD>\n" + vidlinkUnmuteScript);
                                        } else {
                                            // No <head> tag found — inject at top of body
                                            html = vidlinkUnmuteScript + html;
                                        }
                                        in = new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
                                        Log.i("TMDB_APP", "[VidLink] Auto-unmute script injected for: " + rawUrl);
                                    } catch (Exception e) {
                                        Log.w("TMDB_APP", "[VidLink] Script injection failed: " + e.getMessage());
                                    }
                                }

                                Map<String, String> responseHeaders = new HashMap<>();
                                responseHeaders.put("Access-Control-Allow-Origin", "*");
                                responseHeaders.put("Access-Control-Allow-Headers", "*");
                                for (Map.Entry<String, java.util.List<String>> header : conn.getHeaderFields().entrySet()) {
                                    if (header.getKey() != null) {
                                        String hKey = header.getKey().toLowerCase();
                                        if (!hKey.equals("content-security-policy") && !hKey.equals("x-frame-options")) {
                                            responseHeaders.put(header.getKey(), TextUtils.join(", ", header.getValue()));
                                        }
                                    }
                                }
                                return new WebResourceResponse(
                                    mimeType,
                                    encoding,
                                    statusCode,
                                    conn.getResponseMessage() != null ? conn.getResponseMessage() : "OK",
                                    responseHeaders,
                                    in
                                );
                            } catch (Exception e) {
                                Log.w("TMDB_APP", "[VidLink] Intercept error: " + e.getMessage());
                            }
                        }

                        // Stealth 200 OK Ad/Tracker Interceptor (returns 0-byte dummy JS/CSS so anti-adblock detection never triggers)
                        if (isAdOrTrackerUrl(lower)) {
                            String mimeType = lower.contains(".css") ? "text/css" : "application/javascript";
                            return new WebResourceResponse(
                                mimeType,
                                "UTF-8",
                                200,
                                "OK",
                                new java.util.HashMap<>(),
                                new ByteArrayInputStream("".getBytes(StandardCharsets.UTF_8))
                            );
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
                        "  function hideCineSrcEpisodeBtn() {" +
                        "    try {" +
                        "      document.querySelectorAll('iframe').forEach(function(frame) {" +
                        "        try {" +
                        "          var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);" +
                        "          if (doc && !doc.__tmdb_cinesrc_styled) {" +
                        "            var loc = (frame.contentWindow && frame.contentWindow.location ? frame.contentWindow.location.href : '') || (frame.src || '');" +
                        "            if (loc.indexOf('cinesrc') !== -1) {" +
                        "              doc.__tmdb_cinesrc_styled = true;" +
                        "              var st = doc.createElement('style');" +
                        "              st.id = 'tmdb-hide-cinesrc-episodes';" +
                        "              st.textContent = \"#base-ui-_r_8_, [id='base-ui-_r_8_'] { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important; max-width: 0 !important; max-height: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }\";" +
                        "              (doc.head || doc.documentElement).appendChild(st);" +
                        "            }" +
                        "          }" +
                        "        } catch(e) {}" +
                        "      });" +
                        "    } catch(e) {}" +
                        "  }" +
                        "  monitorMedia();" +
                        "  hideCineSrcEpisodeBtn();" +
                        "  setInterval(function() {" +
                        "    monitorMedia();" +
                        "    hideCineSrcEpisodeBtn();" +
                        "  }, 1000);" +
                        "})();";
                    view.evaluateJavascript(mediaMonitorScript, null);
                }
            });

            // Handle cold-start deep link intent (if app was launched directly via tmdbstream://)
            handleDeepLinkIntent(getIntent());
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
        if (!isSimulatingTouch && !isTV() && ev.getAction() == MotionEvent.ACTION_DOWN && isWatchPageActive) {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_screen_touched'));", null);
            }
        }
        return super.dispatchTouchEvent(ev);
    }



    private long lastDpadCenterTime = 0;
    private long lastOkPressTime = 0;

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            Log.i("TMDB_APP", "[Native Key] keyCode=" + keyCode + " isTV=" + isTV() + " isWatchPageActive=" + isWatchPageActive);

            // Synchronously consume Back key if any dropdown is open anywhere in the app
            if (keyCode == KeyEvent.KEYCODE_BACK && isDropdownOpen) {
                Log.i("TMDB_APP", "[Native Key] Back key consumed by open dropdown");
                isDropdownOpen = false;
                WebView webView = bridge.getWebView();
                if (webView != null) {
                    webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_close_dropdowns'));", null);
                }
                return true; // Completely consumed, do NOT exit page!
            }

            if (isTV() && isWatchPageActive) {
                WebView webView = bridge.getWebView();

                // If any dropdown is currently open on the Watch page, directly dispatch navigation events
                if (isDropdownOpen) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                        if (webView != null) {
                            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_dropdown_nav', { detail: { direction: 'down' } }));", null);
                        }
                        return true;
                    }
                    if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                        if (webView != null) {
                            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_dropdown_nav', { detail: { direction: 'up' } }));", null);
                        }
                        return true;
                    }
                    if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                        if (webView != null) {
                            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_dropdown_select'));", null);
                        }
                        return true;
                    }
                    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_BACK) {
                        isDropdownOpen = false;
                        if (webView != null) {
                            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_close_dropdowns'));", null);
                        }
                        return true;
                    }
                    return true;
                }

                // If Virtual Cursor is active, completely intercept D-Pad movement, OK clicks, and Back key
                if (isVirtualCursorActive) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_UP || keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
                        keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        if (webView != null) {
                            String dir = keyCode == KeyEvent.KEYCODE_DPAD_UP ? "Up" :
                                         keyCode == KeyEvent.KEYCODE_DPAD_DOWN ? "Down" :
                                         keyCode == KeyEvent.KEYCODE_DPAD_LEFT ? "Left" : "Right";
                            webView.evaluateJavascript(
                                String.format("window.dispatchEvent(new CustomEvent('tmdb_cursor_move', { detail: { direction: '%s' } }));", dir),
                                null
                            );
                        }
                        return true; // CONSUMED: Prevents WebView and iframe from moving native focus!
                    }

                    if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                        long now = SystemClock.uptimeMillis();
                        boolean isDoublePress = (now - lastOkPressTime < 650);
                        lastOkPressTime = now;

                        if (webView != null) {
                            if (isDoublePress) {
                                isVirtualCursorActive = false;
                                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_close_cursor'));", null);
                            } else {
                                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_cursor_click'));", null);
                            }
                        }
                        return true; // CONSUMED: Prevents direct player click toggling
                    }

                    if (keyCode == KeyEvent.KEYCODE_BACK) {
                        isVirtualCursorActive = false;
                        if (webView != null) {
                            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('tmdb_close_cursor'));", null);
                        }
                        return true; // CONSUMED: Dismiss cursor without leaving Watch page
                    }
                }

                if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                    if (webView != null) {
                        webView.evaluateJavascript(
                            "(function() {" +
                            "  if (window.__tmdbVirtualCursorActive) return false;" +
                            "  var header = document.querySelector('[data-watch-header=\"true\"]');" +
                            "  var isHeaderFocused = !!window.__tmdbHeaderFocused || (header && header.contains(document.activeElement));" +
                            "  if (!isHeaderFocused) return false;" +
                            "  var backBtn = document.getElementById('watch-back-btn');" +
                            "  var nextBtn = document.getElementById('watch-next-ep-btn');" +
                            "  var trigger = document.getElementById('watch-provider-trigger');" +
                            "  var active = document.activeElement;" +
                            "  if (active === backBtn) {" +
                            "    if (nextBtn) {" +
                            "      nextBtn.focus();" +
                            "    } else if (trigger) {" +
                            "      trigger.focus();" +
                            "    }" +
                            "    window.dispatchEvent(new CustomEvent('tmdb_reset_header_timer'));" +
                            "    return true;" +
                            "  } else if (active === nextBtn) {" +
                            "    if (trigger) {" +
                            "      trigger.focus();" +
                            "      window.dispatchEvent(new CustomEvent('tmdb_reset_header_timer'));" +
                            "      return true;" +
                            "    }" +
                            "  }" +
                            "  return false;" +
                            "})();",
                            null
                        );
                        return true;
                    }
                    return super.dispatchKeyEvent(event);
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                    if (webView != null) {
                        webView.evaluateJavascript(
                            "(function() {" +
                            "  if (window.__tmdbVirtualCursorActive) return false;" +
                            "  var header = document.querySelector('[data-watch-header=\"true\"]');" +
                            "  var isHeaderFocused = !!window.__tmdbHeaderFocused || (header && header.contains(document.activeElement));" +
                            "  if (!isHeaderFocused) return false;" +
                            "  var backBtn = document.getElementById('watch-back-btn');" +
                            "  var nextBtn = document.getElementById('watch-next-ep-btn');" +
                            "  var trigger = document.getElementById('watch-provider-trigger');" +
                            "  var active = document.activeElement;" +
                            "  if (active === trigger) {" +
                            "    if (nextBtn) {" +
                            "      nextBtn.focus();" +
                            "    } else if (backBtn) {" +
                            "      backBtn.focus();" +
                            "    }" +
                            "    window.dispatchEvent(new CustomEvent('tmdb_reset_header_timer'));" +
                            "    return true;" +
                            "  } else if (active === nextBtn) {" +
                            "    if (backBtn) {" +
                            "      backBtn.focus();" +
                            "      window.dispatchEvent(new CustomEvent('tmdb_reset_header_timer'));" +
                            "      return true;" +
                            "    }" +
                            "  }" +
                            "  return false;" +
                            "})();",
                            null
                        );
                        return true;
                    }
                    return super.dispatchKeyEvent(event);
                }

                // Allow repeated presses for media scrub keys on remote so user can scrub the timeline
                if (keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || keyCode == KeyEvent.KEYCODE_MEDIA_REWIND ||
                    keyCode == KeyEvent.KEYCODE_MEDIA_STEP_FORWARD || keyCode == KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD) {
                    return super.dispatchKeyEvent(event);
                }

                // Drop auto-repeated key events only for single-action triggers like OK/Center and Back
                if (event.getRepeatCount() > 0) {
                    return true;
                }

                if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                    long now = SystemClock.uptimeMillis();
                    boolean isDoublePress = (now - lastOkPressTime < 650);
                    lastOkPressTime = now;

                    if (webView != null) {
                        webView.evaluateJavascript(
                            String.format(
                                "(function() {" +
                                "  if (window.__tmdbVirtualCursorActive) {" +
                                "    if (%b) {" +
                                "      window.dispatchEvent(new CustomEvent('tmdb_close_cursor'));" +
                                "    } else {" +
                                "      window.dispatchEvent(new CustomEvent('tmdb_cursor_click'));" +
                                "    }" +
                                "    return true;" +
                                "  }" +
                                "  var active = document.activeElement;" +
                                "  var isInteractive = active && active !== document.body && active !== document.documentElement && (" +
                                "    active.tagName === 'BUTTON' || active.tagName === 'A' || active.tagName === 'INPUT' ||" +
                                "    active.getAttribute('role') === 'button' || active.classList.contains('tv-focus-target') ||" +
                                "    active.dataset?.watchHeaderItem === 'true' || active.dataset?.providerItem === 'true' || active.id === 'watch-provider-trigger'" +
                                "  );" +
                                "  if (isInteractive) {" +
                                "    if (typeof active.click === 'function') {" +
                                "      active.click();" +
                                "      return true;" +
                                "    }" +
                                "  }" +
                                "  var isHeaderFocused = !!window.__tmdbHeaderFocused;" +
                                "  if (!isHeaderFocused) {" +
                                "    if (%b) {" +
                                "      window.dispatchEvent(new CustomEvent('tmdb_toggle_cursor'));" +
                                "    } else {" +
                                "      if (typeof window.AndroidBridge !== 'undefined' && typeof window.AndroidBridge.simulateTouchAt === 'function') {" +
                                "        window.AndroidBridge.simulateTouchAt(window.innerWidth / 2, window.innerHeight / 2);" +
                                "      }" +
                                "    }" +
                                "  }" +
                                "  return false;" +
                                "})()", isDoublePress, isDoublePress),
                            null
                        );
                        return true;
                    }
                    return super.dispatchKeyEvent(event);
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    if (webView != null) {
                        webView.evaluateJavascript(
                            "(function() {" +
                            "  if (window.__tmdbVirtualCursorActive) return false;" +
                            "  var header = document.querySelector('[data-watch-header=\"true\"]');" +
                            "  var isHeaderFocused = !!window.__tmdbHeaderFocused || (header && header.contains(document.activeElement));" +
                            "  if (isHeaderFocused) {" +
                            "    window.dispatchEvent(new CustomEvent('tmdb_hide_header_and_focus_player'));" +
                            "    return true;" +
                            "  }" +
                            "  return false;" +
                            "})();",
                            null
                        );
                        return true;
                    }
                    return super.dispatchKeyEvent(event);
                } else if (keyCode == KeyEvent.KEYCODE_BACK) {
                    if (webView != null) {
                        webView.evaluateJavascript(
                            "(function() {" +
                            "  if (window.__tmdbVirtualCursorActive) {" +
                            "    window.__tmdbVirtualCursorActive = false;" +
                            "    window.dispatchEvent(new CustomEvent('tmdb_close_cursor'));" +
                            "    return 'CLOSED_CURSOR';" +
                            "  }" +
                            "  var header = document.querySelector('[data-watch-header=\"true\"]');" +
                            "  var dropdown = header ? header.querySelector('[data-provider-dropdown-open=\"true\"]') : null;" +
                            "  if (dropdown) {" +
                            "    window.dispatchEvent(new CustomEvent('tmdb_close_dropdowns'));" +
                            "    var trigger = document.getElementById('watch-provider-trigger');" +
                            "    if (trigger) { trigger.focus(); }" +
                            "    return 'CLOSED_DROPDOWN';" +
                            "  }" +
                            "  var isHeaderFocused = !!window.__tmdbHeaderFocused || (header && header.contains(document.activeElement));" +
                            "  var backBtn = document.getElementById('watch-back-btn') || (header ? header.querySelector('[data-watch-back=\"true\"], [data-watch-header-item=\"true\"]') : null);" +
                            "  if (!isHeaderFocused) {" +
                            "    window.__tmdbHeaderFocused = true;" +
                            "    window.dispatchEvent(new CustomEvent('tmdb_show_header_focus_back'));" +
                            "    if (backBtn) { backBtn.focus(); }" +
                            "    setTimeout(function() { if (backBtn) { backBtn.focus(); } }, 50);" +
                            "    return 'FOCUSED_HEADER';" +
                            "  } else {" +
                            "    window.__tmdbHeaderFocused = false;" +
                            "    if (typeof window.tmdbExitWatch === 'function') {" +
                            "      window.tmdbExitWatch();" +
                            "    } else {" +
                            "      window.dispatchEvent(new CustomEvent('tmdb_exit_watch'));" +
                            "      if (backBtn && typeof backBtn.click === 'function') { backBtn.click(); }" +
                            "    }" +
                            "    return 'EXITED_WATCH';" +
                            "  }" +
                            "})();",
                            null
                        );
                        return true;
                    }
                    return super.dispatchKeyEvent(event);
                }
            }
        }

        if (isTV() && !isWatchPageActive && event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                if (event.getRepeatCount() > 0) return true;
                WebView webView = bridge.getWebView();
                if (webView != null) {
                    webView.evaluateJavascript(
                        "(function() {" +
                        "  var active = document.activeElement;" +
                        "  console.log('[TMDB Streamer] Enter pressed! activeElement:', active ? (active.tagName + '#' + active.id + ' text: ' + (active.textContent || '').trim().substring(0, 30)) : 'null');" +
                        "  if (active && active !== document.body && active !== document.documentElement) {" +
                        "    if (typeof active.click === 'function') {" +
                        "      active.click();" +
                        "      return true;" +
                        "    }" +
                        "  }" +
                        "  return false;" +
                        "})()",
                        null
                    );
                    return true;
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void promptInstallApk(File apkFile) {
        try {
            if (apkFile == null || !apkFile.exists()) {
                Log.e("TMDB_APP", "[Update] APK file does not exist: " + (apkFile != null ? apkFile.getAbsolutePath() : "null"));
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    Log.w("TMDB_APP", "[Update] Prompting user for ACTION_MANAGE_UNKNOWN_APP_SOURCES");
                    Intent manageIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    manageIntent.setData(Uri.parse("package:" + getPackageName()));
                    manageIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(manageIntent);
                }
            }

            Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                apkFile
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            
            // Explicitly grant read URI permission
            grantUriPermission(getPackageName(), apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);

            startActivity(intent);
        } catch (Exception e) {
            Log.e("TMDB_APP", "[Update] Failed to launch package installer: " + e.getMessage(), e);
        }
    }

    private File getPersistentBackupFile(boolean createDirs) {
        try {
            // Target 1: Public Documents directory (/sdcard/Documents/TMDBStreamer/)
            File docsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
            if (docsDir != null) {
                File appDir = new File(docsDir, "TMDBStreamer");
                if (createDirs && !appDir.exists()) {
                    appDir.mkdirs();
                }
                if (appDir.exists() || createDirs) {
                    return new File(appDir, "tmdb_backup.json");
                }
            }

            // Target 2: Public Download directory (/sdcard/Download/TMDBStreamer/)
            File downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (downloadDir != null) {
                File appDir = new File(downloadDir, "TMDBStreamer");
                if (createDirs && !appDir.exists()) {
                    appDir.mkdirs();
                }
                if (appDir.exists() || createDirs) {
                    return new File(appDir, "tmdb_backup.json");
                }
            }

            // Fallback: App-scoped external files directory
            File extFilesDir = getExternalFilesDir(null);
            if (extFilesDir != null) {
                if (createDirs && !extFilesDir.exists()) {
                    extFilesDir.mkdirs();
                }
                return new File(extFilesDir, "tmdb_backup.json");
            }
        } catch (Exception e) {
            Log.e("TMDB_APP", "[PersistentStorage] Error resolving backup file: " + e.getMessage(), e);
        }
        return null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLinkIntent(intent);
    }

    private void handleDeepLinkIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null) {
            String scheme = data.getScheme();
            String host = data.getHost();
            boolean isTmdbStreamScheme = "tmdbstream".equalsIgnoreCase(scheme);
            boolean isTmdbWebLink = "https".equalsIgnoreCase(scheme) && 
                (host != null && (host.equalsIgnoreCase("themoviedb.org") || host.equalsIgnoreCase("www.themoviedb.org")));

            if (isTmdbStreamScheme || isTmdbWebLink) {
                String uriStr = data.toString();
                Log.i("TMDB_APP", "[DeepLink] Received deep link: " + uriStr);
                runOnUiThread(() -> {
                    WebView wv = this.bridge != null ? this.bridge.getWebView() : null;
                    if (wv != null) {
                        dispatchDeepLinkToWeb(wv, uriStr);
                    } else {
                        // Retry briefly if webview is still initializing
                        getWindow().getDecorView().postDelayed(() -> {
                            WebView retryWv = bridge != null ? bridge.getWebView() : null;
                            if (retryWv != null) {
                                dispatchDeepLinkToWeb(retryWv, uriStr);
                            }
                        }, 500);
                    }
                });
            }
        }
    }

    private void dispatchDeepLinkToWeb(WebView wv, String uriStr) {
        String jsDispatch = String.format(
            "window.dispatchEvent(new CustomEvent('tmdb_deep_link', { detail: { url: '%s' } }));",
            uriStr.replace("'", "\\'")
        );
        wv.evaluateJavascript(jsDispatch, null);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (orientationListener != null) {
            orientationListener.disable();
        }
    }
}



