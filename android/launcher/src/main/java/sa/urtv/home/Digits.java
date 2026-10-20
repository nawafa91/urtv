package sa.urtv.home;

/** Western digits for launcher labels, including names supplied by apps and TV inputs. */
final class Digits {
    private Digits() {}

    static String latin(CharSequence value) {
        if (value == null) return "";
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c >= '\u0660' && c <= '\u0669') c = (char) ('0' + c - '\u0660');
            else if (c >= '\u06f0' && c <= '\u06f9') c = (char) ('0' + c - '\u06f0');
            out.append(c);
        }
        return out.toString();
    }
}
