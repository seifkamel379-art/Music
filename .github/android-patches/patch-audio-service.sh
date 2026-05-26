#!/bin/bash
# Installs AudioForegroundService + AudioServicePlugin into the Android project
# Usage: bash patch-audio-service.sh <artifacts/web dir> <patches dir>

set -e
WEBDIR="$1"
PATCHDIR="$2"

echo "[audio-patch] Starting..."

# ── Find package directory ──────────────────────────────────────────
MANIFEST="$WEBDIR/android/app/src/main/AndroidManifest.xml"
JAVA_ROOT="$WEBDIR/android/app/src/main/java"

PACKAGE=$(grep -m1 'package=' "$MANIFEST" 2>/dev/null | sed 's/.*package="\([^"]*\)".*/\1/')
if [ -z "$PACKAGE" ]; then
  echo "[audio-patch] WARN: Could not read package from manifest, trying MainActivity"
  PACKAGE=$(find "$JAVA_ROOT" -name "MainActivity.java" 2>/dev/null | xargs grep -m1 '^package ' 2>/dev/null | head -1 | sed 's/package //;s/;//')
fi

if [ -z "$PACKAGE" ]; then
  echo "[audio-patch] ERROR: Could not determine package name"
  exit 1
fi

echo "[audio-patch] Package: $PACKAGE"
PKG_PATH=$(echo "$PACKAGE" | tr '.' '/')
JAVA_DIR="$JAVA_ROOT/$PKG_PATH"
mkdir -p "$JAVA_DIR"

# ── Copy and fix package in Java files ─────────────────────────────
for FILE in AudioForegroundService.java AudioServicePlugin.java; do
  SRC="$PATCHDIR/$FILE"
  DST="$JAVA_DIR/$FILE"
  if [ ! -f "$SRC" ]; then
    echo "[audio-patch] ERROR: Missing $SRC"
    exit 1
  fi
  sed "s/^package io\.seifoo\.app;/package $PACKAGE;/" "$SRC" > "$DST"
  echo "[audio-patch] Installed $FILE → $DST"
done

# ── Patch AndroidManifest.xml ───────────────────────────────────────
# Add Foreground Service permissions if not present
add_perm() {
  local PERM="$1"
  if ! grep -q "$PERM" "$MANIFEST"; then
    sed -i "/<manifest /a\\    <uses-permission android:name=\"$PERM\" />" "$MANIFEST"
    echo "[audio-patch] Added permission: $PERM"
  fi
}
add_perm "android.permission.FOREGROUND_SERVICE"
add_perm "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
add_perm "android.permission.POST_NOTIFICATIONS"

# Add service declaration inside <application> if not already there
if grep -q "AudioForegroundService" "$MANIFEST"; then
  echo "[audio-patch] Service already declared in manifest"
else
  # Insert before </application>
  SERVICE_DECL='        <service\n            android:name=".AudioForegroundService"\n            android:foregroundServiceType="mediaPlayback"\n            android:exported="false" \/>'
  sed -i "s|</application>|${SERVICE_DECL}\n    </application>|" "$MANIFEST"
  echo "[audio-patch] Added AudioForegroundService to manifest"
fi

# ── Patch MainActivity.java to register AudioServicePlugin ──────────
MAIN=$(find "$JAVA_DIR" -name "MainActivity.java" 2>/dev/null | head -1)
if [ -z "$MAIN" ]; then
  MAIN=$(find "$JAVA_ROOT" -name "MainActivity.java" 2>/dev/null | head -1)
fi

if [ -z "$MAIN" ]; then
  echo "[audio-patch] WARN: MainActivity.java not found"
else
  echo "[audio-patch] Patching $MAIN"

  # Add import if not present
  if ! grep -q "AudioServicePlugin" "$MAIN"; then
    # Try to add registerPlugin for AudioServicePlugin
    if grep -q "registerPlugin" "$MAIN"; then
      # Find last registerPlugin line and insert after
      sed -i "/registerPlugin/a\\        registerPlugin(AudioServicePlugin.class);" "$MAIN"
    elif grep -q "onCreate" "$MAIN"; then
      # Insert into existing onCreate
      sed -i '/onCreate.*Bundle/{ n; s/^\(\s*\)/\1registerPlugin(AudioServicePlugin.class);\n\1/ }' "$MAIN"
    else
      # Add full onCreate override
      sed -i 's/public class \([A-Za-z]*\) extends BridgeActivity {/public class \1 extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(AudioServicePlugin.class);\n        super.onCreate(savedInstanceState);\n    }/' "$MAIN"
    fi
    echo "[audio-patch] Registered AudioServicePlugin in MainActivity"
  else
    echo "[audio-patch] AudioServicePlugin already registered"
  fi
fi

echo "[audio-patch] Done ✓"
