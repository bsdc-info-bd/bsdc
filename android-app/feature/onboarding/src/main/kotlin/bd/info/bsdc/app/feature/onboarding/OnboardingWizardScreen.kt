package bd.info.bsdc.app.feature.onboarding

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.MyLocation
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.auth.AuthDomainValidators
import bd.info.bsdc.app.core.auth.AuthRepository
import bd.info.bsdc.app.core.auth.AuthStateSnapshot
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.DevicePermissionKind
import bd.info.bsdc.app.core.model.PermissionGrantState
import bd.info.bsdc.app.core.model.ProfileDraft
import bd.info.bsdc.app.core.network.BsdcPlatformApi
import bd.info.bsdc.app.core.permissions.PermissionCoordinator
import bd.info.bsdc.app.core.permissions.PermissionSettingsFallbackDialog
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val SUGGESTED_SKILLS = listOf(
    "Kotlin", "Android", "Compose", "Java", "TypeScript", "React", "Next.js",
    "Python", "PostgreSQL", "Cloudflare", "Node.js", "Go", "Rust", "DevOps", "UI/UX",
)

private val SUGGESTED_INTERESTS = listOf(
    "Open Source", "Mobile Engineering", "System Design", "Tech Careers",
    "Cybersecurity", "AI & Data", "Startups BD", "Community Events",
)

