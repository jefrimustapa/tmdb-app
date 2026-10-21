#!/bin/sh
# MSM Getter Microservice Watchdog
# Runs periodically via cru cron to ensure HTTP endpoint is responding

# Check internal loopback HTTP port 3034 first (no TLS overhead), then HTTPS 3033
check_health() {
    # 1. Internal loopback HTTP port 3034
    if curl -s -m 5 "http://127.0.0.1:3034/tg/health/" 2>/dev/null | grep -q '"status":"ok"'; then
        return 0
    fi
    # 2. Main HTTPS port 3033 (-k for self-signed / router certificate)
    if curl -k -s -m 5 "https://127.0.0.1:3033/tg/health/" 2>/dev/null | grep -q '"status":"ok"'; then
        return 0
    fi
    return 1
}

FAIL_FILE="/tmp/msm_watchdog.fails"

# 1. Quick check if service is healthy
if check_health; then
    rm -f "$FAIL_FILE"
    exit 0
fi

# 2. If check failed, increment failure counter
FAILS=$(cat "$FAIL_FILE" 2>/dev/null || echo 0)
FAILS=$((FAILS + 1))
echo "$FAILS" > "$FAIL_FILE"

# 3. If failed 3 consecutive times (9 minutes), attempt heal & restart
if [ "$FAILS" -ge 3 ]; then
    logger -t "msm-watchdog" "MSM service unhealthy (failures: $FAILS). Initiating auto-recovery..."
    
    # Check if node binary is broken
    if ! /opt/bin/node -v >/dev/null 2>&1; then
        logger -t "msm-watchdog" "Corrupted node binary detected. Restoring from /jffs/bin/node.clean..."
        [ -f /jffs/bin/node.clean ] && cp /jffs/bin/node.clean /opt/bin/node && chmod 755 /opt/bin/node
    fi

    # Restart service
    /opt/etc/init.d/S99tg-streamer restart >/dev/null 2>&1 || /opt/etc/init.d/S99msm-getter restart >/dev/null 2>&1
    rm -f "$FAIL_FILE"
fi
