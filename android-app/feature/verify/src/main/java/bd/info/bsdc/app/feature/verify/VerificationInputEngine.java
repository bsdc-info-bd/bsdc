package bd.info.bsdc.app.feature.verify;

import bd.info.bsdc.app.core.common.DocCodeChecksum;
import bd.info.bsdc.app.core.common.PdfSha256Verifier;
import bd.info.bsdc.app.core.model.VerificationState;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Pure Java 21 deterministic engine for parsing QR/deep-link/manual verification inputs
 * and matching vf-site verification status copy.
 */
public final class VerificationInputEngine {

    public enum InputKind {
        DOC_CODE,
        REPORT_RECEIPT,
        UNRECOGNIZED
    }

    public static final class ParsedVerificationInput {
        private final InputKind kind;
        private final String normalizedValue;
        private final boolean checkDigitValid;

        public ParsedVerificationInput(InputKind kind, String normalizedValue, boolean checkDigitValid) {
            this.kind = kind;
            this.normalizedValue = normalizedValue;
            this.checkDigitValid = checkDigitValid;
        }

        public InputKind getKind() {
            return kind;
        }

        public String getNormalizedValue() {
            return normalizedValue;
        }

        public boolean isCheckDigitValid() {
            return checkDigitValid;
        }
    }

    private VerificationInputEngine() {}

    /**
     * Accepts raw document code, full vf-site URL (?code= / ?c= / ?report=),
     * bsdc://verify/<code|uuid> URI, or bare report receipt UUID.
     */
    public static ParsedVerificationInput classifyInput(String raw) {
        if (raw == null) {
            return new ParsedVerificationInput(InputKind.UNRECOGNIZED, "", false);
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return new ParsedVerificationInput(InputKind.UNRECOGNIZED, "", false);
        }

        // Check bare report UUID first
        String directUuid = PdfSha256Verifier.normaliseReportReceiptId(trimmed);
        if (!directUuid.isEmpty()) {
            return new ParsedVerificationInput(InputKind.REPORT_RECEIPT, directUuid, true);
        }

        // Parse URI query parameters or path tails if input looks like a link
        if (trimmed.contains("://") || trimmed.startsWith("/verify")) {
            try {
                URI uri = URI.create(trimmed.startsWith("/") ? "https://vf.main.bsdc.info.bd" + trimmed : trimmed);
                String query = uri.getRawQuery();
                if (query != null && !query.isEmpty()) {
                    for (String pair : query.split("&")) {
                        int eq = pair.indexOf('=');
                        if (eq <= 0) continue;
                        String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8)
                            .toLowerCase(Locale.ROOT);
                        String val = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
                        if ("report".equals(key)) {
                            String uuid = PdfSha256Verifier.normaliseReportReceiptId(val);
                            if (!uuid.isEmpty()) {
                                return new ParsedVerificationInput(InputKind.REPORT_RECEIPT, uuid, true);
                            }
                        } else if ("code".equals(key) || "c".equals(key)) {
                            String norm = DocCodeChecksum.normaliseDocCode(val);
                            return new ParsedVerificationInput(
                                InputKind.DOC_CODE,
                                norm,
                                DocCodeChecksum.isValidDocCode(norm)
                            );
                        }
                    }
                }
                String path = uri.getPath();
                if (path != null) {
                    String[] segments = path.split("/");
                    for (int i = segments.length - 1; i >= 0; i--) {
                        String seg = segments[i].trim();
                        if (seg.isEmpty() || "verify".equalsIgnoreCase(seg)) continue;
                        String uuid = PdfSha256Verifier.normaliseReportReceiptId(seg);
                        if (!uuid.isEmpty()) {
                            return new ParsedVerificationInput(InputKind.REPORT_RECEIPT, uuid, true);
                        }
                        if (seg.toUpperCase(Locale.ROOT).startsWith("BSDC-")) {
                            String norm = DocCodeChecksum.normaliseDocCode(seg);
                            return new ParsedVerificationInput(
                                InputKind.DOC_CODE,
                                norm,
                                DocCodeChecksum.isValidDocCode(norm)
                            );
                        }
                    }
                }
            } catch (IllegalArgumentException ignored) {
                // Fall back to direct doc-code parsing below
            }
        }

