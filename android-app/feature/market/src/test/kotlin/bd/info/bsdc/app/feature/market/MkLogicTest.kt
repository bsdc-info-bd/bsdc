package bd.info.bsdc.app.feature.market

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Behaviour of the storefront browsing rules. These are pure functions over DTOs, so they are
 * tested directly rather than through Compose.
 */
class MkLogicTest {

    private fun product(
        id: String,
        name: String,
        pricePoisha: Long,
        inStock: Boolean = true,
        imageUrl: String = "https://cdn/$id.jpg",
        categoryId: String? = null,
    ) = MkStorefrontProductDto(
        id = id,
        slug = id,
        name = name,
        price_poisha = pricePoisha,
        in_stock = inStock,
        category_id = categoryId,
        image_url = imageUrl,
    )

    private val rice = product("p1", "Miniket Rice", 7500)
    private val oil = product("p2", "Soybean Oil", 18000)
    private val salt = product("p3", "Sea Salt", 4000, inStock = false)

    @Test
    fun featuredLiftsInStockAboveSoldOutButKeepsShopOrder() {
        val sorted = MkLogic.sortStorefront(listOf(salt, oil, rice), MkLogic.ProductSort.FEATURED)
        assertEquals(listOf("p2", "p1", "p3"), sorted.map { it.id })
    }

    @Test
    fun priceLowBreaksTiesByName() {
        val tied = listOf(
            product("b", "Bread", 5000),
            product("a", "Atta", 5000),
            product("c", "Chira", 3000),
        )
        val sorted = MkLogic.sortStorefront(tied, MkLogic.ProductSort.PRICE_LOW)
        assertEquals(listOf("c", "a", "b"), sorted.map { it.id })
    }

    @Test
    fun priceHighPutsThePriciestFirst() {
        val sorted = MkLogic.sortStorefront(listOf(rice, oil, salt), MkLogic.ProductSort.PRICE_HIGH)
        assertEquals(listOf("p2", "p1", "p3"), sorted.map { it.id })
    }

    @Test
    fun nameSortIgnoresCase() {
        val list = listOf(product("x", "chaL", 100), product("y", "Brinjal", 200))
        val sorted = MkLogic.sortStorefront(list, MkLogic.ProductSort.NAME)
        assertEquals(listOf("y", "x"), sorted.map { it.id })
    }

    @Test
    fun sortDoesNotMutateInput() {
        val original = listOf(salt, oil, rice)
        MkLogic.sortStorefront(original, MkLogic.ProductSort.PRICE_LOW)
        assertEquals(listOf("p3", "p2", "p1"), original.map { it.id })
    }

    @Test
    fun inStockOnlyFiltersSoldOutRows() {
        val filtered = MkLogic.filterStorefront(
            listOf(rice, oil, salt),
            MkLogic.ProductFilter(inStockOnly = true),
        )
        assertEquals(listOf("p1", "p2"), filtered.map { it.id })
    }

    @Test
    fun priceBandIsComparedInTakaEvenThoughProductsStorePoisha() {
        // 50–100 taka must include ৳75 rice and exclude ৳180 oil.
        val filtered = MkLogic.filterStorefront(
            listOf(rice, oil, salt),
            MkLogic.ProductFilter(minTaka = 50, maxTaka = 100),
        )
        assertEquals(listOf("p1"), filtered.map { it.id })
    }

    @Test
    fun queryMatchesInsideTheNameAndTrimsWhitespace() {
        val filtered = MkLogic.filterStorefront(
            listOf(rice, oil, salt),
            MkLogic.ProductFilter(query = "  OIL "),
        )
        assertEquals(listOf("p2"), filtered.map { it.id })
    }

    @Test
    fun emptyFilterKeepsEveryProduct() {
        val filter = MkLogic.ProductFilter()
        assertTrue(!filter.isActive)
        assertEquals(3, MkLogic.filterStorefront(listOf(rice, oil, salt), filter).size)
    }

    @Test
    fun anyConstraintMarksTheFilterActive() {
        assertTrue(MkLogic.ProductFilter(inStockOnly = true).isActive)
        assertTrue(MkLogic.ProductFilter(minTaka = 1).isActive)
        assertTrue(MkLogic.ProductFilter(maxTaka = 1).isActive)
        assertTrue(MkLogic.ProductFilter(query = "x").isActive)
    }

    @Test
    fun compareNeedsTwoProducts() {
        assertTrue(MkLogic.compareRows(emptyList(), bn = false).isEmpty())
        assertTrue(MkLogic.compareRows(listOf(rice), bn = false).isEmpty())
    }

    @Test
    fun compareDropsRowsThatAgreeAcrossProducts() {
        val same = listOf(
            product("a", "Atta", 5000),
            product("b", "Bread", 5000),
        )
        // Prices agree and both have photos, so only the stock line could differ — and it does not.
        assertTrue(MkLogic.compareRows(same, bn = false).isEmpty())

        val rows = MkLogic.compareRows(same, bn = false, keepSame = true)
        assertEquals(3, rows.size)
        assertTrue(rows.none { it.differs })
    }

    @Test
    fun compareReportsThePriceDifferenceInTaka() {
        val rows = MkLogic.compareRows(listOf(rice, oil), bn = false)
        val price = rows.first { it.label == "Price" }
        assertEquals(listOf("৳75", "৳180"), price.values)
        assertTrue(price.differs)
    }

    @Test
    fun compareUsesBanglaLabelsAndDigits() {
        val rows = MkLogic.compareRows(listOf(rice, oil), bn = true)
        val price = rows.first { it.label == "দাম" }
        assertEquals("৳৭৫", price.values[0])
    }

    @Test
    fun compareCapsAtThreeProducts() {
        val four = listOf(
            product("a", "A", 100),
            product("b", "B", 200),
            product("c", "C", 300),
            product("d", "D", 400),
        )
        val price = MkLogic.compareRows(four, bn = false).first { it.label == "Price" }
        assertEquals(3, price.values.size)
    }

    @Test
    fun cheapestAndSavingsFollowThePriceSpread() {
        val chosen = listOf(rice, oil)
        assertEquals("p1", MkLogic.cheapestOf(chosen)?.id)
        assertEquals(10500L, MkLogic.savingsAgainstPriciest(chosen))
        assertEquals(0L, MkLogic.savingsAgainstPriciest(listOf(rice)))
        assertNull(MkLogic.cheapestOf(emptyList()))
    }

    @Test
    fun aSingleProductIsNeverCheaperThanItself() {
        assertEquals(0L, MkLogic.savingsAgainstPriciest(emptyList()))
        val samePrice = listOf(rice, product("dup", "Rice again", 7500))
        assertEquals(0L, MkLogic.savingsAgainstPriciest(samePrice))
    }

    @Test
    fun sortLabelsExistInBothLanguages() {
        assertEquals("Price: low first", MkLogic.productSortLabel(MkLogic.ProductSort.PRICE_LOW, false))
        assertEquals("কম দাম আগে", MkLogic.productSortLabel(MkLogic.ProductSort.PRICE_LOW, true))
        assertTrue(MkLogic.productSortLabel(MkLogic.ProductSort.NAME, true).none { it in 'A'..'z' })
    }
}