private enum class HandleCheckState {
    IDLE,
    CHECKING,
    AVAILABLE,
    UNAVAILABLE,
    INVALID_FORMAT,
    RESERVED,
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OnboardingWizardScreen(
    authState: AuthStateSnapshot,
    authRepository: AuthRepository,
    platformApi: BsdcPlatformApi,
    permissionCoordinator: PermissionCoordinator,
    language: AppLanguage,
    onLanguageSelected: (AppLanguage) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val existing = authState.profile
    var step by rememberSaveable { mutableIntStateOf(0) }
    var displayName by rememberSaveable {
        mutableStateOf(
            existing?.displayName?.takeIf { it.isNotBlank() }
                ?: authState.session?.displayName?.takeIf { it.isNotBlank() }
                ?: "",
        )
    }
    var username by rememberSaveable { mutableStateOf(existing?.username.orEmpty()) }
    var bio by rememberSaveable { mutableStateOf(existing?.bio.orEmpty()) }
    var location by rememberSaveable { mutableStateOf(existing?.location.orEmpty()) }
    var website by rememberSaveable { mutableStateOf(existing?.website.orEmpty()) }
    var customSkill by rememberSaveable { mutableStateOf("") }
    var locationLookupBusy by remember { mutableStateOf(false) }
    var locationStatus by remember { mutableStateOf<String?>(null) }

    val selectedSkills = remember {
        mutableStateListOf<String>().apply {
            addAll(existing?.skills.orEmpty())
        }
    }
    val selectedInterests = remember {
        mutableStateListOf<String>().apply {
            addAll(existing?.interests.orEmpty())
        }
    }

    var handleState by remember { mutableStateOf(HandleCheckState.IDLE) }

    LaunchedEffect(username) {
        val normalized = AuthDomainValidators.normalizeUsername(username)
        if (normalized.isEmpty()) {
            handleState = HandleCheckState.IDLE
            return@LaunchedEffect
        }
        val validation = AuthDomainValidators.validateUsername(normalized)
        if (validation != AuthDomainValidators.UsernameValidation.VALID) {
            handleState = if (validation == AuthDomainValidators.UsernameValidation.RESERVED) {
                HandleCheckState.RESERVED
            } else {
                HandleCheckState.INVALID_FORMAT
            }
            return@LaunchedEffect
        }
        handleState = HandleCheckState.CHECKING
        delay(350)
        val available = runCatching { authRepository.checkUsernameAvailability(normalized) }
            .getOrDefault(true)
        handleState = if (available) HandleCheckState.AVAILABLE else HandleCheckState.UNAVAILABLE
    }

    fun triggerLocationFill() {
        val permState = permissionCoordinator.states[DevicePermissionKind.LOCATION]
        if (permState != PermissionGrantState.GRANTED) {
            permissionCoordinator.request(DevicePermissionKind.LOCATION)
            return
        }
        locationLookupBusy = true
        locationStatus = null
        scope.launch {
            val coords = CoarseLocationHelper.fetchApproximateCoordinates(context)
            if (coords == null) {
                locationLookupBusy = false
                locationStatus = if (bn) {
                    "ডিভাইস অবস্থান পাওয়া যায়নি — অনুগ্রহ করে শহরের নাম টাইপ করুন।"
                } else {
                    "Could not get a device fix — please type your city name directly."
                }
                return@launch
            }
            runCatching {
                platformApi.reverseGeocode(coords.first, coords.second, language)
            }.onSuccess { result ->
                locationLookupBusy = false
                if (result.place.isNotBlank()) {
                    location = result.place
                } else {
                    locationStatus = if (bn) {
                        "স্থানের নাম মেলেনি — অনুগ্রহ করে নিজে টাইপ করুন।"
                    } else {
                        "No city match at rounded coordinates — please enter your city manually."
                    }
                }
            }.onFailure {
                locationLookupBusy = false
                locationStatus = if (bn) {
                    "জিওকোডার সংযোগ ব্যর্থ — শহরের নাম টাইপ করুন।"
                } else {
                    "Location lookup unavailable — please type your city manually."
                }
            }
        }
    }

    fun finishOnboarding() {
        val cleanHandle = AuthDomainValidators.normalizeUsername(username)
        val cleanName = displayName.trim().ifEmpty { "Member" }
        scope.launch {
            authRepository.saveOnboardingProfile(
                draft = ProfileDraft(
                    username = cleanHandle,
                    displayName = cleanName,
                    bio = bio.trim(),
                    avatarUrl = authState.session?.photoUrl.orEmpty(),
                    location = location.trim(),
                    website = website.trim(),
                    skills = selectedSkills.toList(),
                    interests = selectedInterests.toList(),
                    language = language,
                    onboardingComplete = true,
                ),
                language = language,
            )
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = if (bn) "প্রোফাইল সেটআপ (${step + 1}/৪)" else "Profile Setup (${step + 1}/4)",
                style = MaterialTheme.typography.headlineMedium,
            )
            TextButton(onClick = { scope.launch { authRepository.atomicSignOut() } }) {
                Text(if (bn) "সাইন আউট" else "Sign out")
            }
        }

        LinearProgressIndicator(
            progress = { (step + 1) / 4f },
            modifier = Modifier.fillMaxWidth(),
        )

        authState.errorMessage?.let { err ->
            BsdcStatusBanner(
                title = if (bn) "প্রোফাইল সংরক্ষণ ত্রুটি" else "Save failed",
                body = err,
                tone = BsdcTone.BAD,
            )
        }

        AnimatedContent(
            targetState = step,
            transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(150)) },
            label = "onboarding_step_transition",
        ) { currentStep ->
            when (currentStep) {
                0 -> BsdcCard(elevated = true) {
                    Text(
                        text = if (bn) "আপনার পরিচয় ও ইউজারনেম" else "Your Identity & Handle",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    OutlinedTextField(
                        value = displayName,
                        onValueChange = { displayName = it.take(60) },
                        label = { Text(if (bn) "প্রদর্শিত নাম" else "Display Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it.lowercase().take(24) },
                        label = { Text(if (bn) "ইউজারনেম (৩–২৪ অক্ষর)" else "Username handle (3–24 chars)") },
                        leadingIcon = { Icon(Icons.Rounded.AlternateEmail, contentDescription = null) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    HandleStatusRow(state = handleState, language = language)
                    OutlinedTextField(
                        value = bio,
                        onValueChange = { bio = it.take(280) },
                        label = { Text(if (bn) "সংক্ষিপ্ত পরিচয়" else "Short Bio") },
                        minLines = 2,
                        maxLines = 4,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                1 -> BsdcCard(elevated = true) {
                    Text(
                        text = if (bn) "শহর, লিংক ও ভাষা" else "City, Website & Language",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    OutlinedTextField(
                        value = location,
                        onValueChange = { location = it.take(80) },
                        label = { Text(if (bn) "শহর / জেলা" else "City / Region") },
                        leadingIcon = { Icon(Icons.Rounded.LocationOn, contentDescription = null) },
                        trailingIcon = {
                            IconButton(
                                onClick = ::triggerLocationFill,
                                enabled = !locationLookupBusy,
                            ) {
                                Icon(Icons.Rounded.MyLocation, contentDescription = "Use my city")
                            }
                        },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    BsdcButton(
                        label = if (locationLookupBusy) {
                            if (bn) "অবস্থান খুঁজছে…" else "Detecting city…"
                        } else if (bn) {
                            "আমার বর্তমান শহর ব্যবহার করুন (~১ কিমি)"
                        } else {
                            "Use my approximate city (~1 km)"
                        },
                        secondary = true,
                        leadingIcon = Icons.Rounded.MyLocation,
                        enabled = !locationLookupBusy,
                        onClick = ::triggerLocationFill,
                    )
                    locationStatus?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = BsdcThemeTokens.colors.warn,
                        )
                    }
                    OutlinedTextField(
                        value = website,
                        onValueChange = { website = it.take(200) },
                        label = { Text(if (bn) "ওয়েবসাইট / GitHub" else "Website / GitHub URL") },
                        leadingIcon = { Icon(Icons.Rounded.Public, contentDescription = null) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = language == AppLanguage.BN,
                            onClick = { onLanguageSelected(AppLanguage.BN) },
                            label = { Text("বাংলা") },
                        )
                        FilterChip(
                            selected = language == AppLanguage.EN,
                            onClick = { onLanguageSelected(AppLanguage.EN) },
                            label = { Text("English") },
                        )
                    }
                }

                2 -> BsdcCard(elevated = true) {
                    Text(
                        text = if (bn) "দক্ষতা ও আগ্রহের বিষয়" else "Skills & Community Topics",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = customSkill,
                            onValueChange = { customSkill = it.take(32) },
                            label = { Text(if (bn) "নিজস্ব স্কিল যোগ করুন" else "Add custom skill") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(
                            onClick = {
                                val cleaned = customSkill.trim()
                                if (cleaned.isNotEmpty() && selectedSkills.size < 20 &&
                                    selectedSkills.none { it.equals(cleaned, ignoreCase = true) }
                                ) {
                                    selectedSkills.add(cleaned)
                                    customSkill = ""
                                }
                            },
                        ) {
                            Icon(Icons.Rounded.Add, contentDescription = "Add skill")
                        }
                    }

                    Text(
                        text = if (bn) "প্রযুক্তি ও দক্ষতা" else "Skills",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        (SUGGESTED_SKILLS + selectedSkills).distinct().forEach { skill ->
                            val selected = selectedSkills.any { it.equals(skill, ignoreCase = true) }
                            FilterChip(
                                selected = selected,
                                onClick = {
                                    if (selected) {
                                        selectedSkills.removeAll { it.equals(skill, ignoreCase = true) }
                                    } else if (selectedSkills.size < 20) {
                                        selectedSkills.add(skill)
                                    }
                                },
                                label = { Text(skill) },
                            )
                        }
                    }

                    Text(
                        text = if (bn) "আগ্রহের বিষয়" else "Interests",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        SUGGESTED_INTERESTS.forEach { topic ->
                            val selected = selectedInterests.any { it.equals(topic, ignoreCase = true) }
                            FilterChip(
                                selected = selected,
                                onClick = {
                                    if (selected) {
                                        selectedInterests.removeAll { it.equals(topic, ignoreCase = true) }
                                    } else if (selectedInterests.size < 20) {
                                        selectedInterests.add(topic)
                                    }
                                },
                                label = { Text(topic) },
                            )
                        }
                    }
                }

                3 -> BsdcCard(elevated = true) {
                    Text(
                        text = if (bn) "ডিভাইস প্রস্তুতি ও অনুমতি" else "Device Readiness & Permissions",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        text = if (bn) {
                            "সব ফিচার নিরবচ্ছিন্নভাবে ব্যবহার করতে নিচের অনুমতিগুলো চালু করুন (পরে সেটিংস থেকে পরিবর্তনযোগ্য)।"
                        } else {
                            "Enable device permissions below for instant Push Alerts, Camera QR Scan, City Meetup fill, and Voice Search (always adjustable later)."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                    DevicePermissionKind.entries.forEach { kind ->
                        val granted = permissionCoordinator.states[kind] == PermissionGrantState.GRANTED
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = when (kind) {
                                    DevicePermissionKind.NOTIFICATIONS -> if (bn) "পুশ নোটিফিকেশন" else "Push Notifications"
                                    DevicePermissionKind.LOCATION -> if (bn) "লোকেশন (~১ কিমি)" else "City Location (~1 km)"
                                    DevicePermissionKind.CAMERA -> if (bn) "ক্যামেরা (QR ও ছবি)" else "Camera (QR & Photos)"
                                    DevicePermissionKind.MICROPHONE -> if (bn) "মাইক্রোফোন (ভয়েস সার্চ)" else "Microphone (Voice Search)"
                                },
                                style = MaterialTheme.typography.titleMedium,
                            )
                            if (granted) {
                                Icon(
                                    imageVector = Icons.Rounded.CheckCircle,
                                    contentDescription = "Granted",
                                    tint = BsdcThemeTokens.colors.brandStrong,
                                )
                            } else {
                                BsdcButton(
                                    label = if (bn) "অনুমতি দিন" else "Allow",
                                    secondary = true,
                                    onClick = { permissionCoordinator.request(kind) },
                                )
                            }
                        }
                    }
                    if (!permissionCoordinator.allGranted) {
                        BsdcButton(
                            label = if (bn) "সব অনুমতি চালু করুন" else "Allow All Permissions",
                            secondary = true,
                            onClick = permissionCoordinator::requestAllMissing,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (step > 0) {
                BsdcButton(
                    label = if (bn) "পেছনে" else "Back",
                    secondary = true,
                    onClick = { step -= 1 },
                    modifier = Modifier.weight(1f),
                )
            }
            val stepZeroValid = displayName.trim().isNotEmpty() &&
                (handleState == HandleCheckState.AVAILABLE || handleState == HandleCheckState.CHECKING)
            if (step < 3) {
                BsdcButton(
                    label = if (bn) "পরবর্তী" else "Continue",
                    enabled = if (step == 0) stepZeroValid else true,
                    onClick = { step += 1 },
                    modifier = Modifier.weight(1f),
                )
            } else {
                BsdcButton(
                    label = if (authState.isBusy) {
                        if (bn) "সংরক্ষণ হচ্ছে…" else "Saving…"
                    } else if (bn) {
                        "প্রোফাইল সম্পন্ন করুন"
                    } else {
                        "Finish & Enter BSDC"
                    },
                    enabled = !authState.isBusy && stepZeroValid,
                    onClick = ::finishOnboarding,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }

    PermissionSettingsFallbackDialog(coordinator = permissionCoordinator, language = language)
}

@Composable
private fun HandleStatusRow(
    state: HandleCheckState,
    language: AppLanguage,
) {
    val bn = language == AppLanguage.BN
    when (state) {
        HandleCheckState.IDLE -> Text(
            text = if (bn) "শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও _ ব্যবহার করুন" else "Lowercase letters, digits, and _ (cannot start/end with _)",
            style = MaterialTheme.typography.bodyMedium,
            color = BsdcThemeTokens.colors.mutedText,
        )
        HandleCheckState.CHECKING -> BsdcBadge(
            label = if (bn) "যাচাই হচ্ছে…" else "Checking availability…",
            tone = BsdcTone.INFO,
        )
        HandleCheckState.AVAILABLE -> BsdcBadge(
            label = if (bn) "ইউজারনেমটি উপলব্ধ" else "Handle available",
            tone = BsdcTone.OK,
        )
        HandleCheckState.UNAVAILABLE -> BsdcBadge(
            label = if (bn) "এই ইউজারনেম ইতিমধ্যেই নেওয়া হয়েছে" else "Handle already taken",
            tone = BsdcTone.BAD,
        )
        HandleCheckState.RESERVED -> BsdcBadge(
            label = if (bn) "সংরক্ষিত ইউজারনেম — অন্যটি দিন" else "Reserved handle — choose another",
            tone = BsdcTone.WARN,
        )
        HandleCheckState.INVALID_FORMAT -> BsdcBadge(
            label = if (bn) "সঠিক ফরম্যাট: ৩–২৪ অক্ষর (a-z, 0-9, _)" else "Must be 3–24 chars (a-z, 0-9, _) without leading/trailing _",
            tone = BsdcTone.BAD,
        )
    }
}
