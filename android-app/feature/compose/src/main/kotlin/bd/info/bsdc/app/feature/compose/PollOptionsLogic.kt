package bd.info.bsdc.app.feature.compose

/**
 * A poll option as the database holds it, with the ballots it carries.
 *
 * `votes` is what makes the difference between a poll and a record of what
 * people answered: the app may reword a poll nobody has voted on, and must not
 * touch one that has answers.
 */
internal data class StoredPollOption(
    val position: Int,
    val label: String,
    val votes: Int,
)

/** What a save has to do to a post's poll. */
internal sealed interface PollWrite {
    /** The poll is exactly what it was: no delete, no insert, nothing to lose. */
    data object Unchanged : PollWrite

    /** Somebody voted. The options are frozen; the save is refused with a sentence. */
    data object Locked : PollWrite

    /** Nobody voted yet: replace the options with these labels. */
    data class Replace(val labels: List<String>) : PollWrite
}

/**
 * Whether a save has to touch the poll at all.
 *
 * The composer used to delete every option and re-insert the list on every save.
 * `poll_votes.option_id` cascades from `poll_options`, so that rewrite deleted
 * every ballot — correcting a typo in a poll's body emptied the poll, and the
 * options came back with new ids, so nothing was recoverable.
 *
 * This is the same decision the web client makes (`decidePollWrite`), and 0121
 * makes it in the database as well for every client that does not.
 */
internal object PollOptionsLogic {
    fun decide(stored: List<StoredPollOption>, options: List<String>): PollWrite {
        val labels = options.map { it.trim() }.filter { it.isNotEmpty() }
        val existing = stored.sortedBy { it.position }

        if (existing.map { it.label } == labels) return PollWrite.Unchanged
        if (existing.any { it.votes > 0 }) return PollWrite.Locked
        return PollWrite.Replace(labels)
    }
}

/** The save stopped because the poll it was asked to rewrite already has votes. */
internal class PollOptionsLockedException : IllegalStateException("poll/options-locked")
