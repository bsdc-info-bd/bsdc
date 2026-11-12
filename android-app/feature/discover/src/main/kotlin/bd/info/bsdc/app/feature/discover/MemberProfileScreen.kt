package bd.info.bsdc.app.feature.discover

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Article
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MyLocation
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.WorkspacePremium
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcAnimatedEntrance
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcFeedSkeletonCard
import bd.info.bsdc.app.core.designsystem.BsdcMetricTile
import bd.info.bsdc.app.core.designsystem.BsdcMotionSpecs
import bd.info.bsdc.app.core.designsystem.BsdcPalette
import bd.info.bsdc.app.core.designsystem.BsdcResponsiveContainer
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.designsystem.bsdcShimmerPlaceholder
import bd.info.bsdc.app.core.media.BsdcAvatar
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaLightboxDialog
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcHosts
import bd.info.bsdc.app.core.model.DevicePermissionKind
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.MediaPurpose
import bd.info.bsdc.app.core.model.MemberProfile
import bd.info.bsdc.app.core.permissions.rememberPermissionCoordinator
import coil3.ImageLoader
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private enum class ProfileTab {
    POSTS,
    ABOUT,
    BADGES,
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MemberProfileScreen(
    usernameOrUid: String,
    viewerUid: String?,
    repository: DiscoverRepository,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onBack: () -> Unit,
    onSignInRequired: () -> Unit,
    onOpenMessages: () -> Unit,
    onOpenExternal: (String) -> Unit,
    mediaRepository: BsdcMediaRepository? = null,
    onOpenPost: (FeedPost) -> Unit = {},
    onProfileUpdated: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val ext = BsdcThemeTokens.colors
    val reducedMotion = BsdcThemeTokens.reducedMotion
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val permissionCoordinator = rememberPermissionCoordinator()

    var loading by remember { mutableStateOf(true) }
    var postsLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var profile by remember { mutableStateOf<MemberProfile?>(null) }
    var memberPosts by remember { mutableStateOf<List<FeedPost>>(emptyList()) }
    var following by remember { mutableStateOf(false) }
    var activeTab by rememberSaveable { mutableStateOf(ProfileTab.POSTS) }
    var lightboxImage by remember { mutableStateOf<Pair<String, String>?>(null) }
    var moreMenuExpanded by remember { mutableStateOf(false) }
    var confirmBlockOpen by remember { mutableStateOf(false) }

    var editing by remember { mutableStateOf(false) }
    var editName by remember { mutableStateOf("") }
    var editBio by remember { mutableStateOf("") }
    var editLocation by remember { mutableStateOf("") }
    var editWebsite by remember { mutableStateOf("") }
    var editSkillsRaw by remember { mutableStateOf("") }
    var editInterestsRaw by remember { mutableStateOf("") }
    var editAvatarUrl by remember { mutableStateOf("") }
    var editCoverUrl by remember { mutableStateOf("") }
    var editLang by remember { mutableStateOf(language) }
    var saving by remember { mutableStateOf(false) }
    var uploadingAvatar by remember { mutableStateOf(false) }
    var uploadingCover by remember { mutableStateOf(false) }
    var uploadPct by remember { mutableIntStateOf(0) }

    suspend fun loadPosts(uid: String) {
        postsLoading = true
        repository.fetchMemberPosts(uid)
            .onSuccess { memberPosts = it }
        postsLoading = false
    }

    suspend fun load() {
        loading = true
        error = null
        val target = usernameOrUid.trim()
        val fetched = if (target.startsWith("@") || target.length < 24) {
            repository.fetchProfileByUsername(target)
        } else {
            repository.fetchProfileByUid(target)
        }
        fetched.onSuccess { p ->
            profile = p
            if (p != null) {
                editName = p.displayName
                editBio = p.bio
                editLocation = p.location
                editWebsite = p.website
                editSkillsRaw = p.skills.joinToString(", ")
                editInterestsRaw = p.interests.joinToString(", ")
                editAvatarUrl = p.avatarUrl
                editCoverUrl = p.coverUrl
                editLang = p.language
                if (!viewerUid.isNullOrBlank() && viewerUid != p.uid) {
                    following = repository.isFollowing(viewerUid, p.uid)
                }
                loadPosts(p.uid)
            } else {
                error = if (bn) "সদস্য প্রোফাইল পাওয়া যায়নি।" else "Member profile not found."
            }
        }.onFailure { err ->
            error = err.localizedMessage ?: "Failed to load profile."
        }
        loading = false
    }

    val avatarPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        val p = profile ?: return@rememberLauncherForActivityResult
        val repo = mediaRepository ?: return@rememberLauncherForActivityResult
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploadingAvatar = true
            uploadPct = 0
            error = null
            runCatching {
                val uploaded = repo.uploadImageUri(uri, MediaPurpose.AVATAR) { pct ->
                    uploadPct = pct
                }
                repository.updateProfilePhoto(uid = p.uid, avatarUrl = uploaded.url).getOrThrow()
                uploaded.url
            }.onSuccess { newUrl ->
                editAvatarUrl = newUrl
                statusMessage = if (bn) "প্রোফাইল ছবি আপডেট হয়েছে।" else "Profile photo updated."
                onProfileUpdated()
                load()
            }.onFailure { err ->
                error = err.localizedMessage ?: (if (bn) "ছবি আপলোড ব্যর্থ হয়েছে।" else "Photo upload failed.")
            }
            uploadingAvatar = false
        }
    }

    val coverPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        val p = profile ?: return@rememberLauncherForActivityResult
        val repo = mediaRepository ?: return@rememberLauncherForActivityResult
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploadingCover = true
            uploadPct = 0
            error = null
            runCatching {
                val uploaded = repo.uploadImageUri(uri, MediaPurpose.COVER) { pct ->
                    uploadPct = pct
                }
                repository.updateProfilePhoto(uid = p.uid, coverUrl = uploaded.url).getOrThrow()
                uploaded.url
            }.onSuccess { newUrl ->
                editCoverUrl = newUrl
                statusMessage = if (bn) "কভার ছবি আপডেট হয়েছে।" else "Cover photo updated."
                onProfileUpdated()
                load()
            }.onFailure { err ->
                error = err.localizedMessage ?: (if (bn) "কভার আপলোড ব্যর্থ হয়েছে।" else "Cover upload failed.")
            }
            uploadingCover = false
        }
    }

    fun shareProfile(p: MemberProfile) {
        val handlePart = p.username.takeIf { it.isNotBlank() }?.let { "/@$it" } ?: "/@${p.uid}"
        val url = "${BsdcHosts.SITE_ORIGIN}$handlePart"
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, p.displayName)
            putExtra(Intent.EXTRA_TEXT, "${p.displayName} — $url")
        }
        runCatching {
            context.startActivity(Intent.createChooser(intent, if (bn) "প্রোফাইল শেয়ার করুন" else "Share profile"))
        }
    }

    LaunchedEffect(usernameOrUid, viewerUid) {
        load()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    val handle = profile?.username?.takeIf { it.isNotBlank() }?.let { "@$it" }
                    Column {
                        Text(
                            text = profile?.displayName ?: (if (bn) "প্রোফাইল" else "Profile"),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (!handle.isNullOrBlank()) {
                            Text(
                                text = handle,
                                style = MaterialTheme.typography.labelSmall,
                                color = ext.mutedText,
                                maxLines = 1,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = if (bn) "ফিরুন" else "Back",
                        )
                    }
                },
                actions = {
                    profile?.let { p ->
                        val isSelf = viewerUid != null && viewerUid == p.uid
                        IconButton(onClick = { shareProfile(p) }) {
                            Icon(
                                imageVector = Icons.Rounded.Share,
                                contentDescription = if (bn) "শেয়ার" else "Share",
                            )
                        }
                        if (!isSelf) {
                            Box {
                                IconButton(onClick = { moreMenuExpanded = true }) {
                                    Icon(
                                        imageVector = Icons.Rounded.MoreVert,
                                        contentDescription = if (bn) "আরও" else "More",
                                    )
                                }
                                DropdownMenu(
                                    expanded = moreMenuExpanded,
                                    onDismissRequest = { moreMenuExpanded = false },
                                ) {
                                    DropdownMenuItem(
                                        text = { Text(if (bn) "সদস্য ব্লক করুন" else "Block member") },
                                        leadingIcon = { Icon(Icons.Rounded.Block, contentDescription = null) },
                                        onClick = {
                                            moreMenuExpanded = false
                                            if (viewerUid.isNullOrBlank()) {
                                                onSignInRequired()
                                            } else {
                                                confirmBlockOpen = true
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        BsdcResponsiveContainer(
            maxWidth = 820.dp,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (loading && profile == null) {
                    item { ProfileHeroSkeleton() }
                    items(2) { BsdcFeedSkeletonCard() }
                }

                if (!error.isNullOrBlank()) {
                    item {
                        BsdcStatusBanner(
                            title = if (bn) "প্রোফাইল বিজ্ঞপ্তি" else "Profile notice",
                            body = error.orEmpty(),
                            tone = BsdcTone.WARN,
                        )
                    }
                }

                if (!statusMessage.isNullOrBlank()) {
                    item {
                        BsdcStatusBanner(
                            title = statusMessage.orEmpty(),
                            body = "",
                            tone = BsdcTone.OK,
                        )
                    }
                }

                if (uploadingAvatar || uploadingCover) {
                    item {
                        BsdcCard(elevated = true) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                Text(
                                    text = if (bn) "ছবি আপলোড হচ্ছে... $uploadPct%" else "Uploading image... $uploadPct%",
                                    style = MaterialTheme.typography.labelLarge,
                                )
                            }
                            LinearProgressIndicator(
                                progress = { (uploadPct / 100f).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }

                profile?.let { p ->
                    val isSelf = viewerUid != null && viewerUid == p.uid
                    val safeAvatar = ImgbbUrlAllowlist.normalizeImageUrl(p.avatarUrl)
                    val safeCover = ImgbbUrlAllowlist.normalizeImageUrl(p.coverUrl)

                    item("hero") {
                        BsdcAnimatedEntrance {
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(24.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                border = BorderStroke(1.dp, ext.border),
                            ) {
                                Column {
                                    // Hero cover + overlapping avatar
                                    Box(modifier = Modifier.fillMaxWidth()) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(156.dp),
                                        ) {
                                            if (safeCover.isNotBlank()) {
                                                BsdcImgbbImage(
                                                    fullUrl = safeCover,
                                                    thumbUrl = safeCover,
                                                    contentDescription = p.displayName,
                                                    imageLoader = imageLoader,
                                                    targetWidthPx = 1200,
                                                    cornerRadiusDp = 0,
                                                    onTapOpenLightbox = { lightboxImage = safeCover to p.displayName },
                                                    modifier = Modifier.fillMaxSize(),
                                                )
                                            } else {
                                                Box(
                                                    modifier = Modifier
                                                        .fillMaxSize()
                                                        .background(
                                                            Brush.linearGradient(
                                                                colors = listOf(
                                                                    BsdcPalette.LightGreen800,
                                                                    BsdcPalette.LightGreen700,
                                                                    BsdcPalette.LightGreen500,
                                                                ),
                                                            ),
                                                        ),
                                                )
                                            }

                                            if (isSelf && mediaRepository != null) {
                                                Surface(
                                                    onClick = {
                                                        coverPicker.launch(
                                                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                                                        )
                                                    },
                                                    shape = RoundedCornerShape(999.dp),
                                                    color = Color.Black.copy(alpha = 0.56f),
                                                    modifier = Modifier
                                                        .align(Alignment.TopEnd)
                                                        .padding(12.dp),
                                                ) {
                                                    Row(
                                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                    ) {
                                                        Icon(
                                                            imageVector = Icons.Rounded.PhotoCamera,
                                                            contentDescription = null,
                                                            tint = Color.White,
                                                            modifier = Modifier.size(16.dp),
                                                        )
                                                        Text(
                                                            text = if (bn) "কভার বদলান" else "Cover",
                                                            style = MaterialTheme.typography.labelMedium,
                                                            color = Color.White,
                                                        )
                                                    }
                                                }
                                            }
                                        }

                                        // Overlapping circular avatar anchored to bottom-start
                                        Box(
                                            modifier = Modifier
                                                .padding(start = 18.dp, top = 108.dp),
                                        ) {
                                            BsdcAvatar(
                                                avatarUrl = p.avatarUrl,
                                                displayName = p.displayName.ifBlank { p.username.ifBlank { "U" } },
                                                imageLoader = imageLoader,
                                                size = 92.dp,
                                                borderWidth = 4.dp,
                                                borderColor = MaterialTheme.colorScheme.surfaceVariant,
                                                onClick = if (safeAvatar.isNotBlank()) {
                                                    { lightboxImage = safeAvatar to p.displayName }
                                                } else if (isSelf && mediaRepository != null) {
                                                    {
                                                        avatarPicker.launch(
                                                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                                                        )
                                                    }
                                                } else {
                                                    null
                                                },
                                            )
                                            if (isSelf && mediaRepository != null) {
                                                Surface(
                                                    onClick = {
                                                        avatarPicker.launch(
                                                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                                                        )
                                                    },
                                                    shape = CircleShape,
                                                    color = MaterialTheme.colorScheme.primary,
                                                    border = BorderStroke(2.dp, MaterialTheme.colorScheme.surfaceVariant),
                                                    modifier = Modifier
                                                        .align(Alignment.BottomEnd)
                                                        .size(30.dp),
                                                ) {
                                                    Box(contentAlignment = Alignment.Center) {
                                                        Icon(
                                                            imageVector = Icons.Rounded.CameraAlt,
                                                            contentDescription = if (bn) "ছবি বদলান" else "Change photo",
                                                            tint = MaterialTheme.colorScheme.onPrimary,
                                                            modifier = Modifier.size(16.dp),
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Identity details & actions
                                    Column(
                                        modifier = Modifier.padding(
                                            start = 18.dp,
                                            end = 18.dp,
                                            top = 10.dp,
                                            bottom = 18.dp,
                                        ),
                                        verticalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            Text(
                                                text = p.displayName,
                                                style = MaterialTheme.typography.headlineMedium,
                                                fontWeight = FontWeight.ExtraBold,
                                                modifier = Modifier.weight(1f, fill = false),
                                            )
                                            if (p.verified) {
                                                Icon(
                                                    imageVector = Icons.Rounded.Verified,
                                                    contentDescription = if (bn) "যাচাইকৃত সদস্য" else "Verified member",
                                                    tint = ext.brandStrong,
                                                    modifier = Modifier.size(20.dp),
                                                )
                                            }
                                        }

                                        FlowRow(
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                            verticalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            if (p.username.isNotBlank()) {
                                                Text(
                                                    text = "@${p.username}",
                                                    style = MaterialTheme.typography.bodyMedium,
                                                    color = ext.mutedText,
                                                    fontWeight = FontWeight.Medium,
                                                )
                                            }
                                            val joinedLabel = formatJoinedDate(p.createdAt, bn)
                                            if (joinedLabel.isNotBlank()) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Rounded.CalendarMonth,
                                                        contentDescription = null,
                                                        modifier = Modifier.size(15.dp),
                                                        tint = ext.mutedText,
                                                    )
                                                    Text(
                                                        text = joinedLabel,
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = ext.mutedText,
                                                    )
                                                }
                                            }
                                            if (p.location.isNotBlank()) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Rounded.LocationOn,
                                                        contentDescription = null,
                                                        modifier = Modifier.size(15.dp),
                                                        tint = ext.mutedText,
                                                    )
                                                    Text(
                                                        text = p.location,
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = ext.mutedText,
                                                    )
                                                }
                                            }
                                        }

                                        if (p.bio.isNotBlank()) {
                                            Text(
                                                text = p.bio,
                                                style = MaterialTheme.typography.bodyLarge,
                                                color = MaterialTheme.colorScheme.onSurface,
                                            )
                                        }

                                        val safeSite = DiscoverSearchEngine.safeHttpUrlOrEmpty(p.website)
                                        if (safeSite.isNotBlank()) {
                                            Surface(
                                                onClick = { onOpenExternal(safeSite) },
                                                shape = RoundedCornerShape(999.dp),
                                                color = ext.accentBlueSoft,
                                            ) {
                                                Row(
                                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Rounded.Public,
                                                        contentDescription = null,
                                                        tint = ext.accentBlue,
                                                        modifier = Modifier.size(15.dp),
                                                    )
                                                    Text(
                                                        text = safeSite.removePrefix("https://").removeSuffix("/"),
                                                        style = MaterialTheme.typography.labelMedium,
                                                        color = ext.accentBlue,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                }
                                            }
                                        }

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            if (isSelf) {
                                                BsdcButton(
                                                    label = if (editing) {
                                                        if (bn) "সম্পাদনা বন্ধ করুন" else "Close Editor"
                                                    } else {
                                                        if (bn) "প্রোফাইল সম্পাদনা" else "Edit Profile"
                                                    },
                                                    leadingIcon = Icons.Rounded.Edit,
                                                    secondary = editing,
                                                    onClick = { editing = !editing },
                                                    modifier = Modifier.weight(1f),
                                                )
                                                OutlinedButton(
                                                    onClick = { shareProfile(p) },
                                                    shape = RoundedCornerShape(14.dp),
                                                ) {
                                                    Icon(Icons.Rounded.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                                                    Spacer(Modifier.width(6.dp))
                                                    Text(if (bn) "শেয়ার" else "Share")
                                                }
                                            } else {
                                                BsdcButton(
                                                    label = if (following) {
                                                        if (bn) "অনুসরণ করছেন" else "Following"
                                                    } else {
                                                        if (bn) "অনুসরণ করুন" else "Follow"
                                                    },
                                                    secondary = following,
                                                    leadingIcon = Icons.Rounded.PersonAdd,
                                                    onClick = {
                                                        if (viewerUid.isNullOrBlank()) {
                                                            onSignInRequired()
                                                        } else {
                                                            scope.launch {
                                                                repository.toggleFollow(viewerUid, p.uid, following)
                                                                    .onSuccess { nowFollowing ->
                                                                        following = nowFollowing
                                                                        load()
                                                                    }
                                                            }
                                                        }
                                                    },
                                                    modifier = Modifier.weight(1f),
                                                )
                                                BsdcButton(
                                                    label = if (bn) "বার্তা" else "Message",
                                                    secondary = true,
                                                    leadingIcon = Icons.Rounded.ChatBubbleOutline,
                                                    onClick = onOpenMessages,
                                                    modifier = Modifier.weight(1f),
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Responsive 4-metric stats strip
                    item("stats") {
                        ProfileStatsGrid(profile = p, postsCount = maxOf(p.postsCount, memberPosts.size), language = language)
                    }

                    // Inline animated profile editor for self
                    if (isSelf && editing) {
                        item("editor") {
                            BsdcCard(elevated = true) {
                                BsdcSectionHeader(
                                    title = if (bn) "প্রোফাইল তথ্য হালনাগাদ" else "Edit Profile Details",
                                    subtitle = if (bn) "আপনার প্রোফাইল ছবি, কভার, দক্ষতা ও আগ্রহ আপডেট করুন" else "Update your photo, cover, skills & interests",
                                )

                                if (mediaRepository != null) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        BsdcButton(
                                            label = if (bn) "প্রোফাইল ছবি" else "Change Avatar",
                                            secondary = true,
                                            busy = uploadingAvatar,
                                            leadingIcon = Icons.Rounded.CameraAlt,
                                            onClick = {
                                                avatarPicker.launch(
                                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                                                )
                                            },
                                            modifier = Modifier.weight(1f),
                                        )
                                        BsdcButton(
                                            label = if (bn) "কভার ছবি" else "Change Cover",
                                            secondary = true,
                                            busy = uploadingCover,
                                            leadingIcon = Icons.Rounded.PhotoCamera,
                                            onClick = {
                                                coverPicker.launch(
                                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                                                )
                                            },
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }

                                OutlinedTextField(
                                    value = editName,
                                    onValueChange = { editName = it.take(60) },
                                    label = { Text(if (bn) "প্রদর্শিত নাম" else "Display name") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                OutlinedTextField(
                                    value = editBio,
                                    onValueChange = { editBio = it.take(280) },
                                    label = { Text(if (bn) "সংক্ষিপ্ত পরিচিতি" else "Bio") },
                                    supportingText = { Text("${editBio.length}/280") },
                                    maxLines = 4,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    OutlinedTextField(
                                        value = editLocation,
                                        onValueChange = { editLocation = it.take(80) },
                                        label = { Text(if (bn) "শহর / অবস্থান" else "Location") },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f),
                                    )
                                    OutlinedButton(
                                        onClick = {
                                            if (!DiscoverLocationHelper.hasLocationPermission(context)) {
                                                permissionCoordinator.request(DevicePermissionKind.LOCATION)
                                            } else {
                                                scope.launch {
                                                    val coords = DiscoverLocationHelper.fetchApproximateCoordinates(context)
                                                    if (coords != null) {
                                                        repository.resolveCityFromCoords(coords.first, coords.second, language)
                                                            .onSuccess { city ->
                                                                if (city.isNotBlank()) editLocation = city
                                                            }
                                                    }
                                                }
                                            }
                                        },
                                    ) {
                                        Icon(Icons.Rounded.MyLocation, contentDescription = null)
                                    }
                                }
                                OutlinedTextField(
                                    value = editWebsite,
                                    onValueChange = { editWebsite = it },
                                    label = { Text(if (bn) "ওয়েবসাইট (https://...)" else "Website (https://...)") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                OutlinedTextField(
                                    value = editSkillsRaw,
                                    onValueChange = { editSkillsRaw = it },
                                    label = { Text(if (bn) "দক্ষতা (কমা দিয়ে আলাদা করুন)" else "Skills (comma separated)") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                OutlinedTextField(
                                    value = editInterestsRaw,
                                    onValueChange = { editInterestsRaw = it },
                                    label = { Text(if (bn) "আগ্রহের বিষয় (কমা দিয়ে আলাদা করুন)" else "Interests (comma separated)") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                Text(
                                    text = if (bn) "পছন্দের ভাষা" else "Preferred Language",
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    AppLanguage.entries.forEach { langOption ->
                                        FilterChip(
                                            selected = editLang == langOption,
                                            onClick = { editLang = langOption },
                                            label = { Text(langOption.nativeLabel) },
                                        )
                                    }
                                }
                                BsdcButton(
                                    label = if (saving) {
                                        if (bn) "সংরক্ষণ হচ্ছে..." else "Saving..."
                                    } else {
                                        if (bn) "পরিবর্তন সংরক্ষণ করুন" else "Save Profile"
                                    },
                                    busy = saving,
                                    enabled = !saving && editName.isNotBlank(),
                                    onClick = {
                                        scope.launch {
                                            saving = true
                                            val skillsList = editSkillsRaw
                                                .split(",")
                                                .map { it.trim() }
                                                .filter { it.isNotEmpty() }
                                            val interestsList = editInterestsRaw
                                                .split(",")
                                                .map { it.trim() }
                                                .filter { it.isNotEmpty() }
                                            repository.updateOwnProfile(
                                                uid = p.uid,
                                                displayName = editName,
                                                bio = editBio,
                                                location = editLocation,
                                                website = editWebsite,
                                                skills = skillsList,
                                                interests = interestsList,
                                                language = editLang,
                                            ).onSuccess {
                                                editing = false
                                                statusMessage = if (bn) "প্রোফাইল সংরক্ষিত হয়েছে।" else "Profile updated."
                                                onProfileUpdated()
                                                load()
                                            }.onFailure { err ->
                                                error = err.localizedMessage
                                            }
                                            saving = false
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }

                    // Tab Bar
                    item("tabs") {
                        PrimaryTabRow(
                            selectedTabIndex = activeTab.ordinal,
                            containerColor = MaterialTheme.colorScheme.background,
                        ) {
                            ProfileTab.entries.forEach { tab ->
                                val label = when (tab) {
                                    ProfileTab.POSTS -> if (bn) "পোস্ট (${BanglaDigitFormatter.formatCount(memberPosts.size.toLong(), language)})" else "Posts (${memberPosts.size})"
                                    ProfileTab.ABOUT -> if (bn) "পরিচিতি" else "About"
                                    ProfileTab.BADGES -> if (bn) "অর্জন" else "Badges"
                                }
                                Tab(
                                    selected = activeTab == tab,
                                    onClick = { activeTab = tab },
                                    text = { Text(label, maxLines = 1) },
                                )
                            }
                        }
                    }

                    // Tab body
                    item("tab_content") {
                        AnimatedContent(
                            targetState = activeTab,
                            transitionSpec = { BsdcMotionSpecs.tabTransition(reducedMotion) },
                            label = "profileTabTransition",
                        ) { tab ->
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                when (tab) {
                                    ProfileTab.POSTS -> {
                                        if (postsLoading && memberPosts.isEmpty()) {
                                            BsdcFeedSkeletonCard()
                                        } else if (memberPosts.isEmpty()) {
                                            BsdcEmptyState(
                                                icon = Icons.Rounded.Article,
                                                title = if (bn) "এখনও কোনো পোস্ট নেই" else "No published posts yet",
                                                subtitle = if (bn) {
                                                    "এই সদস্য কোনো পোস্ট প্রকাশ করলে তা এখানে দেখা যাবে।"
                                                } else {
                                                    "Posts shared by this member will appear here."
                                                },
                                            )
                                        } else {
                                            memberPosts.forEach { post ->
                                                MemberPostPreviewCard(
                                                    post = post,
                                                    imageLoader = imageLoader,
                                                    language = language,
                                                    onClick = { onOpenPost(post) },
                                                )
                                            }
                                        }
                                    }

                                    ProfileTab.ABOUT -> {
                                        ProfileAboutSection(
                                            profile = p,
                                            language = language,
                                            onOpenExternal = onOpenExternal,
                                        )
                                    }

                                    ProfileTab.BADGES -> {
                                        ProfileBadgesSection(
                                            profile = p,
                                            postsCount = maxOf(p.postsCount, memberPosts.size),
                                            language = language,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    lightboxImage?.let { (url, caption) ->
        BsdcMediaLightboxDialog(
            fullUrl = url,
            caption = caption,
            imageLoader = imageLoader,
            onDismiss = { lightboxImage = null },
        )
    }

    if (confirmBlockOpen) {
        val p = profile
        if (p != null && !viewerUid.isNullOrBlank()) {
            AlertDialog(
                onDismissRequest = { confirmBlockOpen = false },
                title = { Text(if (bn) "${p.displayName}-কে ব্লক করবেন?" else "Block ${p.displayName}?") },
                text = {
                    Text(
                        if (bn) {
                            "ব্লক করলে আপনারা একে অপরের পোস্ট বা বার্তা দেখতে পাবেন না।"
                        } else {
                            "Blocking stops messages and hides interactions between your accounts."
                        },
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            confirmBlockOpen = false
                            scope.launch {
                                repository.blockMember(viewerUid, p.uid)
                                    .onSuccess {
                                        statusMessage = if (bn) "সদস্য ব্লক করা হয়েছে।" else "Member blocked."
                                    }
                            }
                        },
                    ) {
                        Text(if (bn) "ব্লক করুন" else "Block")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { confirmBlockOpen = false }) {
                        Text(if (bn) "বাতিল" else "Cancel")
                    }
                },
            )
        }
    }
}

@Composable
private fun ProfileStatsGrid(
    profile: MemberProfile,
    postsCount: Int,
    language: AppLanguage,
) {
    val bn = language == AppLanguage.BN
    val postsFmt = BanglaDigitFormatter.formatCount(postsCount.toLong(), language)
    val flwFmt = BanglaDigitFormatter.formatCount(profile.followersCount.toLong(), language)
    val flgFmt = BanglaDigitFormatter.formatCount(profile.followingCount.toLong(), language)
    val repFmt = BanglaDigitFormatter.formatCount(profile.reputation.toLong(), language)

    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        if (maxWidth >= 560.dp) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                BsdcMetricTile(
                    label = if (bn) "পোস্ট" else "Posts",
                    value = postsFmt,
                    icon = Icons.Rounded.Article,
                    tone = BsdcTone.OK,
                    modifier = Modifier.weight(1f),
                )
                BsdcMetricTile(
                    label = if (bn) "অনুসারী" else "Followers",
                    value = flwFmt,
                    icon = Icons.Rounded.Groups,
                    tone = BsdcTone.INFO,
                    modifier = Modifier.weight(1f),
                )
                BsdcMetricTile(
                    label = if (bn) "অনুসরণ" else "Following",
                    value = flgFmt,
                    icon = Icons.Rounded.Visibility,
                    tone = BsdcTone.NEUTRAL,
                    modifier = Modifier.weight(1f),
                )
                BsdcMetricTile(
                    label = if (bn) "সুনাম" else "Reputation",
                    value = repFmt,
                    icon = Icons.Rounded.Star,
                    tone = BsdcTone.WARN,
                    modifier = Modifier.weight(1f),
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    BsdcMetricTile(
                        label = if (bn) "পোস্ট" else "Posts",
                        value = postsFmt,
                        icon = Icons.Rounded.Article,
                        tone = BsdcTone.OK,
                        modifier = Modifier.weight(1f),
                    )
                    BsdcMetricTile(
                        label = if (bn) "অনুসারী" else "Followers",
                        value = flwFmt,
                        icon = Icons.Rounded.Groups,
                        tone = BsdcTone.INFO,
                        modifier = Modifier.weight(1f),
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    BsdcMetricTile(
                        label = if (bn) "অনুসরণ" else "Following",
                        value = flgFmt,
                        icon = Icons.Rounded.Visibility,
                        tone = BsdcTone.NEUTRAL,
                        modifier = Modifier.weight(1f),
                    )
                    BsdcMetricTile(
                        label = if (bn) "সুনাম" else "Reputation",
                        value = repFmt,
                        icon = Icons.Rounded.Star,
                        tone = BsdcTone.WARN,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun MemberPostPreviewCard(
    post: FeedPost,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onClick: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    val ext = BsdcThemeTokens.colors
    val thumb = post.coverUrl.ifBlank { post.media.firstOrNull()?.thumbUrl.orEmpty() }

    BsdcCard(onClick = onClick) {
        if (thumb.isNotBlank()) {
            BsdcImgbbImage(
                fullUrl = thumb,
                thumbUrl = thumb,
                contentDescription = post.title,
                imageLoader = imageLoader,
                targetWidthPx = 640,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(170.dp),
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BsdcBadge(label = post.kind.name, tone = BsdcTone.INFO)
            Text(
                text = "${BanglaDigitFormatter.formatCount(post.readingTime.toLong(), language)} ${if (bn) "মিনিট" else "min read"}",
                style = MaterialTheme.typography.labelSmall,
                color = ext.mutedText,
            )
        }
        if (post.title.isNotBlank()) {
            Text(
                text = post.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        val previewBody = post.excerpt.ifBlank { post.body }.trim()
        if (previewBody.isNotBlank()) {
            Text(
                text = previewBody,
                style = MaterialTheme.typography.bodyMedium,
                color = ext.mutedText,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(Icons.Rounded.FavoriteBorder, contentDescription = null, modifier = Modifier.size(16.dp), tint = ext.mutedText)
                Text(
                    text = BanglaDigitFormatter.formatCount(post.likes.toLong(), language),
                    style = MaterialTheme.typography.labelMedium,
                    color = ext.mutedText,
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(Icons.Rounded.ChatBubbleOutline, contentDescription = null, modifier = Modifier.size(16.dp), tint = ext.mutedText)
                Text(
                    text = BanglaDigitFormatter.formatCount(post.comments.toLong(), language),
                    style = MaterialTheme.typography.labelMedium,
                    color = ext.mutedText,
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProfileAboutSection(
    profile: MemberProfile,
    language: AppLanguage,
    onOpenExternal: (String) -> Unit,
) {
    val bn = language == AppLanguage.BN
    val ext = BsdcThemeTokens.colors
    val noneText = if (bn) "উল্লেখ করা হয়নি" else "Not specified"

    BsdcCard {
        BsdcSectionHeader(title = if (bn) "দক্ষতা ও প্রযুক্তি" else "Skills & Stack")
        if (profile.skills.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                profile.skills.forEach { skill ->
                    AssistChip(onClick = {}, label = { Text(skill) })
                }
            }
        } else {
            Text(text = noneText, style = MaterialTheme.typography.bodyMedium, color = ext.mutedText)
        }

        HorizontalDivider(color = ext.border)
        BsdcSectionHeader(title = if (bn) "আগ্রহের বিষয়" else "Interests")
        if (profile.interests.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                profile.interests.forEach { interest ->
                    AssistChip(onClick = {}, label = { Text(interest) })
                }
            }
        } else {
            Text(text = noneText, style = MaterialTheme.typography.bodyMedium, color = ext.mutedText)
        }
    }

    BsdcCard {
        BsdcSectionHeader(title = if (bn) "সদস্য বিবরণ" else "Member Details")
        AboutInfoRow(
            icon = Icons.Rounded.LocationOn,
            label = if (bn) "অবস্থান" else "Location",
            value = profile.location.ifBlank { noneText },
        )
        val safeSite = DiscoverSearchEngine.safeHttpUrlOrEmpty(profile.website)
        AboutInfoRow(
            icon = Icons.Rounded.Public,
            label = if (bn) "ওয়েবসাইট" else "Website",
            value = safeSite.ifBlank { noneText },
            onClick = if (safeSite.isNotBlank()) ({ onOpenExternal(safeSite) }) else null,
        )
        AboutInfoRow(
            icon = Icons.Rounded.Language,
            label = if (bn) "ভাষা" else "Language",
            value = profile.language.nativeLabel,
        )
        AboutInfoRow(
            icon = Icons.Rounded.CalendarMonth,
            label = if (bn) "সদস্য হয়েছেন" else "Member since",
            value = formatJoinedDate(profile.createdAt, bn).ifBlank { noneText },
        )
        AboutInfoRow(
            icon = Icons.Rounded.Info,
            label = if (bn) "প্রোফাইল দৃশ্যমানতা" else "Visibility",
            value = if (profile.privacy.discoverable) {
                if (bn) "পাবলিক ডিরেক্টরিতে দৃশ্যমান" else "Discoverable in directory"
            } else {
                if (bn) "শুধুমাত্র সরাসরি লিংকে" else "Direct link only"
            },
        )
    }
}

@Composable
private fun AboutInfoRow(
    icon: ImageVector,
    label: String,
    value: String,
    onClick: (() -> Unit)? = null,
) {
    val ext = BsdcThemeTokens.colors
    val rowMod = if (onClick != null) {
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp)
    } else {
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    }
    Row(
        modifier = rowMod,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = ext.mutedText)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = label, style = MaterialTheme.typography.labelSmall, color = ext.mutedText)
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = if (onClick != null) ext.accentBlue else MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ProfileBadgesSection(
    profile: MemberProfile,
    postsCount: Int,
    language: AppLanguage,
) {
    val bn = language == AppLanguage.BN
    val tier = when {
        profile.reputation >= 500 -> if (bn) "কোর বিল্ডার" else "Core Builder"
        profile.reputation >= 150 -> if (bn) "সক্রিয় মেন্টর" else "Community Mentor"
        profile.reputation >= 40 -> if (bn) "অবদানকারী" else "Contributor"
        else -> if (bn) "BSDC সদস্য" else "BSDC Member"
    }

    BsdcCard {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.WorkspacePremium,
                contentDescription = null,
                tint = BsdcThemeTokens.colors.brandStrong,
                modifier = Modifier.size(30.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(text = tier, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    text = if (bn) {
                        "${BanglaDigitFormatter.formatCount(profile.reputation.toLong(), language)} সুনাম পয়েন্ট"
                    } else {
                        "${profile.reputation} reputation points"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = BsdcThemeTokens.colors.mutedText,
                )
            }
            if (profile.verified) {
                BsdcBadge(label = if (bn) "যাচাইকৃত" else "Verified", tone = BsdcTone.OK)
            }
        }
    }

    if (postsCount > 0 || profile.followersCount >= 5 || profile.skills.size >= 3) {
        BsdcCard {
            BsdcSectionHeader(title = if (bn) "কমিউনিটি মাইলফলক" else "Community Milestones")
            if (postsCount > 0) {
                AboutInfoRow(
                    icon = Icons.Rounded.Article,
                    label = if (bn) "প্রকাশিত লেখক" else "Published Author",
                    value = if (bn) "${BanglaDigitFormatter.formatCount(postsCount.toLong(), language)}টি পোস্ট প্রকাশিত" else "$postsCount posts published",
                )
            }
            if (profile.followersCount >= 5) {
                AboutInfoRow(
                    icon = Icons.Rounded.Groups,
                    label = if (bn) "নেটওয়ার্ক নির্মাতা" else "Network Builder",
                    value = if (bn) "${BanglaDigitFormatter.formatCount(profile.followersCount.toLong(), language)} জন অনুসারী" else "${profile.followersCount} followers",
                )
            }
            if (profile.skills.size >= 3) {
                AboutInfoRow(
                    icon = Icons.Rounded.AutoAwesome,
                    label = if (bn) "বহুমুখী দক্ষতা" else "Multi-Stack Profile",
                    value = profile.skills.take(4).joinToString(" • "),
                )
            }
        }
    }
}

@Composable
private fun ProfileHeroSkeleton() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, BsdcThemeTokens.colors.border),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(156.dp)
                    .bsdcShimmerPlaceholder(),
            )
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(84.dp)
                        .clip(CircleShape)
                        .bsdcShimmerPlaceholder(),
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.55f)
                        .height(22.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .bsdcShimmerPlaceholder(),
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.85f)
                        .height(16.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .bsdcShimmerPlaceholder(),
                )
            }
        }
    }
}

private fun formatJoinedDate(isoRaw: String, bn: Boolean): String {
    val clean = isoRaw.trim()
    if (clean.isEmpty()) return ""
    return runCatching {
        val instant = Instant.parse(clean)
        val locale = if (bn) Locale.forLanguageTag("bn-BD") else Locale.ENGLISH
        val fmt = DateTimeFormatter.ofPattern("MMM yyyy", locale).withZone(ZoneId.systemDefault())
        val formatted = fmt.format(instant)
        if (bn) "যোগদান $formatted" else "Joined $formatted"
    }.getOrDefault("")
}
