package bd.info.bsdc.app.feature.market

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MkVendorFlowTest {

    private val complete = MkApplyDraft(
        fullName = "Rahim Uddin",
        nid = "1234567890123",
        mobile = "01712345678",
        shopName = "Sylhet Crafts",
        shopType = "handicraft",
        addressLine = "House 4, Road 7, Zindabazar",
        lat = 24.8949,
        lng = 91.8687,
        agreements = MkLogic.AGREEMENT_KEYS.toSet(),
        packageCode = "10",
        paymentSender = "01712345678",
        paymentHolder = "Rahim Uddin",
        paymentTxn = "TXN123456",
    )

    @Test
    fun aCompleteApplicationPassesReview() {
        assertTrue(applyStepProblems(ApplyStep.REVIEW, complete, bn = false).isEmpty())
    }

    @Test
    fun anEmptyIdentityStepReportsEveryField() {
        val problems = applyStepProblems(ApplyStep.IDENTITY, MkApplyDraft(), bn = false)
        assertEquals(3, problems.size)
    }

    @Test
    fun aPinOutsideBangladeshBlocksTheLocationStep() {
        val abroad = complete.copy(lat = 51.5, lng = -0.12)
        assertEquals(1, applyStepProblems(ApplyStep.LOCATION, abroad, bn = false).size)
    }

    @Test
    fun everyAgreementIsRequired() {
        val missingOne = complete.copy(agreements = MkLogic.AGREEMENT_KEYS.drop(1).toSet())
        assertEquals(1, applyStepProblems(ApplyStep.AGREEMENTS, missingOne, bn = false).size)
    }

    @Test
    fun paymentNeedsSenderHolderAndTransactionId() {
        val blank = complete.copy(paymentSender = "", paymentHolder = "", paymentTxn = "")
        assertEquals(3, applyStepProblems(ApplyStep.PAYMENT, blank, bn = false).size)
    }

    @Test
    fun problemsAreBilingual() {
        val bnProblems = applyStepProblems(ApplyStep.IDENTITY, MkApplyDraft(), bn = true)
        assertTrue(bnProblems.all { line -> line.any { it.code in 0x0980..0x09FF } })
    }

    @Test
    fun aValidProductBecomesAPayloadInPoisha() {
        val draft = MkProductDraft(
            name = "Clay pot",
            description = "Hand thrown",
            priceText = "250",
            stockText = "4",
            status = "active",
            categoryId = null,
            images = listOf("https://i.imgbb.com/a.webp"),
        )
        val payload = buildProductPayload(draft)
        assertNotNull(payload)
        assertEquals("25000", payload!!["price_poisha"]!!.jsonPrimitive.content)
        assertEquals("4", payload["stock"]!!.jsonPrimitive.content)
        assertEquals("active", payload["status"]!!.jsonPrimitive.content)
        assertEquals(1, (payload["images"] as JsonArray).size)
    }

    @Test
    fun aProductWithBadFieldsIsRefused() {
        val good = MkProductDraft(name = "Mat", priceText = "100", stockText = "1")
        assertNull(buildProductPayload(good.copy(priceText = "0")))
        assertNull(buildProductPayload(good.copy(stockText = "abc")))
        assertNull(buildProductPayload(good.copy(name = "M")))
        assertNull(buildProductPayload(good.copy(images = listOf("http://insecure.example/a.png"))))
    }

    @Test
    fun aMissingCategoryIsSentAsNull() {
        val payload = buildProductPayload(MkProductDraft(name = "Mat", priceText = "100", stockText = "1"))
        assertEquals("null", payload!!["category_id"].toString())
        assertEquals("[]", payload["images"]!!.jsonArray.toString())
    }
}
