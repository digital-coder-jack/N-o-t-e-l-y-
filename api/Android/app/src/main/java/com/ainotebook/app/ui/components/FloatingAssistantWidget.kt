package com.ainotebook.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
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
    var focusMode by rememberSaveable { mutableStateOf(false) }
    val appContext = LocalContext.current.applicationContext
    val widgetPrefs = remember(appContext) { appContext.getSharedPreferences("notely_assistant_widget", Context.MODE_PRIVATE) }
    val chatState by vm.state.collectAsState()
    val restoredChatId = remember { widgetPrefs.getInt("last_chat_id", -1).takeIf { it > 0 } }
    LaunchedEffect(chatState.currentChatId) { chatState.currentChatId?.let { widgetPrefs.edit().putInt("last_chat_id", it).apply() } }
    val motionAllowed = remember(appContext) { try { Settings.Global.getFloat(appContext.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f } catch (_: Exception) { true } }
    var unread by rememberSaveable { mutableStateOf(false) }
    var wasStreaming by remember { mutableStateOf(chatState.streaming) }
    LaunchedEffect(chatState.streaming, mode, chatState.messages.lastOrNull()?.content) {
        val latest = chatState.messages.lastOrNull()
        if (wasStreaming && !chatState.streaming && mode == 0 && latest?.role == "assistant" && latest.content.isNotBlank()) unread = true
        if (mode > 0) unread = false
        wasStreaming = chatState.streaming
    }
    val badgeScale by animateFloatAsState(if (unread) 1f else 0f, animationSpec = tween(180), label = "assistant-unread-badge")
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
                        AuroraOrb(size = 36.dp, generating = chatState.streaming)
                        Column {
                            Text("Notely Assistant", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            Text("Stay in your study flow", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { contextEnabled = !contextEnabled }, modifier = Modifier.semantics { contentDescription = if (contextEnabled) "Remove context" else "Add context" }) {
                            Text(if (contextEnabled) "×" else "+", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleMedium)
                        }
                        if (mode == 2 && !isPhone) {
                            IconButton(onClick = { focusMode = !focusMode }, modifier = Modifier.semantics { contentDescription = if (focusMode) "Show assistant side panels" else "Focus mode" }) {
                                Text(if (focusMode) "☷" else "◎", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleMedium)
                            }
                        }
                        if (mode == 1) {
                            IconButton(onClick = { onModeChange(2) }, modifier = Modifier.semantics { contentDescription = "Maximize assistant" }) {
                                Text("□", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleMedium)
                            }
                        } else if (mode == 2) {
                            IconButton(onClick = { onModeChange(1) }, modifier = Modifier.semantics { contentDescription = "Minimize assistant" }) {
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
                        if (!focusMode) {
                            Column(Modifier.width(220.dp).fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)).padding(12.dp)) {
                                Text("Chat history", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                androidx.compose.material3.TextButton(onClick = { vm.startNewChat() }, modifier = Modifier.fillMaxWidth()) { Text("＋ New chat") }
                                LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    items(chatState.chats, key = { it.id }) { chat ->
                                        Surface(modifier = Modifier.fillMaxWidth().clickable { vm.openChat(chat.id) }, shape = RoundedCornerShape(10.dp), color = if (chat.id == chatState.currentChatId) MaterialTheme.colorScheme.primaryContainer else Color.Transparent) {
                                            Text(chat.title, modifier = Modifier.padding(horizontal = 9.dp, vertical = 10.dp), maxLines = 2, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
                                        }
                                    }
                                }
                            }
                        }
                        Box(Modifier.weight(1f).fillMaxSize()) {
                            ChatScreen(vm = vm, initialChatId = restoredChatId, embedded = true, context = if (contextEnabled) context else null)
                        }
                        if (!focusMode) {
                            Column(Modifier.width(205.dp).fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.28f)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Sources used", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text(if (contextEnabled) "Context label: $context" else "Context is turned off.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("The current chat API does not automatically retrieve source documents.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                androidx.compose.material3.HorizontalDivider()
                                Text("Quick actions", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                androidx.compose.material3.TextButton(onClick = { onModeChange(1) }, modifier = Modifier.fillMaxWidth()) { Text("＋ Add to notebook") }
                                androidx.compose.material3.TextButton(onClick = { contextEnabled = !contextEnabled }, modifier = Modifier.fillMaxWidth()) { Text(if (contextEnabled) "☆ Turn context off" else "☆ Turn context on") }
                                Spacer(Modifier.weight(1f))
                                androidx.compose.material3.TextButton(onClick = { focusMode = true }, modifier = Modifier.fillMaxWidth()) { Text("◎ Focus mode") }
                            }
                        }
                    }
                } else {
                    Box(Modifier.weight(1f)) {
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
                containerColor = Color.Transparent,
                contentColor = Color.White
            ) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    AuroraOrb(size = 62.dp, generating = chatState.streaming)
                    Box(Modifier.align(Alignment.TopEnd).padding(3.dp).size(12.dp).graphicsLayer { scaleX = badgeScale; scaleY = badgeScale }.clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                }
            }
        }
    }
}

