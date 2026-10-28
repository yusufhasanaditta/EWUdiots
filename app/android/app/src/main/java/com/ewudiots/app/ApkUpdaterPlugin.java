package com.ewudiots.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app update for the APK installed from the website: downloads the new APK into the app's cache (with progress
 * events) and opens Android's installer. Android always shows its own "Update this app?" confirmation; the app can't
 * (and shouldn't) skip it. Only https downloads from GitHub releases or the EWUdiots site are accepted.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    private static boolean trusted(String url) {
        return url != null && (url.startsWith("https://ewudiots.vercel.app/") || url.startsWith("https://github.com/yusufhasanaditta/EWUdiots/")
            || url.startsWith("https://objects.githubusercontent.com/") || url.startsWith("https://release-assets.githubusercontent.com/"));
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String start = call.getString("url");
        if (!trusted(start)) { call.reject("Untrusted update address"); return; }
        call.setKeepAlive(true);
        new Thread(() -> {
            HttpURLConnection con = null;
            try {
                // Follow the redirects (site → GitHub release → file host) by hand, checking each address.
                String url = start;
                for (int hops = 0; ; hops++) {
                    if (hops > 6) throw new Exception("Too many redirects");
                    con = (HttpURLConnection) new URL(url).openConnection();
                    con.setInstanceFollowRedirects(false);
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(30000);
                    int code = con.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String next = new URL(new URL(url), con.getHeaderField("Location")).toString();
                        con.disconnect();
                        if (!trusted(next)) throw new Exception("Untrusted redirect");
                        url = next;
                        continue;
                    }
                    if (code != 200) throw new Exception("Download failed (" + code + ")");
                    break;
                }
                long total = con.getContentLengthLong();
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("No space for the update");
                File apk = new File(dir, "EWUdiots-update.apk");
                try (InputStream in = con.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0; int n, last = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != last) {
                            last = pct;
                            JSObject p = new JSObject();
                            p.put("percent", pct);
                            p.put("bytes", done);
                            notifyListeners("progress", p);
                        }
                    }
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Update failed");
            } finally {
                if (con != null) con.disconnect();
                call.setKeepAlive(false);
            }
        }).start();
    }
}
