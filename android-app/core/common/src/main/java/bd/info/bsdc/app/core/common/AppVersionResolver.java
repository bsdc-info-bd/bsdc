package bd.info.bsdc.app.core.common;

import java.util.regex.Pattern;

/**
 * Computes Play Store monotonic versionCode and human-readable versionName from CI tags.
 * Matches the verified semantics from BSDC's android release workflow.
 */
public final class AppVersionResolver {

    private static final Pattern SEMVER = Pattern.compile("^\\d+\\.\\d+\\.\\d+$");

    public static final class AppVersion {
        private final int code;
        private final String name;

        public AppVersion(int code, String name) {
            this.code = code;
            this.name = name;
        }

        public int getCode() {
            return code;
        }

        public String getName() {
            return name;
        }
    }

    private AppVersionResolver() {}

    public static AppVersion fromTagAndRun(String rawTag, int runNumber) {
        int safeCode = Math.max(1, runNumber);
        String cleaned = rawTag == null ? "" : rawTag.trim()
            .replaceFirst("^refs/tags/", "")
            .replaceFirst("^android-v?", "")
            .replaceFirst("^v", "");
        String name = SEMVER.matcher(cleaned).matches() ? cleaned : "0.0.0-build." + safeCode;
        return new AppVersion(safeCode, name);
    }
}
