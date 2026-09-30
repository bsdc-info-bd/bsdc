package bd.info.bsdc.app.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.model.UserProfile
import bd.info.bsdc.app.ui.NotificationsViewModel
import bd.info.bsdc.app.ui.ProfileViewModel
import bd.info.bsdc.app.ui.components.PostCard
import coil.compose.AsyncImage
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel,
    onSignOut: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenConversation: (String) -> Unit,
    onOpenPost: (String) -> Unit,
    onManageStack: (() -> Unit)? = null,
    onBack: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val profile by viewModel.state.collectAsStateWithLifecycle()
    val posts by viewModel.posts.collectAsStateWithLifecycle()
    val following by viewModel.isFollowing.collectAsStateWithLifecycle()
    val action by viewModel.action.collectAsStateWithLifecycle()
    val conversationId by viewModel.conversationId.collectAsStateWithLifecycle()
    val privacyPreferences by viewModel.privacyPreferences.collectAsStateWithLifecycle()
    val locationSuggestion by viewModel.locationSuggestion.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableIntStateOf(0) }
    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(viewModel::uploadAvatar) }
    val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(viewModel::uploadCover) }
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    var privacyDisclosure by remember { mutableStateOf<PrivacyDisclosure?>(null) }
    val cameraCapture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { captured ->
        val uri = pendingCameraUri
        pendingCameraUri = null
        if (captured && uri != null) viewModel.uploadCapturedAvatar(uri)
        else if (uri != null) context.deleteTemporaryCapture(uri)
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        when {
            !granted -> viewModel.showActionError("Camera permission was not granted. You can still choose a profile image from your device.")
            !context.hasCameraCaptureHandler() -> viewModel.showActionError("No camera app is available on this device. You can still choose a profile image.")
            else -> context.profileCameraUri()?.let { uri ->
                pendingCameraUri = uri
                cameraCapture.launch(uri)
            } ?: viewModel.showActionError("BSDC could not prepare a private camera capture.")
        }
    }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) viewModel.suggestApproximateLocation(context)
        else viewModel.showActionError("Approximate location was not granted. You can still enter a city manually.")
    }
    val contactPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickContact()) { uri ->
        if (uri != null) context.prepareAndLaunchContactInvite(uri, viewModel::showActionError)
    }
    val contactPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) contactPicker.launch(null)
        else viewModel.showActionError("Contacts permission was not granted. BSDC cannot prepare an invite without a recipient.")
    }

    LaunchedEffect(conversationId) {
        conversationId?.let {
            onOpenConversation(it)
            viewModel.consumeConversation()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (viewModel.isOwnProfile) "Your profile" else "Developer profile") },
                navigationIcon = { onBack?.let { TextButton(onClick = it) { Text("Back") } } },
                actions = {
                    if (viewModel.isOwnProfile) TextButton(onClick = onSignOut) { Text("Sign out") }
                }
            )
        }
    ) { padding ->
        val member = profile
        if (member == null) {
            Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.Center) {
                Text("Loading profile", style = MaterialTheme.typography.titleLarge)
                Text("This profile is fetched from BSDC in real time.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item(key = "identity") {
                    ProfileIdentity(
                        profile = member,
                        editable = viewModel.isOwnProfile,
                        busy = action.busy,
                        onEditCover = { coverPicker.launch(arrayOf("image/*")) },
                        onEditAvatar = { avatarPicker.launch(arrayOf("image/*")) }
                    )
                }
                item(key = "actions") {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (viewModel.isOwnProfile) {
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                                Button(onClick = { editing = true }, enabled = !action.busy, modifier = Modifier.weight(1f)) { Text("Edit profile") }
                                Button(onClick = { onManageStack?.invoke() }, enabled = !action.busy && onManageStack != null, modifier = Modifier.weight(1f)) { Text("Tech stack") }
                            }
                        } else {
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                                Button(onClick = viewModel::toggleFollow, enabled = !action.busy, modifier = Modifier.weight(1f)) {
                                    Text(if (following) "Following" else "Follow")
                                }
                                Button(onClick = viewModel::messageMember, enabled = !action.busy, modifier = Modifier.weight(1f)) { Text("Message") }
                            }
                        }
                        action.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                        action.message?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
                    }
                }
                if (viewModel.isOwnProfile) {
                    item(key = "privacy-controls") {
                        PrivacyAndPersonalizationCard(
                            profile = member,
                            preferences = privacyPreferences,
                            busy = action.busy,
                            onTakeCameraPhoto = {
                                if (privacyPreferences.cameraProfilePhotoConsent) {
                                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                        if (context.hasCameraCaptureHandler()) context.profileCameraUri()?.let { uri ->
                                            pendingCameraUri = uri
                                            cameraCapture.launch(uri)
                                        } ?: viewModel.showActionError("BSDC could not prepare a private camera capture.")
                                        else viewModel.showActionError("No camera app is available on this device. You can still choose a profile image.")
                                    } else cameraPermission.launch(Manifest.permission.CAMERA)
                                } else privacyDisclosure = PrivacyDisclosure.CAMERA
                            },
                            onStopCamera = { viewModel.setCameraProfilePhotoConsent(false) },
                            onRemoveProfilePhoto = viewModel::removeProfilePhoto,
                            onSuggestCity = {
                                if (privacyPreferences.approximateLocationConsent) {
                                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                                        viewModel.suggestApproximateLocation(context)
                                    } else locationPermission.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                                } else privacyDisclosure = PrivacyDisclosure.LOCATION
                            },
                            onStopLocation = viewModel::revokeApproximateLocation,
                            onInviteContact = {
                                if (privacyPreferences.contactInviteConsent) {
                                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
                                        contactPicker.launch(null)
                                    } else contactPermission.launch(Manifest.permission.READ_CONTACTS)
                                } else privacyDisclosure = PrivacyDisclosure.CONTACTS
                            },
                            onStopContactInvite = { viewModel.setContactInviteConsent(false) }
                        )
                    }
                }
                item(key = "tabs") {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AssistChip(onClick = { selectedTab = 0 }, label = { Text("Posts ${posts.size}") })
                        AssistChip(onClick = { selectedTab = 1 }, label = { Text("About") })
                    }
                }
                if (selectedTab == 0) {
                    if (posts.isEmpty()) {
                        item(key = "empty-posts") { EmptyProfilePosts(viewModel.isOwnProfile) }
                    } else {
                        items(posts, key = { "post-${it.id}" }) { post ->
                            PostCard(
                                post = post,
                                onAuthorClick = { onOpenProfile(post.authorId) },
                                onReact = {},
                                onComment = { onOpenPost(post.id) },
                                onMore = {},
                                modifier = Modifier.padding(horizontal = 12.dp)
                            )
                        }
                    }
                } else {
                    item(key = "about") { AboutProfile(member) }
                }
            }
        }
    }

    if (editing && profile != null) {
        EditProfileDialog(
            profile = profile!!,
            busy = action.busy,
            onDismiss = { editing = false },
            onSave = { username, name, bio, skills, location ->
                if (username != profile!!.username) viewModel.changeUsername(username)
                viewModel.update(name, bio, skills, location)
                editing = false
            }
        )
    }

    privacyDisclosure?.let { disclosure ->
        SensitiveFeatureDisclosureDialog(
            disclosure = disclosure,
            onDismiss = { privacyDisclosure = null },
            onContinue = {
                privacyDisclosure = null
                when (disclosure) {
                    PrivacyDisclosure.CAMERA -> {
                        viewModel.setCameraProfilePhotoConsent(true)
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                            if (context.hasCameraCaptureHandler()) context.profileCameraUri()?.let { uri ->
                                pendingCameraUri = uri
                                cameraCapture.launch(uri)
                            } ?: viewModel.showActionError("BSDC could not prepare a private camera capture.")
                            else viewModel.showActionError("No camera app is available on this device. You can still choose a profile image.")
                        } else cameraPermission.launch(Manifest.permission.CAMERA)
                    }
                    PrivacyDisclosure.LOCATION -> {
                        viewModel.setApproximateLocationConsent(true)
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                            viewModel.suggestApproximateLocation(context)
                        } else locationPermission.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                    }
                    PrivacyDisclosure.CONTACTS -> {
                        viewModel.setContactInviteConsent(true)
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
                            contactPicker.launch(null)
                        } else contactPermission.launch(Manifest.permission.READ_CONTACTS)
                    }
                }
            }
        )
    }
    locationSuggestion?.let { label ->
        AlertDialog(
            onDismissRequest = viewModel::dismissLocationSuggestion,
            title = { Text("Use this public city?") },
            text = { Text("BSDC suggests \"$label\". Only this label will be saved to your public profile; the device coordinates used to suggest it are not stored.") },
            confirmButton = { TextButton(onClick = { viewModel.saveSuggestedLocation(label) }, enabled = !action.busy) { Text("Save city") } },
            dismissButton = { TextButton(onClick = viewModel::dismissLocationSuggestion, enabled = !action.busy) { Text("Keep manual location") } }
        )
    }
}

