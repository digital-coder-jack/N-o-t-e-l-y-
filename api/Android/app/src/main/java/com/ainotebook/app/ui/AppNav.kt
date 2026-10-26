package com.ainotebook.app.ui

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.zIndex
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import android.content.Context
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.ainotebook.app.data.Repository
import com.ainotebook.app.ui.components.OfflineBanner
import com.ainotebook.app.ui.components.SpaceBackground
import com.ainotebook.app.ui.components.rememberHaptics
import com.ainotebook.app.ui.screens.ChatScreen
import com.ainotebook.app.ui.components.FloatingAssistantWidget
import com.ainotebook.app.ui.screens.DashboardScreen
import com.ainotebook.app.ui.screens.NotesScreen
import com.ainotebook.app.ui.screens.LoginScreen
import com.ainotebook.app.ui.screens.ProfileScreen
import com.ainotebook.app.ui.screens.SignupScreen
import com.ainotebook.app.ui.screens.ToolsScreen
import com.ainotebook.app.ui.theme.Indigo
import com.ainotebook.app.ui.theme.MutedText

object Routes {
    const val LOGIN = "login"
    const val SIGNUP = "signup"
    const val DASHBOARD = "dashboard"
    const val TOOLS = "tools"
    const val NOTES = "notes"
    const val PROFILE = "profile"
}

private data class NavItem(val route: String, val label: String, val icon: ImageVector)

private val BOTTOM_ITEMS = listOf(
    NavItem(Routes.DASHBOARD, "Home", Icons.Default.Dashboard),
    NavItem(Routes.NOTES, "Write", Icons.Default.AutoStories),
    NavItem(Routes.TOOLS, "Practice", Icons.Default.AutoStories),
    NavItem(Routes.PROFILE, "More", Icons.Default.Person),
)

