package bd.info.bsdc.app.feature.onboarding

import android.app.Activity
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MarkEmailRead
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SyncProblem
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.auth.AuthDomainValidators
import bd.info.bsdc.app.core.auth.AuthRepository
import bd.info.bsdc.app.core.auth.AuthStateSnapshot
import bd.info.bsdc.app.core.designsystem.BsdcAnimatedEntrance
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcMotionSpecs
import bd.info.bsdc.app.core.designsystem.BsdcResponsiveContainer
import bd.info.bsdc.app.core.designsystem.BsdcShieldMark
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import kotlinx.coroutines.launch

private enum class AuthFlowMode {
    SIGN_IN,
    SIGN_UP,
    RESET_PASSWORD,
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BsdcAuthScreen(
    authState: AuthStateSnapshot,
    authRepository: AuthRepository,
    language: AppLanguage,
    onContinueAsGuest: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val activity = context as? Activity
    val scope = rememberCoroutineScope()
    val reducedMotion = BsdcThemeTokens.reducedMotion

    var mode by rememberSaveable { mutableStateOf(AuthFlowMode.SIGN_IN) }
    var displayName by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var passwordVisible by rememberSaveable { mutableStateOf(false) }

    val passwordScore = remember(password) { AuthDomainValidators.scorePassword(password) }
    val canSubmitEmail = AuthDomainValidators.isEmailValid(email) && when (mode) {
        AuthFlowMode.SIGN_IN -> password.length >= 6
        AuthFlowMode.SIGN_UP -> displayName.trim().length >= 2 && password.length >= 8
        AuthFlowMode.RESET_PASSWORD -> true
    }

    fun submitEmailForm() {
        if (!canSubmitEmail || authState.isBusy) return
        scope.launch {
            when (mode) {
                AuthFlowMode.SIGN_IN -> authRepository.signInWithEmail(email, password, language)
                AuthFlowMode.SIGN_UP -> authRepository.signUpWithEmail(email, password, displayName, language)
                AuthFlowMode.RESET_PASSWORD -> authRepository.sendPasswordReset(email, language)
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        BsdcThemeTokens.colors.brandSoft.copy(alpha = 0.28f),
                        MaterialTheme.colorScheme.background,
                        MaterialTheme.colorScheme.background,
                    ),
                ),
            ),
    ) {
        BsdcResponsiveContainer(
            maxWidth = 540.dp,
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 24.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                BsdcAnimatedEntrance {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        BsdcShieldMark(size = 64.dp)
                        Text(
                            text = if (bn) "BSDC কমিউনিটিতে স্বাগতম" else "Welcome to BSDC",
                            style = MaterialTheme.typography.headlineLarge,
                            textAlign = TextAlign.Center,
                        )
                        Text(
                            text = if (bn) {
                                "বাংলাদেশ সফটওয়্যার ডেভেলপমেন্ট কমিউনিটি — সদস্য, যাচাই, মেসেঞ্জার ও মার্কেটপ্লেস।"
                            } else {
                                "Bangladesh Software Development Community — member network, verification, messenger & marketplace."
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = BsdcThemeTokens.colors.mutedText,
                            textAlign = TextAlign.Center,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            BsdcBadge(
                                label = if (bn) "বাংলা ও English" else "Bangla & English",
                                tone = BsdcTone.OK,
                            )
                            BsdcBadge(
                                label = if (bn) "চিরকাল ফ্রি" else "Free for Developers",
                                tone = BsdcTone.INFO,
                            )
                        }
                    }
                }

                authState.errorMessage?.takeIf { it.isNotBlank() }?.let { err ->
                    BsdcStatusBanner(
                        title = if (bn) "প্রমাণীকরণ বার্তা" else "Authentication notice",
                        body = err,
                        tone = BsdcTone.BAD,
                    )
                }
                authState.infoMessage?.takeIf { it.isNotBlank() }?.let { info ->
                    BsdcStatusBanner(
                        title = if (bn) "সম্পন্ন" else "Sent",
                        body = info,
                        tone = BsdcTone.OK,
                    )
                }

                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = mode == AuthFlowMode.SIGN_IN,
                        onClick = {
                            authRepository.clearMessages()
                            mode = AuthFlowMode.SIGN_IN
                        },
                        shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                        label = { Text(if (bn) "সাইন ইন" else "Sign In") },
                    )
                    SegmentedButton(
                        selected = mode == AuthFlowMode.SIGN_UP,
                        onClick = {
                            authRepository.clearMessages()
                            mode = AuthFlowMode.SIGN_UP
                        },
                        shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                        label = { Text(if (bn) "নতুন অ্যাকাউন্ট" else "Create Account") },
                    )
                }

