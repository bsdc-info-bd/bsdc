package bd.info.bsdc.app.feature.market

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MkLogicTest {

    @Test
    fun formatsWholeTakaWithoutDecimals() {
        assertEquals("৳150", MkLogic.formatTaka(15000, bn = false))
        assertEquals("৳950", MkLogic.formatTaka(95000, bn = false))
    }

    @Test
    fun keepsPaisaWhenPresent() {
        assertEquals("৳123.45", MkLogic.formatTaka(12345, bn = false))
        assertEquals("৳0.05", MkLogic.formatTaka(5, bn = false))
    }

    @Test
    fun usesLakhGroupingAndBanglaDigits() {
        assertEquals("৳10,00,000", MkLogic.formatTaka(100000000, bn = false))
        assertEquals("৳১০,০০,০০০", MkLogic.formatTaka(100000000, bn = true))
    }

    @Test
    fun acceptsBdMobileWithPrefixesAndSeparators() {
        assertTrue(MkLogic.isBdMobile("01712-345678"))
        assertTrue(MkLogic.isBdMobile("+8801712345678"))
        assertTrue(MkLogic.isBdMobile("8801712345678"))
        assertFalse(MkLogic.isBdMobile("0212345678"))
        assertFalse(MkLogic.isBdMobile("017123"))
    }

    @Test
    fun checksBangladeshBoundingBox() {
        assertTrue(MkLogic.isInsideBangladesh(MkLogic.SYLHET_LAT, MkLogic.SYLHET_LNG))
        assertFalse(MkLogic.isInsideBangladesh(51.5, -0.12))
    }

    @Test
    fun vendorCanOnlyAdvanceOneStepOrCancel() {
        assertEquals(listOf("accepted", "cancelled"), MkLogic.vendorActionsFor("placed"))
        assertEquals(listOf("delivered", "cancelled"), MkLogic.vendorActionsFor("out_for_delivery"))
        assertTrue(MkLogic.vendorActionsFor("delivered").isEmpty())
        assertTrue(MkLogic.vendorActionsFor("cancelled").isEmpty())
    }

    @Test
    fun timelineRunsFromPlacedToDelivered() {
        assertEquals(0, MkLogic.timelineIndex("placed"))
        assertEquals(4, MkLogic.timelineIndex("delivered"))
        assertEquals(-1, MkLogic.timelineIndex("cancelled"))
    }

    @Test
    fun reviewRequiresDeliveryAndHappensOnce() {
        assertFalse(MkLogic.canReview("out_for_delivery", reviewed = false))
        assertTrue(MkLogic.canReview("delivered", reviewed = false))
        assertFalse(MkLogic.canReview("delivered", reviewed = true))
    }

    @Test
    fun customerCancelStopsAfterHandover() {
        assertTrue(MkLogic.canCustomerCancel("placed"))
        assertFalse(MkLogic.canCustomerCancel("accepted"))
        assertFalse(MkLogic.canCustomerCancel("out_for_delivery"))
    }

    @Test
    fun onlyOpenOrdersKeepAStatusNotification() {
        assertTrue(MkLogic.isActiveOrderStatus("placed"))
        assertTrue(MkLogic.isActiveOrderStatus("accepted"))
        assertTrue(MkLogic.isActiveOrderStatus("packaged"))
        assertTrue(MkLogic.isActiveOrderStatus("out_for_delivery"))
        assertFalse(MkLogic.isActiveOrderStatus("delivered"))
        assertFalse(MkLogic.isActiveOrderStatus("cancelled"))
    }

    @Test
    fun statusLabelsMatchTheServerWording() {
        assertEquals("Out for delivery | ডেলিভারিতে", MkLogic.orderStatusLabel("out_for_delivery"))
        assertEquals("Delivered | পৌঁছে গেছে", MkLogic.orderStatusLabel("delivered"))
        assertEquals("mystery", MkLogic.orderStatusLabel("mystery"))
    }

    @Test
    fun nidAcceptsOnlyTheThreeOfficialLengths() {
        assertTrue(MkLogic.isNid("1234567890"))
        assertTrue(MkLogic.isNid("1234567890123"))
        assertTrue(MkLogic.isNid("12345678901234567"))
        assertFalse(MkLogic.isNid("123456789"))
        assertFalse(MkLogic.isNid("12345678901234"))
        assertFalse(MkLogic.isNid("12345abcde"))
    }

    @Test
    fun txnIdNeedsFourToFortyCharacters() {
        assertTrue(MkLogic.isTxnId("ABCD"))
        assertFalse(MkLogic.isTxnId("ABC"))
        assertFalse(MkLogic.isTxnId("A".repeat(41)))
    }

    @Test
    fun takaInputBecomesPoisha() {
        assertEquals(15000L, MkLogic.parseTakaToPoisha("150"))
        assertEquals(1250L, MkLogic.parseTakaToPoisha("12.5"))
        assertEquals(12000L, MkLogic.parseTakaToPoisha("1,20"))
        assertEquals(12050L, MkLogic.parseTakaToPoisha("120.50"))
        assertEquals(12000L, MkLogic.parseTakaToPoisha("১২০"))
    }

    @Test
    fun takaInputRejectsZeroNegativeAndExcessDecimals() {
        assertEquals(null, MkLogic.parseTakaToPoisha("0"))
        assertEquals(null, MkLogic.parseTakaToPoisha("-5"))
        assertEquals(null, MkLogic.parseTakaToPoisha("1.234"))
        assertEquals(null, MkLogic.parseTakaToPoisha(""))
        assertEquals(null, MkLogic.parseTakaToPoisha("abc"))
    }
}
