package bd.info.bsdc.app.feature.market

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    @Test
    fun evaluatesThreeModeDeliveryFeesAndRadiusRulesIdenticallyToSql() {
        val defaultEval = MkLogic.evaluateShopDelivery(
            MkShopDeliveryDto(scope = "all_bd", fee_mode = "default", default_fee_poisha = 15000),
            pinLat = null,
            pinLng = null,
        )
        assertEquals(15000L, defaultEval.feePoisha)
        assertFalse(defaultEval.needsPinForFee)

        val fixedEval = MkLogic.evaluateShopDelivery(
            MkShopDeliveryDto(scope = "all_bd", fee_mode = "fixed", fixed_fee_poisha = 45000),
            pinLat = null,
            pinLng = null,
        )
        assertEquals(45000L, fixedEval.feePoisha)

        val perKmCfg = MkShopDeliveryDto(
            scope = "radius",
            radius_km = 5,
            fee_mode = "per_km",
            per_km_rate_poisha = 2500,
            center_lat = 24.8949,
            center_lng = 91.8687,
        )
        val unpinned = MkLogic.evaluateShopDelivery(perKmCfg, null, null)
        assertTrue(unpinned.needsPinForFee)
        assertEquals(0L, unpinned.feePoisha)

        // ~2.8 km away -> ceil = 3 km -> 3 * 2500 = 7500 poisha
        val pinnedInArea = MkLogic.evaluateShopDelivery(perKmCfg, 24.915, 91.885)
        assertEquals(3, pinnedInArea.roundedKm)
        assertEquals(7500L, pinnedInArea.feePoisha)
        assertTrue(pinnedInArea.withinArea)

        // ~15 km away -> outside 5 km radius
        val pinnedOut = MkLogic.evaluateShopDelivery(perKmCfg, 25.03, 91.87)
        assertFalse(pinnedOut.withinArea)
    }

    @Test
    fun formatsOpeningScheduleBadgesInEnglishAndBangla() {
        assertTrue(MkLogic.isValidHhMm("09:00"))
        assertTrue(MkLogic.isValidHhMm("24:00", allow24 = true))
        assertFalse(MkLogic.isValidHhMm("24:00", allow24 = false))

        val openSched = MkShopScheduleDto(enabled = true, is_open = true, closes_at = "21:30")
        assertEquals("Open · closes 9:30 PM", MkLogic.scheduleBadgeLabel(openSched, bn = false))

        val closedSched = MkShopScheduleDto(
            enabled = true,
            is_open = false,
            next_open = MkNextOpenDto(day = 0, start = "09:00"),
        )
        assertEquals("Closed · opens Sunday 9:00 AM", MkLogic.scheduleBadgeLabel(closedSched, bn = false))
        assertTrue(MkLogic.scheduleBadgeLabel(closedSched, bn = true)!!.contains("রবিবার"))
    }
}
