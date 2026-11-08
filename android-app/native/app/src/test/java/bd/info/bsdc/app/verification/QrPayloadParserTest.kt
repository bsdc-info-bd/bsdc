package bd.info.bsdc.app.verification

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QrPayloadParserTest {
    @Test fun acceptsOnlyKnownDocumentQrForms() {
        val code = "BSDC-CT-4A7C21B9-6"
        assertEquals(VerificationLookup.Code(code), QrPayloadParser.parse(code.lowercase()))
        assertEquals(VerificationLookup.Code(code), QrPayloadParser.parse("https://vf.main.bsdc.info.bd/?code=$code"))
        assertEquals(VerificationLookup.Code(code), QrPayloadParser.parse("https://vf.bsdc.info.bd/?c=$code"))
        assertEquals(VerificationLookup.Code(code), QrPayloadParser.parse("https://vf.main.bsdc.info.bd/?code=BSDC%2DCT%2D4A7C21B9%2D6"))
    }

    @Test fun reportReceiptMustBeAUuidAndOfficialHttpsOrigin() {
        val id = "00000000-0000-4000-8000-000000000001"
        assertEquals(VerificationLookup.Report(id), QrPayloadParser.parse("https://vf.main.bsdc.info.bd/?report=$id"))
        assertNull(QrPayloadParser.parse("http://vf.main.bsdc.info.bd/?code=BSDC-CT-4A7C21B9-6"))
        assertNull(QrPayloadParser.parse("https://vf.main.bsdc.info.bd.attacker.test/?code=BSDC-CT-4A7C21B9-6"))
        assertNull(QrPayloadParser.parse("https://vf.main.bsdc.info.bd/?report=not-a-uuid"))
        assertNull(QrPayloadParser.parse("https://vf.main.bsdc.info.bd/?report=00000000-0000-4000-8000-000000000001&code=BSDC-CT-4A7C21B9-6"))
        assertNull(QrPayloadParser.parse("https://vf.main.bsdc.info.bd/?code=BSDC-CT-4A7C21B9-6&code=BSDC-CT-4A7C21B9-6"))
        assertNull(QrPayloadParser.parse("https://vf.main.bsdc.info.bd/?code=BSDC-CT-4A7C21B9-6#fragment"))
    }

    @Test fun rejectsOtherSchemesAndArbitraryPaths() {
        assertNull(QrPayloadParser.parse("javascript:alert(1)"))
        assertNull(QrPayloadParser.parse("https://vf.main.bsdc.info.bd/redirect?code=BSDC-CT-4A7C21B9-6"))
        assertNull(QrPayloadParser.parse("https://untrusted.example/?code=BSDC-CT-4A7C21B9-6"))
    }
}
