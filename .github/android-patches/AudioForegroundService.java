package io.seifoo.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AudioForegroundService extends Service {

    static final String TAG = "SeifooAudio";
    static final String CHANNEL_ID = "seifoo_playback";
    static final int NOTIFICATION_ID = 7337;

    /* Intent actions sent TO the service */
    public static final String ACTION_START        = "io.seifoo.app.audio.START";
    public static final String ACTION_STOP         = "io.seifoo.app.audio.STOP";
    public static final String ACTION_UPDATE_META  = "io.seifoo.app.audio.UPDATE_META";
    public static final String ACTION_UPDATE_STATE = "io.seifoo.app.audio.UPDATE_STATE";

    /* Intent actions sent FROM notification buttons → broadcast → service */
    static final String ACTION_CMD_PLAY   = "io.seifoo.app.audio.CMD_PLAY";
    static final String ACTION_CMD_PAUSE  = "io.seifoo.app.audio.CMD_PAUSE";
    static final String ACTION_CMD_NEXT   = "io.seifoo.app.audio.CMD_NEXT";
    static final String ACTION_CMD_PREV   = "io.seifoo.app.audio.CMD_PREV";
    static final String ACTION_CMD_STOP   = "io.seifoo.app.audio.CMD_STOP";

    /* Callback interface for AudioServicePlugin */
    public interface Listener {
        void onTransportControl(String command);
    }
    public static volatile Listener listener;

    /* Current state */
    private String  title        = "seifoo";
    private String  artist       = "";
    private String  thumbnailUrl = null;
    private boolean isPlaying    = false;
    private long    positionMs   = 0;
    private long    durationMs   = 0;
    private Bitmap  albumArt     = null;

    private MediaSession       mediaSession;
    private NotificationManager notifManager;
    private ExecutorService    ioExecutor;
    private Handler            mainHandler;
    private BroadcastReceiver  cmdReceiver;

    // ─────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "Service created");
        ioExecutor   = Executors.newSingleThreadExecutor();
        mainHandler  = new Handler(Looper.getMainLooper());
        notifManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        createNotificationChannel();
        setupMediaSession();
        registerCmdReceiver();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        String action = intent.getAction();
        if (action == null) return START_STICKY;

        switch (action) {
            case ACTION_START:
                title        = nonNull(intent.getStringExtra("title"), "seifoo");
                artist       = nonNull(intent.getStringExtra("artist"), "");
                thumbnailUrl = intent.getStringExtra("thumbnail");
                isPlaying    = intent.getBooleanExtra("playing", false);
                durationMs   = intent.getLongExtra("duration", 0);
                positionMs   = intent.getLongExtra("position", 0);
                mediaSession.setActive(true);
                updateSessionState();
                loadArtThenNotify();
                break;

            case ACTION_UPDATE_META:
                title        = nonNull(intent.getStringExtra("title"), title);
                artist       = nonNull(intent.getStringExtra("artist"), artist);
                thumbnailUrl = intent.getStringExtra("thumbnail");
                durationMs   = intent.getLongExtra("duration", durationMs);
                positionMs   = 0;
                loadArtThenNotify();
                break;

            case ACTION_UPDATE_STATE:
                isPlaying  = intent.getBooleanExtra("playing", isPlaying);
                positionMs = intent.getLongExtra("position", positionMs);
                durationMs = intent.getLongExtra("duration", durationMs);
                updateSessionState();
                updateNotification();
                break;

            case ACTION_STOP:
                stopSelf();
                break;
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "Service destroyed");
        try { unregisterReceiver(cmdReceiver); } catch (Exception ignored) {}
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        if (ioExecutor != null) ioExecutor.shutdownNow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    // ─────────────────────────────────────────────────────────────────
    // MediaSession setup
    // ─────────────────────────────────────────────────────────────────

    private void setupMediaSession() {
        mediaSession = new MediaSession(this, "SeifooSession");
        mediaSession.setFlags(
            MediaSession.FLAG_HANDLES_MEDIA_BUTTONS |
            MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
        );

        long supportedActions =
            PlaybackState.ACTION_PLAY |
            PlaybackState.ACTION_PAUSE |
            PlaybackState.ACTION_PLAY_PAUSE |
            PlaybackState.ACTION_SKIP_TO_NEXT |
            PlaybackState.ACTION_SKIP_TO_PREVIOUS |
            PlaybackState.ACTION_SEEK_TO |
            PlaybackState.ACTION_STOP;

        PlaybackState initialState = new PlaybackState.Builder()
            .setActions(supportedActions)
            .setState(PlaybackState.STATE_PAUSED, 0, 1.0f)
            .build();
        mediaSession.setPlaybackState(initialState);

        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay()              { dispatch("play"); }
            @Override public void onPause()             { dispatch("pause"); }
            @Override public void onSkipToNext()        { dispatch("next"); }
            @Override public void onSkipToPrevious()    { dispatch("prev"); }
            @Override public void onStop()              { dispatch("stop"); }
            @Override public void onSeekTo(long pos)    { dispatchSeek(pos); }

            private void dispatch(String cmd) {
                Log.d(TAG, "MediaSession command: " + cmd);
                if (listener != null) listener.onTransportControl(cmd);
            }
            private void dispatchSeek(long ms) {
                if (listener != null) listener.onTransportControl("seek:" + ms);
            }
        });
    }

    private void updateSessionState() {
        if (mediaSession == null) return;
        int state = isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
        PlaybackState ps = new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
                        PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT |
                        PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO |
                        PlaybackState.ACTION_STOP)
            .setState(state, positionMs, isPlaying ? 1.0f : 0.0f)
            .build();
        mediaSession.setPlaybackState(ps);

        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE,  title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM,  "seifoo")
            .putLong  (MediaMetadata.METADATA_KEY_DURATION, durationMs);
        if (albumArt != null) {
            meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART,      albumArt);
            meta.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON,   albumArt);
        }
        mediaSession.setMetadata(meta.build());
    }

    // ─────────────────────────────────────────────────────────────────
    // Notification
    // ─────────────────────────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Seifoo Playback", NotificationManager.IMPORTANCE_LOW
            );
            ch.setDescription("Background music playback");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableLights(false);
            ch.enableVibration(false);
            notifManager.createNotificationChannel(ch);
        }
    }

    private void loadArtThenNotify() {
        final String url = thumbnailUrl;
        albumArt = null; // reset first — show without art immediately
        updateSessionState();
        updateNotification();

        if (url == null || url.isEmpty()) return;

        ioExecutor.execute(() -> {
            Bitmap bmp = fetchBitmap(url);
            mainHandler.post(() -> {
                albumArt = bmp;
                updateSessionState();
                updateNotification();
            });
        });
    }

    private Bitmap fetchBitmap(String urlStr) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoInput(true);
            conn.connect();
            InputStream is = conn.getInputStream();
            Bitmap raw = BitmapFactory.decodeStream(is);
            is.close();
            conn.disconnect();
            if (raw == null) return null;
            // Scale to 512×512 for the notification
            return Bitmap.createScaledBitmap(raw, 512, 512, true);
        } catch (Exception e) {
            Log.w(TAG, "fetchBitmap failed: " + e.getMessage());
            return null;
        }
    }

    @SuppressWarnings({"deprecation"})
    private Notification buildNotification() {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            : PendingIntent.FLAG_UPDATE_CURRENT;

        /* Launch intent — opens the app */
        Intent launchIntent = getPackageManager()
            .getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(this, 0,
            launchIntent != null ? launchIntent : new Intent(), flags);

        /* Notification action pending intents */
        PendingIntent prevPi  = broadcastPi(ACTION_CMD_PREV,  1, flags);
        PendingIntent ppPi    = broadcastPi(ACTION_CMD_PLAY,  2, flags); // play or pause
        PendingIntent nextPi  = broadcastPi(ACTION_CMD_NEXT,  3, flags);
        PendingIntent stopPi  = broadcastPi(ACTION_CMD_STOP,  4, flags);

        /* Icon */
        int playIcon  = android.R.drawable.ic_media_play;
        int pauseIcon = android.R.drawable.ic_media_pause;
        int prevIcon  = android.R.drawable.ic_media_previous;
        int nextIcon  = android.R.drawable.ic_media_next;
        int stopIcon  = android.R.drawable.ic_menu_close_clear_cancel;
        int smallIcon = android.R.drawable.ic_media_play;
        // Try to use app's own notification icon if available
        try {
            int rid = getResources().getIdentifier("ic_stat_notify", "drawable", getPackageName());
            if (rid != 0) smallIcon = rid;
        } catch (Exception ignored) {}

        Notification.Action prevAction = new Notification.Action(prevIcon, "Prev", prevPi);
        Notification.Action ppAction   = new Notification.Action(
            isPlaying ? pauseIcon : playIcon, isPlaying ? "Pause" : "Play", ppPi);
        Notification.Action nextAction = new Notification.Action(nextIcon, "Next", nextPi);
        Notification.Action stopAction = new Notification.Action(stopIcon, "Stop", stopPi);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_MAX);
        }

        builder
            .setSmallIcon(smallIcon)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(contentPi)
            .setDeleteIntent(stopPi)
            .setOngoing(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(prevAction)
            .addAction(ppAction)
            .addAction(nextAction)
            .addAction(stopAction)
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));

        if (albumArt != null) {
            builder.setLargeIcon(albumArt);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setCategory(Notification.CATEGORY_TRANSPORT);
            builder.setColor(0xFF1DB954); // Spotify green
        }

        return builder.build();
    }

    private PendingIntent broadcastPi(String action, int reqCode, int flags) {
        Intent i = new Intent(action);
        i.setPackage(getPackageName());
        return PendingIntent.getBroadcast(this, reqCode, i, flags);
    }

    private void updateNotification() {
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                startForeground(NOTIFICATION_ID, n,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } catch (Exception e) {
                startForeground(NOTIFICATION_ID, n);
            }
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // BroadcastReceiver for notification button taps
    // ─────────────────────────────────────────────────────────────────

    private void registerCmdReceiver() {
        cmdReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent intent) {
                String action = intent.getAction();
                if (action == null) return;
                switch (action) {
                    case ACTION_CMD_PLAY:
                    case ACTION_CMD_PAUSE:
                        if (listener != null) {
                            listener.onTransportControl(isPlaying ? "pause" : "play");
                        }
                        break;
                    case ACTION_CMD_NEXT:
                        if (listener != null) listener.onTransportControl("next");
                        break;
                    case ACTION_CMD_PREV:
                        if (listener != null) listener.onTransportControl("prev");
                        break;
                    case ACTION_CMD_STOP:
                        if (listener != null) listener.onTransportControl("stop");
                        stopSelf();
                        break;
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_CMD_PLAY);
        filter.addAction(ACTION_CMD_PAUSE);
        filter.addAction(ACTION_CMD_NEXT);
        filter.addAction(ACTION_CMD_PREV);
        filter.addAction(ACTION_CMD_STOP);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(cmdReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(cmdReceiver, filter);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────

    private String nonNull(String s, String fallback) {
        return (s != null && !s.isEmpty()) ? s : fallback;
    }
}