private enum class PrivacyDisclosure { CAMERA, LOCATION, CONTACTS }

@Composable
private fun SensitiveFeatureDisclosureDialog(
    disclosure: PrivacyDisclosure,
    onDismiss: () -> Unit,
    onContinue: () -> Unit
) {
    val (title, body, continueLabel) = when (disclosure) {
        PrivacyDisclosure.CAMERA -> Triple(
            "Use camera for a profile photo?",
            "BSDC will request camera access only to capture a profile image you requested. The capture is held in temporary app storage, then uploaded to the configured BSDC image service as your public profile photo. You can remove the public profile reference later.",
            "Continue to camera"
        )
        PrivacyDisclosure.LOCATION -> Triple(
            "Use approximate location once?",
            "BSDC will ask Android only for approximate location to suggest a city-level public profile label. Raw coordinates are not stored, uploaded, or used to rank your feed. You review the suggestion before it is saved and can remove it at any time.",
            "Find my city"
        )
        PrivacyDisclosure.CONTACTS -> Triple(
            "Choose one contact to invite?",
            "BSDC will request Contacts permission only to read the one recipient you choose in Android’s picker and prepare an email or SMS draft. It does not upload or save names, email addresses, or phone numbers. Your email or SMS app sends the invite only if you choose to send it.",
            "Open contact picker"
        )
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = { TextButton(onClick = onContinue) { Text(continueLabel) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Not now") } }
    )
}

private fun Context.hasCameraCaptureHandler(): Boolean =
    Intent(MediaStore.ACTION_IMAGE_CAPTURE).resolveActivity(packageManager) != null

private fun Context.profileCameraUri(): Uri? = runCatching {
    val directory = File(cacheDir, "profile-camera").apply { mkdirs() }
    val image = File.createTempFile("profile-", ".jpg", directory)
    FileProvider.getUriForFile(this, "$packageName.fileprovider", image)
}.getOrNull()

private fun Context.deleteTemporaryCapture(uri: Uri) {
    runCatching { contentResolver.delete(uri, null, null) }
}

private data class ContactInviteTarget(val name: String, val email: String?, val phone: String?)

private fun Context.prepareAndLaunchContactInvite(uri: Uri, onError: (String) -> Unit) {
    val target = runCatching { readInviteTarget(uri) }.getOrElse {
        onError("BSDC could not read the contact you selected.")
        return
    }
    if (target == null || (target.email.isNullOrBlank() && target.phone.isNullOrBlank())) {
        onError("Choose a contact with an email address or mobile number to prepare an invite.")
        return
    }
    val recipient = target.email ?: target.phone.orEmpty()
    val body = "Hi ${target.name}, I’m part of Bangladesh Software Development Community. Join me on BSDC to connect, learn, publish, and collaborate with developers."
    val intent = if (target.email != null) {
        Intent(Intent.ACTION_SENDTO, Uri.fromParts("mailto", recipient, null)).apply {
            putExtra(Intent.EXTRA_SUBJECT, "Join me on BSDC")
            putExtra(Intent.EXTRA_TEXT, body)
        }
    } else {
        Intent(Intent.ACTION_SENDTO, Uri.fromParts("smsto", recipient, null)).apply {
            putExtra("sms_body", body)
        }
    }
    runCatching { startActivity(Intent.createChooser(intent, "Invite ${target.name}")) }
        .onFailure { onError("No email or SMS app is available for this invite.") }
}

@Suppress("MissingPermission") // READ_CONTACTS is checked immediately before the one-contact picker is launched.
private fun Context.readInviteTarget(uri: Uri): ContactInviteTarget? {
    val contact = contentResolver.query(
        uri,
        arrayOf(ContactsContract.Contacts._ID, ContactsContract.Contacts.DISPLAY_NAME),
        null,
        null,
        null
    )?.use { cursor ->
        if (!cursor.moveToFirst()) return@use null
        cursor.getLong(cursor.getColumnIndexOrThrow(ContactsContract.Contacts._ID)) to
            (cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME)) ?: "a developer")
    } ?: return null
    val email = contentResolver.query(
        ContactsContract.CommonDataKinds.Email.CONTENT_URI,
        arrayOf(ContactsContract.CommonDataKinds.Email.ADDRESS),
        "${ContactsContract.CommonDataKinds.Email.CONTACT_ID} = ?",
        arrayOf(contact.first.toString()),
        null
    )?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
    val phone = contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
        "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
        arrayOf(contact.first.toString()),
        null
    )?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
    return ContactInviteTarget(contact.second, email, phone)
}

