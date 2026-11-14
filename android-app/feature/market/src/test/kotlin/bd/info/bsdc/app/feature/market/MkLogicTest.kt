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
}
