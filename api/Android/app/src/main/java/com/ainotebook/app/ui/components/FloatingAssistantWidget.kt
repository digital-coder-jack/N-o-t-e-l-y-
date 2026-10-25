package com.ainotebook.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.ui.platform.LocalContext
import android.content.Context
import android.provider.Settings
import com.ainotebook.app.ui.ChatViewModel
import com.ainotebook.app.ui.screens.ChatScreen

/**
 * Persistent assistant overlay mounted by MainShell rather than by an individual destination.
 * mode: 0 = circle, 1 = compact window, 2 = maximized.
 */
@Composable
fun FloatingAssistantWidget(
    mode: Int,
    onModeChange: (Int) -> Unit,
    vm: ChatViewModel,
    context: String,
    onOpen: () -> Unit
) {
    var contextEnabled by rememberSaveable { mutableStateOf(true) }
    val chatState by vm.state.collectAsState()
    val appContext = LocalContext.current.applicationContext
    val widgetPrefs = remember(appContext) { appContext.getSharedPreferences("notely_assistant_widget", Context.MODE_PRIVATE) }
    val chatState by vm.state.collectAsState()
    val restoredChatId = remember { widgetPrefs.getInt("last_chat_id", -1).takeIf { it > 0 } }
    LaunchedEffect(chatState.currentChatId) { chatState.currentChatId?.let { widgetPrefs.edit().putInt("last_chat_id", it).apply() } }
    val motionAllowed = remember(appContext) { try { Settings.Global.getFloat(appContext.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f } catch (_: Exception) { true } }
    val pulseTransition = rememberInfiniteTransition()
    val pulseScale by pulseTransition.animateFloat(1f, if (motionAllowed) 1.035f else 1f, infiniteRepeatable(tween(2100, easing = FastOutSlowInEasing), RepeatMode.Reverse))
    val panelScale by animateFloatAsState(if (mode == 0) 0.84f else if (mode == 1) 0.97f else 1f, animationSpec = spring(dampingRatio = 0.78f, stiffness = 480f))
    val panelAlpha by animateFloatAsState(if (mode == 0) 0f else 1f, animationSpec = tween(180))
    val panelOffset by animateFloatAsState(if (mode == 0) 18f else 0f, animationSpec = spring(dampingRatio = 0.82f, stiffness = 500f))
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val compactHeight = maxHeight * 0.72f
        val isPhone = maxWidth < 600.dp
        val panelModifier = when (mode) {
            2 -> if (isPhone) Modifier.fillMaxSize().padding(WindowInsets.safeDrawing.asPaddingValues()) else Modifier.fillMaxSize().padding(8.dp)
            1 -> if (isPhone) Modifier.align(Alignment.BottomEnd).padding(horizontal = 12.dp, bottom = 84.dp).fillMaxWidth().widthIn(max = 380.dp).heightIn(max = compactHeight).height(compactHeight) else Modifier.align(Alignment.BottomEnd).padding(end = 24.dp, bottom = 88.dp).fillMaxWidth().widthIn(max = 380.dp).heightIn(max = compactHeight).height(compactHeight)
            else -> Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 88.dp).size(1.dp).alpha(0f).clearAndSetSemantics { }
        }.graphicsLayer {
            scaleX = panelScale
            scaleY = panelScale
            alpha = panelAlpha
            translationY = panelOffset
            transformOrigin = TransformOrigin(1f, 1f)
        }

        Surface(
            modifier = panelModifier,
            shape = if (mode == 2) RoundedCornerShape(20.dp) else RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = if (mode == 0) 0.dp else 8.dp,
            shadowElevation = if (mode == 0) 0.dp else 16.dp,
            border = if (mode == 0) null else androidx.compose.foundation.BorderStroke(
                1.dp, MaterialTheme.colorScheme.outlineVariant
            )
        ) {
            Column(Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                            Text(
                                "✦",
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                        Column {
                            Text("Notely Assistant", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Text("Stay in your study flow", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { contextEnabled = !contextEnabled }, modifier = Modifier.semantics { contentDescription = if (contextEnabled) "Remove context" else "Add context" }) {
                            Text(if (contextEnabled) "×" else "+", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleMedium)
                        }
                        if (mode == 1) {
                            IconButton(onClick = { onModeChange(2) }) {
                                Text("□", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleMedium)
                            }
                        } else if (mode == 2) {
                            IconButton(onClick = { onModeChange(1) }) {
                                Text("↙", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleMedium)
                            }
                        }
                        IconButton(onClick = { onModeChange(0) }) {
                            Text("−", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleLarge)
                        }
                    }
                }
                if (contextEnabled) {
                    Text("Context: $context", modifier = Modifier.padding(horizontal = 14.dp, vertical = 5.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
                if (mode == 2 && !isPhone) {
                    Row(Modifier.weight(1f).fillMaxWidth()) {
                        Column(Modifier.width(244.dp).fillMaxHeight().padding(end = 12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                Text("Chat history", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                                TextButton(onClick = { vm.startNewChat() }) { Text("New") }
                            }
                            LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                items(chatState.chats, key = { it.id }) { chat ->
                                    TextButton(onClick = { vm.openChat(chat.id) }, modifier = Modifier.fillMaxWidth()) {
                                        Text(
                                            (if (chat.id == chatState.currentChatId) "• " else "") + chat.title,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                    }
                                }
                            }
                        }
                        Box(Modifier.width(1.dp).fillMaxHeight().background(MaterialTheme.colorScheme.outlineVariant))
                        Box(Modifier.weight(1f).fillMaxHeight()) {
                            // Keep ChatScreen composed while minimized so the selected chat and drafts survive navigation.
                            ChatScreen(vm = vm, initialChatId = restoredChatId, embedded = true, context = if (contextEnabled) context else null)
                        }
                    }
                } else {
                    Box(Modifier.weight(1f)) {
                        // Keep ChatScreen composed while the widget is minimized so the selected chat and drafts survive navigation.
                        ChatScreen(vm = vm, initialChatId = restoredChatId, embedded = true, context = if (contextEnabled) context else null)
                    }
                }
            }
        }

        if (mode == 0) {
            FloatingActionButton(
                onClick = onOpen,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = if (isPhone) 16.dp else 24.dp, bottom = if (isPhone) 88.dp else 24.dp)
                    .size(56.dp)
                    .graphicsLayer { scaleX = pulseScale; scaleY = pulseScale }
                    .semantics { contentDescription = "Open Notely Assistant" },
                shape = CircleShape,
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) {
                Text("✦", style = MaterialTheme.typography.headlineSmall)
            }
        }
    }
}
