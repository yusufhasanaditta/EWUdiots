package com.ewudiots.app;

import android.annotation.SuppressLint;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;
import org.json.JSONTokener;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Portal sync: a hidden browser inside the app that opens the real EWU portal (portal.ewubd.edu) on the phone.
 * The student's ID and password are typed into EWU's own login form here and go only to EWU — never to EWUdiots'
 * servers. Only if the student ticks "Remember on this phone" is the password kept, encrypted with a key that lives in
 * Android's hardware-backed keystore and never leaves this phone; the web part of the app never reads it back
 * (login with useSaved fills it here in Java). The app then opens the student's pages and runs the same privacy filter as the
 * Chrome extension (src/portal-scrape.js), which keeps only academic lines. EWU's "3 + 18 = ?" check is shown to the
 * student to answer; it is not bypassed. Only https://portal.ewubd.edu pages can be opened.
 */
@CapacitorPlugin(name = "PortalSync")
public class PortalSyncPlugin extends Plugin {
    private static final String PORTAL = "https://portal.ewubd.edu";
    private WebView web;
    private PluginCall waiting; // the call that resolves on the next page load
    private String waitingFor = "";
    private final Handler ui = new Handler(Looper.getMainLooper());

    private static final String STATUS_JS = "(() => { const v = (n) => (document.querySelector('[name=' + n + ']') || {}).value || '';"
        + " const err = [...document.querySelectorAll('.validation-summary-errors, .field-validation-error, .alert-danger, .text-danger, #lblMessage, .error')]"
        + ".map((e) => e.innerText.trim()).filter(Boolean).join(' ').slice(0, 200);"
        + " return JSON.stringify({ url: location.href, login: !!document.getElementById('loginform'), first: v('FirstNo'), second: v('SecondNo'), error: err,"
        + " name: ((document.body.innerText.match(/Hi,\\s*([^\\n]{2,60})/) || [])[1] || '').trim() }); })()";

