package bd.info.bsdc.app.feature.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcEditSheet
import bd.info.bsdc.app.core.designsystem.BsdcFormChecklist
import bd.info.bsdc.app.core.designsystem.BsdcFormChoiceRow
import bd.info.bsdc.app.core.designsystem.BsdcFormNumber
import bd.info.bsdc.app.core.designsystem.BsdcFormSection
import bd.info.bsdc.app.core.designsystem.BsdcFormText
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import coil3.ImageLoader

/**
 * The event editor, in the app.
 *
 * Until now the host's card on an event page ended in "Edit on the web", while `update_event` had been
 * callable from this screen the whole time — the same gap the gig and job pages had, and the same fix.
 * The field set, their order and their labels are the web's `EventEditDialog`, so an event corrected
 * from a phone reads exactly as one corrected from a browser.
 *
 * The two date boxes are the point of the sheet. A host moves an event because the plan changed, and
 * `update_event` notifies everyone who had said they were coming — so the moment is typed in the
 * event's own zone, the end is checked against the start here rather than at the database, and the
 * subtitle tells the member that people will be told, before they press Save.
 */
@Composable
fun MkEventEditSheet(
    visible: Boolean,
    event: EventDetailDto,
    bn: Boolean,
    saving: Boolean,
    errorMessage: String,
    imageLoader: ImageLoader,
    onSave: (EventEditPayload) -> Unit,
    onDismiss: () -> Unit,
    mediaRepository: BsdcMediaRepository? = null,
) {
    if (!visible) return
    val tokens = BsdcThemeTokens.colors
    val zone = EventDetailLogic.zoneFor(event.timezone)
    val seed = remember(event.id, event.startsAt, event.endsAt, event.title) { EventEditLogic.formFrom(event) }
    var form by remember(event.id, event.startsAt, event.endsAt, event.title) { mutableStateOf(seed) }
    val issues = EventEditLogic.validate(form, event, zone)
    val dirty = EventEditLogic.isDirty(seed, form, zone)

    fun issue(prefix: String): String = issues.firstOrNull { issue -> issue.startsWith(prefix) }.orEmpty()

    BsdcEditSheet(
        visible = true,
        title = if (bn) "ইভেন্ট সম্পাদনা" else "Edit event",
        subtitle = if (bn) {
            "বিবরণ, তারিখ বা স্থান ঠিক করুন। তারিখ বদলালে অংশগ্রহণকারীদের জানানো হবে।"
        } else {
            "Correct the details, the date or the venue. Attendees are told if the date moves."
        },
        kicker = "/events/${event.slug}",
        onDismiss = onDismiss,
        primaryLabel = if (bn) "সংরক্ষণ" else "Save changes",
        primaryEnabled = issues.isEmpty() && dirty,
        onPrimary = { onSave(EventEditLogic.toPayload(form, zone)) },
        secondaryLabel = if (bn) "বাতিল" else "Cancel",
        onSecondary = onDismiss,
        busy = saving,
        errorMessage = errorMessage,
    ) {
        BsdcFormSection(
            title = if (bn) "ইভেন্ট" else "The event",
            subtitle = if (bn) {
                "যা মানুষ পাতায় দেখবে।"
            } else {
                "What a reader sees on the page."
            },
        ) {
            BsdcFormText(
                label = if (bn) "শিরোনাম" else "Title",
                value = form.title,
                onValueChange = { form = form.copy(title = it) },
                counter = "${form.title.trim().length}/${EventEditLogic.TITLE_MAX}",
                error = issue("Event title"),
                complete = form.title.trim().length in EventEditLogic.TITLE_MIN..EventEditLogic.TITLE_MAX,
                enabled = !saving,
            )
            BsdcFormText(
                label = if (bn) "বিবরণ" else "Description",
                value = form.description,
                onValueChange = { form = form.copy(description = it) },
                hint = if (bn) {
                    "খালি রাখলে বিবরণ মুছে যাবে।"
                } else {
                    "Leave it empty to remove the description."
                },
                error = issue("Event description"),
                singleLine = false,
                minLines = 5,
                maxLines = 12,
                counter = "${form.description.trim().length}/${EventEditLogic.DESCRIPTION_MAX}",
                imeAction = ImeAction.Default,
                enabled = !saving,
            )
        }

        BsdcFormSection(
            title = if (bn) "কখন" else "When",
            subtitle = if (bn) {
                "${event.timezone?.trim().orEmpty().ifEmpty { EventDetailLogic.DEFAULT_ZONE }} অনুযায়ী সময় দিন — " +
                    "তারিখ বদলালে যারা আসবে বলেছে সবাইকে জানানো হবে।"
            } else {
                "Times in ${event.timezone?.trim().orEmpty().ifEmpty { EventDetailLogic.DEFAULT_ZONE }}. " +
                    "Moving the date tells everyone who said they were coming."
            },
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BsdcFormText(
                    label = if (bn) "শুরু" else "Starts",
                    value = form.startsText,
                    onValueChange = { form = form.copy(startsText = it) },
                    hint = if (bn) "২০২৬-১২-০৬ ১৮:০০" else "2026-12-06 18:00",
                    error = issue("Starts reads like"),
                    leadingIcon = Icons.Rounded.PlayArrow,
                    complete = EventEditLogic.parses(form.startsText),
                    modifier = Modifier.weight(1f),
                    enabled = !saving,
                )
                BsdcFormText(
                    label = if (bn) "শেষ" else "Ends",
                    value = form.endsText,
                    onValueChange = { form = form.copy(endsText = it) },
                    hint = if (bn) "২০২৬-১২-০৬ ২০:৩০" else "2026-12-06 20:30",
                    error = issue("Ends reads like").ifEmpty { issue("An event has to end") },
                    leadingIcon = Icons.Rounded.Stop,
                    complete = EventEditLogic.parses(form.endsText),
                    modifier = Modifier.weight(1f),
                    enabled = !saving,
                )
            }
        }

        BsdcFormSection(
            title = if (bn) "কোথায়" else "Where",
            subtitle = if (bn) {
                "অনলাইন ইভেন্টে যোগ দেওয়ার লিংক লাগে, সরাসরি হলে স্থান — হাইব্রিডে দুটোর একটিই যথেষ্ট।"
            } else {
                "An online event needs its link, an in-person one its venue, and a hybrid any of them."
            },
        ) {
            BsdcFormChoiceRow(
                label = if (bn) "ধরন" else "Format",
                options = EventEditLogic.choices(bn),
                selected = form.mode,
                onChange = { form = form.copy(mode = it) },
                enabled = !saving,
            )
            BsdcFormText(
                label = if (bn) "স্থান" else "Venue",
                value = form.venue,
                onValueChange = { form = form.copy(venue = it) },
                counter = "${form.venue.trim().length}/${EventEditLogic.VENUE_MAX}",
                error = if (form.mode == EventEditLogic.IN_PERSON) {
                    issue("An in-person event").ifEmpty { issue("The venue is") }
                } else {
                    ""
                },
                complete = form.venue.trim().isNotEmpty() && form.venue.trim().length <= EventEditLogic.VENUE_MAX,
                leadingIcon = Icons.Rounded.LocationOn,
                enabled = !saving,
            )
            BsdcFormText(
                label = if (bn) "শহর" else "City",
                value = form.city,
                onValueChange = { form = form.copy(city = it) },
                counter = "${form.city.trim().length}/${EventEditLogic.CITY_MAX}",
                error = if (form.mode != EventEditLogic.ONLINE) issue("The venue is") else "",
                enabled = !saving,
            )
            BsdcFormText(
                label = if (bn) "যোগ দেওয়ার লিংক" else "Join link",
                value = form.joinUrl,
                onValueChange = { form = form.copy(joinUrl = it) },
                hint = if (bn) {
                    "সরাসরি HTTPS লিংক।"
                } else {
                    "A direct HTTPS link people join by."
                },
                error = if (form.mode == EventEditLogic.ONLINE) {
                    issue("An online event").ifEmpty { issue("A join link") }
                } else {
                    ""
                },
                complete = form.joinUrl.trim().isNotEmpty() &&
                    JobDetailLogic.isValidApplicationHttpsUrl(form.joinUrl),
                leadingIcon = Icons.Rounded.Link,
                keyboardType = KeyboardType.Uri,
                enabled = !saving,
            )
            BsdcFormNumber(
                label = if (bn) "আসনসংখ্যা" else "Capacity",
                value = form.capacityText,
                onValueChange = { form = form.copy(capacityText = it.filter { ch -> ch.isDigit() }.take(7)) },
                hint = if (bn) {
                    "খালি রাখলে যেকোনো সংখ্যক মানুষ আসতে পারবে; এখন ${event.goingCount} জন এসে গেছেন।"
                } else {
                    "Empty means no ceiling. ${event.goingCount} people are already going."
                },
                error = issue("Capacity"),
                enabled = !saving,
            )
        }

        BsdcFormSection(
            title = if (bn) "কভার ছবি" else "Cover picture",
            subtitle = if (bn) {
                "বিএসডিসি ইমেজ হোস্টের ছবি।"
            } else {
                "A picture from the BSDC image host."
            },
        ) {
            MkListingCoverField(
                coverUrl = form.coverUrl,
                onCoverUrl = { form = form.copy(coverUrl = it) },
                bn = bn,
                allowed = EventEditLogic.coverAllowed(form.coverUrl),
                error = issue("A cover"),
                imageLoader = imageLoader,
                mediaRepository = mediaRepository,
                enabled = !saving,
            )
        }

        BsdcFormChecklist(
            caption = if (bn) "সংরক্ষণের প্রস্তুতি" else "Ready to save?",
            items = EventEditLogic.checklist(form, event, zone, bn),
        )

        Text(
            text = if (bn) {
                "অংশগ্রহণের অবস্থা, আসনসংখ্যা ও বাতিলের অবস্থা এখান থেকে বদলানো যায় না — সেগুলো " +
                    "আয়োজনের ফলাফল। ইভেন্ট বাতিল বা মুছে ফেলার বোতাম উপরের কার্ডে, কারণ সেগুলো " +
                    "সবাইকে জানানো দরকার।"
            } else {
                "The RSVP status, the seat count and the cancelled flag are not on this form: they are " +
                    "consequences of running the event. Cancelling or deleting it is its own button, " +
                    "above, because those are the two changes every attendee has to be told about."
            },
            style = MaterialTheme.typography.labelSmall,
            color = tokens.mutedText,
            modifier = Modifier.padding(bottom = 2.dp),
        )
    }
}
