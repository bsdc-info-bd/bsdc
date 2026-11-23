package bd.info.bsdc.app.feature.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcChecklistItem
import bd.info.bsdc.app.core.designsystem.BsdcEditSheet
import bd.info.bsdc.app.core.designsystem.BsdcFilterPill
import bd.info.bsdc.app.core.designsystem.BsdcFormChecklist
import bd.info.bsdc.app.core.designsystem.BsdcFormNumber
import bd.info.bsdc.app.core.designsystem.BsdcFormReviewRow
import bd.info.bsdc.app.core.designsystem.BsdcFormSection
import bd.info.bsdc.app.core.designsystem.BsdcFormText
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens

/**
 * Bidding on a gig, as a sheet rather than a dialog.
 *
 * A proposal is a sales pitch with a price on it, and the old control treated it like a form to get
 * through: three boxes in an `AlertDialog`, one sentence of validation dumped under all three at once,
 * and no answer to the only question a bidder actually has — *is my number sensible against what the
 * client asked for*.
 *
 * So the sheet starts from the gig's own budget line, which the member was already reading when they
 * decided to bid, and keeps it on screen while they type. It refuses each problem where it belongs —
 * `DiscoverSearchEngine.proposalProblems` is the rule, and its codes are translated under the field
 * that caused them, not at the bottom of the dialog. And it shows the pitch and the numbers once more
 * before they are sent, because a proposal cannot be edited afterwards and a client reads the bid and
 * the delivery window as one offer.
 *
 * The numbers are the ones the gig's own ceiling uses: at least one day, at most
 * `DiscoverSearchEngine.MAX_DELIVERY_DAYS`, which is the same 3,650 a gig's duration is capped at.
 */
