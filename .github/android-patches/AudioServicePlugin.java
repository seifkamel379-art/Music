package io.seifoo.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioService")
public class AudioServicePlugin extends Plugin implements AudioForegroundService.Listener {

    private static final String TAG = "AudioServicePlugin";

    @Override
    public void load() {
        // Register ourselves as the transport control listener
        AudioForegroundService.listener = this;
    }

    // ─────────────────────────────────────────────────────────────────
    // JS-callable methods
    // ─────────────────────────────────────────────────────────────────

    @PluginMethod
    public void startSession(PluginCall call) {
        String title     = call.getString("title", "seifoo");
        String artist    = call.getString("artist", "");
        String thumbnail = call.getString("thumbnail", null);
        boolean playing  = Boolean.TRUE.equals(call.getBoolean("playing", false));
        long duration    = call.getLong("duration", 0L);
        long position    = call.getLong("position", 0L);

        Intent i = new Intent(getContext(), AudioForegroundService.class);
        i.setAction(AudioForegroundService.ACTION_START);
        i.putExtra("title",     title);
        i.putExtra("artist",    artist);
        i.putExtra("thumbnail", thumbnail);
        i.putExtra("playing",   playing);
        i.putExtra("duration",  duration);
        i.putExtra("position",  position);
        startForegroundService(i);

        call.resolve();
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        String title     = call.getString("title", "seifoo");
        String artist    = call.getString("artist", "");
        String thumbnail = call.getString("thumbnail", null);
        long duration    = call.getLong("duration", 0L);

        Intent i = new Intent(getContext(), AudioForegroundService.class);
        i.setAction(AudioForegroundService.ACTION_UPDATE_META);
        i.putExtra("title",     title);
        i.putExtra("artist",    artist);
        i.putExtra("thumbnail", thumbnail);
        i.putExtra("duration",  duration);
        startForegroundService(i);

        call.resolve();
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        boolean playing  = Boolean.TRUE.equals(call.getBoolean("playing", false));
        long position    = call.getLong("position", 0L);
        long duration    = call.getLong("duration", 0L);

        Intent i = new Intent(getContext(), AudioForegroundService.class);
        i.setAction(AudioForegroundService.ACTION_UPDATE_STATE);
        i.putExtra("playing",  playing);
        i.putExtra("position", position);
        i.putExtra("duration", duration);
        startForegroundService(i);

        call.resolve();
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        Intent i = new Intent(getContext(), AudioForegroundService.class);
        i.setAction(AudioForegroundService.ACTION_STOP);
        getContext().startService(i);
        call.resolve();
    }

    // ─────────────────────────────────────────────────────────────────
    // AudioForegroundService.Listener → forward to JS
    // ─────────────────────────────────────────────────────────────────

    @Override
    public void onTransportControl(String command) {
        Log.d(TAG, "Transport control: " + command);
        JSObject data = new JSObject();
        if (command.startsWith("seek:")) {
            data.put("command", "seek");
            try {
                data.put("position", Long.parseLong(command.substring(5)));
            } catch (NumberFormatException ignored) {}
        } else {
            data.put("command", command);
        }
        notifyListeners("transportControl", data);
    }

    // ─────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────

    private void startForegroundService(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "startForegroundService failed: " + e.getMessage());
        }
    }
}
