package io.seifoo.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MediaScan",
    permissions = {
        @Permission(
            alias = "readAudio",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.READ_MEDIA_AUDIO
            }
        )
    }
)
public class MediaScanPlugin extends Plugin {

    @PluginMethod
    public void getAllAudioFiles(PluginCall call) {
        boolean hasPermission;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            hasPermission = ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.READ_MEDIA_AUDIO
            ) == PackageManager.PERMISSION_GRANTED;
        } else {
            hasPermission = ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.READ_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED;
        }

        if (!hasPermission) {
            requestPermissionForAlias("readAudio", call, "audioPermissionCallback");
            return;
        }

        scanAudio(call);
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        boolean granted;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted = ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.READ_MEDIA_AUDIO
            ) == PackageManager.PERMISSION_GRANTED;
        } else {
            granted = ContextCompat.checkSelfPermission(
                getContext(), Manifest.permission.READ_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED;
        }
        if (!granted) {
            call.reject("PERMISSION_DENIED");
            return;
        }
        scanAudio(call);
    }

    private void scanAudio(PluginCall call) {
        JSArray tracks = new JSArray();
        Uri collection;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
        } else {
            collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        }

        String[] projection = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA,
        };

        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String sortOrder = MediaStore.Audio.Media.TITLE + " ASC";

        try (Cursor cursor = getContext().getContentResolver().query(
            collection, projection, selection, null, sortOrder
        )) {
            if (cursor == null) { call.resolve(new JSObject().put("tracks", tracks)); return; }
            int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
            int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
            int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
            int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
            int durCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
            int dataCol = cursor.getColumnIndex(MediaStore.Audio.Media.DATA);

            while (cursor.moveToNext()) {
                long id = cursor.getLong(idCol);
                String displayName = cursor.getString(nameCol);
                String title = cursor.getString(titleCol);
                if (title == null || title.isEmpty()) {
                    title = displayName != null ? displayName.replaceAll("\\.[^.]+$", "") : "أغنية";
                }
                String artist = cursor.getString(artistCol);
                if (artist == null || artist.equals("<unknown>")) artist = "ملفاتك";
                long durationMs = cursor.getLong(durCol);
                String path = dataCol >= 0 ? cursor.getString(dataCol) : "";
                Uri contentUri = Uri.withAppendedPath(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id)
                );

                JSObject item = new JSObject();
                item.put("id", "device-ms-" + id);
                item.put("title", title);
                item.put("artist", artist);
                item.put("duration", formatDuration(durationMs));
                item.put("uri", contentUri.toString());
                item.put("path", path != null ? path : "");
                tracks.put(item);
            }
        } catch (Exception e) {
            call.reject("SCAN_FAILED: " + e.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("tracks", tracks);
        call.resolve(result);
    }

    private String formatDuration(long ms) {
        if (ms <= 0) return "0:00";
        long secs = ms / 1000;
        long m = secs / 60;
        long s = secs % 60;
        if (m >= 60) {
            long h = m / 60; m = m % 60;
            return h + ":" + pad(m) + ":" + pad(s);
        }
        return m + ":" + pad(s);
    }

    private String pad(long n) {
        return n < 10 ? "0" + n : String.valueOf(n);
    }
}