    @SuppressLint("SetJavaScriptEnabled")
    private void ensureWeb() {
        if (web != null) return;
        web = new WebView(getActivity());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !req.getUrl().toString().startsWith(PORTAL); // never leave the portal
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                if (waiting == null || url == null || !url.startsWith(PORTAL)) return;
                PluginCall c = waiting; waiting = null;
                ui.postDelayed(() -> afterLoad(c), 700); // let the page's own scripts run
            }
        });
        // Invisible 1×1 view: a WebView needs to be attached to run reliably, but the student never sees the portal.
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(1, 1);
        web.setAlpha(0f);
        web.setVisibility(View.VISIBLE);
        ((ViewGroup) getActivity().getWindow().getDecorView()).addView(web, lp);
    }

    private void expectLoad(PluginCall call, String what, long timeoutMs) {
        waiting = call; waitingFor = what;
        ui.postDelayed(() -> { if (waiting == call) { waiting = null; call.reject("The EWU portal didn't answer. Check your internet and try again."); } }, timeoutMs);
    }

    private void afterLoad(PluginCall c) {
        if ("read".equals(waitingFor) || c.getString("script") != null) { runRead(c, 0); return; }
        eval(STATUS_JS, (r) -> c.resolve(json(r)));
    }

    private interface Cb { void done(String value); }
    private void eval(String js, Cb cb) { web.evaluateJavascript(js, (v) -> { String out = ""; try { Object o = new JSONTokener(v).nextValue(); out = o instanceof String ? (String) o : ""; } catch (Exception ignored) { } cb.done(out); }); }
    private static JSObject json(String s) { try { return JSObject.fromJSONObject(new JSONObject(s)); } catch (Exception e) { JSObject o = new JSObject(); o.put("error", "Unreadable page"); return o; } }

    /** Opens the portal login page; answers with the "first + second" check numbers (or login:false if already signed in). */
    @PluginMethod
    public void open(PluginCall call) {
        ui.post(() -> { ensureWeb(); expectLoad(call, "status", 30000); web.loadUrl(PORTAL + "/"); });
    }

    /** Fills EWU's own login form and submits it; answers with the next page's status.
     *  useSaved: true takes the password remembered on this phone instead of `password`. */
    @PluginMethod
    public void login(PluginCall call) {
        String id = call.getString("username", ""), pw = call.getString("password", ""), ans = call.getString("answer", "");
        if (web == null) { call.reject("Open the portal first"); return; }
        if (call.getBoolean("useSaved", false)) {
            String saved = loadPassword(id);
            if (saved == null) { call.reject("No password is remembered for this ID on this phone. Type it once more."); return; }
            pw = saved;
        }
        String js = "(() => { const f = document.forms['myForm'] || document.getElementById('loginform'); if (!f) return 'noform';"
            + " const set = (n, v) => { const e = f.querySelector('[name=' + n + ']'); if (e) e.value = v; };"
            + " set('Username', " + JSONObject.quote(id) + "); set('Password', " + JSONObject.quote(pw) + "); set('Answer', " + JSONObject.quote(ans) + ");"
            + " const b = f.querySelector('[type=submit]'); if (b) b.click(); else HTMLFormElement.prototype.submit.call(f); return 'sent'; })()";
        ui.post(() -> { expectLoad(call, "status", 30000); eval(js, (r) -> { if (!"sent".equals(r)) { waiting = null; call.reject("The portal's login form wasn't found. Try again in a minute."); } }); });
    }

    /** Opens one portal page (path), optionally clicks a button whose text matches `click`, waits until the text
     *  matches `waitFor` (or `timeout` ms), then runs `script` (the privacy filter) and answers with its result. */
    @PluginMethod
    public void read(PluginCall call) {
        String path = call.getString("path", "/");
        if (web == null) { call.reject("Open the portal first"); return; }
        if (!path.startsWith("/") || path.startsWith("//")) { call.reject("Bad portal path"); return; }
        ui.post(() -> { expectLoad(call, "read", 30000); web.loadUrl(PORTAL + path); });
    }

    private void runRead(PluginCall c, int tries) {
        String click = c.getString("click"), waitFor = c.getString("waitFor"), script = c.getString("script", "document.body.innerText");
        int timeout = c.getInt("timeout", 9000);
        if (tries == 0 && click != null) {
            eval("(() => { const re = new RegExp(" + JSONObject.quote(click) + ", 'i'); const b = [...document.querySelectorAll('button, input[type=submit], input[type=button], a')]"
                + ".find((x) => re.test(x.innerText || x.value || '')); if (b) b.click(); return b ? 'clicked' : 'none'; })()", (r) -> ui.postDelayed(() -> runRead(c, 1), 1200));
            return;
        }
        if (waitFor != null && tries * 500 < timeout) {
            eval("(() => new RegExp(" + JSONObject.quote(waitFor) + ", 'i').test(document.body.innerText) ? 'yes' : 'no')()", (r) -> {
                if ("yes".equals(r)) finishRead(c, script); else ui.postDelayed(() -> runRead(c, tries + 1), 500);
            });
            return;
        }
        finishRead(c, script);
    }
    private void finishRead(PluginCall c, String script) {
        eval(script, (r) -> { JSObject o = new JSObject(); o.put("result", r); o.put("url", web.getUrl()); c.resolve(o); });
    }

    /** Runs `script` on the page that is open now (no navigation). With `waitJs` (an expression answering 'yes' or 'no'),
     *  waits until it says yes or `timeout` ms pass, then answers with the value of `result`. Used to read the portal's own
     *  JSON with the student's session; the script itself keeps only academic fields (src/portalsync.js). */
    @PluginMethod
    public void exec(PluginCall call) {
        if (web == null) { call.reject("Open the portal first"); return; }
        String script = call.getString("script", "''");
        ui.post(() -> eval(script, (r) -> {
            if (call.getString("waitJs") == null) { call.resolve(result(r)); return; }
            pollExec(call, System.currentTimeMillis());
        }));
    }
    private void pollExec(PluginCall c, long since) {
        if (web == null) { c.reject("The portal was closed"); return; }
        eval(c.getString("waitJs"), (r) -> {
            if ("yes".equals(r) || System.currentTimeMillis() - since > c.getInt("timeout", 30000)) eval(c.getString("result", "''"), (v) -> c.resolve(result(v)));
            else ui.postDelayed(() -> pollExec(c, since), 400);
        });
    }
    private static JSObject result(String v) { JSObject o = new JSObject(); o.put("result", v); return o; }

    /* ── "Remember on this phone": AES-GCM with a key in the Android keystore ── */
    private static final String KEY_ALIAS = "ewudiots_portal_login";
    private SharedPreferences prefs() { return getContext().getSharedPreferences("portal_login", android.content.Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(KEY_ALIAS)) {
            KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            kg.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
    }
    private String loadPassword(String id) {
        SharedPreferences p = prefs();
        String box = p.getString("box", null);
        if (box == null || !id.equals(p.getString("id", ""))) return null;
        try {
            String[] parts = box.split(":");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) { p.edit().clear().apply(); return null; } // e.g. restored to a new phone: the key isn't there
    }

    /** Remembers the password for this student ID on this phone (encrypted). */
    @PluginMethod
    public void rememberLogin(PluginCall call) {
        String id = call.getString("username", ""), pw = call.getString("password", "");
        if (id.isEmpty() || pw.isEmpty()) { call.reject("Nothing to remember"); return; }
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            String box = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(c.doFinal(pw.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            prefs().edit().putString("id", id).putString("box", box).apply();
            call.resolve();
        } catch (Exception e) { call.reject("This phone couldn't store the password safely."); }
    }

    /** Which student ID has a remembered password (never the password itself). */
    @PluginMethod
    public void savedLogin(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject o = new JSObject();
        o.put("id", p.getString("id", ""));
        o.put("saved", p.getString("box", null) != null);
        call.resolve(o);
    }

    @PluginMethod
    public void forgetLogin(PluginCall call) { prefs().edit().clear().apply(); call.resolve(); }

    /** Closes the hidden browser and forgets the portal session (signs out of the portal on this phone). */
    @PluginMethod
    public void close(PluginCall call) {
        ui.post(() -> {
            if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); web = null; }
            waiting = null;
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
            call.resolve();
        });
    }
}
