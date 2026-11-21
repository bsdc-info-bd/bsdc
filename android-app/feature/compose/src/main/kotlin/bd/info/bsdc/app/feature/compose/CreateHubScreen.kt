package bd.info.bsdc.app.feature.compose

import androidx.compose.animation.AnimatedContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.AddPhotoAlternate
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Event
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material.icons.rounded.Publish
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcActionTile
import bd.info.bsdc.app.core.designsystem.BsdcMotionSpecs
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcHeroBanner
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.MediaPurpose
import coil3.ImageLoader
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

@Composable
fun CreateHubScreen(
    viewerUid: String?,
    composeRepository: ComposeRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    initialMode: CreateHubMode = CreateHubMode.POST,
    /**
     * A channel to open the post composer aimed at, when the member arrived from a group page.
     *
     * The hub only forwards it. It has no opinion about channels, and it should not: the rules that
     * decide what a channel may hold are in one place (`ChannelRules`) so that the hub, the composer
     * and the web cannot drift apart and disagree about the same post.
     */
    initialChannelId: String? = null,
    initialChannelName: String? = null,
    onSignInRequired: () -> Unit,
    onPostPublished: (PublishedResult) -> Unit,
    onDirectoryCreated: (CreateHubMode, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    // Read once, here: `transitionSpec` is not a composable scope, so the token has to be captured
    // rather than fetched inside the animation lambda.
    val reducedMotion = BsdcThemeTokens.reducedMotion
    if (viewerUid == null) {
        LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
        ) {
            item {
                BsdcEmptyState(
                    icon = Icons.Rounded.AddCircleOutline,
                    title = if (bn) "প্রকাশ করতে সাইন ইন করুন" else "Sign in to create & publish",
                    subtitle = if (bn) {
                        "পোস্ট, প্রশ্ন, পোল, ইভেন্ট, চাকরি, প্রজেক্ট ও গ্রুপ তৈরি করতে আপনার BSDC অ্যাকাউন্টে প্রবেশ করুন।"
                    } else {
                        "Sign in to publish posts, articles, Q&A, polls, snippets, events, jobs, gigs, projects, or groups."
                    },
                    actionLabel = if (bn) "সাইন ইন করুন" else "Sign In",
                    onAction = onSignInRequired,
                )
            }
        }
        return
    }

    var mode by remember(initialMode) { mutableStateOf(initialMode) }
    var showPicker by remember(initialMode) { mutableStateOf(initialMode == CreateHubMode.POST) }

    Column(modifier = modifier.fillMaxSize()) {
        // The picker: one tile per directory, so the reader chooses what they are making
        // rather than decoding a strip of chips. Collapses once a form is open.
        if (showPicker) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    BsdcHeroBanner(
                        title = if (bn) "কী তৈরি করবেন?" else "What will you build?",
                        subtitle = if (bn) {
                            "পোস্ট, ইভেন্ট, চাকরি, গিগ, প্রজেক্ট বা গ্রুপ — এক ট্যাপে শুরু করুন।"
                        } else {
                            "A post, an event, a job, a gig, a project or a group — pick one to start."
                        },
                        eyebrow = if (bn) "তৈরি করুন" else "Create",
                        icon = Icons.Rounded.AddCircleOutline,
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "পোস্ট / নিবন্ধ" else "Post or article",
                        subtitle = if (bn) {
                            "লেখা, কোড স্নিপেট, প্রশ্ন, পোল বা ছবি — সব এক কম্পোজারে।"
                        } else {
                            "Writing, code snippets, questions, polls and photos — one composer."
                        },
                        icon = Icons.Rounded.PhotoLibrary,
                        onClick = {
                            mode = CreateHubMode.POST
                            showPicker = false
                        },
                        badge = if (bn) "মার্কডাউন" else "Markdown",
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "ইভেন্ট" else "Event",
                        subtitle = if (bn) {
                            "মিটআপ, ওয়ার্কশপ বা হ্যাকাথন — সময়, স্থান ও ক্যাপাসিটি সহ।"
                        } else {
                            "A meetup, workshop or hackathon — with time, place and capacity."
                        },
                        icon = Icons.Rounded.Event,
                        tone = BsdcTone.INFO,
                        onClick = {
                            mode = CreateHubMode.EVENT
                            showPicker = false
                        },
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "চাকরি" else "Job",
                        subtitle = if (bn) {
                            "পূর্ণকালীন, খণ্ডকালীন বা রিমোট ভূমিকা — বেতন ও দক্ষতা সহ।"
                        } else {
                            "A full-time, part-time or remote role — with pay and skills."
                        },
                        icon = Icons.Rounded.Work,
                        tone = BsdcTone.INFO,
                        onClick = {
                            mode = CreateHubMode.JOB
                            showPicker = false
                        },
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "ফ্রিল্যান্স গিগ" else "Freelance gig",
                        subtitle = if (bn) {
                            "একটি নির্দিষ্ট কাজের বাজেট দিন — ফ্রিল্যান্সাররা প্রস্তাব পাঠাবে।"
                        } else {
                            "Scope one piece of work and freelancers send proposals."
                        },
                        icon = Icons.Rounded.Work,
                        tone = BsdcTone.OK,
                        onClick = {
                            mode = CreateHubMode.GIG
                            showPicker = false
                        },
                        badge = if (bn) "প্রস্তাব" else "Proposals",
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "প্রজেক্ট" else "Project",
                        subtitle = if (bn) {
                            "ওপেন-সোর্স প্রজেক্ট দেখান — রিপো, ডেমো ও স্ক্রিনশট সহ।"
                        } else {
                            "Show an open-source project — repository, demo and screenshots."
                        },
                        icon = Icons.Rounded.Code,
                        tone = BsdcTone.NEUTRAL,
                        onClick = {
                            mode = CreateHubMode.PROJECT
                            showPicker = false
                        },
                    )
                }
                item {
                    BsdcActionTile(
                        title = if (bn) "কমিউনিটি গ্রুপ" else "Community group",
                        subtitle = if (bn) {
                            "একটি বিষয়ভিত্তিক গ্রুপ খুলুন — পাবলিক বা প্রাইভেট।"
                        } else {
                            "Open a group around a topic — public or private."
                        },
                        icon = Icons.Rounded.Groups,
                        tone = BsdcTone.WARN,
                        onClick = {
                            mode = CreateHubMode.GROUP
                            showPicker = false
                        },
                    )
                }
                item {
                    BsdcButton(
                        label = if (bn) "একটি ফর্ম খুলুন" else "Open the composer",
                        onClick = { showPicker = false },
                        secondary = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            return
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CreateHubMode.entries.forEach { entry ->
                FilterChip(
                    selected = mode == entry,
                    onClick = { mode = entry },
                    label = { Text(if (bn) entry.labelBn else entry.labelEn) },
                )
            }
            FilterChip(
                selected = false,
                onClick = { showPicker = true },
                label = { Text(if (bn) "ধরন বদলান" else "Change type") },
            )
        }

        // One screen per kind, animated in. The hub used to inline all six forms in a single
        // LazyColumn, which is why they all felt like the same small sheet with different labels: a
        // dedicated scaffold gives each kind its own header, its own back affordance and its own
        // entrance, and the router below is the only thing the hub still owns.
        AnimatedContent(
            targetState = mode,
            transitionSpec = { BsdcMotionSpecs.screenTransition(reducedMotion) },
            label = "createKindScreen",
        ) { target ->
            when (target) {
                CreateHubMode.POST -> PostComposerScreen(
                    authorUid = viewerUid,
                    composeRepository = composeRepository,
                    mediaRepository = mediaRepository,
                    imageLoader = imageLoader,
                    language = language,
                    initialChannelId = initialChannelId,
                    initialChannelName = initialChannelName,
                    onPublished = onPostPublished,
                )

                CreateHubMode.EVENT -> MkCreateEventScreen(
                    hostUid = viewerUid,
                    repository = composeRepository,
                    mediaRepository = mediaRepository,
                    imageLoader = imageLoader,
                    language = language,
                    onBack = { showPicker = true },
                    onCreated = { slug -> onDirectoryCreated(CreateHubMode.EVENT, slug) },
                )
                CreateHubMode.JOB -> MkCreateJobScreen(
                    posterUid = viewerUid,
                    repository = composeRepository,
                    language = language,
                    onBack = { showPicker = true },
                    onCreated = { slug -> onDirectoryCreated(CreateHubMode.JOB, slug) },
                )
                CreateHubMode.GIG -> MkCreateGigScreen(
                    clientUid = viewerUid,
                    repository = composeRepository,
                    language = language,
                    onBack = { showPicker = true },
                    onCreated = { slug -> onDirectoryCreated(CreateHubMode.GIG, slug) },
                )
                CreateHubMode.PROJECT -> MkCreateProjectScreen(
                    ownerUid = viewerUid,
                    repository = composeRepository,
                    mediaRepository = mediaRepository,
                    imageLoader = imageLoader,
                    language = language,
                    onBack = { showPicker = true },
                    onCreated = { slug -> onDirectoryCreated(CreateHubMode.PROJECT, slug) },
                )
                CreateHubMode.GROUP -> MkCreateGroupScreen(
                    repository = composeRepository,
                    language = language,
                    onBack = { showPicker = true },
                    onCreated = { slug -> onDirectoryCreated(CreateHubMode.GROUP, slug) },
                )
            }
        }
    }
}
