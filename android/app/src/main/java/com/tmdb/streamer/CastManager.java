package com.tmdb.streamer;

import android.app.Activity;
import android.net.Uri;
import android.util.Log;
import androidx.mediarouter.app.MediaRouteChooserDialog;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.MediaSeekOptions;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManager;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import com.google.android.gms.common.images.WebImage;
import android.os.Looper;
import org.json.JSONObject;
import java.util.concurrent.Callable;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;

/**
 * Native Google Cast for direct streams (TGStrm). Every public method is safe to call on
 * devices without Google Play Services: they just report "not available".
 */
public class CastManager {
    private static final String TAG = "TMDB_CAST";

    private final Activity activity;
    private CastContext castContext;
    private SessionManager sessionManager;

    // Media waiting for the user to pick a device
    private String pendingUrl, pendingTitle, pendingType, pendingPoster;
    private long pendingPosMs;
    private boolean hasPending = false;
    private int lastLoggedState = -1;

    private final SessionManagerListener<CastSession> listener = new SessionManagerListener<CastSession>() {
        @Override public void onSessionStarted(CastSession s, String id) { loadPending(s); }
        @Override public void onSessionResumed(CastSession s, boolean wasSuspended) { loadPending(s); }
        @Override public void onSessionStarting(CastSession s) {}
        @Override public void onSessionStartFailed(CastSession s, int e) { hasPending = false; }
        @Override public void onSessionEnding(CastSession s) {}
        @Override public void onSessionEnded(CastSession s, int e) { hasPending = false; }
        @Override public void onSessionResuming(CastSession s, String id) {}
        @Override public void onSessionResumeFailed(CastSession s, int e) {}
        @Override public void onSessionSuspended(CastSession s, int reason) {}
    };

    public CastManager(Activity activity) {
        this.activity = activity;
    }

    public void init() {
        try {
            castContext = CastContext.getSharedInstance(activity);
            sessionManager = castContext.getSessionManager();
            sessionManager.addSessionManagerListener(listener, CastSession.class);
        } catch (Throwable t) {
            Log.w(TAG, "Cast unavailable: " + t);
            castContext = null;
            sessionManager = null;
        }
    }

    public void release() {
        try {
            if (sessionManager != null) sessionManager.removeSessionManagerListener(listener, CastSession.class);
        } catch (Throwable ignored) {}
    }

    public boolean isAvailable() {
        return castContext != null;
    }

