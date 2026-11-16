package bd.info.bsdc.app.core.auth;

import bd.info.bsdc.app.core.model.BsdcRole;
import bd.info.bsdc.app.core.model.SessionClaims;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Pure Java 21 validators and claim parsers matching BSDC web contracts:
 * - main-site/src/lib/auth/password-strength.ts
 * - main-site/src/lib/profile/types.ts
 * - main-site/src/lib/auth/session-claims.ts
 */
public final class AuthDomainValidators {

    public static final int USERNAME_MIN = 3;
    public static final int USERNAME_MAX = 24;
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[a-z0-9_]+$");
    private static final Pattern REPEAT_PATTERN = Pattern.compile("(.)\\1{3,}");

    public static final Set<String> RESERVED_USERNAMES = Set.of(
        "admin", "administrator", "bsdc", "rrc", "support", "help", "about",
        "contact", "settings", "messages", "notifications", "search", "explore",
        "auth", "login", "signup", "api", "vendor", "marketplace", "jobs",
        "moderator", "staff", "owner", "official", "system", "root", "null", "undefined"
    );

    private AuthDomainValidators() {}

    public enum UsernameValidation {
        VALID,
        TOO_SHORT,
        TOO_LONG,
        INVALID_CHARACTERS,
        LEADING_OR_TRAILING_UNDERSCORE,
        RESERVED
    }

    public enum PasswordStrengthLevel {
        VERY_WEAK(0),
        WEAK(1),
        FAIR(2),
        GOOD(3),
        STRONG(4);

        public final int score;

        PasswordStrengthLevel(int score) {
            this.score = score;
        }

        public static PasswordStrengthLevel fromScore(int score) {
            for (PasswordStrengthLevel level : values()) {
                if (level.score == score) return level;
            }
            return score >= 4 ? STRONG : VERY_WEAK;
        }
    }

    public static String normalizeUsername(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    public static UsernameValidation validateUsername(String raw) {
        String value = normalizeUsername(raw);
        if (value.length() < USERNAME_MIN) return UsernameValidation.TOO_SHORT;
        if (value.length() > USERNAME_MAX) return UsernameValidation.TOO_LONG;
        if (!USERNAME_PATTERN.matcher(value).matches()) return UsernameValidation.INVALID_CHARACTERS;
        if (value.startsWith("_") || value.endsWith("_")) {
            return UsernameValidation.LEADING_OR_TRAILING_UNDERSCORE;
        }
        if (RESERVED_USERNAMES.contains(value)) return UsernameValidation.RESERVED;
        return UsernameValidation.VALID;
    }

    public static boolean isEmailValid(String email) {
        if (email == null) return false;
        String trimmed = email.trim();
        int at = trimmed.indexOf('@');
        if (at <= 0 || at >= trimmed.length() - 3) return false;
        int dot = trimmed.indexOf('.', at + 2);
        return dot > at + 1 && dot < trimmed.length() - 1 && !trimmed.contains(" ");
    }

    /**
     * Exact score mapping from main-site/src/lib/auth/password-strength.ts (0..4).
     */
    public static int scorePassword(String password) {
        if (password == null || password.isEmpty()) return 0;

        int score = 0;
        if (password.length() >= 8) score += 1;
        if (password.length() >= 12) score += 1;

        boolean hasLower = false;
        boolean hasUpper = false;
        boolean hasDigit = false;
        boolean hasSymbol = false;

        for (int i = 0; i < password.length(); i++) {
            char ch = password.charAt(i);
            if (Character.isLowerCase(ch)) {
                hasLower = true;
            } else if (Character.isUpperCase(ch)) {
                hasUpper = true;
            } else if (Character.isDigit(ch)) {
                hasDigit = true;
            } else {
                hasSymbol = true;
            }
        }

        if (hasLower && hasUpper) score += 1;
        if (hasDigit && hasSymbol) score += 1;

        if (REPEAT_PATTERN.matcher(password).find() && score > 1) {
            score -= 1;
        }
        return Math.max(0, Math.min(4, score));
    }

    /**
     * Parses Firebase ID token custom claims honoring `bsdc_role` while keeping
     * Postgres `role = "authenticated"` distinct from application rank.
     */
    public static SessionClaims parseSessionClaims(Map<String, Object> raw) {
        if (raw == null || raw.isEmpty()) {
            return new SessionClaims(BsdcRole.MEMBER, false, false, false);
        }

        Object postgresRoleObj = raw.get("role");
        boolean postgresAuthenticated = "authenticated".equals(postgresRoleObj);

        BsdcRole appRole = parseAppRole(raw.get("bsdc_role"));
        if (appRole == null) {
            appRole = parseAppRole(postgresRoleObj);
        }
        if (appRole == null) {
            appRole = BsdcRole.MEMBER;
        }

        boolean vendor = Boolean.TRUE.equals(raw.get("vendor"));
        boolean staff = Boolean.TRUE.equals(raw.get("staff"));
        return new SessionClaims(appRole, vendor, staff, postgresAuthenticated);
    }

    private static BsdcRole parseAppRole(Object value) {
        if (!(value instanceof String)) return null;
        String text = ((String) value).trim().toLowerCase(Locale.ROOT);
        for (BsdcRole candidate : BsdcRole.values()) {
            if (candidate.getWireValue().equals(text)) {
                return candidate;
            }
        }
        return null;
    }
}
