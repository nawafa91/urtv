package sa.urtv.screensaver;

import java.io.IOException;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure Java release policy, also exercised on the host. HTTPS channel is the trust root. */
final class ContentPolicy {
    static final int MAX_BYTES = 8 * 1024 * 1024;
    static void descriptor(int schema, int contract, int expectedContract, long version,
            long minApk, long maxApk, long apk, String commit, String sha, long bytes) throws IOException {
        if (schema != 1 || contract != expectedContract || version < 1 || minApk < 1 ||
                minApk > maxApk || maxApk > 2100000000L || apk < minApk || apk > maxApk ||
                !commit.matches("[a-f0-9]{40}") || !sha.matches("[a-f0-9]{64}") ||
                bytes < 30000 || bytes > MAX_BYTES) throw new IOException("Incompatible stable release");
    }
    static String digest(byte[] body) throws IOException {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(body);
            StringBuilder out = new StringBuilder();
            for (byte b : hash) out.append(String.format(Locale.ROOT, "%02x", b & 255));
            return out.toString();
        } catch (java.security.NoSuchAlgorithmException e) { throw new IOException(e); }
    }
    static void verify(byte[] body, String sha, long bytes, int contract) throws IOException {
        if (body.length != bytes || body.length > MAX_BYTES || !digest(body).equals(sha))
            throw new IOException("Release hash/size mismatch");
        String text = new String(body, "UTF-8");
        if (!text.startsWith("<!DOCTYPE html>") || !text.trim().endsWith("</html>") ||
                !text.contains("<meta name=\"urtv-content-contract\" content=\"" + contract + "\">") ||
                !text.contains("window.URTV_READY = true;") || text.toLowerCase(Locale.ROOT).contains("tshi-dev/urtv"))
            throw new IOException("Missing content contract or unapproved upstream reference");
        Matcher refs = Pattern.compile("https://raw\\.githubusercontent\\.com/[^/\\s]+/[^/\\s]+/([^/\\s]+)/").matcher(text);
        while (refs.find()) if (!refs.group(1).matches("[a-f0-9]{40}"))
            throw new IOException("Moving asset reference refused");
    }
    private ContentPolicy() { }
}