@Composable
fun MkGigProposalSheet(
    visible: Boolean,
    gig: GigDto,
    bn: Boolean,
    sending: Boolean,
    errorMessage: String,
    onSubmit: (pitch: String, bid: Int, days: Int) -> Unit,
    onDismiss: () -> Unit,
) {
    if (!visible) return
    val tokens = BsdcThemeTokens.colors
    var pitch by remember(gig.id) { mutableStateOf("") }
    var bidText by remember(gig.id) { mutableStateOf("") }
    var daysText by remember(gig.id) { mutableStateOf("7") }
    var reviewing by remember(gig.id) { mutableStateOf(false) }

    val bid = bidText.trim().toIntOrNull()
    val days = daysText.trim().toIntOrNull()
    // The same formatter the gig editor uses for its own live budget line, fed from the published row:
    // one place knows how a band is written, and a bid is weighed against exactly the string the
    // member read on the gig page.
    val budgetLine = GigEditLogic.budgetLine(
        GigEditForm(
            budgetMinText = gig.budgetMin?.toString().orEmpty(),
            budgetMaxText = gig.budgetMax?.toString().orEmpty(),
            isHourly = gig.isHourly,
        ),
        gig.currency,
    )
    val problems = DiscoverSearchEngine.proposalProblems(pitch, bid, days)
    fun problem(code: String): String =
        if (code in problems) proposalProblemMessage(code, bn) else ""

    // The per-day figure is the one number a bid does not state and a client compares anyway. It is
    // derived, never sent: `submit_proposal` takes the bid and the window, and the arithmetic is here so
    // the member can see what an hourly-looking number implies before they commit to it.
    val perDay = if (bid != null && days != null && days > 0) bid / days else null

    BsdcEditSheet(
        visible = true,
        title = if (bn) "প্রস্তাব পাঠান" else "Send a proposal",
        subtitle = if (reviewing) {
            if (bn) {
                "পাঠানোর আগে দেখে নিন — ক্লায়েন্ট এই তিনটিই পড়বে, আর পাঠানোর পর বদলানো যাবে না।"
            } else {
                "Check it once. The client reads these three things, and a sent proposal cannot be edited."
            }
        } else {
            if (bn) {
                "আপনার পরিকল্পনা, আপনার দর, আর কত দিনে দেবেন।"
            } else {
                "Your approach, your price, and how long you need."
            }
        },
        kicker = if (bn) {
            "«${gig.title}» গিগের জন্য প্রস্তাব"
        } else {
            "Proposal for ${gig.title}"
        },
        onDismiss = onDismiss,
        primaryLabel = when {
            sending -> if (bn) "পাঠানো হচ্ছে…" else "Sending…"
            reviewing -> if (bn) "প্রস্তাব পাঠান" else "Send proposal"
            else -> if (bn) "আগে দেখে নিন" else "Review proposal"
        },
        primaryEnabled = (problems.isEmpty() || reviewing) && !sending,
        onPrimary = {
            if (reviewing) {
                onSubmit(pitch.trim(), bid ?: 0, days ?: 7)
            } else {
                reviewing = true
            }
        },
        secondaryLabel = if (reviewing) {
            if (bn) "লেখা বদলান" else "Edit the pitch"
        } else {
            if (bn) "বাতিল" else "Cancel"
        },
        onSecondary = {
            if (reviewing) {
                reviewing = false
            } else {
                onDismiss()
            }
        },
        busy = sending,
        errorMessage = errorMessage,
    ) {
        if (!reviewing) {
            BsdcFormSection(
                title = if (bn) "আপনার প্রস্তাব" else "Your pitch",
                subtitle = if (bn) {
                    "কী করবেন আর কোন কাজটি করেছেন — সেটাই লিখুন, সাধারণ প্রশংসা নয়।"
                } else {
                    "What you would do, and the work that shows you have done it. Not a compliment."
                },
            ) {
                BsdcFormText(
                    label = if (bn) "আপনার প্রস্তাব" else "Your pitch",
                    value = pitch,
                    onValueChange = { pitch = it },
                    hint = if (bn) {
                        "আপনার পরিকল্পনা ও প্রাসঙ্গিক কাজ লিখুন। অন্তত ${DiscoverSearchEngine.MIN_PITCH} অক্ষর।"
                    } else {
                        "Explain your approach and relevant work. At least ${DiscoverSearchEngine.MIN_PITCH} characters."
                    },
                    error = problem("pitch_short"),
                    singleLine = false,
                    minLines = 6,
                    maxLines = 14,
                    counter = "${pitch.trim().length} / ${DiscoverSearchEngine.MIN_PITCH}",
                    imeAction = ImeAction.Default,
                    complete = pitch.trim().length >= DiscoverSearchEngine.MIN_PITCH,
                    enabled = !sending,
                )
            }

            BsdcFormSection(
                title = if (bn) "দর ও সময়" else "Bid and window",
                subtitle = if (bn) {
                    "গিগের বাজেট: $budgetLine"
                } else {
                    "The gig's budget: $budgetLine"
                },
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BsdcFormNumber(
                        label = if (bn) "আপনার দর (${gig.currency})" else "Your bid (${gig.currency})",
                        value = bidText,
                        onValueChange = { bidText = it.filter { ch -> ch.isDigit() }.take(9) },
                        error = problem("bid_invalid"),
                        prefix = "৳",
                        modifier = Modifier.weight(1f),
                        enabled = !sending,
                    )
                    BsdcFormNumber(
                        label = if (bn) "কত দিনে দেবেন" else "Delivery in days",
                        value = daysText,
                        onValueChange = { daysText = it.filter { ch -> ch.isDigit() }.take(4) },
                        error = problem("days_invalid").ifEmpty { problem("days_too_long") },
                        modifier = Modifier.weight(1f),
                        enabled = !sending,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("3", "7", "14", "30").forEach { idea ->
                        BsdcFilterPill(
                            label = if (bn) "${BanglaDigits.of(idea)} দিন" else "$idea days",
                            selected = daysText == idea,
                            onClick = { daysText = idea },
                        )
                    }
                }
                if (perDay != null && perDay > 0) {
                    Text(
                        text = if (bn) {
                            "প্রতি দিনে প্রায় ${gig.currency} $perDay — ক্লায়েন্ট এটি দেখবে না, আপনিই দেখবেন"
                        } else {
                            "About $gig.currency $perDay a day, which the client will not see and you will"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.brandStrong,
                    )
                }
                if (gig.durationDays != null && days != null && days > gig.durationDays!!) {
                    // Not a refusal — the gig says how long the client hoped for, and bidding past it is
                    // a decision the member should see themselves make rather than discover later.
                    Text(
                        text = if (bn) {
                            "ক্লায়েন্ট ${gig.durationDays} দিনের কথা লিখেছেন; আপনার দিন বেশি হলে কারণটি প্রস্তাবে লিখুন।"
                        } else {
                            "The client asked for ${gig.durationDays} days. If you need longer, say why in the pitch."
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.warn,
                    )
                }
            }

            BsdcFormChecklist(
                caption = if (bn) "পাঠানোর প্রস্তুতি" else "Ready to send?",
                items = listOf(
                    BsdcChecklistItem(
                        label = if (bn) {
                            "প্রস্তাব অন্তত ${DiscoverSearchEngine.MIN_PITCH} অক্ষরের"
                        } else {
                            "The pitch is at least ${DiscoverSearchEngine.MIN_PITCH} characters"
                        },
                        done = "pitch_short" !in problems,
                    ),
                    BsdcChecklistItem(
                        label = if (bn) "দর লেখা আছে" else "A bid is given",
                        done = "bid_invalid" !in problems,
                    ),
                    BsdcChecklistItem(
                        label = if (bn) {
                            "সময়কাল ১ থেকে ${DiscoverSearchEngine.MAX_DELIVERY_DAYS} দিন"
                        } else {
                            "The window is 1 to ${DiscoverSearchEngine.MAX_DELIVERY_DAYS} days"
                        },
                        done = "days_invalid" !in problems && "days_too_long" !in problems,
                    ),
                ),
            )

            Text(
                text = if (bn) {
                    "আপনার দর ও প্রস্তাব শুধু এই গিগের ক্লায়েন্ট দেখতে পাবেন।"
                } else {
                    "Only this gig's client sees your bid and your pitch."
                },
                style = MaterialTheme.typography.labelSmall,
                color = tokens.mutedText,
            )
        } else {
            BsdcFormSection(
                title = if (bn) "ক্লায়েন্ট যা পড়বে" else "What the client reads",
                subtitle = if (bn) {
                    "একটি প্রস্তাব পাঠানোর পর বদলানো যায় না; প্রয়োজনে প্রত্যাহার করে আবার দিন।"
                } else {
                    "A proposal cannot be edited once sent — withdraw it and bid again if you must change it."
                },
            ) {
                BsdcFormReviewRow(
                    label = if (bn) "দর" else "Bid",
                    value = "${gig.currency} ${bid ?: 0}${if (gig.isHourly) (if (bn) " / ঘণ্টা" else " / hr") else ""}",
                )
                BsdcFormReviewRow(
                    label = if (bn) "ডেলিভারি" else "Delivery",
                    value = if (bn) "${days ?: 0} দিন" else "${days ?: 0} days",
                )
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = if (bn) "প্রস্তাব" else "Pitch",
                        style = MaterialTheme.typography.labelMedium,
                        color = tokens.mutedText,
                    )
                    Text(
                        text = pitch.trim(),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}

/** Bangla numerals for a chip label that a Bangla reader counts in Bangla. */
private object BanglaDigits {
    private val map = charArrayOf('০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯')

    fun of(digits: String): String = buildString {
        digits.forEach { ch -> if (ch.isDigit()) append(map[ch - '0']) else append(ch) }
    }
}
