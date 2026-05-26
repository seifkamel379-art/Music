package io.seifoo.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.MimeTypeMap;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@CapacitorPlugin(
    name = "MediaScan",
    permissions = {
        @Permission(
            alias = "readAudio",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE
            }
        ),
        @Permission(
            alias = "readAudioMedia",
            strings = {
                "android.permission.READ_MEDIA_AUDIO"
            }
        )
    }
)
public class MediaScanPlugin extends Plugin {

    private static final String TAG = "MediaScanPlugin";

    /** All audio extensions we care about */
    private static final Set<String> AUDIO_EXTS = new HashSet<>();
    static {
        String[] exts = {"mp3","m4a","aac","ogg","opus","flac","wav","wma","ape","aiff","aif",
                         "alac","mp4","3gp","3gpp","amr","mid","midi","mka","webm","ts"};
        for (String e : exts) AUDIO_EXTS.add(e.toLowerCase());
    }

    @PluginMethod
    public void getAllAudioFiles(PluginCall call) {
        if (hasPermission()) {
            doScan(call);
        } else {
            // Android 13+: request READ_MEDIA_AUDIO; older: request READ_EXTERNAL_STORAGE
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissionForAlias("readAudioMedia", call, "permissionCallback");
            } else {
                requestPermissionForAlias("readAudio", call, "permissionCallback");
            }
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (hasPermission()) {
            doScan(call);
        } else {
            call.reject("PERMISSION_DENIED");
        }
    }

