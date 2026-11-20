package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OwnerActionsLogicTest {
    // ---------------------------- who sees what ----------------------------

    @Test
    fun theAuthorOfAnOpenGigMayEditCloseAndDelete() {
        val controls = OwnerActionsLogic.listingControls("open", isOwner = true, isStaff = false)
        assertTrue(controls.canEdit)
        assertTrue(controls.canClose)
        assertTrue(controls.canDelete)
        assertTrue(controls.any)
    }

    @Test
    fun aClosedGigOffersNoSecondCloseButStillOffersEdit() {
        // Correcting a closed listing is allowed on purpose: its text must not stay wrong.
        val controls = OwnerActionsLogic.listingControls("closed", isOwner = true, isStaff = false)
        assertTrue(controls.canEdit)
        assertFalse(controls.canClose)
        assertTrue(controls.canDelete)
    }

    @Test
    fun statusIsReadCaseAndSpaceInsensitively() {
        assertTrue(OwnerActionsLogic.listingControls(" OPEN ", true, false).canClose)
        assertFalse(OwnerActionsLogic.listingControls("Paused", true, false).canClose)
    }

    @Test
    fun aStrangerIsOfferedNothing() {
        val controls = OwnerActionsLogic.listingControls("open", isOwner = false, isStaff = false)
        assertFalse(controls.any)
        assertFalse(controls.canEdit)
        assertFalse(controls.canClose)
        assertFalse(controls.canDelete)
    }

    @Test
    fun staffMayDoEverythingEvenWithoutOwningTheRow() {
        val controls = OwnerActionsLogic.listingControls("open", isOwner = false, isStaff = true)
        assertTrue(controls.canEdit)
        assertTrue(controls.canClose)
        assertTrue(controls.canDelete)
    }

    // ------------------------------- groups --------------------------------

    @Test
    fun theOwnerOfAGroupMayEditAndDelete() {
        val controls = OwnerActionsLogic.groupControls("owner", isStaff = false)
        assertTrue(controls.canEdit)
        assertTrue(controls.canDelete)
        assertFalse(controls.canClose)
    }

    @Test
    fun aModeratorMayCorrectAGroupButNotDeleteIt() {
        // update_group admits a moderator; delete_group does not. Offering the trash button
        // would be offering a button whose only outcome is a refusal.
        for (role in listOf("moderator", "admin")) {
            val controls = OwnerActionsLogic.groupControls(role, isStaff = false)
            assertTrue("$role should edit", controls.canEdit)
            assertFalse("$role should not delete", controls.canDelete)
        }
    }

    @Test
    fun aPlainMemberAndAStrangerGetNoGroupControls() {
        assertFalse(OwnerActionsLogic.groupControls("member", isStaff = false).any)
        assertFalse(OwnerActionsLogic.groupControls(null, isStaff = false).any)
        assertFalse(OwnerActionsLogic.groupControls("  ", isStaff = false).any)
    }

    @Test
    fun staffAdministerAnyGroup() {
        val controls = OwnerActionsLogic.groupControls(null, isStaff = true)
        assertTrue(controls.canEdit)
        assertTrue(controls.canDelete)
    }

    // ------------------------------- events --------------------------------

    @Test
    fun theHostOfAnEventMayCorrectCancelAndDelete() {
        val controls = OwnerActionsLogic.eventControls(
            isHost = true,
            groupRole = null,
            isCancelled = false,
            isStaff = false,
        )
        assertTrue(controls.canEdit)
        assertTrue(controls.canClose)
        assertTrue(controls.canDelete)
    }

    @Test
    fun anAlreadyCancelledEventOffersNoSecondCancel() {
        val controls = OwnerActionsLogic.eventControls(
            isHost = true,
            groupRole = null,
            isCancelled = true,
            isStaff = false,
        )
        assertTrue(controls.canEdit)
        assertFalse(controls.canClose)
        assertTrue(controls.canDelete)
    }

    @Test
    fun aGroupModeratorMayCorrectAnEventTheyDoNotHost() {
        val controls = OwnerActionsLogic.eventControls(
            isHost = false,
            groupRole = "Moderator",
            isCancelled = false,
            isStaff = false,
        )
        assertTrue(controls.canEdit)
        assertTrue(controls.canClose)
    }

    @Test
    fun anAttendeeOrAStrangerGetsNoEventControls() {
        assertFalse(
            OwnerActionsLogic.eventControls(
                isHost = false,
                groupRole = "member",
                isCancelled = false,
                isStaff = false,
            ).any,
        )
        assertFalse(
            OwnerActionsLogic.eventControls(
                isHost = false,
                groupRole = null,
                isCancelled = false,
                isStaff = false,
            ).any,
        )
    }

    // --------------------------- what the dialog says ----------------------

    @Test
    fun aDeleteThatTakesSomebodysWorkSaysHowMuch() {
        assertEquals(
            "The gig is removed with its 7 proposals. Every freelancer who bid is told.",
            OwnerActionsLogic.deleteMessage(OwnerActionsLogic.DeleteMessage.GIG, 7, bn = false),
        )
        assertEquals(
            "The gig is removed with its 1 proposal. Every freelancer who bid is told.",
            OwnerActionsLogic.deleteMessage(OwnerActionsLogic.DeleteMessage.GIG, 1, bn = false),
        )
        assertEquals(
            "The role is removed with its 3 applications. Every applicant still waiting is told.",
            OwnerActionsLogic.deleteMessage(OwnerActionsLogic.DeleteMessage.JOB, 3, bn = false),
        )
    }

    @Test
    fun aDeleteWithNothingAttachedUsesTheShorterSentence() {
        assertEquals(
            "The gig is removed. This cannot be undone.",
            OwnerActionsLogic.deleteMessage(OwnerActionsLogic.DeleteMessage.GIG, 0, bn = false),
        )
        assertEquals(
            "The role is removed. This cannot be undone.",
            OwnerActionsLogic.deleteMessage(OwnerActionsLogic.DeleteMessage.JOB, 0, bn = false),
        )
    }

    @Test
    fun everyMessageHasABanglaForm() {
        for (key in OwnerActionsLogic.DeleteMessage.values()) {
            val en = OwnerActionsLogic.deleteMessage(key, 2, bn = false)
            val bn = OwnerActionsLogic.deleteMessage(key, 2, bn = true)
            assertTrue("$key delete en", en.isNotBlank())
            assertTrue("$key delete bn", bn.isNotBlank())
            assertTrue("$key delete differs", en != bn)
            assertTrue("$key close en", OwnerActionsLogic.closeMessage(key, bn = false).isNotBlank())
            assertTrue("$key close bn", OwnerActionsLogic.closeMessage(key, bn = true).isNotBlank())
        }
    }

    @Test
    fun closingSaysThatNothingIsRemoved() {
        // A client who believes closing destroys the bids will not close a stale gig.
        val gig = OwnerActionsLogic.closeMessage(OwnerActionsLogic.DeleteMessage.GIG, bn = false)
        assertTrue(gig.contains("proposals stay"))
        val job = OwnerActionsLogic.closeMessage(OwnerActionsLogic.DeleteMessage.JOB, bn = false)
        assertTrue(job.contains("applications stay"))
    }

    // ------------------------------ presses --------------------------------

    @Test
    fun aBusyControlRefusesASecondPress() {
        val controls = OwnerActionsLogic.listingControls("open", isOwner = true, isStaff = false)
        assertTrue(OwnerActionsLogic.canPress(false, controls, OwnerActionsLogic.Confirmation.CLOSE))
        assertFalse(OwnerActionsLogic.canPress(true, controls, OwnerActionsLogic.Confirmation.CLOSE))
        assertFalse(OwnerActionsLogic.canPress(true, controls, OwnerActionsLogic.Confirmation.DELETE))
    }

    @Test
    fun aPressIsRefusedWhenTheControlWouldNotBeOffered() {
        val closed = OwnerActionsLogic.listingControls("closed", isOwner = true, isStaff = false)
        assertFalse(OwnerActionsLogic.canPress(false, closed, OwnerActionsLogic.Confirmation.CLOSE))
        assertTrue(OwnerActionsLogic.canPress(false, closed, OwnerActionsLogic.Confirmation.DELETE))

        val moderator = OwnerActionsLogic.groupControls("moderator", isStaff = false)
        assertFalse(OwnerActionsLogic.canPress(false, moderator, OwnerActionsLogic.Confirmation.DELETE))
        assertFalse(OwnerActionsLogic.canPress(false, moderator, OwnerActionsLogic.Confirmation.CLOSE))
    }

    @Test
    fun anUnchangedFieldIsSentAsNullSoTheRoutineLeavesItAlone() {
        // `update_*` reads null as "leave this column as it is" and an empty string as
        // "clear it" — the distinction the edit form relies on for an untouched cover.
        assertNull(OwnerActionsLogic.clearedValue("https://i.ibb.co/x.png", "https://i.ibb.co/x.png"))
        assertEquals("https://i.ibb.co/y.png", OwnerActionsLogic.clearedValue("https://i.ibb.co/x.png", "https://i.ibb.co/y.png"))
        assertEquals("", OwnerActionsLogic.clearedValue("https://i.ibb.co/x.png", ""))
        assertEquals("", OwnerActionsLogic.clearedValue(null, ""))
    }
}