@Composable
fun AppRoot(repo: Repository) {
    val factory = remember(repo) { VMFactory(repo) }
    // Distinguish a session that has not loaded yet from a genuinely logged-out user.
    val token by repo.tokenFlow.collectAsState(initial = "__NOTELY_SESSION_LOADING__")
    val sessionLoading = token == "__NOTELY_SESSION_LOADING__"
    val isAuthed = !sessionLoading && !token.isNullOrBlank()
    NativeLaunchFlow(factory = factory, isAuthed = isAuthed, sessionLoading = sessionLoading) {
        MainShell(factory)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AuthFlow(factory: VMFactory, startRoute: String, onBackToLanding: () -> Unit) {
    val nav = rememberNavController()
    val authVm: AuthViewModel = viewModel(factory = factory)
    androidx.activity.compose.BackHandler(enabled = nav.previousBackStackEntry == null) { onBackToLanding() }

    ModalBottomSheet(onDismissRequest = onBackToLanding, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = MaterialTheme.colorScheme.surface) {
    NavHost(
        modifier = Modifier.fillMaxHeight(0.9f),
        navController = nav,
        startDestination = startRoute,
        enterTransition = { slideInHorizontally(tween(300)) { it / 2 } + fadeIn(tween(300)) },
        exitTransition = { fadeOut(tween(200)) },
        popEnterTransition = { fadeIn(tween(300)) },
        popExitTransition = { slideOutHorizontally(tween(300)) { it / 2 } + fadeOut(tween(200)) }
    ) {
        composable(Routes.LOGIN) {
            LoginScreen(
                vm = authVm,
                onLoggedIn = { /* token flow triggers the shuttered workspace transition */ },
                onGoSignup = { nav.navigate(Routes.SIGNUP) }
            )
        }
        composable(Routes.SIGNUP) {
            SignupScreen(
                vm = authVm,
                onSignedUp = { /* token flow triggers the shuttered workspace transition */ },
                onGoLogin = { nav.popBackStack() }
            )
        }
    }
    }
}

@Composable
private fun MainShell(factory: VMFactory) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val haptic = rememberHaptics()
    val appContext = LocalContext.current.applicationContext
    val widgetPrefs = remember(appContext) { appContext.getSharedPreferences("notely_assistant_widget", Context.MODE_PRIVATE) }
    var assistantMode by rememberSaveable { mutableStateOf(widgetPrefs.getInt("mode", 0).coerceIn(0, 2)) }
    var trialDetailsOpen by rememberSaveable { mutableStateOf(false) }
    var trialReminderDismissed by rememberSaveable { mutableStateOf(false) }
    var trialEndedDismissed by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(userState.user?.trial_expired) { if (userState.user?.trial_expired == true) { assistantMode = 0; trialEndedDismissed = false } }
    LaunchedEffect(assistantMode) { widgetPrefs.edit().putInt("mode", assistantMode).apply() }
    androidx.activity.compose.BackHandler(enabled = assistantMode > 0) {
        assistantMode = if (assistantMode == 2) 1 else 0
    }

    val dashboardVm: DashboardViewModel = viewModel(factory = factory)
    val chatVm: ChatViewModel = viewModel(factory = factory)
    val toolsVm: ToolsViewModel = viewModel(factory = factory)
    val notesVm: NotesViewModel = viewModel(factory = factory)
    val profileVm: ProfileViewModel = viewModel(factory = factory)

    val userState by profileVm.state.collectAsState()
    val networkMonitor = LocalNetworkMonitor.current
    val isOnline by networkMonitor.isOnline.collectAsState(initial = networkMonitor.currentlyOnline())

    SpaceBackground {
      Box(Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = androidx.compose.ui.graphics.Color.Transparent,
            bottomBar = {
                NavigationBar(
                    modifier = Modifier.clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)),
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
                    tonalElevation = 6.dp
                ) {
                    BOTTOM_ITEMS.forEach { item ->
                        val selected = current?.startsWith(item.route) == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                if (!selected) {
                                    haptic()
                                    nav.navigate(item.route) {
                                        popUpTo(Routes.DASHBOARD) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            },
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = {
                                Text(
                                    item.label,
                                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                unselectedIconColor = MutedText,
                                unselectedTextColor = MutedText,
                                indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)
                            )
                        )
                    }
                }
            }
        ) { padding ->
            Column(Modifier.padding(padding)) {
                OfflineBanner(isOnline = isOnline)
                NavHost(
                    navController = nav,
                    startDestination = Routes.DASHBOARD,
                    enterTransition = { fadeIn(tween(220)) + slideInHorizontally(tween(260)) { it / 6 } },
                    exitTransition = { fadeOut(tween(160)) },
                    popEnterTransition = { fadeIn(tween(220)) },
                    popExitTransition = { fadeOut(tween(160)) }
                ) {
                    composable(Routes.DASHBOARD) {
                        DashboardScreen(
                            vm = dashboardVm,
                            userName = userState.user?.name ?: "",
                            onOpenChat = { id -> chatVm.openChat(id); assistantMode = 1 },
                            onNewChat = { chatVm.startNewChat(); assistantMode = 1 },
                            onOpenTools = {
                                nav.navigate(Routes.TOOLS) {
                                    popUpTo(Routes.DASHBOARD) { saveState = true }
                                    launchSingleTop = true
                                }
                            }
                        )
                    }
                    composable(Routes.TOOLS) {
                        ToolsScreen(vm = toolsVm)
                    }
                    composable(Routes.NOTES) {
                        NotesScreen(vm = notesVm, onOpenTools = { nav.navigate(Routes.TOOLS) { launchSingleTop = true } })
                    }
                    composable(Routes.PROFILE) {
                        ProfileScreen(
                            vm = profileVm,
                            onLoggedOut = { /* token flow flips AppRoot to AuthFlow */ }
                        )
                    }
                }
            }
        }
        FloatingAssistantWidget(
            mode = assistantMode,
            onModeChange = { assistantMode = it },
            vm = chatVm,
            context = when {
                current?.startsWith(Routes.NOTES) == true -> "Write · Notes"
                current?.startsWith(Routes.TOOLS) == true -> "Practice · Study tools"
                current?.startsWith(Routes.PROFILE) == true -> "Plan · Account"
                else -> "Home"
            },
            onOpen = { haptic(); assistantMode = 1 }
        )

        val trialUser = userState.user
        if (trialUser != null && trialUser.is_trial) {
            Box(Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 8.dp, end = 12.dp).zIndex(1100f)) {
                Column(horizontalAlignment = Alignment.End) {
                    Surface(
                        modifier = Modifier.clickable { trialDetailsOpen = !trialDetailsOpen },
                        shape = RoundedCornerShape(999.dp),
                        color = MaterialTheme.colorScheme.surface,
                        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        val daysLeft = trialUser.trial_days_left ?: 0
                        Text(
                            if (trialUser.trial_expired) "Trial ended" else "Trial: " + daysLeft + if (daysLeft == 1) " day left" else " days left",
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                            color = MaterialTheme.colorScheme.onSurface,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    if (trialDetailsOpen) Surface(
                        modifier = Modifier.padding(top = 8.dp).widthIn(max = 290.dp),
                        shape = RoundedCornerShape(18.dp),
                        color = MaterialTheme.colorScheme.surface,
                        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        shadowElevation = 8.dp
                    ) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(if (trialUser.trial_expired) "Your trial has ended" else "Your seven-day trial", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                            Text(if (trialUser.trial_expired) "Your notes and materials remain safe in read-only mode." else "Everything is unlocked while your trial is active.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                            Text("Upgrade payments are not connected yet.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                            TextButton(onClick = { trialDetailsOpen = false }) { Text("Close") }
                        }
                    }
                }
            }
            val daysLeft = trialUser.trial_days_left ?: 0
            if (!trialUser.trial_expired && (daysLeft == 2 || daysLeft == 1) && !trialReminderDismissed) {
                Surface(Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 54.dp, start = 12.dp, end = 12.dp), shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 4.dp) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(if (daysLeft == 2) "Your trial ends in two days" else "Your trial ends today", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                            Text("Your saved work stays yours.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        }
                        TextButton(onClick = { trialReminderDismissed = true }) { Text("Dismiss") }
                    }
                }
            }
            if (trialUser.trial_expired && !trialEndedDismissed) {
                Box(Modifier.fillMaxSize().zIndex(20000f).background(MaterialTheme.colorScheme.background.copy(alpha = .97f)), contentAlignment = Alignment.Center) {
                    Surface(Modifier.padding(24.dp), shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 8.dp) {
                        Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Text("YOUR NEXT CHAPTER", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                            Text("Your trial has ended.", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                            Text("Your notes and materials are safe. You can still read your work; creating, editing and AI features are paused until you upgrade.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                            Button(onClick = { trialEndedDismissed = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(999.dp)) { Text("Continue to read-only workspace") }
                            OutlinedButton(onClick = { trialDetailsOpen = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(999.dp)) { Text("View upgrade options") }
                            if (trialDetailsOpen) Text("Payments are not connected yet. Your saved work remains available.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }

      }
    }
}
