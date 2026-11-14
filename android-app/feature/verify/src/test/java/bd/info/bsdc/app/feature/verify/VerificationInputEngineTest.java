package bd.info.bsdc.app.feature.verify;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import bd.info.bsdc.app.core.common.DocCodeChecksum;
import bd.info.bsdc.app.core.model.VerificationState;
import org.junit.Test;

public class VerificationInputEngineTest {

    @Test
    public void classifyInput_extractsDocCodeFromVfUrlAndRepairsTypos() {
        String validDigit = DocCodeChecksum.cardCheckDigit("4A7C21B9");
        String code = "BSDC-CT-4A7C21B9-" + validDigit;
        String url = "https://vf.main.bsdc.info.bd/?code=" + code.toLowerCase();

        VerificationInputEngine.ParsedVerificationInput parsed =
            VerificationInputEngine.classifyInput(url);

        assertEquals(VerificationInputEngine.InputKind.DOC_CODE, parsed.getKind());
        assertEquals(code, parsed.getNormalizedValue());
        assertTrue(parsed.isCheckDigitValid());
    }

    @Test
    public void classifyInput_extractsReportUuidFromQrLinkOrBareUuid() {
        String uuid = "550e8400-e29b-41d4-a716-446655440000";
        VerificationInputEngine.ParsedVerificationInput fromUrl =
            VerificationInputEngine.classifyInput("https://vf.main.bsdc.info.bd/?report=" + uuid);
        VerificationInputEngine.ParsedVerificationInput fromBare =
            VerificationInputEngine.classifyInput(uuid.toUpperCase());

        assertEquals(VerificationInputEngine.InputKind.REPORT_RECEIPT, fromUrl.getKind());
        assertEquals(uuid, fromUrl.getNormalizedValue());
        assertEquals(VerificationInputEngine.InputKind.REPORT_RECEIPT, fromBare.getKind());
        assertEquals(uuid, fromBare.getNormalizedValue());
    }

    @Test
    public void classifyInput_flagsInvalidCheckDigitAndUnknownJunk() {
        VerificationInputEngine.ParsedVerificationInput badDigit =
            VerificationInputEngine.classifyInput("bsdc://verify/BSDC-ID-12345678-9");
        VerificationInputEngine.ParsedVerificationInput junk =
            VerificationInputEngine.classifyInput("https://example.com/hello");

        assertEquals(VerificationInputEngine.InputKind.DOC_CODE, badDigit.getKind());
        assertFalse(badDigit.isCheckDigitValid());
        assertEquals(VerificationInputEngine.InputKind.UNRECOGNIZED, junk.getKind());
    }

    @Test
    public void bilingualHeadlinesAndAdviceAreNonEmptyForAllStates() {
        for (VerificationState state : VerificationState.values()) {
            assertFalse(VerificationInputEngine.stateHeadline(state, false).isBlank());
            assertFalse(VerificationInputEngine.stateHeadline(state, true).isBlank());
            assertFalse(VerificationInputEngine.adviceText(state, false).isBlank());
            assertFalse(VerificationInputEngine.adviceText(state, true).isBlank());
        }
    }
}
