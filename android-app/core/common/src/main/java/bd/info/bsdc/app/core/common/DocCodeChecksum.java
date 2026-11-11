package bd.info.bsdc.app.core.common;

import bd.info.bsdc.app.core.model.DocKind;
import bd.info.bsdc.app.core.model.ParsedDocCode;
import bd.info.bsdc.app.core.model.VerificationResult;
import bd.info.bsdc.app.core.model.VerificationState;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Deterministic BSDC document-code parser and check-digit engine.
 *
 * <p>Byte-for-byte parity with {@code corporate-kit/src/domain/trust.ts},
 * {@code corporate-kit/src/domain/staff.ts}, and Postgres {@code bsdc.card_check_digit()}.
 */
public final class DocCodeChecksum {

    private static final Pattern DOC_PATTERN =
        Pattern.compile("^BSDC-[A-Z]{2}-[0-9A-Z]{8}-[0-9]$");
    private static final Pattern SHAPE_FOR_TYPO_REPAIR =
        Pattern.compile("^BSDC-[A-Z]{2}-.{8}-.$");

    private DocCodeChecksum() {}

    /**
     * Computes alternating 1/3 weighted check digit modulo 10 over the 8-character body.
     * Digits count as 0..9; letters A..Z count as 10..35.
     */
    public static String cardCheckDigit(String body) {
        if (body == null) return "";
        int sum = 0;
        for (int i = 0; i < body.length(); i++) {
            char ch = Character.toUpperCase(body.charAt(i));
            int value = (ch >= '0' && ch <= '9') ? (ch - '0') : (ch - 55);
            int weight = (i % 2 == 0) ? 1 : 3;
            sum += value * weight;
        }
        return String.valueOf(((sum % 10) + 10) % 10);
    }

    /**
     * Tidies spacing, casing, Unicode dashes, and common O/I misreadings (O->4, I->8).
     */
    public static String normaliseDocCode(String raw) {
        if (raw == null) return "";
        String compact = raw
            .trim()
            .toUpperCase(Locale.ROOT)
            .replaceAll("\\s+", "")
            .replaceAll("[\\u2012\\u2013\\u2014\\u2015]", "-");
        if (!SHAPE_FOR_TYPO_REPAIR.matcher(compact).matches()) {
            return compact;
        }
        String body = compact.substring(8, 16)
            .replace('O', '4')
            .replace('I', '8');
        return "BSDC-" + compact.substring(5, 7) + "-" + body + "-" + compact.substring(17);
    }

    public static ParsedDocCode parseDocCode(String raw) {
        String code = normaliseDocCode(raw);
        if (code.isEmpty()) {
            return new ParsedDocCode.Invalid(code, "Enter the code printed on the document.");
        }
        if (!DOC_PATTERN.matcher(code).matches()) {
            return new ParsedDocCode.Invalid(code, "That is not the shape of a BSDC code.");
        }
        String kindRaw = code.substring(5, 7);
        DocKind kind = DocKind.fromCode(kindRaw);
        if (kind == null) {
            return new ParsedDocCode.Invalid(code, "BSDC does not issue documents of that kind.");
        }
        String body = code.substring(8, 16);
        String expected = cardCheckDigit(body);
        if (!expected.equals(code.substring(17))) {
            return new ParsedDocCode.Invalid(
                code,
                "The code failed its own check digit, so it was mistyped."
            );
        }
        return new ParsedDocCode.Valid(code, kind, body);
    }

    public static boolean isValidDocCode(String raw) {
        return parseDocCode(raw) instanceof ParsedDocCode.Valid;
    }

    /** Formats valid codes in readable printed blocks: "BSDC-CT XXXXXXXX D". */
    public static String formatDocCode(String raw) {
        String code = normaliseDocCode(raw);
        if (!DOC_PATTERN.matcher(code).matches()) {
            return code;
        }
        return code.substring(0, 7) + " " + code.substring(8, 16) + " " + code.substring(17);
    }

    public static String verificationUrl(String origin, String code) {
        String base = (origin == null || origin.isBlank())
            ? "https://vf.main.bsdc.info.bd"
            : origin.replaceAll("/+$", "");
        String encoded = URLEncoder.encode(normaliseDocCode(code), StandardCharsets.UTF_8);
        return base + "/?code=" + encoded;
    }

    /** Immediate client-side rejection without touching Postgres for invalid codes. */
    public static VerificationResult localRejection(String raw) {
        ParsedDocCode parsed = parseDocCode(raw);
        if (parsed instanceof ParsedDocCode.Valid) {
            return null;
        }
        ParsedDocCode.Invalid invalid = (ParsedDocCode.Invalid) parsed;
        return new VerificationResult(
            invalid.getCode(),
            "unknown",
            false,
            VerificationState.MALFORMED,
            invalid.getReason(),
            "",
            "",
            "",
            null,
            null,
            0
        );
    }
}
