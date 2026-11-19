package bd.info.bsdc.app.feature.compose

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PollOptionsLogicTest {
    private val voted = listOf(
        StoredPollOption(position = 0, label = "Neovim", votes = 3),
        StoredPollOption(position = 1, label = "VS Code", votes = 1),
    )

    @Test
    fun anUnchangedPollIsNotWritten() {
        // The common save: the body changed and the poll did not. Nothing about
        // the poll is written, so nothing about it can be lost.
        assertEquals(PollWrite.Unchanged, PollOptionsLogic.decide(voted, listOf("Neovim", "VS Code")))
        assertEquals(
            PollWrite.Unchanged,
            PollOptionsLogic.decide(voted, listOf("  Neovim ", "VS Code", "")),
        )
    }

    @Test
    fun aPollNobodyVotedOnIsRewritten() {
        assertEquals(
            PollWrite.Replace(listOf("Yes", "No")),
            PollOptionsLogic.decide(emptyList(), listOf("Yes", "No")),
        )
        assertEquals(
            PollWrite.Replace(listOf("Yes", "No")),
            PollOptionsLogic.decide(
                listOf(
                    StoredPollOption(position = 0, label = "Ys", votes = 0),
                    StoredPollOption(position = 1, label = "No", votes = 0),
                ),
                listOf("Yes", "No"),
            ),
        )
    }

    @Test
    fun aPollThatHasVotesKeepsItsOptions() {
        assertEquals(PollWrite.Locked, PollOptionsLogic.decide(voted, listOf("Neovim", "Emacs")))
        assertEquals(PollWrite.Locked, PollOptionsLogic.decide(voted, emptyList()))
    }

    @Test
    fun optionsAreComparedInStoredOrderNotArrivalOrder() {
        val shuffled = listOf(
            StoredPollOption(position = 1, label = "VS Code", votes = 0),
            StoredPollOption(position = 0, label = "Neovim", votes = 0),
        )
        assertEquals(
            PollWrite.Unchanged,
            PollOptionsLogic.decide(shuffled, listOf("Neovim", "VS Code")),
        )
    }

    @Test
    fun theLockIsAnIllegalStateWithTheKeyTheDatabaseUses() {
        val error = PollOptionsLockedException()
        assertTrue(error is IllegalStateException)
        assertEquals("poll/options-locked", error.message)
    }
}
