package bd.info.bsdc.app.core.common;

import bd.info.bsdc.app.core.model.AppLanguage;

/**
 * Formats integers and metric strings into Bangla digits ({@code ০–৯}) when active.
 * Matches {@code push-worker/src/notifications.ts#toBanglaDigits}.
 */
public final class BanglaDigitFormatter {

    private static final char[] BANGLA_DIGITS = {
        '০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'
    };

    private BanglaDigitFormatter() {}

    public static String toBanglaDigits(long value) {
        return toBanglaDigits(String.valueOf(value));
    }

    public static String toBanglaDigits(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            if (ch >= '0' && ch <= '9') {
                sb.append(BANGLA_DIGITS[ch - '0']);
            } else {
                sb.append(ch);
            }
        }
        return sb.toString();
    }

    public static String formatCount(long count, AppLanguage language) {
        String text = String.valueOf(count);
        return language == AppLanguage.BN ? toBanglaDigits(text) : text;
    }
}
