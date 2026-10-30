package com.ainotebook.app.ui.screens

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Quiz
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Summarize
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.ainotebook.app.data.Chat
import com.ainotebook.app.data.SavedNote
import com.ainotebook.app.ui.DashboardViewModel
import com.ainotebook.app.ui.components.BrandLogo
import java.time.Instant
import java.time.temporal.ChronoUnit

private data class RecentWork(
    val key: String,
    val title: String,
    val subtitle: String,
    val kind: String,
    val id: Int,
    val timestamp: Long
)

@Composable
fun DashboardScreen(
    vm: DashboardViewModel,
    userName: String,
    userId: Int,
    onOpenChat: (Int) -> Unit,
    onNewChat: () -> Unit,
    onSendPrompt: (String) -> Unit,
    onOpenNote: (Int) -> Unit,
    onOpenTools: (String) -> Unit
) {
    val state by vm.state.collectAsState()
    var prompt by remember { mutableStateOf("") }
    var greeting by remember { mutableStateOf(timeGreeting()) }
    val context = LocalContext.current
    val activityPrefs = remember(context, userId) {
        context.getSharedPreferences("notely_home_activity_$userId", Context.MODE_PRIVATE)
    }
    val lifecycleOwner = LocalLifecycleOwner.current

    LaunchedEffect(userName, state.loading) {
        greeting = timeGreeting()
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                greeting = timeGreeting()
                vm.load()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val recent = remember(state.notes, state.chats, userId) {
        val items = mutableListOf<RecentWork>()
        state.notes.forEach { note ->
            val opened = activityPrefs.getLong("note:${note.id}", 0L)
            items += RecentWork(
                key = "note:${note.id}",
                title = note.topic.ifBlank { "Untitled note" },
                subtitle = note.content.take(70).ifBlank { "Your saved study note" },
                kind = "note",
                id = note.id,
                timestamp = maxOf(opened, parseTimestamp(note.created_at))
            )
        }
        state.chats.forEach { chat ->
            val opened = activityPrefs.getLong("chat:${chat.id}", 0L)
            items += RecentWork(
                key = "chat:${chat.id}",
                title = chat.title.ifBlank { "New chat" },
                subtitle = "Notely Assistant conversation",
                kind = "chat",
                id = chat.id,
                timestamp = maxOf(opened, parseTimestamp(chat.updated_at ?: chat.created_at))
            )
        }
        items.sortedByDescending { it.timestamp }.take(3)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(
            Brush.verticalGradient(
                listOf(
                    MaterialTheme.colorScheme.background,
                    MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                    MaterialTheme.colorScheme.background
                )
            )
        ),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 22.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            Column(
                modifier = Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier.size(66.dp).clip(CircleShape).background(
                        Brush.linearGradient(listOf(Color(0xFF8FE8F8), Color(0xFF347FE4), Color(0xFF7768E9)))
                    ),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        modifier = Modifier.size(48.dp),
                        shape = CircleShape,
                        color = Color.White.copy(alpha = 0.16f)
                    ) {
                        Box(contentAlignment = Alignment.Center) { BrandLogo(size = 36.dp) }
                    }
                }
                Spacer(Modifier.height(20.dp))
                Text(
                    "$greeting, ${userName.ifBlank { "there" }}",
                    style = MaterialTheme.typography.headlineSmall.copy(fontSize = 26.sp),
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    "How can I assist you today?",
                    style = MaterialTheme.typography.headlineSmall.copy(fontSize = 23.sp),
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 4.dp)
                )
                Text(
                    "Your study space is ready. Ask a question or choose a tool.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 9.dp)
                )
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = prompt,
                        onValueChange = { prompt = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Ask Notely anything about your studies…") },
                        minLines = 3,
                        maxLines = 5,
                        shape = RoundedCornerShape(16.dp),
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Sentences,
                            imeAction = ImeAction.Send
                        ),
                        keyboardActions = KeyboardActions(
                            onSend = {
                                val message = prompt.trim()
                                if (message.isNotEmpty()) {
                                    onSendPrompt(message)
                                    prompt = ""
                                }
                            }
                        )
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(7.dp)
                        ) {
                            QuickChip("Summarize", Icons.Default.Summarize) { onOpenTools("SUMMARIZE") }
                            QuickChip("Flashcards", Icons.Default.AutoStories) { onOpenTools("FLASHCARDS") }
                            QuickChip("Quiz", Icons.Default.Quiz) { onOpenTools("QUIZ") }
                            QuickChip("Study plan", Icons.Default.FlashOn) { onOpenTools("PLAN") }
                        }
                        Spacer(Modifier.width(8.dp))
                        Button(
                            onClick = {
                                val message = prompt.trim()
                                if (message.isNotEmpty()) {
                                    onSendPrompt(message)
                                    prompt = ""
                                }
                            },
                            enabled = prompt.isNotBlank(),
                            shape = RoundedCornerShape(13.dp),
                            contentPadding = PaddingValues(horizontal = 13.dp, vertical = 11.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                        ) {
                            Icon(Icons.Default.Send, contentDescription = "Send", modifier = Modifier.size(17.dp))
                        }
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                Column {
                    Text("Continue where you left off", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("Your recent notes and conversations", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text("RECENT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
            }
        }

        if (state.loading && recent.isEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface) {
                    Text("Loading your recent work…", modifier = Modifier.fillMaxWidth().padding(18.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else if (recent.isEmpty()) {
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    item { StarterCard("Create your first note", "Write and save your study notes", "NOTE") { onOpenNote(0) } }
                    item { StarterCard("Make flashcards", "Practice key ideas from your lessons", "CARDS") { onOpenTools("FLASHCARDS") } }
                    item { StarterCard("Generate a quiz", "Check what you remember", "QUIZ") { onOpenTools("QUIZ") } }
                }
            }
        } else {
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(recent, key = { it.key }) { item ->
                        RecentCard(item) {
                            activityPrefs.edit().putLong(item.key, System.currentTimeMillis()).apply()
                            if (item.kind == "chat") onOpenChat(item.id) else onOpenNote(item.id)
                        }
                    }
                }
            }
        }

        state.error?.let { message ->
            item { Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                Text("Each tool opens in its own workspace page.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun QuickChip(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(999.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.62f)
    ) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(5.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun RecentCard(item: RecentWork, onClick: () -> Unit) {
    Card(
        modifier = Modifier.width(248.dp).height(154.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 5.dp)
    ) {
        Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)) {
                Text(if (item.kind == "note") "▤" else "✦", modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp), color = MaterialTheme.colorScheme.primary)
            }
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(item.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
            }
            Text(if (item.timestamp > 0L) "Last opened ${timeAgo(item.timestamp)}" else "Saved in your workspace", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun StarterCard(title: String, description: String, label: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier.width(248.dp).height(154.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
    ) {
        Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("Get started →", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
        }
    }
}

private fun timeGreeting(): String {
    val hour = java.time.LocalTime.now().hour
    return when {
        hour < 12 -> "Good morning"
        hour < 17 -> "Good afternoon"
        else -> "Good evening"
    }
}

private fun parseTimestamp(value: String?): Long {
    if (value.isNullOrBlank()) return 0L
    return runCatching { Instant.parse(value).toEpochMilli() }.getOrDefault(0L)
}

private fun timeAgo(timestamp: Long): String {
    val minutes = ChronoUnit.MINUTES.between(Instant.ofEpochMilli(timestamp), Instant.now()).coerceAtLeast(0)
    return when {
        minutes < 1 -> "just now"
        minutes < 60 -> "${minutes}m ago"
        minutes < 1440 -> "${minutes / 60}h ago"
        else -> "${minutes / 1440}d ago"
    }
}
