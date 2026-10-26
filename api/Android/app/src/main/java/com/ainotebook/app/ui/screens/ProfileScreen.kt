package com.ainotebook.app.ui.screens

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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Brightness6
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ColorLens
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ainotebook.app.data.AccentTone
import com.ainotebook.app.data.ThemeMode
import com.ainotebook.app.ui.LocalAppPrefs
import com.ainotebook.app.ui.ProfileViewModel
import com.ainotebook.app.ui.components.ErrorBanner
import com.ainotebook.app.ui.components.GlassCard
import com.ainotebook.app.ui.components.rememberHaptics
import com.ainotebook.app.ui.theme.Cyan
import com.ainotebook.app.ui.theme.Indigo
import com.ainotebook.app.ui.theme.MutedText
import com.ainotebook.app.ui.theme.Violet
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    vm: ProfileViewModel,
    onLoggedOut: () -> Unit
) {
    val state by vm.state.collectAsState()
    val prefs = LocalAppPrefs.current
    val scope = rememberCoroutineScope()
    val haptic = rememberHaptics()

    val themeMode by prefs.themeMode.collectAsState(initial = ThemeMode.LIGHT)
    val dynamicColor by prefs.dynamicColor.collectAsState(initial = false)
    val haptics by prefs.hapticsEnabled.collectAsState(initial = true)
    val accent by prefs.accentTone.collectAsState(initial = AccentTone.INDIGO)

    var showThemeSheet by remember { mutableStateOf(false) }
    var showAccentSheet by remember { mutableStateOf(false) }
    var showNameDialog by remember { mutableStateOf(false) }
    var showPasswordDialog by remember { mutableStateOf(false) }

    LaunchedEffect(state.loggedOut) { if (state.loggedOut) onLoggedOut() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .padding(16.dp)
    ) {
        // Header / avatar
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier
                        .size(88.dp)
                        .clip(CircleShape)
                        .background(Brush.linearGradient(listOf(Indigo, Violet))),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        (state.user?.name?.firstOrNull() ?: 'U').uppercase(),
                        color = Color.White,
                        fontSize = 38.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    state.user?.name ?: "User",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    state.user?.email ?: "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(Modifier.height(18.dp))
        ErrorBanner(state.error)
        state.message?.let {
            Text(it, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(vertical = 6.dp))
        }

        // Account section
        SectionLabel("Account")
        SettingsGroup {
            SettingsRow(Icons.Default.Person, "Display name", state.user?.name ?: "—") { showNameDialog = true }
            Divider()
            SettingsRow(Icons.Default.Lock, "Change password", "••••••") { showPasswordDialog = true }
        }

        Spacer(Modifier.height(16.dp))

        // Appearance section
        SectionLabel("Appearance")
        SettingsGroup {
            SettingsRow(Icons.Default.Brightness6, "Theme", themeModeLabel(themeMode)) { showThemeSheet = true }
            Divider()
            SettingsRow(Icons.Default.ColorLens, "Accent color", accentLabel(accent)) { showAccentSheet = true }
            Divider()
            SettingsToggleRow(
                Icons.Default.ColorLens,
                "Dynamic color",
                "Use your wallpaper colors (Android 12+)",
                dynamicColor
            ) { enabled -> scope.launch { prefs.setDynamicColor(enabled) } }
            Divider()
            SettingsToggleRow(
                Icons.Default.Vibration,
                "Haptic feedback",
                "Subtle vibrations on key actions",
                haptics
            ) { enabled -> haptic(); scope.launch { prefs.setHaptics(enabled) } }
        }

        Spacer(Modifier.height(24.dp))
        OutlinedButton(
            onClick = { haptic(); vm.logout() },
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(16.dp)
        ) {
            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(8.dp))
            Text("Log out")
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "Notely · v1.2",
            style = MaterialTheme.typography.labelSmall,
            color = MutedText,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))
    }

    // Theme picker bottom sheet
    if (showThemeSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showThemeSheet = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                Text("Theme", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.height(12.dp))
                ThemeMode.values().forEach { mode ->
                    val selected = mode == themeMode
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (selected) Indigo.copy(alpha = 0.14f) else Color.Transparent)
                            .clickable { scope.launch { prefs.setThemeMode(mode) }; showThemeSheet = false }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(themeModeLabel(mode), Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)
                        if (selected) Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = Indigo)
                    }
                    Spacer(Modifier.height(6.dp))
                }
                Spacer(Modifier.height(20.dp))
            }
        }
    }

    if (showAccentSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showAccentSheet = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                Text("Accent color", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text("Personalize the workspace without changing your account.", color = MutedText, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
                AccentTone.values().forEach { tone ->
                    val selected = tone == accent
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (selected) accentColor(tone).copy(alpha = 0.15f) else Color.Transparent)
                            .clickable { scope.launch { prefs.setAccentTone(tone) }; showAccentSheet = false }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(Modifier.size(18.dp).clip(CircleShape).background(accentColor(tone)))
                        Spacer(Modifier.size(12.dp))
                        Text(accentLabel(tone), Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)
                        if (selected) Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = accentColor(tone))
                    }
                    Spacer(Modifier.height(6.dp))
                }
                Spacer(Modifier.height(20.dp))
            }
        }
    }

    // Edit name dialog
    if (showNameDialog) {
        var newName by remember { mutableStateOf(state.user?.name ?: "") }
        AlertDialog(
            onDismissRequest = { showNameDialog = false },
            title = { Text("Display name") },
            text = {
                OutlinedTextField(value = newName, onValueChange = { newName = it }, singleLine = true, modifier = Modifier.fillMaxWidth())
            },
            confirmButton = {
                TextButton(onClick = { vm.updateName(newName); showNameDialog = false }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { showNameDialog = false }) { Text("Cancel") } }
        )
    }

    // Change password dialog
    if (showPasswordDialog) {
        var current by remember { mutableStateOf("") }
        var new by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showPasswordDialog = false },
            title = { Text("Change password") },
            text = {
                Column {
                    OutlinedTextField(
                        value = current, onValueChange = { current = it },
                        label = { Text("Current password") }, singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = new, onValueChange = { new = it },
                        label = { Text("New password (min 6)") }, singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.changePassword(current, new); showPasswordDialog = false }) { Text("Update") }
            },
            dismissButton = { TextButton(onClick = { showPasswordDialog = false }) { Text("Cancel") } }
        )
    }
}

