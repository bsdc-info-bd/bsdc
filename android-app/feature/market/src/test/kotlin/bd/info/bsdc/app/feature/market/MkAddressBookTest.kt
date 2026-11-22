package bd.info.bsdc.app.feature.market

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The address book and the shop's minimum order, on the platform that has no database to ask.
 *
 * Two halves on purpose. The first tests the rules as a member meets them: a number typed with
 * dashes, a basket that clears the minimum only once the ride is left out, a pin in Bangkok. The
 * second half reads migration 0131 itself and holds these constants against it — the routine is the
 * authority and this file is its echo, and an echo that agrees only with itself proves nothing. When
 * the SQL moves and Kotlin is left behind, that is the failure this catches. It reads the file the
 * same way the web parity test does, so both platforms are held to one source rather than to each
 * other's copy of it.
 */
class MkAddressBookTest {

    private val sylhet = 24.8949 to 91.8687

    // ------------------------------------------------------------------ the minimum order

    @Test
    fun aShopThatSetsNothingTakesAnyBasket() {
        assertEquals(0L, MkLogic.minimumOrderShortfallPoisha(1L, 0L))
        assertFalse(MkLogic.hasMinimumOrder(0L))
    }

    @Test
    fun theGoodsAreMeasuredAndNeverTheRide() {
        // 600 taka of tea at a 700 taka minimum, plus a 150 taka delivery charge. The total clears
        // 700 and the order still fails, because the charge is not something the customer bought. A
        // screen that compared totals would promise an order `mk_place_order` then refuses.
        val subtotal = 60_000L
        val fee = 15_000L
        assertEquals(10_000L, MkLogic.minimumOrderShortfallPoisha(subtotal, 70_000L))
        assertEquals(0L, MkLogic.minimumOrderShortfallPoisha(subtotal + fee, 70_000L))
        assertTrue(MkLogic.hasMinimumOrder(70_000L))
    }

    @Test
    fun anExactlyEqualBasketIsMetAndANonsenseMinimumIsNoMinimum() {
        assertEquals(0L, MkLogic.minimumOrderShortfallPoisha(70_000L, 70_000L))
        assertEquals(0L, MkLogic.minimumOrderShortfallPoisha(1L, -500L))
    }

    // -------------------------------------------------------------------- the draft form

    @Test
    fun aPhoneTypedWithSeparatorsIsTheNumberTheRoutineStripsTo() {
        val check = MkLogic.checkAddressDraft(
            name = "Rahim Uddin",
            phone = "01712-345678",
            line = "House 4, Road 7, Zindabazar",
            lat = sylhet.first,
            lng = sylhet.second,
        )
        assertFalse(check.phone)
        assertTrue(check.ok)
    }

    private fun errors(
        phone: String = "01712345678",
        name: String = "Rahim",
        line: String = "House 4, Zindabazar",
        nickname: String = "",
        label: String = "home",
        pin: Pair<Double, Double>? = sylhet,
    ) = MkLogic.checkAddressDraft(
        name = name,
        phone = phone,
        line = line,
        nickname = nickname,
        label = label,
        lat = pin?.first,
        lng = pin?.second,
    )

    @Test
    fun eachRefusalBelongsToItsOwnField() {
        assertTrue(errors(name = "A").name)
        assertTrue(errors(phone = "0171234567").phone)
        assertTrue(errors(line = "Hous").line)
        assertTrue(errors(nickname = "x".repeat(41)).nickname)
        assertTrue(errors(pin = null).pin)
        assertTrue(errors(label = "flat").label)
        // A pin in Bangkok is inside no shop's area and outside this country. The fee it would
        // compute is a number with no meaning, so the form refuses it instead of showing 150 taka.
        assertTrue(errors(pin = 13.7563 to 100.5018).pin)
        assertTrue(errors().ok)
    }

    @Test
    fun theLabelsACardCanHoldAreTheThreeTheColumnAllows() {
        assertEquals(listOf("home", "work", "other"), MkLogic.ADDRESS_LABELS)
        assertEquals("Home", MkLogic.addressLabel("home", false))
        assertEquals("অফিস", MkLogic.addressLabel("work", true))
        assertEquals("অন্যান্য", MkLogic.addressLabel("other", true))
    }

    @Test
    fun aCardIsHeadedByWhatTheMemberCalledTheDoor() {
        assertEquals("Ammu flat", headline("work", "Ammu flat"))
        assertEquals("Work", headline("work", "   "))
        assertEquals("Other", headline("other", ""))
    }

    // ------------------------------------------------------------- parity with migration 0131

    @Test
    fun theBookHoldsExactlyAsManyRowsAsTheRoutineCounts() {
        val cap = Regex("""if v_count >= (\d+) then""").find(migration())?.groupValues?.get(1)
        assertEquals(MkLogic.ADDRESS_MAX.toString(), cap)
    }

    @Test
    fun thePhoneRuleIsTheColumnPatternAndNotAnInvention() {
        val pattern = Regex("""phone ~ '([^']+)'""").find(migration())?.groupValues?.get(1)
        assertEquals("^01[3-9][0-9]{8}", pattern?.trimEnd('$'))
    }

