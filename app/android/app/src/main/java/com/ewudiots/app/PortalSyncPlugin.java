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

/**
 * Portal sync: a hidden browser inside the app that opens the real EWU portal (portal.ewubd.edu) on the phone.
 * The student's ID and password are typed into EWU's own login form here and go only to EWU — never to EWUdiots'
 * servers, and they are not stored. The app then opens the student's pages and runs the same privacy filter as the
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

    /** Fills EWU's own login form and submits it; answers with the next page's status. */
    @PluginMethod
    public void login(PluginCall call) {
        String id = call.getString("username", ""), pw = call.getString("password", ""), ans = call.getString("answer", "");
        if (web == null) { call.reject("Open the portal first"); return; }
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
