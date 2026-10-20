package sa.urtv.screensaver;

import java.io.*;
import java.util.Properties;

/** Immutable pages + atomic pointer. Candidate survives download interruption, not a failed boot.
 * All access in the app is serialized by Updater. Does not touch user preferences.
 */
final class ContentStore {
    private final File dir;
    private final Properties state = new Properties();
    ContentStore(File dir) throws IOException {
        this.dir = dir;
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cannot create content directory");
        File pointer = new File(dir, "state.properties");
        if (pointer.isFile()) try (InputStream in = new FileInputStream(pointer)) { state.load(in); }
        catch (IllegalArgumentException e) { throw new IOException("Corrupt content state", e); }
        for (String key : new String[] {"active", "previous", "candidate", "attempt"}) {
            String sha = state.getProperty(key);
            if (sha != null && !sha.matches("[a-f0-9]{64}")) throw new IOException("Corrupt content pointer");
        }
        if (state.getProperty("attempt") != null && !state.getProperty("attempt").equals(state.getProperty("candidate")))
            throw new IOException("Corrupt trial pointer");
    }
    private File page(String sha) { return sha != null && sha.matches("[a-f0-9]{64}") ? new File(dir, sha + ".html") : null; }
    private boolean valid(String sha) {
        File f = page(sha);
        if (f == null || !f.isFile() || f.length() > ContentPolicy.MAX_BYTES) return false;
        try { return ContentPolicy.digest(read(f)).equals(sha); } catch (IOException e) { return false; }
    }
    private static byte[] read(File f) throws IOException {
        try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] b = new byte[8192]; int n;
            while ((n = in.read(b)) != -1) { out.write(b, 0, n); if (out.size() > ContentPolicy.MAX_BYTES) throw new IOException("Oversize page"); }
            return out.toByteArray();
        }
    }
    private void save() throws IOException {
        File temp = new File(dir, "state.tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) { state.store(out, "UrTV content state"); out.getFD().sync(); }
        if (!temp.renameTo(new File(dir, "state.properties"))) throw new IOException("Cannot commit content state");
    }
    long highest() { try { return Long.parseLong(state.getProperty("highest", "0")); } catch (NumberFormatException e) { return Long.MAX_VALUE; } }
    boolean canStage(long version, String sha) {
        return version > highest() && state.getProperty("blocked." + sha) == null && state.getProperty("candidate") == null;
    }
    boolean stage(byte[] bytes, String sha, long version) throws IOException {
        if (!canStage(version, sha)) return false;
        if (bytes.length > ContentPolicy.MAX_BYTES || !ContentPolicy.digest(bytes).equals(sha)) throw new IOException("Corrupt candidate");
        File temp = new File(dir, "download.tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) { out.write(bytes); out.getFD().sync(); }
        if (!temp.renameTo(page(sha))) throw new IOException("Cannot stage content");
        state.setProperty("candidate", sha); state.setProperty("highest", Long.toString(version));
        save(); return true;
    }
    File choose() throws IOException {
        // A prior process died/rebooted before the WebView health acknowledgement: reject its candidate.
        if (state.getProperty("attempt") != null) reject(page(state.getProperty("attempt")));
        String candidate = state.getProperty("candidate");
        if (candidate != null) {
            if (valid(candidate)) { state.setProperty("attempt", candidate); save(); return page(candidate); }
            reject(page(candidate));
        }
        String active = state.getProperty("active");
        if (valid(active)) return page(active);
        if (active != null) rollback();
        return valid(state.getProperty("active")) ? page(state.getProperty("active")) : null;
    }
    void healthy(File file) throws IOException {
        String sha = state.getProperty("candidate");
        if (sha == null || !page(sha).equals(file) || !sha.equals(state.getProperty("attempt")) || !valid(sha)) return;
        String active = state.getProperty("active");
        if (valid(active)) state.setProperty("previous", active);
        state.setProperty("active", sha); state.remove("candidate"); state.remove("attempt"); save(); prune();
    }
    void reject(File file) throws IOException {
        String candidate = state.getProperty("candidate");
        if (candidate != null && page(candidate).equals(file)) {
            state.setProperty("blocked." + candidate, "true"); state.remove("candidate"); state.remove("attempt"); save();
        } else if (file != null && file.equals(page(state.getProperty("active")))) rollback();
    }
    void rollback() throws IOException {
        String pending = state.getProperty("candidate");
        String blocked = pending != null ? pending : state.getProperty("active");
        if (blocked != null) state.setProperty("blocked." + blocked, "true");
        state.remove("candidate"); state.remove("attempt");
        if (pending != null) { save(); prune(); return; } // pending -> current good, not the older previous good
        String previous = state.getProperty("previous");
        if (valid(previous)) state.setProperty("active", previous); else state.remove("active");
        state.remove("previous"); save(); prune();
    }
    private void prune() {
        File[] files = dir.listFiles(); if (files == null) return;
        for (File f : files) if (f.getName().matches("[a-f0-9]{64}\\.html") &&
                !f.equals(page(state.getProperty("active"))) && !f.equals(page(state.getProperty("previous"))) &&
                !f.equals(page(state.getProperty("candidate")))) f.delete();
    }
}