    private boolean hasPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            int r = ContextCompat.checkSelfPermission(getContext(), "android.permission.READ_MEDIA_AUDIO");
            return r == PackageManager.PERMISSION_GRANTED;
        }
        return ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    // ────────────────────────────────────────────────────
    // Main scan: MediaStore (all volumes) + file-system walk
    // ────────────────────────────────────────────────────
    private void doScan(PluginCall call) {
        // Use LinkedHashMap keyed by MediaStore ID so we deduplicate automatically
        Map<String, JSObject> byId = new LinkedHashMap<>();

        // 1. MediaStore – primary external volume
        scanVolume(MediaStore.VOLUME_EXTERNAL_PRIMARY, byId);

        // 2. MediaStore – ALL external volumes (API 29+) — catches secondary SD cards
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                for (String vol : android.provider.MediaStore.getExternalVolumeNames(getContext())) {
                    scanVolume(vol, byId);
                }
            } catch (Exception e) {
                Log.w(TAG, "getExternalVolumeNames failed: " + e.getMessage());
            }
        }

        // 3. MediaStore – internal storage
        try {
            scanVolume(MediaStore.VOLUME_INTERNAL, byId);
        } catch (Exception e) {
            Log.w(TAG, "Internal volume scan failed: " + e.getMessage());
        }

        // 4. File-system walk on old devices or to catch files not yet indexed
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            walkFilesystem(byId);
        }

        // 5. Always walk Downloads + Music on all versions to catch unindexed files
        walkPublicDirs(byId);

        JSArray tracks = new JSArray();
        for (JSObject o : byId.values()) tracks.put(o);

        JSObject result = new JSObject();
        result.put("tracks", tracks);
        result.put("total", byId.size());
        Log.i(TAG, "Total audio tracks found: " + byId.size());
        call.resolve(result);
    }

    // ────────────────────────────────────────────────────
    // MediaStore volume scan
    // ────────────────────────────────────────────────────
    private void scanVolume(String volumeName, Map<String, JSObject> out) {
        Uri collection;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                collection = MediaStore.Audio.Media.getContentUri(volumeName);
            } else {
                collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            }
        } catch (Exception e) {
            Log.w(TAG, "getContentUri failed for " + volumeName + ": " + e.getMessage());
            return;
        }

        String[] projection = buildProjection();
        // No IS_MUSIC filter – we want everything that is audio (podcasts, downloads, etc.)
        String selection = MediaStore.Audio.Media.DURATION + " > 0";
        String sortOrder = MediaStore.Audio.Media.DATE_ADDED + " DESC";

        try (Cursor c = getContext().getContentResolver().query(
                collection, projection, selection, null, sortOrder)) {
            if (c == null) return;

            int idCol    = c.getColumnIndex(MediaStore.Audio.Media._ID);
            int titleCol = c.getColumnIndex(MediaStore.Audio.Media.TITLE);
            int artistCol= c.getColumnIndex(MediaStore.Audio.Media.ARTIST);
            int albumCol = c.getColumnIndex(MediaStore.Audio.Media.ALBUM);
            int durCol   = c.getColumnIndex(MediaStore.Audio.Media.DURATION);
            int dataCol  = c.getColumnIndex(MediaStore.Audio.Media.DATA);
            int nameCol  = c.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
            int sizeCol  = c.getColumnIndex(MediaStore.Audio.Media.SIZE);

            while (c.moveToNext()) {
                if (idCol < 0) continue;
                long id = c.getLong(idCol);
                String key = volumeName + "_" + id;
                if (out.containsKey(key)) continue;

                String displayName = nameCol >= 0 ? c.getString(nameCol) : null;
                String title = titleCol >= 0 ? c.getString(titleCol) : null;
                if (title == null || title.isEmpty() || title.equals("<unknown>")) {
                    title = displayName != null ? stripExt(displayName) : "أغنية";
                }
                String artist = artistCol >= 0 ? c.getString(artistCol) : null;
                if (artist == null || artist.isEmpty() || artist.equals("<unknown>")) artist = "ملفاتك";
                String album = albumCol >= 0 ? c.getString(albumCol) : "";
                if (album == null || album.equals("<unknown>")) album = "";
                long durMs = durCol >= 0 ? c.getLong(durCol) : 0;
                String path = dataCol >= 0 ? c.getString(dataCol) : "";

                // Content URI that works on all API levels
                Uri contentUri = Uri.withAppendedPath(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id));
                // On API 29+ use volume-specific URI for better reliability
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        contentUri = ContentUris.withAppendedId(
                                MediaStore.Audio.Media.getContentUri(volumeName), id);
                    } catch (Exception ignored) {}
                }

                JSObject o = new JSObject();
                o.put("id", "ms-" + key);
                o.put("title", title);
                o.put("artist", artist);
                o.put("album", album);
                o.put("duration", fmtDuration(durMs));
                o.put("durationMs", durMs);
                o.put("uri", contentUri.toString());
                o.put("path", path != null ? path : "");
                o.put("size", sizeCol >= 0 ? c.getLong(sizeCol) : 0);
                out.put(key, o);
            }
        } catch (Exception e) {
            Log.w(TAG, "scanVolume(" + volumeName + ") error: " + e.getMessage());
        }
    }

    // ────────────────────────────────────────────────────
    // Filesystem walk (pre-Q and for public dirs)
    // ────────────────────────────────────────────────────
    private void walkFilesystem(Map<String, JSObject> out) {
        File[] roots = getContext().getExternalFilesDirs(null);
        if (roots != null) {
            for (File r : roots) {
                if (r == null) continue;
                // Walk from storage root, not app-private dir
                File root = r;
                while (root.getParentFile() != null && !root.getParentFile().getAbsolutePath().equals("/")) {
                    root = root.getParentFile();
                }
                walkDir(root, out, 0);
            }
        }
        // Also walk Environment.getExternalStorageDirectory (deprecated but still works pre-Q)
        try {
            File ext = Environment.getExternalStorageDirectory();
            if (ext != null && ext.exists()) walkDir(ext, out, 0);
        } catch (Exception ignored) {}
    }

    private void walkPublicDirs(Map<String, JSObject> out) {
        String[] publicTypes = {
            Environment.DIRECTORY_MUSIC,
            Environment.DIRECTORY_DOWNLOADS,
            Environment.DIRECTORY_PODCASTS,
            Environment.DIRECTORY_RINGTONES,
            Environment.DIRECTORY_ALARMS,
            Environment.DIRECTORY_NOTIFICATIONS,
            Environment.DIRECTORY_AUDIOBOOKS,
        };
        for (String type : publicTypes) {
            try {
                File dir = Environment.getExternalStoragePublicDirectory(type);
                if (dir != null && dir.exists()) walkDir(dir, out, 0);
            } catch (Exception ignored) {}
        }
    }

    private void walkDir(File dir, Map<String, JSObject> out, int depth) {
        if (depth > 8 || dir == null || !dir.exists() || !dir.isDirectory()) return;
        // Skip hidden and system dirs
        String name = dir.getName();
        if (name.startsWith(".") || name.equals("Android") || name.equals("data")
                || name.equals("obb") || name.equals("proc") || name.equals("sys")) return;

        File[] files;
        try { files = dir.listFiles(); } catch (Exception e) { return; }
        if (files == null) return;

        for (File f : files) {
            if (f == null) continue;
            if (f.isDirectory()) {
                walkDir(f, out, depth + 1);
            } else if (f.isFile()) {
                String fname = f.getName().toLowerCase();
                int dot = fname.lastIndexOf('.');
                if (dot < 0) continue;
                String ext = fname.substring(dot + 1);
                if (!AUDIO_EXTS.contains(ext)) continue;
                if (f.length() < 10_000) continue; // skip tiny files

                String path = f.getAbsolutePath();
                String key = "fs_" + path;
                if (out.containsKey(key)) continue;

                String title = stripExt(f.getName());
                JSObject o = new JSObject();
                o.put("id", "fs-" + path.hashCode());
                o.put("title", title);
                o.put("artist", "ملفاتك");
                o.put("album", "");
                o.put("duration", "");
                o.put("durationMs", 0);
                o.put("uri", "file://" + path);
                o.put("path", path);
                o.put("size", f.length());
                out.put(key, o);
            }
        }
    }

    // ────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────
    private String[] buildProjection() {
        List<String> cols = new ArrayList<>();
        cols.add(MediaStore.Audio.Media._ID);
        cols.add(MediaStore.Audio.Media.TITLE);
        cols.add(MediaStore.Audio.Media.ARTIST);
        cols.add(MediaStore.Audio.Media.ALBUM);
        cols.add(MediaStore.Audio.Media.DURATION);
        cols.add(MediaStore.Audio.Media.DISPLAY_NAME);
        cols.add(MediaStore.Audio.Media.SIZE);
        // DATA is deprecated in Q+ but still works and is useful for pre-Q
        cols.add(MediaStore.Audio.Media.DATA);
        return cols.toArray(new String[0]);
    }

    private String stripExt(String name) {
        if (name == null) return "أغنية";
        int d = name.lastIndexOf('.');
        return (d > 0 ? name.substring(0, d) : name).trim();
    }

    private String fmtDuration(long ms) {
        if (ms <= 0) return "";
        long s = ms / 1000, m = s / 60, h = m / 60;
        s %= 60; m %= 60;
        if (h > 0) return h + ":" + pad(m) + ":" + pad(s);
        return m + ":" + pad(s);
    }
    private String pad(long n) { return n < 10 ? "0" + n : String.valueOf(n); }
}
// Needed for URI building on API 29+
class ContentUris {
    static Uri withAppendedId(Uri uri, long id) {
        return android.content.ContentUris.withAppendedId(uri, id);
    }
}