                BsdcAnimatedEntrance(delayMillis = 60) {
                    BsdcCard(elevated = true) {
                        AnimatedContent(
                            targetState = mode,
                            transitionSpec = {
                                BsdcMotionSpecs.screenTransition(
                                    reducedMotion = reducedMotion,
                                    forward = targetState.ordinal >= initialState.ordinal,
                                )
                            },
                            label = "auth_mode_transition",
                        ) { currentMode ->
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                if (currentMode == AuthFlowMode.SIGN_UP) {
                                    OutlinedTextField(
                                        value = displayName,
                                        onValueChange = { displayName = it.take(60) },
                                        label = { Text(if (bn) "পূর্ণ নাম" else "Full name") },
                                        leadingIcon = { Icon(Icons.Rounded.Person, contentDescription = null) },
                                        singleLine = true,
                                        shape = RoundedCornerShape(14.dp),
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }

                                OutlinedTextField(
                                    value = email,
                                    onValueChange = { email = it },
                                    label = { Text(if (bn) "ইমেইল ঠিকানা" else "Email address") },
                                    leadingIcon = { Icon(Icons.Rounded.Email, contentDescription = null) },
                                    singleLine = true,
                                    shape = RoundedCornerShape(14.dp),
                                    keyboardOptions = KeyboardOptions(
                                        keyboardType = KeyboardType.Email,
                                        imeAction = if (currentMode == AuthFlowMode.RESET_PASSWORD) {
                                            ImeAction.Done
                                        } else {
                                            ImeAction.Next
                                        },
                                    ),
                                    keyboardActions = KeyboardActions(
                                        onDone = {
                                            if (currentMode == AuthFlowMode.RESET_PASSWORD) submitEmailForm()
                                        },
                                    ),
                                    modifier = Modifier.fillMaxWidth(),
                                )

                                if (currentMode != AuthFlowMode.RESET_PASSWORD) {
                                    OutlinedTextField(
                                        value = password,
                                        onValueChange = { password = it },
                                        label = { Text(if (bn) "পাসওয়ার্ড" else "Password") },
                                        leadingIcon = { Icon(Icons.Rounded.Lock, contentDescription = null) },
                                        trailingIcon = {
                                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                                Icon(
                                                    imageVector = if (passwordVisible) {
                                                        Icons.Rounded.VisibilityOff
                                                    } else {
                                                        Icons.Rounded.Visibility
                                                    },
                                                    contentDescription = null,
                                                )
                                            }
                                        },
                                        visualTransformation = if (passwordVisible) {
                                            VisualTransformation.None
                                        } else {
                                            PasswordVisualTransformation()
                                        },
                                        singleLine = true,
                                        shape = RoundedCornerShape(14.dp),
                                        keyboardOptions = KeyboardOptions(
                                            keyboardType = KeyboardType.Password,
                                            imeAction = ImeAction.Done,
                                        ),
                                        keyboardActions = KeyboardActions(onDone = { submitEmailForm() }),
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }

                                if (currentMode == AuthFlowMode.SIGN_UP && password.isNotEmpty()) {
                                    PasswordStrengthBar(score = passwordScore, language = language)
                                }

                                BsdcButton(
                                    label = when {
                                        authState.isBusy && bn -> "অপেক্ষা করুন…"
                                        authState.isBusy -> "Please wait…"
                                        currentMode == AuthFlowMode.SIGN_IN && bn -> "সাইন ইন করুন"
                                        currentMode == AuthFlowMode.SIGN_IN -> "Sign In with Email"
                                        currentMode == AuthFlowMode.SIGN_UP && bn -> "অ্যাকাউন্ট তৈরি করুন"
                                        currentMode == AuthFlowMode.SIGN_UP -> "Create BSDC Account"
                                        bn -> "রিসেট লিংক পাঠান"
                                        else -> "Send Password Reset Link"
                                    },
                                    busy = authState.isBusy,
                                    enabled = canSubmitEmail && !authState.isBusy,
                                    onClick = ::submitEmailForm,
                                    modifier = Modifier.fillMaxWidth(),
                                )

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    TextButton(
                                        onClick = {
                                            authRepository.clearMessages()
                                            mode = if (currentMode == AuthFlowMode.RESET_PASSWORD) {
                                                AuthFlowMode.SIGN_IN
                                            } else {
                                                AuthFlowMode.RESET_PASSWORD
                                            }
                                        },
                                    ) {
                                        Text(
                                            text = if (currentMode == AuthFlowMode.RESET_PASSWORD) {
                                                if (bn) "সাইন ইনে ফিরুন" else "Back to Sign In"
                                            } else {
                                                if (bn) "পাসওয়ার্ড ভুলে গেছেন?" else "Forgot password?"
                                            },
                                        )
                                    }
                                    if (onContinueAsGuest != null) {
                                        TextButton(onClick = onContinueAsGuest) {
                                            Text(
                                                if (bn) "ভিজিটর হিসেবে দেখুন" else "Browse verification",
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    HorizontalDivider(modifier = Modifier.weight(1f))
                    Text(
                        text = if (bn) "অথবা চালিয়ে যান" else "Or continue with",
                        style = MaterialTheme.typography.labelLarge,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                    HorizontalDivider(modifier = Modifier.weight(1f))
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    BsdcButton(
                        label = "Google",
                        secondary = true,
                        busy = authState.isBusy,
                        enabled = !authState.isBusy && activity != null,
                        onClick = {
                            if (activity != null) {
                                scope.launch { authRepository.signInWithGoogle(activity, language) }
                            }
                        },
                        modifier = Modifier.weight(1f),
                    )
                    BsdcButton(
                        label = "GitHub",
                        leadingIcon = Icons.Rounded.Code,
                        secondary = true,
                        busy = authState.isBusy,
                        enabled = !authState.isBusy && activity != null,
                        onClick = {
                            if (activity != null) {
                                scope.launch { authRepository.signInWithGitHub(activity, language) }
                            }
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun PasswordStrengthBar(
    score: Int,
    language: AppLanguage,
) {
    val bn = language == AppLanguage.BN
    val activeColor by animateColorAsState(
        targetValue = when {
            score <= 1 -> BsdcThemeTokens.colors.danger
            score == 2 -> BsdcThemeTokens.colors.warn
            else -> BsdcThemeTokens.colors.brandStrong
        },
        label = "password_strength_color",
    )
    val label = when {
        bn && score <= 1 -> "দুর্বল পাসওয়ার্ড"
        bn && score == 2 -> "মাঝারি পাসওয়ার্ড"
        bn && score == 3 -> "ভালো পাসওয়ার্ড"
        bn -> "শক্তিশালী পাসওয়ার্ড"
        score <= 1 -> "Weak password"
        score == 2 -> "Fair password"
        score == 3 -> "Good password"
        else -> "Strong password"
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            for (segment in 1..4) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(5.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(
                            if (score >= segment) activeColor else BsdcThemeTokens.colors.border,
                        ),
                )
            }
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = activeColor,
        )
    }
}

@Composable
fun ProfileSyncRecoveryScreen(
    authState: AuthStateSnapshot,
    authRepository: AuthRepository,
    language: AppLanguage,
    onContinueAsGuest: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()

    BsdcResponsiveContainer(
        maxWidth = 520.dp,
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            BsdcAnimatedEntrance {
                BsdcCard(elevated = true) {
                    Icon(
                        imageVector = Icons.Rounded.SyncProblem,
                        contentDescription = null,
                        tint = BsdcThemeTokens.colors.warn,
                        modifier = Modifier.size(48.dp),
                    )
                    Text(
                        text = if (bn) {
                            "আপনার প্রোফাইল এখনো সিঙ্ক হয়নি"
                        } else {
                            "Could not sync your profile"
                        },
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    Text(
                        text = if (bn) {
                            "আপনার সাইন-ইন সম্পন্ন হয়েছে, কিন্তু বিদ্যমান বিএসডিসি প্রোফাইল পড়তে সাময়িক সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।"
                        } else {
                            "You are signed in, but loading your existing BSDC profile hit a temporary network error. Retry instead of resetting your profile."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                    authState.errorMessage?.takeIf { it.isNotBlank() }?.let { err ->
                        BsdcStatusBanner(
                            title = if (bn) "সংযোগ বিবরণ" else "Details",
                            body = err,
                            tone = BsdcTone.WARN,
                        )
                    }
                    BsdcButton(
                        label = if (bn) "প্রোফাইল পুনরায় সিঙ্ক করুন" else "Retry profile sync",
                        leadingIcon = Icons.Rounded.Refresh,
                        busy = authState.isBusy,
                        enabled = !authState.isBusy,
                        onClick = { scope.launch { authRepository.refreshSessionAndProfile() } },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    BsdcButton(
                        label = if (bn) "ভিজিটর হিসেবে দেখুন" else "Continue browsing",
                        secondary = true,
                        onClick = onContinueAsGuest,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    TextButton(
                        onClick = { scope.launch { authRepository.atomicSignOut() } },
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    ) {
                        Text(if (bn) "সাইন আউট ও অ্যাকাউন্ট পরিবর্তন" else "Sign out & switch account")
                    }
                }
            }
        }
    }
}

@Composable
fun VerifyEmailGateScreen(
    email: String,
    authState: AuthStateSnapshot,
    authRepository: AuthRepository,
    language: AppLanguage,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()

    BsdcResponsiveContainer(
        maxWidth = 520.dp,
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            BsdcAnimatedEntrance {
                BsdcCard(elevated = true) {
                    Icon(
                        imageVector = Icons.Rounded.MarkEmailRead,
                        contentDescription = null,
                        tint = BsdcThemeTokens.colors.brandStrong,
                        modifier = Modifier.size(48.dp),
                    )
                    Text(
                        text = if (bn) "আপনার ইমেইল যাচাই করুন" else "Verify your email address",
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    Text(
                        text = if (bn) {
                            "আমরা $email ঠিকানায় একটি যাচাইকরণ লিংক পাঠিয়েছি। ইনবক্স বা স্প্যাম ফোল্ডার থেকে লিংকে ক্লিক করে নিচের বাটনে চাপুন।"
                        } else {
                            "We sent a verification link to $email. Open it from your inbox (or spam folder), then tap below to enter BSDC."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = BsdcThemeTokens.colors.mutedText,
                    )

                    authState.infoMessage?.let {
                        BsdcStatusBanner(
                            title = if (bn) "তথ্য" else "Update",
                            body = it,
                            tone = BsdcTone.INFO,
                        )
                    }
                    authState.errorMessage?.let {
                        BsdcStatusBanner(
                            title = if (bn) "সমস্যা" else "Error",
                            body = it,
                            tone = BsdcTone.BAD,
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))
                    BsdcButton(
                        label = if (bn) "আমি যাচাই করেছি — চালিয়ে যান" else "I've verified my email",
                        busy = authState.isBusy,
                        enabled = !authState.isBusy,
                        onClick = { scope.launch { authRepository.reloadVerificationStatus(language) } },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    BsdcButton(
                        label = if (bn) "লিংক পুনরায় পাঠান" else "Resend verification email",
                        secondary = true,
                        enabled = !authState.isBusy,
                        onClick = { scope.launch { authRepository.resendEmailVerification(language) } },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    TextButton(
                        onClick = { scope.launch { authRepository.atomicSignOut() } },
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    ) {
                        Text(if (bn) "অন্য অ্যাকাউন্ট ব্যবহার করুন" else "Sign out & switch account")
                    }
                }
            }
        }
    }
}
