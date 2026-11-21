package bd.info.bsdc.app.feature.compose

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn as composableFadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcMotionSpecs
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.pressBounceScale

/**
 * The composer's chrome: the mode switch, the audience row, and the pickers behind them.
 *
 * This is kept out of `PostComposerScreen` for one reason: that screen owns draft state, uploads and
 * publishing, and it should not also own the question of what a channel picker looks like.
 * Everything here renders decisions; the decisions themselves are in [ChannelRules], which is pure
 * and unit-tested. That split is what lets the app and the web say the same words about the same
 * refusal — which is the entire point of `bsdc.channel_post_block` existing in the database.
 */

/** What the editor area is showing. `SPLIT` is the middle ground the web has and the app did not. */
enum class MkComposerMode { WRITE, SPLIT, PREVIEW }

/**
 * A segmented mode switch with a sliding thumb.
 *
 * The thumb uses a spring rather than a duration because a segmented control is *pushed*, not timed:
 * a linear slide reads like a progress bar, while a critically-damped spring reads like a physical
 * part of the screen. Under reduced motion the state still changes — it just stops travelling, which
 * is the whole requirement, not an aesthetic preference.
 */
@Composable
fun MkComposerModeSwitch(
    mode: MkComposerMode,
    onModeChange: (MkComposerMode) -> Unit,
    bn: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = BsdcThemeTokens.colors
    val reduced = BsdcThemeTokens.reducedMotion
    val haptics = LocalHapticFeedback.current
    val modes = MkComposerMode.entries
    val index = modes.indexOf(mode).coerceAtLeast(0)
    val thumbStart = remember(index, reduced) { (index * SEGMENT_WIDTH_DP).dp }
    val animatedStart by animateDpAsState(
        targetValue = thumbStart,
        animationSpec = if (reduced) {
            spring(stiffness = Spring.StiffnessHigh)
        } else {
            BsdcMotionSpecs.SegmentSlideSpring
        },
        label = "composerModeThumb",
    )

    Box(
        modifier = modifier
            .height(40.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(tokens.surfaceElevated)
            .border(1.dp, tokens.border, RoundedCornerShape(20.dp))
            .padding(3.dp),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = animatedStart)
                .width(SEGMENT_WIDTH_DP.dp)
                .fillMaxHeight()
                .clip(RoundedCornerShape(17.dp))
                .background(MaterialTheme.colorScheme.primary),
        )
        Row(modifier = Modifier.fillMaxHeight()) {
            modes.forEachIndexed { position, entry ->
                val selected = position == index
                Box(
                    modifier = Modifier
                        .width(SEGMENT_WIDTH_DP.dp)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(17.dp))
                        .clickable {
                            if (!selected) {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                onModeChange(entry)
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = modeLabel(entry, bn),
                        style = MaterialTheme.typography.labelLarge,
                        color = if (selected) MaterialTheme.colorScheme.onPrimary else tokens.mutedText,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

private const val SEGMENT_WIDTH_DP = 96

private fun modeLabel(mode: MkComposerMode, bn: Boolean): String = when (mode) {
    MkComposerMode.WRITE -> if (bn) "লিখুন" else "Write"
    MkComposerMode.SPLIT -> if (bn) "দুটোই" else "Split"
    MkComposerMode.PREVIEW -> if (bn) "প্রিভিউ" else "Preview"
}

/**
 * Where the post will land, and who may read it — one row, because they are one decision and they
 * constrain each other: a channel post cannot be `private`.
 *
 * Showing them side by side is what makes the reconciliation legible. Kept apart, the audience
 * control visibly jumping to "Followers" after a channel is chosen looks like the app overruled the
 * member; together, with the hint under them, it reads as what it is — the one pairing a channel
 * cannot carry, refused before it is sent rather than after.
 */
@Composable
fun MkAudienceRow(
    channel: PostableChannel?,
    hasChannel: Boolean,
    visibility: ComposerVisibility,
    bn: Boolean,
    onPickChannel: () -> Unit,
    onPickVisibility: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = BsdcThemeTokens.colors
    val copy = ChannelPickerCopy.forLanguage(bn)
    val privateBlocked = channel != null && !ChannelRules.visibilityAllowedInChannel(visibility, channel.id)

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MkAudienceChip(
                // `hasChannel` and `channel` differ while the list is still loading, and only one of
                // them is the truth about the draft: a composer opened from a group page already has
                // a channel, and calling that "To the feed" for a moment would be a lie about where
                // the member's words are going.
                label = when {
                    channel != null -> "#${channel.slug.ifBlank { channel.name }}"
                    hasChannel -> if (bn) "চ্যানেল নির্বাচিত…" else "Channel chosen…"
                    else -> if (bn) "ফিডে" else "To the feed"
                },
                caption = if (bn) "কোথায় পোস্ট হবে" else "Where it posts",
                icon = if (hasChannel) Icons.Rounded.Groups else Icons.Rounded.ChatBubbleOutline,
                warning = channel?.blockReason != null,
                onClick = onPickChannel,
            )
            MkAudienceChip(
                label = visibilityLabel(visibility, bn),
                caption = if (bn) "কে পড়বে" else "Who reads it",
                icon = when (visibility) {
                    ComposerVisibility.PUBLIC -> Icons.Rounded.Public
                    ComposerVisibility.FOLLOWERS -> Icons.Rounded.Visibility
                    ComposerVisibility.PRIVATE -> Icons.Rounded.Lock
                },
                warning = privateBlocked,
                onClick = onPickVisibility,
            )
        }
        AnimatedVisibility(
            visible = hasChannel || privateBlocked,
            enter = expandVertically() + composableFadeIn(),
            exit = shrinkVertically() + fadeOut(),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (privateBlocked) Icons.Rounded.WarningAmber else Icons.Rounded.Tune,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = if (privateBlocked) {
                        MaterialTheme.colorScheme.error
                    } else {
                        tokens.mutedText
                    },
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = if (privateBlocked) copy.privateNeedsFeed else copy.inChannelHint,
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.mutedText,
                )
            }
        }
    }
}

@Composable
private fun MkAudienceChip(
    label: String,
    caption: String,
    icon: ImageVector,
    warning: Boolean,
    onClick: () -> Unit,
) {
    val tokens = BsdcThemeTokens.colors
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(tokens.surfaceElevated)
            .border(
                width = if (warning) 1.4.dp else 1.dp,
                color = if (warning) MaterialTheme.colorScheme.error else tokens.border,
                shape = RoundedCornerShape(14.dp),
            )
            .pressBounceScale(interaction)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = if (warning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.width(8.dp))
        Column {
            Text(
                text = caption,
                style = MaterialTheme.typography.labelSmall,
                color = tokens.mutedText,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

internal fun visibilityLabel(visibility: ComposerVisibility, bn: Boolean): String = when (visibility) {
    ComposerVisibility.PUBLIC -> if (bn) "সবাই" else "Everyone"
    ComposerVisibility.FOLLOWERS -> if (bn) "অনুসারীরা" else "Followers"
    ComposerVisibility.PRIVATE -> if (bn) "শুধু আমি" else "Only me"
}

/**
 * The channel picker sheet.
 *
 * A blocked room stays listed and disabled, with its reason in the label. Hiding it is the worse
 * choice: the group page shows the room either way, so an option that simply is not there is a
 * mystery, while an option that says "read-only" is the same sentence the database would answer with.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MkChannelPickerSheet(
    visible: Boolean,
    channels: List<PostableChannel>,
    selectedChannelId: String?,
    visibility: ComposerVisibility,
    bn: Boolean,
    onDismiss: () -> Unit,
    onPick: (channelId: String?) -> Unit,
) {
    if (!visible) return
    val tokens = BsdcThemeTokens.colors
    val copy = ChannelPickerCopy.forLanguage(bn)
    val sections = ChannelRules.sections(channels, copy)
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.padding(horizontal = 20.dp)) {
            Text(
                text = if (bn) "কোথায় পোস্ট করবেন" else "Where should this post go?",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = if (bn) {
                    "আপনার গ্রুপের চ্যানেলগুলো এখানে। যে ঘর পোস্ট নিতে পারে না, কারণটা লেবেলে লেখা।"
                } else {
                    "Channels from your groups are listed here. A room that cannot take a post says why."
                },
                style = MaterialTheme.typography.bodySmall,
                color = tokens.mutedText,
            )
        }
        Spacer(Modifier.height(10.dp))
        LazyColumn(contentPadding = PaddingValues(bottom = 28.dp)) {
            sections.forEachIndexed { sectionIndex, section ->
                item(key = "channel-section-$sectionIndex") {
                    Text(
                        text = section.label,
                        style = MaterialTheme.typography.labelMedium,
                        color = tokens.mutedText,
                        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 2.dp),
                    )
                }
                items(
                    items = section.options,
                    key = { option ->
                        when (option) {
                            ChannelOption.Feed -> ChannelRules.FEED_OPTION_VALUE
                            is ChannelOption.Channel -> option.channel.id
                        }
                    },
                ) { option ->
                    val channelId = when (option) {
                        ChannelOption.Feed -> null
                        is ChannelOption.Channel -> option.channel.id
                    }
                    val selected = channelId == selectedChannelId
                    val blockedByAudience = channelId != null && channelId != selectedChannelId &&
                        !ChannelRules.visibilityAllowedInChannel(visibility, channelId)
                    val enabled = ChannelRules.isEnabled(option) && !blockedByAudience
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = enabled) {
                                onPick(channelId)
                                onDismiss()
                            }
                            .padding(horizontal = 20.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(22.dp)
                                .clip(CircleShape)
                                .background(
                                    when {
                                        !enabled -> tokens.surfaceElevated
                                        selected -> MaterialTheme.colorScheme.primary
                                        else -> MaterialTheme.colorScheme.surfaceContainerHighest
                                    },
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (selected && enabled) {
                                Icon(
                                    imageVector = Icons.Rounded.Check,
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                    tint = MaterialTheme.colorScheme.onPrimary,
                                )
                            }
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = ChannelRules.optionLabel(option, copy),
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (enabled) MaterialTheme.colorScheme.onSurface else tokens.mutedText,
                                maxLines = 2,
                            )
                            if (blockedByAudience) {
                                Text(
                                    text = copy.privateNeedsFeed,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = tokens.mutedText,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * The audience picker.
 *
 * `private` is dimmed, not hidden, while a channel is selected, and it says why in the same line: a
 * control that disappears is a bug the member has to discover, while a control that is labelled is a
 * rule they can read.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MkVisibilityPickerSheet(
    visible: Boolean,
    visibility: ComposerVisibility,
    channelId: String?,
    bn: Boolean,
    onDismiss: () -> Unit,
    onPick: (ComposerVisibility) -> Unit,
) {
    if (!visible) return
    val tokens = BsdcThemeTokens.colors
    val copy = ChannelPickerCopy.forLanguage(bn)
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column {
            Text(
                text = if (bn) "কে পড়তে পারবে" else "Who can read this",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 4.dp),
            )
            ComposerVisibility.entries.forEach { entry ->
                val enabled = ChannelRules.visibilityAllowedInChannel(entry, channelId)
                val selected = entry == visibility
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = enabled) {
                            onPick(entry)
                            onDismiss()
                        }
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = visibilityLabel(entry, bn),
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (enabled) MaterialTheme.colorScheme.onSurface else tokens.mutedText,
                    )
                    Spacer(Modifier.width(8.dp))
                    AnimatedVisibility(visible = !enabled) {
                        Text(
                            text = copy.privateNeedsFeed,
                            style = MaterialTheme.typography.labelSmall,
                            color = tokens.mutedText,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    if (selected) {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
