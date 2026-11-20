package bd.info.bsdc.app.feature.discover

/**
 * Pure rules for the owner controls on a gig, job or event.
 *
 * The database routines (migration 0128) decide who may write; these functions decide what the
 * app *shows*, and they answer the same questions the website's `OwnerActions` and
 * `ListingEditForm` answer — whether the controls appear at all, which ones, and what the
 * confirmation says before something irreversible happens.
 *
 * Two rules matter and are the reason this is not inlined into a composable:
 *
 *  - A **close** is soft and belongs to whoever may correct the listing; a **delete** is only
 *    offered when the reader is the owner or staff, matching `delete_gig`/`delete_job`/
 *    `delete_event`, which refuse a moderator. A moderator therefore sees "edit" without a
 *    trash button rather than a button whose only outcome is an error.
 *  - A delete that takes somebody else's work with it must **say how much**. The routine
 *    reports the count (proposals, applications, RSVPs) and the dialog repeats it, because
 *    "delete this gig?" is not the same question as "delete this gig and 7 proposals?".
 */
object OwnerActionsLogic {
    /** The controls a reader is offered, in the order the website renders them. */
    data class Controls(
        val canEdit: Boolean,
        val canClose: Boolean,
        val canDelete: Boolean,
    ) {
        val any: Boolean get() = canEdit || canClose || canDelete
    }

    private val NONE = Controls(canEdit = false, canClose = false, canDelete = false)

    /**
     * What the listing's owner may do.
     *
     * [status] is the row's own status; a closed gig or job offers no way to close it again.
     * [isOwner] is the listing's author; [isStaff] adds the delete for community staff, which
     * every 0128 routine admits. Editing is offered whenever the reader owns the row, because
     * `update_*` admits the author regardless of status — correcting a closed listing is
     * allowed on purpose, so its text does not stay wrong forever.
     */
    fun listingControls(
        status: String,
        isOwner: Boolean,
        isStaff: Boolean,
    ): Controls {
        if (!isOwner && !isStaff) return NONE
        val open = status.trim().lowercase() == "open"
        return Controls(canEdit = true, canClose = open, canDelete = true)
    }

    /**
     * What a group's reader may do.
     *
     * `update_group` admits a moderator, `delete_group` admits only the owner (or staff), so
     * the two answers genuinely differ here — this is the one place a moderator gets edit
     * without delete.
     */
    fun groupControls(myRole: String?, isStaff: Boolean): Controls {
        val role = myRole?.trim()?.lowercase()
        val moderates = role == "owner" || role == "admin" || role == "moderator"
        val owns = role == "owner"
        return Controls(
            canEdit = moderates || isStaff,
            canClose = false,
            canDelete = owns || isStaff,
        )
    }

    /**
     * What an event's reader may do: the host, a moderator of the organising group, or staff.
     * [groupRole] is the reader's role in [groupId]'s group, or null when the event belongs to
     * no group or the reader is not a member.
     */
    fun eventControls(
        isHost: Boolean,
        groupRole: String?,
        isCancelled: Boolean,
        isStaff: Boolean,
    ): Controls {
        val moderates = groupRole?.trim()?.lowercase() in setOf("owner", "admin", "moderator")
        if (!isHost && !moderates && !isStaff) return NONE
        return Controls(canEdit = true, canClose = !isCancelled, canDelete = true)
    }

    /**
     * The sentence shown before a destructive confirmation, with the count that makes it
     * honest. A count of zero chooses the shorter wording — there is nobody to warn.
     */
    fun deleteMessage(key: DeleteMessage, count: Int, bn: Boolean): String = when (key) {
        DeleteMessage.GIG -> when {
            count <= 0 -> if (bn) "এই কাজটি মুছে যাবে। এটি ফেরানো যাবে না।" else "The gig is removed. This cannot be undone."
            bn -> "এই কাজটি তার $countটি প্রস্তাবসহ মুছে যাবে। প্রস্তাব দেওয়া প্রত্যেককে জানানো হবে।"
            else -> "The gig is removed with its $count proposal${if (count == 1) "" else "s"}. Every freelancer who bid is told."
        }
        DeleteMessage.JOB -> when {
            count <= 0 -> if (bn) "এই পদটি মুছে যাবে। এটি ফেরানো যাবে না।" else "The role is removed. This cannot be undone."
            bn -> "এই পদটি তার $countটি আবেদনসহ মুছে যাবে। অপেক্ষমাণ প্রত্যেককে জানানো হবে।"
            else -> "The role is removed with its $count application${if (count == 1) "" else "s"}. Every applicant still waiting is told."
        }
        DeleteMessage.EVENT -> when {
            count <= 0 -> if (bn) "ইভেন্টটি মুছে যাবে।" else "The event is removed."
            bn -> "ইভেন্ট ও তার $countটি আরএসভি মুছে যাবে, এবং সবাইকে জানানো হবে।"
            else -> "The event and its $count RSVP${if (count == 1) "" else "s"} are removed, and everybody is told."
        }
        DeleteMessage.GROUP -> if (bn) {
            "গ্রুপ ও তার চ্যানেলগুলো মুছে যাবে। চ্যানেলের পোস্ট লেখকের কাছে থাকবে কিন্তু আর্কাইভ হবে।"
        } else {
            "The group and its channels are removed. Posts inside them stay with their authors but are archived."
        }
    }

    enum class DeleteMessage { GIG, JOB, EVENT, GROUP }

    /**
     * Which of the two confirmations a press opens. A close is reversible in spirit; a delete
     * is not, so the button that reaches it is styled accordingly on the screen.
     */
    enum class Confirmation { CLOSE, DELETE }

    /**
     * What the close confirmation promises. Close never removes anything, and saying so
     * matters: a client who believes closing destroys the bids will not close a gig that has
     * gone stale.
     */
    fun closeMessage(key: DeleteMessage, bn: Boolean): String = when (key) {
        DeleteMessage.GIG -> if (bn) {
            "কাজটি বন্ধ হবে এবং যাঁরা প্রস্তাব দিয়েছেন সবাইকে জানানো হবে। প্রস্তাবগুলো থেকে যাবে।"
        } else {
            "It stops accepting proposals and every freelancer who bid is told. The proposals stay."
        }
        DeleteMessage.JOB -> if (bn) {
            "আবেদন নেওয়া বন্ধ হবে এবং অপেক্ষমাণ প্রত্যেককে জানানো হবে। আবেদনগুলো থেকে যাবে।"
        } else {
            "It stops accepting applications and every applicant still waiting is told. The applications stay."
        }
        DeleteMessage.EVENT -> if (bn) {
            "পাতাটি থেকে যাবে ও বাতিল বলে দেখাবে, এবং সবাইকে জানানো হবে।"
        } else {
            "The page stays and says it was cancelled, and everybody is told."
        }
        DeleteMessage.GROUP -> if (bn) "গ্রুপটি আর্কাইভ হবে।" else "The group is archived."
    }

    /**
     * Whether the reader is still allowed to press the control they are looking at.
     *
     * The button holds its busy state while a routine runs, and a second press would send a
     * second write. Closing is idempotent at the database, but the notification fan-out is
     * not free, so the press is refused here first.
     */
    fun canPress(busy: Boolean, controls: Controls, confirmation: Confirmation): Boolean =
        !busy && when (confirmation) {
            Confirmation.CLOSE -> controls.canClose
            Confirmation.DELETE -> controls.canDelete
        }

    /** The empty string vs null dance: the routines read null as "leave it alone". */
    fun clearedValue(current: String?, next: String): String? =
        if (current == next) null else next
}
