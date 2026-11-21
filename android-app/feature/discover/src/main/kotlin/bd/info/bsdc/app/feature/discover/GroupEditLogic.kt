package bd.info.bsdc.app.feature.discover

/**
 * The rules behind the group edit sheet.
 *
 * `update_group` treats a JSON null as "leave this column alone", so an edit screen has to decide,
 * field by field, whether the member *said* something or merely left it as they found it. That
 * decision is the whole risk of the feature: get it wrong and editing a group's name silently clears
 * its cover image. It is kept here, as plain functions on plain values, so it can be tested without a
 * device — and so the wording of the constraints matches the wording the create form already uses.
 *
 * The field-by-field mapping mirrors `GroupEditDialog` in
 * `main-site/src/components/communities/CommunityEditForm.tsx`, deliberately: the same group edited
 * from the app and from the browser must end up with the same row.
 */

/** `bsdc_group_privacy` (migration 0011): three values, no fourth. */
enum class GroupPrivacy(val wire: String) {
    PUBLIC("public"),
    PRIVATE("private"),
    SECRET("secret"),
    ;

    companion object {
        /** Anything unrecognised reads as `public`, the column's own default. */
        fun fromWire(value: String?): GroupPrivacy = values().firstOrNull { it.wire == value } ?: PUBLIC
    }
}

/** What the sheet holds while the member types. */
data class GroupEditForm(
    val name: String = "",
    val description: String = "",
    val rules: String = "",
    val privacy: GroupPrivacy = GroupPrivacy.PUBLIC,
    val language: String = "bn",
    val avatarUrl: String = "",
    val coverUrl: String = "",
)

/** What `update_group` is sent. A null means "do not touch this column". */
data class GroupEditPayload(
    val name: String,
    val description: String,
    val rules: String?,
    val privacy: String?,
    val language: String?,
    val avatarUrl: String?,
    val coverUrl: String?,
)

object GroupEditLogic {
    /**
     * The same numbers the create form enforces — `ComposerValidationEngine.validateGroupDraft` uses
     * these limits and `GroupEditLogicTest` fails if the two ever drift apart.
     */
    const val NAME_MIN = 3
    const val NAME_MAX = 80
    const val DESCRIPTION_MAX = 2000

    val LANGUAGES = listOf("bn", "en")

    fun formFrom(group: GroupDetailDto): GroupEditForm = GroupEditForm(
        name = group.name,
        description = group.description.orEmpty(),
        rules = group.rules.orEmpty(),
        privacy = GroupPrivacy.fromWire(group.privacy),
        language = if (group.language in LANGUAGES) group.language.orEmpty() else "bn",
        avatarUrl = group.avatarUrl.orEmpty(),
        coverUrl = group.coverUrl.orEmpty(),
    )

    /**
     * Sentences, not error codes — the sheet prints them straight under the field it complains about.
     *
     * The phrasing is the create form's, so a member who was refused while making a group is refused
     * the same way while renaming one.
     */
    fun validate(form: GroupEditForm): List<String> {
        val issues = mutableListOf<String>()
        val name = form.name.trim()
        if (name.length < NAME_MIN || name.length > NAME_MAX) {
            issues += "Group name must be between $NAME_MIN and $NAME_MAX characters."
        }
        if (form.description.length > DESCRIPTION_MAX) {
            issues += "Group description cannot exceed $DESCRIPTION_MAX characters."
        }
        return issues
    }

    fun isValid(form: GroupEditForm): Boolean = validate(form).isEmpty()

    /**
     * The payload, with the web's per-field shape.
     *
     * `rules` and `avatarUrl` blank out to null, because the web does the same and because a blank
     * text box is not a member asking to erase their avatar. `coverUrl` is sent trimmed as typed,
     * blank included — that is how the web clears a cover, so the app must too, or the same two taps
     * would leave two different rows.
     *
     * `privacy` and `language` are never null: they are chosen from a closed list, and a sheet that
     * displayed `public` sent `public`.
     */
    fun toPayload(form: GroupEditForm): GroupEditPayload = GroupEditPayload(
        name = form.name.trim(),
        description = form.description.trim(),
        rules = form.rules.trim().takeIf { it.isNotEmpty() },
        privacy = form.privacy.wire,
        language = form.language,
        avatarUrl = form.avatarUrl.trim().takeIf { it.isNotEmpty() },
        coverUrl = form.coverUrl.trim(),
    )

    /** Whether the Save button has anything to do. */
    fun isDirty(initial: GroupEditForm, form: GroupEditForm): Boolean = toPayload(initial) != toPayload(form)

    /**
     * One sentence for a failed save.
     *
     * `update_group` raises `groups/not-owner` and `groups/not-mod` for the two ways a member can be
     * past their authority, and both mean the same thing on screen: somebody else closed that door.
     */
    fun editFailureMessage(error: Throwable, bn: Boolean): String {
        val text = error.message.orEmpty()
        return when {
            text.contains("not-owner") || text.contains("not-mod") ->
                if (bn) "গ্রুপটি সম্পাদনা করার অনুমতি আপনার নেই।" else "You no longer have permission to edit this group."
            text.contains("name") && text.contains("least") ->
                if (bn) "নামটি খুব ছোট।" else "The group name is too short."
            else -> if (bn) "গ্রুপ সম্পাদনা করা যায়নি।" else "Could not save the group."
        }
    }
}
