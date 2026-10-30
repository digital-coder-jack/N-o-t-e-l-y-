package com.ainotebook.app.ui

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.zIndex
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
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
import androidx.compose.runtime.key
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
import com.ainotebook.app.data.SessionAccount
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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.weight
import com.ainotebook.app.ui.components.BrandLogo
import kotlinx.coroutines.launch


object Routes {
    const val LOGIN = "login"
    const val SIGNUP = "signup"
    const val DASHBOARD = "dashboard"
    const val TOOLS = "tools"
    const val NOTES = "notes"
    const val PROFILE = "profile"
    const val LIBRARY = "library"
    const val SCHEDULE = "schedule"
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
        key(token) { MainShell(factory) }
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(factory: VMFactory) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val haptic = rememberHaptics()
    val appContext = LocalContext.current.applicationContext
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var assistantMode by remember { mutableStateOf(0) }
    var activeWorkspaceTab by rememberSaveable { mutableStateOf("chat") }
    var profileMenuOpen by remember { mutableStateOf(false) }
    var helpOpen by remember { mutableStateOf(false) }
    var accountList by remember { mutableStateOf(emptyList<SessionAccount>()) }
    var trialReminderDismissed by rememberSaveable { mutableStateOf(false) }
    var trialEndedDismissed by rememberSaveable { mutableStateOf(false) }

    androidx.activity.compose.BackHandler(enabled = assistantMode > 0) {
        assistantMode = if (assistantMode == 2) 1 else 0
    }

    val dashboardVm: DashboardViewModel = viewModel(factory = factory)
    val chatVm: ChatViewModel = viewModel(factory = factory)
    val toolsVm: ToolsViewModel = viewModel(factory = factory)
    val notesVm: NotesViewModel = viewModel(factory = factory)
    val profileVm: ProfileViewModel = viewModel(factory = factory)
    val userState by profileVm.state.collectAsState()
    val chatState by chatVm.state.collectAsState()
    val dashboardState by dashboardVm.state.collectAsState()
    val homeActivityPrefs = remember(appContext, userState.user?.id) {
        appContext.getSharedPreferences("notely_home_activity_${userState.user?.id ?: 0}", Context.MODE_PRIVATE)
    }

    LaunchedEffect(Unit) {
        chatVm.loadChats()
        accountList = factory.repository.accounts()
    }
    LaunchedEffect(chatState.currentChatId, userState.user?.id) {
        chatState.currentChatId?.let { id -> homeActivityPrefs.edit().putLong("chat:$id", System.currentTimeMillis()).apply() }
    }
    LaunchedEffect(userState.user?.trial_expired) {
        if (userState.user?.trial_expired == true) {
            assistantMode = 0
            trialEndedDismissed = false
        }
    }

    val networkMonitor = LocalNetworkMonitor.current
    val isOnline by networkMonitor.isOnline.collectAsState(initial = networkMonitor.currentlyOnline())
    val isHome = current == Routes.DASHBOARD && activeWorkspaceTab == "chat"
    val title = when {
        isHome -> "Home"
        current == Routes.LIBRARY -> "Library"
        current == Routes.SCHEDULE -> "Schedule"
        current == Routes.NOTES -> "Notes"
        current == Routes.PROFILE -> "Settings"
        current?.startsWith(Routes.TOOLS) == true -> "Study tools"
        else -> "Workspace"
    }

