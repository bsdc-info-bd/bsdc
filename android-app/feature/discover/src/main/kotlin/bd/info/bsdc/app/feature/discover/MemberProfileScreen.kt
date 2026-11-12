package bd.info.bsdc.app.feature.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.MyLocation
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcAvatarCircle
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.DevicePermissionKind
import bd.info.bsdc.app.core.model.MemberProfile
import bd.info.bsdc.app.core.permissions.rememberPermissionCoordinator
import coil3.ImageLoader
import kotlinx.coroutines.launch

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
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val permissionCoordinator = rememberPermissionCoordinator()

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var profile by remember { mutableStateOf<MemberProfile?>(null) }
    var following by remember { mutableStateOf(false) }

    var editing by remember { mutableStateOf(false) }
    var editName by remember { mutableStateOf("") }
    var editBio by remember { mutableStateOf("") }
    var editLocation by remember { mutableStateOf("") }
    var editWebsite by remember { mutableStateOf("") }
    var editSkillsRaw by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }

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
                if (!viewerUid.isNullOrBlank() && viewerUid != p.uid) {
                    following = repository.isFollowing(viewerUid, p.uid)
                }
            } else {
                error = if (bn) "সদস্য প্রোফাইল পাওয়া যায়নি।" else "Member profile not found."
            }
        }.onFailure { err ->
            error = err.localizedMessage ?: "Failed to load profile."
        }
        loading = false
    }

    LaunchedEffect(usernameOrUid, viewerUid) {
        load()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    val handle = profile?.username?.takeIf { it.isNotBlank() }?.let { "@$it" }
                    Text(handle ?: profile?.displayName ?: (if (bn) "প্রোফাইল" else "Profile"))
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = if (bn) "ফিরুন" else "Back",
                        )
                    }
                },
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (loading) {
                item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
            }
            if (!error.isNullOrBlank()) {
                item {
                    BsdcStatusBanner(
                        title = if (bn) "ত্রুটি" else "Profile notice",
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

            profile?.let { p ->
                val isSelf = viewerUid != null && viewerUid == p.uid
                item {
                    BsdcCard {
                        if (p.coverUrl.isNotBlank()) {
                            BsdcImgbbImage(
                                fullUrl = p.coverUrl,
                                thumbUrl = p.coverUrl,
                                contentDescription = p.displayName,
                                imageLoader = imageLoader,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            BsdcAvatarCircle(
                                initials = p.displayName.ifBlank { p.username.ifBlank { "U" } },
                                size = 56.dp,
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Text(
                                        text = p.displayName,
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    if (p.verified) {
                                        Icon(
                                            imageVector = Icons.Rounded.Verified,
                                            contentDescription = "Verified",
                                            tint = BsdcThemeTokens.colors.brandStrong,
                                            modifier = Modifier.size(18.dp),
                                        )
                                    }
                                }
                                if (p.username.isNotBlank()) {
                                    Text(
                                        text = "@${p.username}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }

                        if (p.bio.isNotBlank()) {
                            Text(text = p.bio, style = MaterialTheme.typography.bodyMedium)
                        }

                        if (p.location.isNotBlank()) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.LocationOn,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    text = p.location,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }

                        val safeSite = DiscoverSearchEngine.safeHttpUrlOrEmpty(p.website)
                        if (safeSite.isNotBlank()) {
                            OutlinedButton(onClick = { onOpenExternal(safeSite) }) {
                                Text(safeSite)
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            val flw = BanglaDigitFormatter.formatCount(p.followersCount.toLong(), language)
                            val flg = BanglaDigitFormatter.formatCount(p.followingCount.toLong(), language)
                            val rep = BanglaDigitFormatter.formatCount(p.reputation.toLong(), language)
                            BsdcBadge(
                                label = if (bn) "${flw} অনুসারী" else "$flw followers",
                                tone = BsdcTone.NEUTRAL,
                            )
                            BsdcBadge(
                                label = if (bn) "${flg} অনুসরণ" else "$flg following",
                                tone = BsdcTone.NEUTRAL,
                            )
                            BsdcBadge(
                                label = if (bn) "${rep} সুনাম" else "$rep rep",
                                tone = BsdcTone.INFO,
                            )
                        }

                        if (p.skills.isNotEmpty()) {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                p.skills.forEach { skill ->
                                    AssistChip(onClick = {}, label = { Text(skill) })
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
                                        if (bn) "সম্পাদনা বাতিল" else "Cancel Edit"
                                    } else {
                                        if (bn) "প্রোফাইল সম্পাদনা" else "Edit Profile"
                                    },
                                    leadingIcon = Icons.Rounded.Edit,
                                    onClick = { editing = !editing },
                                    modifier = Modifier.weight(1f),
                                )
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
                                OutlinedButton(onClick = onOpenMessages) {
                                    Icon(Icons.Rounded.ChatBubbleOutline, contentDescription = null)
                                    Spacer(modifier = Modifier.size(6.dp))
                                    Text(if (bn) "বার্তা" else "Message")
                                }
                                IconButton(
                                    onClick = {
                                        if (viewerUid.isNullOrBlank()) {
                                            onSignInRequired()
                                        } else {
                                            scope.launch {
                                                repository.blockMember(viewerUid, p.uid)
                                                    .onSuccess {
                                                        statusMessage = if (bn) "সদস্য ব্লক করা হয়েছে।" else "Member blocked."
                                                    }
                                            }
                                        }
                                    },
                                ) {
                                    Icon(Icons.Rounded.Block, contentDescription = if (bn) "ব্লক" else "Block")
                                }
                            }
                        }
                    }
                }

                if (isSelf && editing) {
                    item {
                        BsdcCard {
                            Text(
                                text = if (bn) "প্রোফাইল তথ্য হালনাগাদ" else "Edit Profile Details",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            OutlinedTextField(
                                value = editName,
                                onValueChange = { editName = it },
                                label = { Text(if (bn) "প্রদর্শিত নাম" else "Display name") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = editBio,
                                onValueChange = { editBio = it },
                                label = { Text(if (bn) "সংক্ষিপ্ত পরিচিতি" else "Bio") },
                                maxLines = 4,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                OutlinedTextField(
                                    value = editLocation,
                                    onValueChange = { editLocation = it },
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
                            BsdcButton(
                                label = if (saving) {
                                    if (bn) "সংরক্ষণ হচ্ছে..." else "Saving..."
                                } else {
                                    if (bn) "পরিবর্তন সংরক্ষণ করুন" else "Save Profile"
                                },
                                enabled = !saving && editName.isNotBlank(),
                                onClick = {
                                    scope.launch {
                                        saving = true
                                        val skillsList = editSkillsRaw
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
                                        ).onSuccess {
                                            editing = false
                                            statusMessage = if (bn) "প্রোফাইল সংরক্ষিত হয়েছে।" else "Profile updated."
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
            }
        }
    }
}
