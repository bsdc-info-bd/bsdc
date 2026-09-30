package bd.info.bsdc.app.privacy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LegalDocumentsTest {
    @Test
    fun `current legal documents have stable immutable record identifiers`() {
        assertEquals("terms-2026-09-30", LegalDocument.TERMS_OF_USE.id)
        assertEquals("privacy-2026-09-30", LegalDocument.PRIVACY_NOTICE.id)
        assertTrue(LegalDocument.entries.all { it.version == "2026-09-30" })
    }

    @Test
    fun `both locales contain complete current documents`() {
        listOf(LegalDocuments.ENGLISH, LegalDocuments.BANGLA).forEach { locale ->
            LegalDocument.entries.forEach { document ->
                val content = LegalDocuments.document(document, locale)
                assertTrue(content.title.isNotBlank())
                assertTrue(content.sections.size >= 6)
                assertTrue(content.sections.all { it.heading.isNotBlank() && it.body.isNotBlank() })
            }
        }
    }

    @Test
    fun `unknown locale safely normalizes to English`() {
        assertEquals(LegalDocuments.ENGLISH, LegalDocuments.normalizeLocale("fr-FR"))
        assertEquals(LegalDocuments.BANGLA, LegalDocuments.normalizeLocale("bn-BD"))
    }
}