@Composable
private fun ProfileIdentity(
    profile: UserProfile,
    editable: Boolean,
    busy: Boolean,
    onEditCover: () -> Unit,
    onEditAvatar: () -> Unit
) {
    Column {
        Box(Modifier.fillMaxWidth().height(178.dp).background(MaterialTheme.colorScheme.secondaryContainer)) {
            profile.coverUrl?.let {
                AsyncImage(
                    model = it,
                    contentDescription = "${profile.displayName} cover image",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            }
            if (editable) TextButton(onClick = onEditCover, enabled = !busy, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) { Text("Change cover") }
        }
        Row(Modifier.padding(horizontal = 16.dp).padding(top = 0.dp), verticalAlignment = Alignment.Bottom) {
            Box(Modifier.size(102.dp).padding(bottom = 0.dp)) {
                if (profile.photoUrl != null) {
                    AsyncImage(
                        model = profile.photoUrl,
                        contentDescription = "${profile.displayName} profile photo",
                        modifier = Modifier.fillMaxSize().clip(CircleShape).background(MaterialTheme.colorScheme.surface),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    ProfileMonogram(profile.displayName, Modifier.fillMaxSize())
                }
                if (editable) TextButton(onClick = onEditAvatar, enabled = !busy, modifier = Modifier.align(Alignment.BottomCenter)) { Text("Photo") }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.padding(top = 16.dp).weight(1f)) {
                Text(profile.displayName, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("@${profile.username}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleSmall)
                if (profile.verified) Text("Verified BSDC member", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
        }
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            if (profile.bio.isNotBlank()) Text(profile.bio, style = MaterialTheme.typography.bodyLarge)
            if (profile.locationLabel != null) Text(profile.locationLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row {
                Text("${profile.followerCount} followers", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.width(18.dp))
                Text("${profile.followingCount} following", style = MaterialTheme.typography.labelLarge)
            }
            if (profile.skills.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                profile.skills.take(4).forEach { skill -> AssistChip(onClick = {}, label = { Text(skill) }) }
            }
        }
    }
}

@Composable
private fun ProfileMonogram(name: String, modifier: Modifier = Modifier) {
    Box(modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
        Text(name.firstOrNull()?.uppercase() ?: "?", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun EmptyProfilePosts(isOwn: Boolean) {
    Card(Modifier.padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Text(
            if (isOwn) "Your public posts will appear here when you publish them." else "This developer has not published a public post yet.",
            modifier = Modifier.padding(18.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun AboutProfile(profile: UserProfile) {
    Card(Modifier.padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("About", style = MaterialTheme.typography.titleMedium)
            Text(profile.bio.ifBlank { "This member has not added a biography yet." })
            profile.locationLabel?.let { Text("Location: $it") }
            if (profile.skills.isNotEmpty()) Text("Skills: ${profile.skills.joinToString(", ")}")
        }
    }
}

@Composable
private fun EditProfileDialog(profile: UserProfile, busy: Boolean, onDismiss: () -> Unit, onSave: (String, String, String, String, String) -> Unit) {
    var username by remember(profile.id) { mutableStateOf(profile.username) }
    var name by remember(profile.id) { mutableStateOf(profile.displayName) }
    var bio by remember(profile.id) { mutableStateOf(profile.bio) }
    var skills by remember(profile.id) { mutableStateOf(profile.skills.joinToString(", ")) }
    var location by remember(profile.id) { mutableStateOf(profile.locationLabel.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit your BSDC profile") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(username, { username = it }, label = { Text("Username") }, prefix = { Text("@") }, singleLine = true)
                OutlinedTextField(name, { name = it }, label = { Text("Display name") }, singleLine = true)
                OutlinedTextField(bio, { bio = it }, label = { Text("Bio") }, minLines = 3)
                OutlinedTextField(skills, { skills = it }, label = { Text("Skills") }, supportingText = { Text("Separate skills with commas") })
                OutlinedTextField(location, { location = it }, label = { Text("Location") }, singleLine = true)
            }
        },
        confirmButton = { TextButton(onClick = { onSave(username, name, bio, skills, location) }, enabled = !busy) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(viewModel: NotificationsViewModel) {
    val notifications = viewModel.notifications.collectAsStateWithLifecycle().value
    Scaffold(topBar = { TopAppBar(title = { Text("Notifications") }) }) { padding ->
        if (notifications.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.Center) {
                Text("You’re all caught up", style = MaterialTheme.typography.titleLarge)
                Text("Activity from your community will appear here.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else LazyColumn(Modifier.fillMaxSize().padding(padding)) {
            items(notifications, key = { it.id }) { notice ->
                Column(
                    Modifier.fillMaxWidth().clickable { viewModel.markRead(notice.id) }.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(notice.title, style = MaterialTheme.typography.titleSmall)
                    Text(notice.body, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (!notice.isRead) Text("New", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                HorizontalDivider()
            }
        }
    }
}
