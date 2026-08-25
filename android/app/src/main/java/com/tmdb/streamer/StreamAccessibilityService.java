package com.tmdb.streamer;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.view.accessibility.AccessibilityEvent;

public class StreamAccessibilityService extends AccessibilityService {
    private static StreamAccessibilityService instance;

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // No-op
    }

    @Override
    public void onInterrupt() {
        // No-op
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    public static boolean isRunning() {
        return instance != null;
    }

    public static boolean performTap(float x, float y) {
        if (instance == null) {
            android.util.Log.e("StreamAccessibility", "Cannot perform tap: AccessibilityService instance is NULL!");
            return false;
        }

        GestureDescription.Builder builder = new GestureDescription.Builder();
        Path path = new Path();
        path.moveTo(x, y);
        builder.addStroke(new GestureDescription.StrokeDescription(path, 0, 80));
        
        android.util.Log.d("StreamAccessibility", "Dispatching OS Gesture Tap at physical coords: (" + x + ", " + y + ")");
        return instance.dispatchGesture(builder.build(), new GestureResultCallback() {
            @Override
            public void onCompleted(GestureDescription gestureDescription) {
                super.onCompleted(gestureDescription);
                android.util.Log.d("StreamAccessibility", "OS Gesture Tap COMPLETED successfully!");
            }

            @Override
            public void onCancelled(GestureDescription gestureDescription) {
                super.onCancelled(gestureDescription);
                android.util.Log.e("StreamAccessibility", "OS Gesture Tap was CANCELLED by system!");
            }
        }, null);
    }
}