/** Inline Compose aurora planet, rendered without external image assets. */
@Composable
private fun AuroraOrb(size: androidx.compose.ui.unit.Dp, generating: Boolean) {
    val transition = rememberInfiniteTransition(label = "aurora-orb")
    val ringAngle by transition.animateFloat(-18f, 342f, infiniteRepeatable(tween(if (generating) 1900 else 10000, easing = androidx.compose.animation.core.LinearEasing)), label = "aurora-ring")
    val pulse by transition.animateFloat(0.97f, if (generating) 1.055f else 1.025f, infiniteRepeatable(tween(if (generating) 900 else 2200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "aurora-pulse")
    Box(Modifier.size(size).graphicsLayer { scaleX = pulse; scaleY = pulse }.clip(CircleShape).background(Brush.radialGradient(listOf(Color(0xFF26385F), Color(0xFF10162F), Color(0xFF030611))))) {
        Box(Modifier.fillMaxSize().clip(CircleShape)) {
            Box(Modifier.size(size * 0.62f).offset(x = size * 0.02f, y = size * 0.12f).blur(size * 0.12f).background(Color(0xCC22D3EE), CircleShape).align(Alignment.TopStart))
            Box(Modifier.size(size * 0.56f).offset(x = size * 0.32f, y = size * 0.10f).blur(size * 0.13f).background(Color(0xC2A855F7), CircleShape).align(Alignment.TopStart))
            Box(Modifier.size(size * 0.62f).offset(x = size * 0.25f, y = size * 0.50f).blur(size * 0.13f).background(Color(0xB8EC4899), CircleShape).align(Alignment.TopStart))
            Box(Modifier.size(size * 0.30f).offset(x = size * 0.12f, y = size * 0.08f).background(Brush.linearGradient(listOf(Color.White.copy(alpha = 0.40f), Color.Transparent)), CircleShape).align(Alignment.TopStart))
        }
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            rotate(ringAngle) {
                drawOval(brush = Brush.linearGradient(listOf(Color(0xFFB9FBFF), Color(0xFF22D3EE), Color(0xFFA855F7))), topLeft = Offset(this.size.width * 0.02f, this.size.height * 0.32f), size = Size(this.size.width * 0.96f, this.size.height * 0.36f), style = Stroke(width = this.size.minDimension * 0.035f))
            }
            drawCircle(Color(0x5522D3EE), radius = this.size.minDimension * 0.49f, style = Stroke(width = this.size.minDimension * 0.012f))
        }
        Text("✦", modifier = Modifier.align(Alignment.Center), color = Color.White, style = MaterialTheme.typography.titleLarge)
    }
}