package bd.info.bsdc.app.core.common;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import bd.info.bsdc.app.core.model.DocKind;
import bd.info.bsdc.app.core.model.ParsedDocCode;
import bd.info.bsdc.app.core.model.VerificationResult;
import bd.info.bsdc.app.core.model.VerificationState;
import org.junit.Test;

public class DocCodeChecksumTest {

    @Test
    public void normaliseAndParseValidCertificateCode() {
        String body = "4A7C21B9";
        String check = DocCodeChecksum.cardCheckDigit(body);
        String code = "BSDC-CT-" + body + "-" + check;

        ParsedDocCode parsed = DocCodeChecksum.parseDocCode("  bsdc-ct-" + body.toLowerCase() + "-" + check + " ");
        assertTrue(parsed instanceof ParsedDocCode.Valid);
        ParsedDocCode.Valid valid = (ParsedDocCode.Valid) parsed;
        assertEquals(code, valid.getCode());
        assertEquals(DocKind.CT, valid.getKind());
        assertEquals(body, valid.getBody());
        assertNull(DocCodeChecksum.localRejection(code));
    }

    @Test
    public void repairsHumanTypoOAndIAndUnicodeDashes() {
        String body = "48AB12CD";
        String check = DocCodeChecksum.cardCheckDigit(body);
        // Replace 4 -> O, 8 -> I, hyphen -> en-dash
        String mistyped = "bsdc\u2013id\u2013OIAB12CD\u2014" + check;

        String repaired = DocCodeChecksum.normaliseDocCode(mistyped);
        assertEquals("BSDC-ID-48AB12CD-" + check, repaired);
        assertTrue(DocCodeChecksum.isValidDocCode(mistyped));
    }

    @Test
    public void rejectsUnknownDocKindOrTamperedCheckDigitLocally() {
        String body = "4A7C21B9";
        int digit = Integer.parseInt(DocCodeChecksum.cardCheckDigit(body));
        String wrongCheck = String.valueOf((digit + 1) % 10);

        VerificationResult badCheck = DocCodeChecksum.localRejection("BSDC-CT-" + body + "-" + wrongCheck);
        assertNotNull(badCheck);
        assertFalse(badCheck.getValid());
        assertEquals(VerificationState.MALFORMED, badCheck.getState());

        VerificationResult badKind = DocCodeChecksum.localRejection("BSDC-ZZ-" + body + "-" + digit);
        assertNotNull(badKind);
        assertEquals(VerificationState.MALFORMED, badKind.getState());
    }

    @Test
    public void formatsPrintedBlocksAndVerificationUrl() {
        String body = "9F3E10B2";
        String check = DocCodeChecksum.cardCheckDigit(body);
        String raw = "BSDC-NT-" + body + "-" + check;

        assertEquals("BSDC-NT " + body + " " + check, DocCodeChecksum.formatDocCode(raw));
        assertEquals(
            "https://vf.main.bsdc.info.bd/?code=" + raw,
            DocCodeChecksum.verificationUrl("https://vf.main.bsdc.info.bd/", raw)
        );
    }
}