    fun navigate(route: String) {
        if (route != Routes.DASHBOARD) assistantMode = 0
        scope.launch { drawerState.close() }
        if (current != route) {
            nav.navigate(route) {
                popUpTo(Routes.DASHBOARD) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = true,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.widthIn(min = 270.dp, max = 310.dp),
                drawerContainerColor = MaterialTheme.colorScheme.surface
            ) {
                Column(
                    Modifier.fillMaxHeight().padding(horizontal = 14.dp, vertical = 18.dp)
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        BrandLogo(size = 34.dp)
                        Spacer(Modifier.width(10.dp))
                        Text("Notely", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(16.dp))
                    Button(
                        onClick = {
                            haptic()
                            navigate(Routes.DASHBOARD)
                            activeWorkspaceTab = "chat"
                            chatVm.startNewChat()
                            assistantMode = 2
                            scope.launch { drawerState.close() }
                        },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                        shape = RoundedCornerShape(15.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 13.dp)
                    ) { Text("＋  New chat", fontWeight = FontWeight.Bold) }
                    Text(
                        "NAVIGATION",
                        modifier = Modifier.padding(start = 12.dp, top = 22.dp, bottom = 8.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Bold
                    )
                    val navItems = listOf(
                        Triple("Library", Routes.LIBRARY, Icons.Default.AutoStories),
                        Triple("Schedule", Routes.SCHEDULE, Icons.Default.Dashboard)
                    )
                    navItems.forEach { item ->
                        NavigationDrawerItem(
                            label = { Text(item.first) },
                            selected = when (item.second) {
                                Routes.TOOLS -> current?.startsWith(Routes.TOOLS) == true
                                else -> current == item.second
                            },
                            onClick = { haptic(); navigate(item.second) },
                            icon = { Icon(item.third, contentDescription = null) },
                            modifier = Modifier.padding(vertical = 2.dp)
                        )
                    }
                    Text(
                        "RECENT",
                        modifier = Modifier.padding(start = 12.dp, top = 18.dp, bottom = 8.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Bold
                    )
                    chatState.chats.forEach { chat ->
                        Text(
                            chat.title.ifBlank { "New chat" },
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                                .clickable {
                                    chatVm.openChat(chat.id)
                                    assistantMode = 2
                                    scope.launch { drawerState.close() }
                                }
                                .padding(horizontal = 12.dp, vertical = 9.dp),
                            maxLines = 1,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f)
                    ) {
                        Row(
                            Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)) {
                                Text(
                                    (userState.user?.name ?: "N").take(1).uppercase(),
                                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 9.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                                Text(userState.user?.name?.ifBlank { "Student" } ?: "Student", fontWeight = FontWeight.SemiBold, maxLines = 1)
                                if (userState.user?.is_trial == true) {
                                    Text("Trial", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            Box {
                                IconButton(onClick = { profileMenuOpen = true }) {
                                    Icon(Icons.Default.MoreVert, contentDescription = "Account menu")
                                }
                                DropdownMenu(expanded = profileMenuOpen, onDismissRequest = { profileMenuOpen = false }) {
                                    DropdownMenuItem(text = { Text(userState.user?.name?.ifBlank { "Your account" } ?: "Your account", fontWeight = FontWeight.Bold) }, onClick = { profileMenuOpen = false }, enabled = false)
                                    accountList.forEach { account ->
                                        DropdownMenuItem(
                                            text = { Row(verticalAlignment = Alignment.CenterVertically) { Text(account.name.ifBlank { account.email.ifBlank { "Account" } }, modifier = Modifier.weight(1f)); if (account.isCurrent) Text("✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) } },
                                            onClick = {
                                                profileMenuOpen = false
                                                if (!account.isCurrent) scope.launch { factory.repository.switchAccount(account.id) }
                                            }
                                        )
                                    }
                                    DropdownMenuItem(
                                        text = { Text("Settings") },
                                        onClick = { profileMenuOpen = false; navigate(Routes.PROFILE) },
                                        leadingIcon = { Icon(Icons.Default.Settings, null) }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Help") },
                                        onClick = { profileMenuOpen = false; helpOpen = true },
                                        leadingIcon = { Icon(Icons.Default.HelpOutline, null) }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Add account") },
                                        onClick = {
                                            profileMenuOpen = false
                                            scope.launch { factory.repository.beginAddAccount() }
                                        },
                                        leadingIcon = { Icon(Icons.Default.Add, null) }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Logout") },
                                        onClick = { profileMenuOpen = false; scope.launch { factory.repository.logout() } },
                                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, null) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    ) {
        Scaffold(
            containerColor = androidx.compose.ui.graphics.Color.Transparent,
            topBar = {
                Row(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface.copy(alpha = 0.92f))
                        .statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { scope.launch { drawerState.open() } }) {
                        Icon(Icons.Default.Menu, contentDescription = "Open workspace menu")
                    }
                    Surface(
                        modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
                        shape = RoundedCornerShape(999.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        Row(Modifier.padding(3.dp), verticalAlignment = Alignment.CenterVertically) {
                            listOf("chat" to "Chat", "workspace" to "Workspace").forEach { option ->
                                val selected = activeWorkspaceTab == option.first
                                Surface(
                                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(999.dp))
                                        .clickable { if (option.first == "chat") { activeWorkspaceTab = "chat"; navigate(Routes.DASHBOARD); assistantMode = 0 } else { activeWorkspaceTab = "workspace"; if (current != Routes.DASHBOARD) navigate(Routes.DASHBOARD) } },
                                    shape = RoundedCornerShape(999.dp),
                                    color = if (selected) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Transparent
                                ) {
                                    Text(option.second, modifier = Modifier.padding(horizontal = 8.dp, vertical = 9.dp),
                                        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                        style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold,
                                        textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                                }
                            }
                        }
                    }
                    Button(
                        onClick = { haptic(); navigate(Routes.DASHBOARD); activeWorkspaceTab = "chat"; chatVm.startNewChat(); assistantMode = 2 },
                        shape = RoundedCornerShape(999.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 9.dp)
                    ) { Text("＋ New") }
                }
            }
        ) { padding ->
            Column(Modifier.padding(padding)) {
                OfflineBanner(isOnline = isOnline)
                if (current == Routes.DASHBOARD && activeWorkspaceTab == "workspace") {
                    AndroidWorkspaceCards { toolName ->
                        when (toolName) {
                            "notes" -> navigate(Routes.NOTES)
                            "documents" -> navigate(Routes.LIBRARY)
                            else -> {
                                val tool = runCatching { Tool.valueOf(toolName.uppercase()) }.getOrNull()
                                if (tool != null) nav.navigate("${Routes.TOOLS}/${tool.name.lowercase()}") { launchSingleTop = true }
                                else navigate(Routes.TOOLS)
                            }
                        }
                    }
                } else NavHost(
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
                            userId = userState.user?.id ?: 0,
                            onOpenChat = { id -> chatVm.openChat(id); assistantMode = 2 },
                            onNewChat = { chatVm.startNewChat(); assistantMode = 2 },
                            onSendPrompt = { prompt -> chatVm.startNewChat(); chatVm.send(prompt); assistantMode = 2 },
                            onOpenNote = { id ->
                                if (id == 0) notesVm.create() else notesVm.select(id)
                                nav.navigate(Routes.NOTES) { launchSingleTop = true }
                            },
                            onOpenTools = { toolName ->
                                val tool = runCatching { Tool.valueOf(toolName.uppercase()) }.getOrNull()
                                if (tool != null) nav.navigate("${Routes.TOOLS}/${tool.name.lowercase()}") { launchSingleTop = true }
                                else navigate(Routes.TOOLS)
                            }
                        )
                    }
                    composable(Routes.TOOLS) {
                        ToolsScreen(vm = toolsVm)
                    }
                    composable(
                        route = "${Routes.TOOLS}/{tool}",
                        arguments = listOf(navArgument("tool") { type = NavType.StringType })
                    ) { entry ->
                        val tool = runCatching {
                            Tool.valueOf(entry.arguments?.getString("tool")?.uppercase().orEmpty())
                        }.getOrNull()
                        ToolsScreen(vm = toolsVm, initialTool = tool)
                    }
                    composable(Routes.NOTES) {
                        NotesScreen(vm = notesVm, userId = userState.user?.id ?: 0, onOpenTools = { nav.navigate(Routes.TOOLS) { launchSingleTop = true } })
                    }
                    composable(Routes.PROFILE) {
                        ProfileScreen(vm = profileVm, onLoggedOut = { })
                    }
                    composable(Routes.LIBRARY) {
                        SimpleWorkspacePage("Library", "Your uploaded study materials will be organized here.")
                    }
                    composable(Routes.SCHEDULE) {
                        SimpleWorkspacePage("Schedule", "Create recurring study digests and research tasks here.")
                    }
                }
            }
        }
    }

    if (current != Routes.DASHBOARD || assistantMode > 0) {
        if (userState.user?.trial_expired != true) FloatingAssistantWidget(
            mode = assistantMode,
            onModeChange = { assistantMode = it },
            vm = chatVm,
            context = when {
                current?.startsWith(Routes.NOTES) == true -> "Write · Notes"
                current?.startsWith(Routes.TOOLS) == true -> "Practice · Study tools"
                current?.startsWith(Routes.PROFILE) == true -> "Settings"
                else -> "Home"
            },
            onOpen = { haptic(); assistantMode = 1 }
        )
    }

    val trialUser = userState.user
    if (trialUser != null && trialUser.is_trial) {
        val daysLeft = trialUser.trial_days_left ?: 0
        if (!trialUser.trial_expired && (daysLeft == 2 || daysLeft == 1) && !trialReminderDismissed) {
            Surface(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp).zIndex(1100f),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surface,
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 3.dp
            ) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(if (daysLeft == 2) "Your trial ends in two days" else "Your trial ends today", fontWeight = FontWeight.SemiBold)
                        Text("Your saved work stays yours.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                    TextButton(onClick = { trialReminderDismissed = true }) { Text("Dismiss") }
                }
            }
        }
        if (trialUser.trial_expired && !trialEndedDismissed) {
            Box(Modifier.fillMaxSize().zIndex(20000f).background(MaterialTheme.colorScheme.background.copy(alpha = .97f)), contentAlignment = Alignment.Center) {
                Surface(Modifier.padding(24.dp), shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface, border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 8.dp) {
                    Column(Modifier.padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("WORKSPACE ACCESS", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        Text("Your trial has ended.", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Text("Your notes and materials remain safe. You can still read your work; creating, editing and AI features are paused while the trial is inactive.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                        Button(onClick = { trialEndedDismissed = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(999.dp)) {
                            Text("Continue to read-only workspace")
                        }
                    }
                }
            }
        }
    }

    if (helpOpen) {
        AlertDialog(
            onDismissRequest = { helpOpen = false },
            title = { Text("Notely Help") },
            text = { Text("Choose a workspace item from the menu, or ask Notely Assistant whenever you need help with your studies.") },
            confirmButton = { TextButton(onClick = { helpOpen = false }) { Text("Close") } }
        )
    }
}


@Composable
private fun AndroidWorkspaceCards(onOpen: (String) -> Unit) {
    val tools = listOf(
        Triple("Notes", "notes", "Write and organize study notes"),
        Triple("Flashcards", "flashcards", "Practice active recall"),
        Triple("Quiz", "quiz", "Test your understanding"),
        Triple("Summarize", "summarize", "Turn material into clear summaries"),
        Triple("Study Roadmap", "plan", "Build a learning path"),
        Triple("Documents", "documents", "Open your study materials")
    )
    Column(Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 22.dp)) {
        Text("YOUR STUDY SPACE", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
        Text("Workspace", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Choose a tool to continue learning.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        Row(
            Modifier.fillMaxWidth().weight(1f).horizontalScroll(rememberScrollState()).padding(top = 22.dp, bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            tools.forEach { item ->
                Surface(
                    modifier = Modifier.width(260.dp).fillMaxHeight(.78f).clip(RoundedCornerShape(24.dp)).clickable { onOpen(item.second) },
                    shape = RoundedCornerShape(24.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    shadowElevation = 5.dp
                ) {
                    Column(Modifier.fillMaxSize().padding(22.dp), verticalArrangement = Arrangement.Bottom) {
                        Text("✦", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.headlineLarge)
                        Spacer(Modifier.weight(1f))
                        Text(item.first, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(item.third, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Spacer(Modifier.height(14.dp))
                        Text("Open tool →", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun SimpleWorkspacePage(title: String, description: String) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
    }
}
