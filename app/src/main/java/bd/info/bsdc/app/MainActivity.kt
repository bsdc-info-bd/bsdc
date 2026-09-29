package bd.info.bsdc.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import bd.info.bsdc.app.auth.AuthState
import bd.info.bsdc.app.ui.AppViewModel
import bd.info.bsdc.app.ui.AuthViewModel
import bd.info.bsdc.app.ui.BsdcViewModelFactory
import bd.info.bsdc.app.ui.ChatRoomViewModel
import bd.info.bsdc.app.ui.ComposerViewModel
import bd.info.bsdc.app.ui.FeedViewModel
import bd.info.bsdc.app.ui.InboxViewModel
import bd.info.bsdc.app.ui.NotificationsViewModel
import bd.info.bsdc.app.ui.ProfileViewModel
import bd.info.bsdc.app.ui.screens.AuthScreen
import bd.info.bsdc.app.ui.screens.ChatRoomScreen
import bd.info.bsdc.app.ui.screens.ComposerScreen
import bd.info.bsdc.app.ui.screens.FeedScreen
import bd.info.bsdc.app.ui.screens.InboxScreen
import bd.info.bsdc.app.ui.screens.NotificationsScreen
import bd.info.bsdc.app.ui.screens.ProfileScreen
import bd.info.bsdc.app.ui.theme.BsdcTheme
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

class MainActivity : ComponentActivity() {
    private val applicationContainer get() = (application as BsdcApplication).container
    private var targetPath by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        targetPath = intent.targetPath()
        setContent { BsdcApp(applicationContainer, targetPath) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        targetPath = intent.targetPath()
    }

    private fun Intent.targetPath(): String? = getStringExtra(EXTRA_TARGET_PATH)
        ?: data?.takeIf { it.host in setOf("www.bsdc.info.bd", "bsdc.info.bd") }?.path

    companion object {
        const val EXTRA_TARGET_PATH = "bsdc_target_path"
    }
}

@Composable
private fun BsdcApp(container: bd.info.bsdc.app.core.AppContainer, targetPath: String?) {
    val app: AppViewModel = viewModel(factory = BsdcViewModelFactory { AppViewModel(container) })
    val auth by app.auth.collectAsStateWithLifecycle()
    val preferences by app.preferences.collectAsStateWithLifecycle()
    BsdcTheme(preferences.theme) {
        when (val session = auth) {
            AuthState.Loading -> LoadingScreen()
            AuthState.ConfigurationRequired -> ConfigurationScreen()
            AuthState.SignedOut -> {
                val vm: AuthViewModel = viewModel(factory = BsdcViewModelFactory { AuthViewModel(container.auth) })
                AuthScreen(vm)
            }
            is AuthState.SignedIn -> CommunityShell(container, session.user.uid, targetPath, app::signOut)
        }
    }
}

@Composable
private fun LoadingScreen() = Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
    CircularProgressIndicator()
}

@Composable
private fun ConfigurationScreen() = Column(
    Modifier.fillMaxSize().padding(28.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally
) {
    Text("BSDC needs secure Firebase configuration", style = MaterialTheme.typography.headlineSmall)
    Text(
        "This build is intentionally unsigned and unconfigured. Add google-services.json from protected deployment settings, then rebuild.",
        modifier = Modifier.padding(top = 10.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
private fun CommunityShell(
    container: bd.info.bsdc.app.core.AppContainer,
    userId: String,
    targetPath: String?,
    onSignOut: () -> Unit
) {
    val nav = rememberNavController()
    val context = LocalContext.current
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(userId) {
        if (android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()?.let { container.notifications.registerDevice(it) }
    }
    LaunchedEffect(targetPath) {
        when {
            targetPath?.startsWith("/messages") == true -> nav.navigate("inbox")
            targetPath?.startsWith("/notifications") == true -> nav.navigate("alerts")
            targetPath?.startsWith("/profile") == true -> nav.navigate("profile")
        }
    }
    Scaffold(bottomBar = { CommunityNavigation(nav.currentDestination?.route ?: "feed") { route ->
        nav.navigate(route) {
            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    } }) { padding ->
        NavHost(navController = nav, startDestination = "feed", modifier = Modifier.padding(padding)) {
            composable("feed") {
                val vm: FeedViewModel = viewModel(factory = BsdcViewModelFactory { FeedViewModel(container) })
                FeedScreen(vm) { nav.navigate("compose") }
            }
            composable("compose") {
                val vm: ComposerViewModel = viewModel(factory = BsdcViewModelFactory { ComposerViewModel(container) })
                ComposerScreen(vm, onPublished = { nav.navigate("feed") { popUpTo("feed") { inclusive = false } } }, onBack = { nav.popBackStack() })
            }
            composable("inbox") {
                val vm: InboxViewModel = viewModel(factory = BsdcViewModelFactory { InboxViewModel(container) })
                InboxScreen(vm) { id -> nav.navigate("chat/${Uri.encode(id)}") }
            }
            composable("alerts") {
                val vm: NotificationsViewModel = viewModel(factory = BsdcViewModelFactory { NotificationsViewModel(container) })
                NotificationsScreen(vm)
            }
            composable("profile") {
                val vm: ProfileViewModel = viewModel(factory = BsdcViewModelFactory { ProfileViewModel(container, userId) })
                ProfileScreen(vm, onSignOut)
            }
            composable("chat/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
                val id = entry.arguments?.getString("id").orEmpty()
                val vm: ChatRoomViewModel = viewModel(key = "chat-$id", factory = BsdcViewModelFactory { ChatRoomViewModel(container, id) })
                ChatRoomScreen(vm) { nav.popBackStack() }
            }
        }
    }
}

@Composable
private fun CommunityNavigation(selectedRoute: String, navigate: (String) -> Unit) {
    NavigationBar {
        listOf(
            Triple("feed", "Feed", Icons.Outlined.Home),
            Triple("compose", "Create", Icons.Outlined.AddCircleOutline),
            Triple("inbox", "Inbox", Icons.Outlined.ChatBubbleOutline),
            Triple("alerts", "Alerts", Icons.Outlined.NotificationsNone),
            Triple("profile", "Profile", Icons.Outlined.PersonOutline)
        ).forEach { (route, label, icon) ->
            NavigationBarItem(selected = selectedRoute == route, onClick = { navigate(route) }, icon = { Icon(icon, label) }, label = { Text(label) })
        }
    }
}