    /** Cast SDK calls must run on the main thread; bridge methods arrive on a WebView thread. */
    private <T> T onMain(Callable<T> job, T fallback) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            try { return job.call(); } catch (Throwable t) { Log.w(TAG, "main call failed: " + t); return fallback; }
        }
        FutureTask<T> task = new FutureTask<>(job);
        activity.runOnUiThread(task);
        try {
            return task.get(1500, TimeUnit.MILLISECONDS);
        } catch (Throwable t) {
            Log.w(TAG, "main call failed: " + t);
            return fallback;
        }
    }

    /** Main thread only. */
    private RemoteMediaClient client() {
        if (sessionManager == null) return null;
        CastSession s = sessionManager.getCurrentCastSession();
        return (s != null && s.isConnected()) ? s.getRemoteMediaClient() : null;
    }

    /** Opens the device chooser (or loads straight away if a session is already connected). */
    public void start(String url, String title, String contentType, long posMs, String posterUrl) {
        if (!isAvailable() || url == null || url.isEmpty()) return;
        activity.runOnUiThread(() -> {
            try {
                CastSession s = sessionManager.getCurrentCastSession();
                if (s != null && s.isConnected()) {
                    load(s, url, title, contentType, posMs, posterUrl);
                    return;
                }
                pendingUrl = url;
                pendingTitle = title;
                pendingType = contentType;
                pendingPoster = posterUrl;
                pendingPosMs = posMs;
                hasPending = true;
                MediaRouteChooserDialog dialog = new MediaRouteChooserDialog(activity);
                dialog.setRouteSelector(castContext.getMergedSelector());
                dialog.show();
            } catch (Throwable t) {
                Log.w(TAG, "start failed: " + t);
            }
        });
    }

    private void loadPending(CastSession s) {
        if (!hasPending) return;
        hasPending = false;
        load(s, pendingUrl, pendingTitle, pendingType, pendingPosMs, pendingPoster);
    }

    private void load(CastSession s, String url, String title, String contentType, long posMs, String posterUrl) {
        RemoteMediaClient rmc = s.getRemoteMediaClient();
        if (rmc == null) return;
        MediaMetadata md = new MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE);
        if (title != null) md.putString(MediaMetadata.KEY_TITLE, title);
        if (posterUrl != null && !posterUrl.isEmpty()) md.addImage(new WebImage(Uri.parse(posterUrl)));
        MediaInfo info = new MediaInfo.Builder(url)
            .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
            .setContentType(contentType == null || contentType.isEmpty() ? "video/mp4" : contentType)
            .setMetadata(md)
            .build();
        Log.i(TAG, "load url=" + url + " type=" + info.getContentType() + " posMs=" + posMs);
        rmc.load(new MediaLoadRequestData.Builder()
            .setMediaInfo(info)
            .setAutoplay(true)
            .setCurrentTime(Math.max(0, posMs))
            .build()).setResultCallback(r -> Log.i(TAG, "load result: success=" + r.getStatus().isSuccess()
                + " code=" + r.getStatus().getStatusCode() + " msg=" + r.getStatus().getStatusMessage()
                + " mediaError=" + (r.getMediaError() != null ? r.getMediaError().toString() : "none")));
    }

    public void playPause() {
        activity.runOnUiThread(() -> {
            RemoteMediaClient rmc = client();
            if (rmc != null) rmc.togglePlayback();
        });
    }

    public void play() {
        activity.runOnUiThread(() -> {
            RemoteMediaClient rmc = client();
            if (rmc != null) rmc.play();
        });
    }

    public void pause() {
        activity.runOnUiThread(() -> {
            RemoteMediaClient rmc = client();
            if (rmc != null) rmc.pause();
        });
    }

    public void seek(long posMs) {
        activity.runOnUiThread(() -> {
            RemoteMediaClient rmc = client();
            if (rmc != null) {
                rmc.seek(new MediaSeekOptions.Builder().setPosition(Math.max(0, posMs)).build());
            }
        });
    }

    /** Ends the cast session and stops the receiver app on the TV. */
    public void stop() {
        hasPending = false;
        if (sessionManager == null) return;
        activity.runOnUiThread(() -> {
            try {
                sessionManager.endCurrentSession(true);
            } catch (Throwable ignored) {}
        });
    }

    /** {"connected":bool,"device":str,"playing":bool,"ended":bool,"position":ms,"duration":ms} */
    public String stateJson() {
        return onMain(this::stateJsonOnMain, "{\"connected\":false}");
    }

    private String stateJsonOnMain() {
        try {
            JSONObject o = new JSONObject();
            CastSession s = sessionManager == null ? null : sessionManager.getCurrentCastSession();
            boolean connected = s != null && s.isConnected();
            o.put("connected", connected);
            if (connected) {
                o.put("device", s.getCastDevice() != null ? s.getCastDevice().getFriendlyName() : "");
                RemoteMediaClient rmc = s.getRemoteMediaClient();
                if (rmc != null) {
                    int ps = rmc.getPlayerState();
                    if (ps != lastLoggedState) {
                        lastLoggedState = ps;
                        Log.i(TAG, "playerState=" + ps + " idleReason=" + rmc.getIdleReason());
                    }
                    o.put("playing", ps == MediaStatus.PLAYER_STATE_PLAYING || ps == MediaStatus.PLAYER_STATE_BUFFERING);
                    o.put("ended", ps == MediaStatus.PLAYER_STATE_IDLE
                        && rmc.getIdleReason() == MediaStatus.IDLE_REASON_FINISHED);
                    o.put("position", rmc.getApproximateStreamPosition());
                    o.put("duration", rmc.getStreamDuration());
                }
            }
            return o.toString();
        } catch (Throwable t) {
            Log.w(TAG, "stateJson failed: " + t);
            return "{\"connected\":false}";
        }
    }
}