        String norm = DocCodeChecksum.normaliseDocCode(trimmed);
        if (norm.startsWith("BSDC-") || DocCodeChecksum.isValidDocCode(norm)) {
            return new ParsedVerificationInput(
                InputKind.DOC_CODE,
                norm,
                DocCodeChecksum.isValidDocCode(norm)
            );
        }

        return new ParsedVerificationInput(InputKind.UNRECOGNIZED, trimmed, false);
    }

    public static String stateHeadline(VerificationState state, boolean bn) {
        if (state == null) {
            return bn ? "অজানা অবস্থা" : "Unknown status";
        }
        switch (state) {
            case VALID:
                return bn ? "বৈধ ও নিবন্ধিত" : "Verified & authentic";
            case REVOKED:
                return bn ? "বাতিলকৃত নথি" : "Revoked document";
            case EXPIRED:
                return bn ? "মেয়াদোত্তীর্ণ নথি" : "Expired document";
            case WITHDRAWN:
                return bn ? "প্রত্যাহারকৃত / অপ্রকাশিত" : "Withdrawn / unpublished";
            case MALFORMED:
                return bn ? "কোডের ফরম্যাট বা চেক-ডিজিট ভুল" : "Invalid code or check digit";
            case UNKNOWN:
            default:
                return bn ? "রেজিস্ট্রিতে পাওয়া যায়নি" : "Not found in registry";
        }
    }

    public static String adviceText(VerificationState state, boolean bn) {
        if (state == null) {
            return bn
                ? "ডকুমেন্টে মুদ্রিত কোডটি মিলিয়ে দেখুন (যেমন BSDC-CT-4A7C21B9-6)।"
                : "Check the code against the document. Every BSDC code looks like BSDC-CT-4A7C21B9-6.";
        }
        switch (state) {
            case VALID:
                return bn
                    ? "উপরের তথ্য সরাসরি BSDC রেজিস্ট্রি থেকে এসেছে। কাগজের তথ্যের সাথে না মিললে নথিটি পরিবর্তিত বলে ধরুন।"
                    : "The details above come from the registry. If they do not match the document in front of you, the document has been altered.";
            case REVOKED:
                return bn
                    ? "প্রদানকারী কর্তৃপক্ষ এই নথিটি বাতিল করেছে। কাগজে যাই থাকুক এটি আর বৈধ নয়।"
                    : "The issuer withdrew this document. Treat it as no longer carrying any authority, whatever the paper says.";
            case EXPIRED:
                return bn
                    ? "নথিটি আসল ছিল কিন্তু এর মেয়াদ শেষ হয়েছে। হালনাগাদ নথি সংগ্রহ করুন।"
                    : "This document was genuine and is recorded, but its period has ended. Ask for a current one.";
            case WITHDRAWN:
                return bn
                    ? "এই নোটিশটি বর্তমানে প্রকাশিত নয় — নির্ধারিত, আর্কাইভকৃত বা প্রতিস্থাপিত হতে পারে।"
                    : "This notice is not published at the moment. It may be scheduled, archived or superseded.";
            case UNKNOWN:
                return bn
                    ? "রেজিস্ট্রিতে এই কোডের কোনো নথি নেই। বানান বা অক্ষর পরীক্ষা করে অযাচাইকৃত হিসেবে ধরুন।"
                    : "Nothing in the registry carries this code. Check for a mistyped character, then treat the document as unverified.";
            case MALFORMED:
            default:
                return bn
                    ? "কোডের শেষ চেক-ডিজিট মেলেনি বা আকৃতি সঠিক নয়। ডকুমেন্টে মুদ্রিত কোডটি পুনরায় লিখুন।"
                    : "Check the code against the document. Every BSDC code looks like BSDC-CT-4A7C21B9-6.";
        }
    }

    public static String docKindLabel(String rawKind, boolean bn) {
        String k = rawKind == null ? "" : rawKind.trim().toUpperCase(Locale.ROOT);
        switch (k) {
            case "CT":
                return bn ? "সার্টিফিকেট (CT)" : "Certificate";
            case "NT":
                return bn ? "অফিশিয়াল নোটিশ (NT)" : "Official Notice";
            case "ID":
                return bn ? "স্টাফ আইডি কার্ড (ID)" : "Staff Identity Card";
            case "RP":
                return bn ? "পারফরম্যান্স রিপোর্ট (PDF)" : "Performance Report Receipt";
            default:
                return bn ? "BSDC নথি" : "BSDC Document";
        }
    }
}
