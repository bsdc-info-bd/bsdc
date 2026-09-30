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
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
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
import androidx.navigation.compose.currentBackStackEntryAsState
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
import bd.info.bsdc.app.ui.PostDetailViewModel
import bd.info.bsdc.app.ui.ProfileViewModel
import bd.info.bsdc.app.ui.OrganizationViewModel
import bd.info.bsdc.app.ui.SeriesViewModel
import bd.info.bsdc.app.ui.screens.AuthScreen
import bd.info.bsdc.app.ui.screens.ChatRoomScreen
import bd.info.bsdc.app.ui.screens.ComposerScreen
import bd.info.bsdc.app.ui.screens.FeedScreen
import bd.info.bsdc.app.ui.screens.InboxScreen
import bd.info.bsdc.app.ui.screens.NotificationsScreen
import bd.info.bsdc.app.ui.screens.PostDetailScreen
import bd.info.bsdc.app.ui.screens.ProfileScreen
import bd.info.bsdc.app.ui.screens.OrganizationScreen
import bd.info.bsdc.app.ui.screens.SeriesScreen
import bd.info.bsdc.app.ui.screens.TechnologyStackScreen
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

    // Navigation targets come from trusted in-app notifications. This native client does not
    // register website App Links or depend on browser routes while the Android link domain is
    // intentionally undecided.
    private fun Intent.targetPath(): String? = getStringExtra(EXTRA_TARGET_PATH)

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
            targetPath?.startsWith("/posts/") == true -> targetPath.substringAfterLast('/').takeIf { it.isNotBlank() }?.let { nav.navigate("post/${Uri.encode(it)}") }
            targetPath?.startsWith("/profile") == true -> nav.navigate("profile")
        }
    }
    val backStackEntry by nav.currentBackStackEntryAsState()
    val selectedRoute = backStackEntry?.destination?.route ?: "feed"
    val navigateToRoot: (String) -> Unit = { route ->
        nav.navigate(route) {
            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
    // A rail prevents crowded five-item navigation on tablets/foldables and leaves a wider
    // content column for code posts, profiles and messages. Compact phones keep bottom tabs.
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val useNavigationRail = maxWidth >= 840.dp
        if (useNavigationRail) {
            Row(Modifier.fillMaxSize()) {
                CommunityNavigationRail(selectedRoute, navigateToRoot)
                CommunityDestinations(nav, container, userId, onSignOut, Modifier.weight(1f))
            }
        } else {
            Scaffold(bottomBar = { CommunityNavigation(selectedRoute, navigateToRoot) }) { padding ->
                CommunityDestinations(nav, container, userId, onSignOut, Modifier.padding(padding))
            }
        }
    }

}


