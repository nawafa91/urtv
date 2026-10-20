package sa.urtv.screensaver;

import android.annotation.SuppressLint;
import android.content.Context;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** The WebView shared by the preview activity and the dream. */
final class ScreenView {
    private ScreenView() {}

    @SuppressLint("SetJavaScriptEnabled")
    @SuppressWarnings("deprecation")
    static WebView create(final Context c) {
        WebView w = new WebView(c);
        w.setBackgroundColor(0xFF040E09);   // no white flash before the page paints
        w.setFocusable(false);
        w.setVerticalScrollBarEnabled(false);
        w.setHorizontalScrollBarEnabled(false);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.setWebViewClient(new WebViewClient() {
            private int generation;
            private boolean healthy;
            private java.io.File downloaded(String url) {
                if (url == null || !url.startsWith("file://")) return null;
                String path = android.net.Uri.parse(url).getPath();
                java.io.File dir = new java.io.File(c.getFilesDir(), "stable-web");
                return path != null && path.startsWith(dir.getPath() + "/") ? new java.io.File(path) : null;
            }
            private void failed(WebView view, String url) {
                java.io.File page = downloaded(url);
                if (page == null || !url.equals(view.getUrl())) return;
                generation++;
                Updater.reject(c, page);
                view.loadUrl(new Prefs(c).dashboardUrl(c));
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                healthy = false;
                final int attempt = ++generation;
                if (downloaded(url) != null) view.postDelayed(() -> {
                    if (attempt == generation && !healthy) failed(view, url);
                }, 45000);
            }
            @Override public void onPageFinished(WebView view, String url) {
                final java.io.File page = downloaded(url);
                if (page == null) return;
                final int attempt = generation;
                view.postDelayed(() -> {
                    if (attempt != generation || !url.equals(view.getUrl())) return;
                    view.evaluateJavascript("window.URTV_READY === true && /^[0-9]+$/.test(document.getElementById('ck-h')?.textContent || '')", value -> {
                        if (attempt != generation) return;
                        if ("true".equals(value)) { healthy = true; Updater.healthy(c, page); }
                        else failed(view, url);
                    });
                }, 20000);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, android.webkit.WebResourceError error) {
                if (req.isForMainFrame()) failed(view, req.getUrl().toString());
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse res) {
                if (req.isForMainFrame()) failed(view, req.getUrl().toString());
            }
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                WebResourceResponse res = PhotoCache.serve(c, r.getUrl().toString());
                return res != null ? res : super.shouldInterceptRequest(v, r);
            }
        });
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // lets the page call Yahoo and other APIs directly, without a CORS gateway
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);   // photos are cached by PhotoCache, data must be fresh
        if (android.os.Build.VERSION.SDK_INT >= 23) s.setOffscreenPreRaster(true);   // draw before it is shown
        w.loadUrl(new Prefs(c).dashboardUrl(c));
        UpdateJob.schedule(c);
        return w;
    }
}
