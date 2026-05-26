#!/bin/bash
# Patches MainActivity.java to register the MediaScan plugin
JAVA_DIR="$1"

MAIN_ACTIVITY=$(find "$JAVA_DIR/.." -name "MainActivity.java" 2>/dev/null | head -1)
if [ -z "$MAIN_ACTIVITY" ]; then
  echo "[patch] MainActivity.java not found, skipping"
  exit 0
fi

echo "[patch] Patching $MAIN_ACTIVITY"

# Add import for MediaScanPlugin
sed -i '/import com.getcapacitor.BridgeActivity;/a import io.seifoo.app.MediaScanPlugin;' "$MAIN_ACTIVITY"

# Register the plugin inside onCreate or via registerPlugin
# Check if it already uses the plugin annotation approach
if grep -q "registerPlugin" "$MAIN_ACTIVITY"; then
  # Already has registerPlugin calls, just add ours
  sed -i '/registerPlugin/a\        registerPlugin(MediaScanPlugin.class);' "$MAIN_ACTIVITY"
else
  # Add onCreate override if not present
  sed -i 's/public class MainActivity extends BridgeActivity {/public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(MediaScanPlugin.class);\n        super.onCreate(savedInstanceState);\n    }/' "$MAIN_ACTIVITY"
fi

echo "[patch] Done"