@Composable
private fun CommunityDestinations(
    nav: androidx.navigation.NavHostController,
    container: bd.info.bsdc.app.core.AppContainer,
    userId: String,
    onSignOut: () -> Unit,
    modifier: Modifier
) {
    NavHost(navController = nav, startDestination = "feed", modifier = modifier) {
        composable("feed") {
            val vm: FeedViewModel = viewModel(factory = BsdcViewModelFactory { FeedViewModel(container) })
            FeedScreen(
                viewModel = vm,
                onCompose = { nav.navigate("compose") },
                onOpenProfile = { memberId ->
                    nav.navigate(if (memberId == userId) "profile" else "member/${Uri.encode(memberId)}")
                },
                onOpenPost = { postId -> nav.navigate("post/${Uri.encode(postId)}") },
                onOpenSeries = { seriesId -> nav.navigate("series/${Uri.encode(seriesId)}") },
                onOpenOrganization = { organizationId -> nav.navigate("organization/${Uri.encode(organizationId)}") }
            )
        }
        composable("compose") {
            val vm: ComposerViewModel = viewModel(factory = BsdcViewModelFactory { ComposerViewModel(container) })
            ComposerScreen(
                vm,
                onPublished = { nav.navigate("feed") { popUpTo("feed") { inclusive = false } } },
                onBack = { nav.popBackStack() },
                onOpenOrganization = { id -> nav.navigate("organization/${Uri.encode(id)}") }
            )
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
            ProfileScreen(
                viewModel = vm,
                onSignOut = onSignOut,
                onOpenProfile = { memberId -> nav.navigate(if (memberId == userId) "profile" else "member/${Uri.encode(memberId)}") },
                onOpenConversation = { conversationId -> nav.navigate("chat/${Uri.encode(conversationId)}") },
                onOpenPost = { postId -> nav.navigate("post/${Uri.encode(postId)}") },
                onManageStack = { nav.navigate("tech-stack") }
            )
        }
        composable("tech-stack") {
            val vm: ProfileViewModel = viewModel(key = "tech-stack-$userId", factory = BsdcViewModelFactory { ProfileViewModel(container, userId) })
            TechnologyStackScreen(vm) { nav.popBackStack() }
        }
        composable("member/{uid}", arguments = listOf(navArgument("uid") { type = NavType.StringType })) { entry ->
            val memberId = entry.arguments?.getString("uid").orEmpty()
            val vm: ProfileViewModel = viewModel(key = "member-$memberId", factory = BsdcViewModelFactory { ProfileViewModel(container, memberId) })
            ProfileScreen(
                viewModel = vm,
                onSignOut = onSignOut,
                onOpenProfile = { nextMemberId -> nav.navigate(if (nextMemberId == userId) "profile" else "member/${Uri.encode(nextMemberId)}") },
                onOpenConversation = { conversationId -> nav.navigate("chat/${Uri.encode(conversationId)}") },
                onOpenPost = { postId -> nav.navigate("post/${Uri.encode(postId)}") },
                onBack = { nav.popBackStack() }
            )
        }
        composable("series/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            val vm: SeriesViewModel = viewModel(key = "series-$id", factory = BsdcViewModelFactory { SeriesViewModel(container, id) })
            SeriesScreen(
                viewModel = vm,
                onBack = { nav.popBackStack() },
                onOpenPost = { postId -> nav.navigate("post/${Uri.encode(postId)}") },
                onOpenProfile = { memberId -> nav.navigate(if (memberId == userId) "profile" else "member/${Uri.encode(memberId)}") }
            )
        }
        composable("organization/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            val vm: OrganizationViewModel = viewModel(key = "organization-$id", factory = BsdcViewModelFactory { OrganizationViewModel(container, id) })
            OrganizationScreen(
                viewModel = vm,
                onBack = { nav.popBackStack() },
                onOpenPost = { postId -> nav.navigate("post/${Uri.encode(postId)}") },
                onOpenProfile = { memberId -> nav.navigate(if (memberId == userId) "profile" else "member/${Uri.encode(memberId)}") }
            )
        }
        composable("post/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            val postId = entry.arguments?.getString("id").orEmpty()
            val vm: PostDetailViewModel = viewModel(key = "post-$postId", factory = BsdcViewModelFactory { PostDetailViewModel(container, postId) })
            PostDetailScreen(
                viewModel = vm,
                onBack = { nav.popBackStack() },
                onOpenProfile = { memberId -> nav.navigate(if (memberId == userId) "profile" else "member/${Uri.encode(memberId)}") }
            )
        }
        composable("chat/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            val vm: ChatRoomViewModel = viewModel(key = "chat-$id", factory = BsdcViewModelFactory { ChatRoomViewModel(container, id) })
            ChatRoomScreen(vm) { nav.popBackStack() }
        }
    }
}

private data class CommunityDestination(
    val route: String,
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector
)

private fun communityDestinations() = listOf(
    CommunityDestination("feed", "Feed", Icons.Outlined.Home),
    CommunityDestination("compose", "Create", Icons.Outlined.AddCircleOutline),
    CommunityDestination("inbox", "Inbox", Icons.Outlined.ChatBubbleOutline),
    CommunityDestination("alerts", "Alerts", Icons.Outlined.NotificationsNone),
    CommunityDestination("profile", "Profile", Icons.Outlined.PersonOutline)
)

@Composable
private fun CommunityNavigation(selectedRoute: String, navigate: (String) -> Unit) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        communityDestinations().forEach { item ->
            NavigationBarItem(
                selected = selectedRoute == item.route,
                onClick = { navigate(item.route) },
                icon = { Icon(item.icon, item.label) },
                label = { Text(item.label) },
                alwaysShowLabel = false
            )
        }
    }
}

@Composable
private fun CommunityNavigationRail(selectedRoute: String, navigate: (String) -> Unit) {
    NavigationRail(containerColor = MaterialTheme.colorScheme.surface) {
        communityDestinations().forEach { item ->
            NavigationRailItem(
                selected = selectedRoute == item.route,
                onClick = { navigate(item.route) },
                icon = { Icon(item.icon, item.label) },
                label = { Text(item.label) }
            )
        }
    }
}
