package bd.info.bsdc.app.feature.compose

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcAnimatedEntrance
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.pressBounceScale
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.remember

/**
 * What every creation screen wears.
 *
 * The hub used to render all six kinds as cards in one scroll container, which is why they felt like
 * the same small sheet with different labels: no kind had a header, a back affordance, or a sentence
 * about what it is judged on. This scaffold gives each of them the same frame, so the difference
 * between publishing a post and posting a job is the *form*, not the amount of respect the screen
 * shows it.
 *
 * The header collapses to a single line under reduced motion — the entrance is skipped, the layout is
 * identical. Motion here is information about where you are, not decoration that a member can lose.
 */
@Composable
fun MkCreateScaffold(
    mode: CreateHubMode,
    bn: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val tokens = BsdcThemeTokens.colors
    val reduced = BsdcThemeTokens.reducedMotion
    val haptics = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface),
    ) {
        // One child: `BsdcAnimatedEntrance` hands its content to `AnimatedVisibility`, which measures a
        // single child, so the header's three parts go in a Column rather than loose in the entrance.
        BsdcAnimatedEntrance {
            Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 6.dp, end = 16.dp, top = 6.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(tokens.surfaceElevated)
                        .pressBounceScale(interaction)
                        .clickable(
                            interactionSource = interaction,
                            indication = null,
                            onClick = {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                onBack()
                            },
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    // A back arrow that *leans* on press is the cheapest honest feedback there is:
                    // the member learns the hit landed before the screen starts moving.
                    val pressed by interaction.collectIsPressedAsState()
                    val tilt by animateFloatAsState(
                        targetValue = if (pressed && !reduced) -8f else 0f,
                        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessHigh),
                        label = "createBackTilt",
                    )
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = if (bn) "পছন্দ বেছে নিন" else "Choose another type",
                        modifier = Modifier
                            .size(20.dp)
                            .rotate(tilt),
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
                Spacer(Modifier.width(6.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (bn) "নতুন" else "New",
                        style = MaterialTheme.typography.labelMedium,
                        color = tokens.mutedText,
                    )
                    Text(
                        text = if (bn) mode.labelBn else mode.labelEn,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                }

            }
            Text(
                text = createKindBlurb(mode, bn),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.mutedText,
                modifier = Modifier.padding(start = 54.dp, end = 16.dp, bottom = 8.dp),
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .height(1.dp)
                    .background(tokens.border),
            )
            }
        }
        Box(modifier = Modifier.weight(1f)) {
            content()
        }
    }
}

/**
 * One sentence per kind, in both languages, on what the form is judged on.
 *
 * Exhaustive on purpose: adding a seventh kind to [CreateHubMode] fails the build until its copy is
 * written, which is a much better outcome than a new screen silently borrowing someone else's
 * sentence.
 */
internal fun createKindBlurb(mode: CreateHubMode, bn: Boolean): String = when (mode) {
    CreateHubMode.POST -> if (bn) {
        "মার্কডাউন, ছবি, পোল ও প্রিভিউ — সবকিছুই এখানে।"
    } else {
        "Markdown, media, a poll and a live preview — all in one place."
    }
    CreateHubMode.EVENT -> if (bn) {
        "সময়, জায়গা ও ধারণক্ষমতা — সময়জোনে অঞ্চল নাম উল্লেখ করুন।"
    } else {
        "Start, end, venue and capacity — name the time zone, the app cannot guess it."
    }
    CreateHubMode.JOB -> if (bn) {
        "বেতনসীমা, কাজের ধরন ও শহর — না থাকলে আবেদনকারী ছেড়ে দেবে।"
    } else {
        "Salary band, work mode and city — a listing without them loses applicants."
    }
    CreateHubMode.GIG -> if (bn) {
        "কাজের পরিধি, বাজেট ও সময়সীমা — স্পষ্ট হলে কাজ পাওয়া যায়।"
    } else {
        "Scope, budget and deadline — the three things that turn a look into an offer."
    }
    CreateHubMode.PROJECT -> if (bn) {
        "কভার ও স্ক্রিনশট আগে — প্রজেক্ট দেখেই বিচার হয়।"
    } else {
        "Cover and screenshots first — a project is read with the eyes."
    }
    CreateHubMode.GROUP -> if (bn) {
        "ঠিকানা (slug) চিরকাল থেকে যায়; তাই সতর্কভাবে বেছে নিন।"
    } else {
        "The address is permanent and public — choose it once, carefully."
    }
}

/**
 * One checklist line: a filled tick when satisfied, an outline when not.
 *
 * It used to be private to the hub file; five forms now share it, so it lives here and is
 * `internal`. The tick colour is animated rather than swapped — the row is the one place a member
 * watches for change while typing, and a colour that arrives all at once reads as a glitch.
 */
@Composable
internal fun ChecklistRow(label: String, done: Boolean, blocking: Boolean = true) {
    val reduced = BsdcThemeTokens.reducedMotion
    val tickColor by animateColorAsState(
        targetValue = when {
            done -> MaterialTheme.colorScheme.primary
            blocking -> MaterialTheme.colorScheme.onSurfaceVariant
            else -> MaterialTheme.colorScheme.onSurfaceVariant
        },
        animationSpec = if (reduced) {
            spring(stiffness = Spring.StiffnessHigh)
        } else {
            spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium)
        },
        label = "checklistRowColor",
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = if (done) "✓" else "○",
            style = MaterialTheme.typography.titleMedium,
            color = tickColor,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
