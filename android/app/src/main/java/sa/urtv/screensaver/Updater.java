package sa.urtv.screensaver;

import android.content.Context;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;

/** Stable-channel manifest -> compatible immutable page -> SHA-256 -> trial -> health acknowledgement. */
final class Updater {
    static final long INTERVAL_MS = 6L * 3600 * 1000;
    private static final Object DOWNLOAD_LOCK = new Object();
    private Updater() { }
    private static ContentStore store(Context c) throws IOException {
        // Never carry unvalidated web content across native APK/contract changes.
        return new ContentStore(new File(c.getFilesDir(), "stable-web/c" + BuildConfig.CONTENT_CONTRACT + "-apk" + BuildConfig.VERSION_CODE));
    }
    static synchronized File select(Context c) {
        try { return store(c).choose(); } catch (IOException e) { return null; } // packaged page is always the final fallback
    }
    static synchronized void healthy(Context c, File file) {
        try { store(c).healthy(file); } catch (IOException ignored) { }
    }
    static synchronized void reject(Context c, File file) {
        try { store(c).reject(file); } catch (IOException ignored) { }
    }
    static synchronized String rollback(Context c) {
        try { store(c).rollback(); return "تم الرجوع إلى المحتوى السابق؛ الإعدادات محفوظة"; }
        catch (IOException e) { return "تعذر الرجوع؛ أوقف تحديث الصفحة لاستخدام النسخة المضمّنة"; }
    }
    static String check(Context c, boolean force) {
        // Network never holds the UI-side store lock (select/health/rollback must not wait for HTTP).
        synchronized (DOWNLOAD_LOCK) { return fetch(c, force); }
    }
    private static String fetch(Context c, boolean force) {
        Prefs prefs = new Prefs(c);
        if (!prefs.autoUpdate() && !force) return "التحديث التلقائي متوقف";
        long now = System.currentTimeMillis();
        if (!force && now - prefs.raw().getLong("lastCheck", 0) < INTERVAL_MS) return "تم الفحص مؤخراً";
        prefs.raw().edit().putLong("lastCheck", now).apply();
        try {
            JSONObject m = new JSONObject(new String(download(BuildConfig.CONTENT_MANIFEST, 16384), "UTF-8"));
            long version = m.getLong("version"), bytes = m.getLong("bytes");
            String commit = m.getString("commit"), sha = m.getString("sha256");
            ContentPolicy.descriptor(m.getInt("schema"), m.getInt("contract"), BuildConfig.CONTENT_CONTRACT,
                version, m.getLong("min_apk"), m.getLong("max_apk"), BuildConfig.VERSION_CODE, commit, sha, bytes);
            synchronized (Updater.class) {
                if (!store(c).canStage(version, sha)) return "لا يوجد إصدار أحدث معتمد أو توجد نسخة قيد الاختبار";
            }
            String url = "https://raw.githubusercontent.com/" + BuildConfig.CONTENT_REPOSITORY + "/" + commit + "/dist/urtv.html";
            byte[] body = download(url, ContentPolicy.MAX_BYTES);
            ContentPolicy.verify(body, sha, bytes, BuildConfig.CONTENT_CONTRACT);
            // Re-read state after HTTP: the UI may have acknowledged/rejected/rolled back meanwhile.
            synchronized (Updater.class) {
                if (!store(c).stage(body, sha, version)) return "تغيرت حالة المحتوى؛ النسخة الحالية محفوظة";
            }
            return "تم تجهيز إصدار مستقر؛ يُختبر عند فتح شاشة التوقف التالية";
        } catch (Exception e) {
            return "لم يُقبل تحديث مستقر؛ النسخة المحلية محفوظة (إصدار غير متاح أو غير متوافق أو اتصال متعذر)";
        }
    }
    private static byte[] download(String url, int limit) throws IOException {
        // Only the fixed HTTPS GitHub channel and a 40-character commit URL are constructed above.
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(15000); con.setReadTimeout(30000);
        try {
            if (con.getResponseCode() != 200 || !"https".equals(con.getURL().getProtocol())) throw new IOException("Unavailable HTTPS release");
            try (InputStream in = con.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] b = new byte[8192]; int n;
                while ((n = in.read(b)) != -1) { out.write(b, 0, n); if (out.size() > limit) throw new IOException("Oversize release"); }
                return out.toByteArray();
            }
        } finally { con.disconnect(); }
    }
}