private fun themeModeLabel(mode: ThemeMode) = when (mode) {
    ThemeMode.SYSTEM -> "System default"
    ThemeMode.LIGHT -> "Light"
    ThemeMode.DARK -> "Dark"
}

private fun accentLabel(tone: AccentTone) = when (tone) {
    AccentTone.INDIGO -> "Indigo"
    AccentTone.CYAN -> "Cyan"
    AccentTone.VIOLET -> "Violet"
    AccentTone.SUNSET -> "Sunset"
}

private fun accentColor(tone: AccentTone) = when (tone) {
    AccentTone.INDIGO -> Indigo
    AccentTone.CYAN -> Cyan
    AccentTone.VIOLET -> Violet
    AccentTone.SUNSET -> Color(0xFFFF8A65)
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MutedText,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 4.dp, bottom = 8.dp)
    )
}

@Composable
private fun SettingsGroup(content: @Composable () -> Unit) {
    GlassCard(Modifier.fillMaxWidth()) { Column { content() } }
}

@Composable
private fun Divider() {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
    )
}

@Composable
private fun SettingsRow(icon: ImageVector, title: String, value: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = Indigo, modifier = Modifier.size(22.dp))
        Spacer(Modifier.size(14.dp))
        Text(title, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.bodyLarge)
        Text(value, color = MutedText, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
        Spacer(Modifier.size(4.dp))
        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MutedText, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun SettingsToggleRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    onToggle: (Boolean) -> Unit
) {
    Row(
        Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = Cyan, modifier = Modifier.size(22.dp))
        Spacer(Modifier.size(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, color = MutedText, style = MaterialTheme.typography.bodySmall)
        }
        Switch(checked = checked, onCheckedChange = onToggle)
    }
}