    @Test
    fun theLengthsAreTheColumnLengths() {
        val sql = migration()
        assertEquals(
            listOf(MkLogic.RECIPIENT_NAME_MIN, MkLogic.RECIPIENT_NAME_MAX),
            pair(sql, """char_length\(btrim\(recipient_name\)\) between (\d+) and (\d+)"""),
        )
        assertEquals(
            listOf(MkLogic.ADDRESS_LINE_MIN, MkLogic.ADDRESS_LINE_MAX),
            pair(sql, """char_length\(btrim\(address_line\)\) between (\d+) and (\d+)"""),
        )
        assertEquals(
            MkLogic.ADDRESS_NICKNAME_MAX,
            Regex("""char_length\(nickname\) <= (\d+)""").find(sql)?.groupValues?.get(1)?.toInt(),
        )
    }

    @Test
    fun theMinimumIsComparedAgainstTheSubtotalAndPricedInWholeTaka() {
        val sql = migration()
        // The one line the whole feature turns on. If it ever reads a total, this test breaks, and it
        // should: a delivery charge must not be able to carry a basket past a shop's minimum.
        assertTrue(Regex("""v_subtotal\s*<\s*v_vendor\.min_order_poisha""").containsMatchIn(sql))
        assertFalse(Regex("""v_subtotal \+ v_fee\s*<\s*v_vendor\.min_order_poisha""").containsMatchIn(sql))
        // The setter speaks whole taka, like every other shop knob, and multiplies on the way in.
        assertTrue(sql.contains("min_order_poisha = p_taka::bigint * 100"))
        // The app's field tops out at 100,000 taka. Being no stricter than the routine is the rule: a
        // panel that refused what the routine accepts has an opinion of its own, and the vendor hears
        // "not saved" with no reason behind it.
        val ceiling = Regex("""p_taka > (\d+)""").find(sql)?.groupValues?.get(1)?.toLong()
        assertTrue("the app lets a vendor type more than the routine accepts", ceiling != null && 100_000L <= ceiling)
    }

    @Test
    fun anOrderNamesASavedAddressAndTheRoutineReadsTheRow() {
        val sql = migration()
        assertTrue(sql.contains("p_address_id"))
        // Not "the client may send a copy": the pin decides the fee, the radius and where the rider
        // goes, so it has to come from the table. A rename of the lookup is this test's job.
        assertTrue(Regex("""from public\.mk_addresses\s+where id = p_address_id""").containsMatchIn(sql))
    }

    @Test
    fun theTableColumnsClampThePinToThisCountry() {
        val sql = migration()
        // The migration aligns its column definitions with spaces, which is why these read \s+.
        assertEquals(
            listOf(MkLogic.BD_LAT_MIN, MkLogic.BD_LAT_MAX),
            pairD(sql, """lat\s+numeric\(9, 6\) not null check \(lat between ([\d.]+) and ([\d.]+)\)"""),
        )
        assertEquals(
            listOf(MkLogic.BD_LNG_MIN, MkLogic.BD_LNG_MAX),
            pairD(sql, """lng\s+numeric\(9, 6\) not null check \(lng between ([\d.]+) and ([\d.]+)\)"""),
        )
    }

    @Test
    fun theRepositoryCallsTheRoutinesThatExist() {
        val sql = migration()
        val repository = readRepoFile(
            "feature",
            "market",
            "src",
            "main",
            "kotlin",
            "bd",
            "info",
            "bsdc",
            "app",
            "feature",
            "market",
            "MkRepository.kt",
        )
        for (rpc in listOf("mk_my_addresses", "mk_save_address", "mk_delete_address", "mk_vendor_set_min_order")) {
            assertTrue("$rpc is not defined by 0131", sql.contains("function public.$rpc("))
            assertTrue("$rpc is never called", repository.contains("\"$rpc\""))
        }
    }

    // -------------------------------------------------------------------------- plumbing

    private fun headline(label: String, nickname: String) =
        MkLogic.addressHeadline(MkSavedAddressDto(label = label, nickname = nickname), false)

    private fun pair(sql: String, pattern: String): List<Int>? =
        Regex(pattern).find(sql)?.destructured?.let { listOf(it.component1().toInt(), it.component2().toInt()) }

    private fun pairD(sql: String, pattern: String): List<Double>? =
        Regex(pattern).find(sql)?.destructured?.let { listOf(it.component1().toDouble(), it.component2().toDouble()) }

    /**
     * The migration's own text, walked up from the module directory the test runs in: tests are
     * launched with the module as the working directory, so this cannot assume how Gradle was run.
     */
    private fun migration(): String {
        val start = File(System.getProperty("user.dir")).absoluteFile
        var dir: File? = start
        repeat(6) {
            val found = dir?.resolve("supabase")?.resolve("migrations")
                ?.listFiles { file -> file.name.startsWith("0131_") && file.name.endsWith(".sql") }
                ?.firstOrNull()
            if (found != null) return found.readText()
            dir = dir?.parentFile
        }
        error("0131 is not reachable above $start — the parity half of this test must not be skipped")
    }

    private fun readRepoFile(vararg parts: String): String {
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        repeat(6) {
            val candidate = dir?.let { root -> parts.fold(root) { acc, part -> acc.resolve(part) } }
            if (candidate != null && candidate.isFile) return candidate.readText()
            dir = dir?.parentFile
        }
        error("could not find ${parts.joinToString("/")} above ${System.getProperty("user.dir")}")
    }
}
