package com.ainotebook.app.ui.screens

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import android.content.Context
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ainotebook.app.data.ChatMessage
import com.ainotebook.app.ui.ChatViewModel
import com.ainotebook.app.ui.components.AssistantAvatar
import com.ainotebook.app.ui.components.NotelyIcon
import com.ainotebook.app.ui.components.NotelyIconTrigger
import com.ainotebook.app.ui.components.BrandLogo
import com.ainotebook.app.ui.components.MarkdownText
import com.ainotebook.app.ui.components.TypingDots
import com.ainotebook.app.ui.components.rememberHaptics
import com.ainotebook.app.ui.theme.HairlineOutline
import com.ainotebook.app.ui.theme.Indigo
import com.ainotebook.app.ui.theme.MutedText
import com.ainotebook.app.ui.theme.Violet
import kotlinx.coroutines.launch

private val SUGGESTIONS = listOf(
    "Explain photosynthesis simply" to "🌱",
    "Quiz me on world history" to "🏛️",
    "Summarize the French Revolution" to "📜",
    "Help with my calculus homework" to "∫"
)

@Composable
fun ChatScreen(
    vm: ChatViewModel,
    initialChatId: Int?,
    embedded: Boolean = false,
    context: String? = null
) {
    val state by vm.state.collectAsState()
    val appContext = LocalContext.current.applicationContext
    val draftPrefs = remember(appContext) { appContext.getSharedPreferences("notely_assistant_drafts", Context.MODE_PRIVATE) }
    var input by rememberSaveable { mutableStateOf("") }
    var editing by remember { mutableStateOf<ChatMessage?>(null) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val haptic = rememberHaptics()

    var showHistory by remember { mutableStateOf(false) }
    var showModels by remember { mutableStateOf(false) }
    fun sendWithContext(text: String) { vm.send(if (embedded && !context.isNullOrBlank()) "Workspace context: $context. Use this as navigation context only; do not assume access to source files. Student question: $text" else text) }

    LaunchedEffect(initialChatId) {
        vm.loadChats()
        if (initialChatId != null && initialChatId > 0) vm.openChat(initialChatId)
        else vm.startNewChat()
    }
    LaunchedEffect(state.currentChatId) {
        input = draftPrefs.getString("draft_" + (state.currentChatId?.toString() ?: "new"), "") ?: ""
    }

    // FIX (Bug 3 partial): Only depend on messages.size, not content, to avoid
    // re-triggering animateScrollToItem on every streaming token — which was
    // cancelling and restarting the scroll coroutine hundreds of times and could
    // cause the list state to become inconsistent.
    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.size - 1)
        }
    }

    val showScrollDown by remember {
        derivedStateOf {
            val last = listState.layoutInfo.totalItemsCount - 1
            val visibleLast = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last > 0 && visibleLast < last - 1
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .imePadding()
        ) {
            {
                ChatHeader(
                    title = if (state.streaming) "Thinking…" else state.currentTitle,
                    model = state.model,
                    onNewChat = { haptic(); vm.startNewChat(); editing = null; input = "" },
                    onHistory = { haptic(); showHistory = true },
                    onModel = { haptic(); showModels = true }
                )
            }

            state.error?.let { errorMessage ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        errorMessage,
                        modifier = Modifier.weight(1f),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        "Dismiss",
                        modifier = Modifier.clickable { vm.clearError() }.padding(start = 12.dp),
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }

            // FIX (Bug 2 + Bug 3): EmptyChat and LazyColumn both occupy the
            // same weight(1f) slot so the Column can always resolve heights.
            // ChatInputBar is now OUTSIDE the if/else so it is always present —
            // this eliminates the layout thrash that occurred when the first
            // message was sent and the entire bottom half of the screen was
            // suddenly added in a single recomposition.
            if (state.messages.isEmpty()) {
                EmptyChat(
                    modifier = Modifier.weight(1f),
                    onSuggestion = { sendWithContext(it) }
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    contentPadding = PaddingValues(vertical = 12.dp)
                ) {
                    // FIX (Bug 1 — MAIN CRASH): Removed key = { it.id }.
                    //
                    // Room auto-generates IDs only after a row is inserted.
                    // While messages are in-flight (user message sent, assistant
                    // placeholder added), BOTH have id = 0. Compose's LazyColumn
                    // requires keys to be unique; two items sharing key=0 throws
                    // an IllegalArgumentException and crashes the app immediately.
                    //
                    // Chat messages are append-only, so position-based identity
                    // (the default when no key is supplied) is perfectly stable
                    // and correct here.
                    items(state.messages) { msg ->
                        MessageRow(
                            msg = msg,
                            streaming = state.streaming,
                            isLastAssistant = msg == state.messages.lastOrNull { it.role == "assistant" },
                            onRegenerate = { haptic(); vm.regenerateLast() },
                            onEdit = { editing = msg; input = msg.content }
                        )
                    }
                }
            }

            // Always-visible input bar (moved out of else branch).
            ChatInputBar(
                value = input,
                onValueChange = { input = it; draftPrefs.edit().putString("draft_" + (state.currentChatId?.toString() ?: "new"), it).apply() },
                streaming = state.streaming,
                isEditing = editing != null,
                onCancelEdit = { editing = null; input = "" },
                onSend = {
                    val text = input.trim()
                    if (text.isNotEmpty()) {
                        haptic()
                        if (editing != null) {
                            vm.editAndResend(text)
                            editing = null
                        } else {
                            sendWithContext(text)
                        }
                        input = ""
                        draftPrefs.edit().remove("draft_" + (state.currentChatId?.toString() ?: "new")).apply()
                    }
                }
            )
        } // End Column

        // Scroll-to-bottom FAB.
        AnimatedVisibility(
            visible = showScrollDown && !showHistory,
            enter = scaleIn() + fadeIn(),
            exit = scaleOut() + fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 92.dp)
        ) {
            Box(
                Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                    .border(1.dp, HairlineOutline, CircleShape)
                    .clickable {
                        scope.launch {
                            if (state.messages.isNotEmpty())
                                listState.animateScrollToItem(state.messages.size - 1)
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.ArrowDownward,
                    contentDescription = "Scroll to bottom",
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // Sheets overlaid on top of everything.
        if (showHistory) {
            ChatHistorySheet(
                vm = vm,
                onDismiss = { showHistory = false }
            )
        }

        if (showModels) {
            ModelPickerSheet(
                options = state.modelOptions,
                selected = state.model,
                onSelect = { vm.selectModel(it); showModels = false },
                onDismiss = { showModels = false }
            )
        }
    } // End outer Box
}

@Composable
private fun ChatHeader(
    title: String,
    model: String,
    onNewChat: () -> Unit,
    onHistory: () -> Unit,
    onModel: () -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onHistory) {
            Icon(
                Icons.Default.History,
                contentDescription = "Chat history",
                tint = MaterialTheme.colorScheme.onBackground
            )
        }
        AssistantAvatar(size = 32.dp)
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                "Notely",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1
            )
            Text(
                title,
                style = MaterialTheme.typography.bodySmall,
                color = MutedText,
                maxLines = 1
            )
        }
        Row(
            Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(Indigo.copy(alpha = 0.16f))
                .clickable(onClick = onModel)
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.AutoAwesome,
                contentDescription = null,
                tint = Indigo,
                modifier = Modifier.size(15.dp)
            )
            Spacer(Modifier.size(4.dp))
            Text(
                when (model.lowercase()) {
                    "pro" -> "Notely Pro"
                    "pro_max" -> "Notely Pro Max"
                    else -> "Notely"
                },
                style = MaterialTheme.typography.labelMedium,
                color = Indigo,
                fontWeight = FontWeight.SemiBold
            )
        }
        IconButton(onClick = onNewChat) {
            Icon(Icons.Default.Add, contentDescription = "New chat", tint = Indigo)
        }
    }
}
@Composable
private fun ChatInputBar(
    value: String,
    onValueChange: (String) -> Unit,
    streaming: Boolean,
    isEditing: Boolean,
    onCancelEdit: () -> Unit,
    onSend: () -> Unit
) {
    Column {
        AnimatedVisibility(visible = isEditing) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.Edit,
                    contentDescription = null,
                    tint = Violet,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.size(6.dp))
                Text(
                    "Editing message",
                    style = MaterialTheme.typography.labelMedium,
                    color = Violet,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    "Cancel",
                    style = MaterialTheme.typography.labelMedium,
                    color = MutedText,
                    modifier = Modifier.clickable(onClick = onCancelEdit)
                )
            }
        }
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                placeholder = { Text("Message Notely…") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(24.dp),
                maxLines = 5,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Indigo,
                    unfocusedBorderColor = HairlineOutline,
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface
                )
            )
            Spacer(Modifier.size(8.dp))
            val sendBrush = if (streaming || value.isBlank())
                Brush.linearGradient(listOf(Indigo.copy(alpha = 0.4f), Indigo.copy(alpha = 0.4f)))
            else
                Brush.linearGradient(listOf(Indigo, Violet))

            Box(
                Modifier
                    .size(50.dp)
                    .clip(CircleShape)
                    .background(sendBrush)
                    .clickable(enabled = !streaming && value.isNotBlank(), onClick = onSend),
                contentAlignment = Alignment.Center
            ) {
                if (streaming) {
                    NotelyIcon(name = "loading", trigger = NotelyIconTrigger.Loop, size = 22.dp, color = Color.White)
                } else {
                    Icon(
                        Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Send",
                        tint = Color.White
                    )
                }
            }
        }
    }
}

// FIX (Bug 2): Added modifier parameter so the call site can pass weight(1f),
// letting the Column resolve heights without ambiguity. Changed internal Box
// from fillMaxSize() to fillMaxWidth() — height is now controlled by the
// caller via the modifier, not asserted from inside.
@Composable
private fun EmptyChat(
    modifier: Modifier = Modifier,
    onSuggestion: (String) -> Unit
) {
    Box(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BrandLogo(size = 88.dp)
            Spacer(Modifier.size(16.dp))
            Text(
                "How can I help you learn today?",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(Modifier.size(6.dp))
            Text(
                "Ask anything, or try one of these:",
                style = MaterialTheme.typography.bodyMedium,
                color = MutedText
            )
            Spacer(Modifier.size(20.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SUGGESTIONS.forEach { (suggestion, emoji) ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
                            .border(
                                1.dp,
                                HairlineOutline.copy(alpha = 0.6f),
                                RoundedCornerShape(16.dp)
                            )
                            .clickable { onSuggestion(suggestion) }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(emoji, style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.size(12.dp))
                        Text(
                            suggestion,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageRow(
    msg: ChatMessage,
    streaming: Boolean,
    isLastAssistant: Boolean,
    onRegenerate: () -> Unit,
    onEdit: () -> Unit
) {
    if (msg.role == "user") {
        UserMessage(msg, onEdit)
    } else {
        AssistantMessage(msg, streaming, isLastAssistant, onRegenerate)
    }
}

@Composable
private fun UserMessage(msg: ChatMessage, onEdit: () -> Unit) {
    var showActions by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.Top
        ) {
            Box(
                Modifier
                    .widthIn(max = 300.dp)
                    .clip(
                        RoundedCornerShape(
                            topStart = 18.dp,
                            topEnd = 18.dp,
                            bottomStart = 18.dp,
                            bottomEnd = 4.dp
                        )
                    )
                    .background(Brush.linearGradient(listOf(Indigo, Violet)))
                    .clickable { showActions = !showActions }
                    .padding(14.dp)
            ) {
                Text(msg.content, color = Color.White, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.size(8.dp))
            Box(
                Modifier
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(Violet.copy(alpha = 0.25f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Default.Person,
                    contentDescription = null,
                    tint = Violet,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
        AnimatedVisibility(visible = showActions && msg.id >= 0) {
            Row(Modifier.padding(end = 38.dp, top = 4.dp)) {
                MessageAction(Icons.Default.Edit, "Edit") { showActions = false; onEdit() }
            }
        }
    }
}

@Composable
private fun AssistantMessage(
    msg: ChatMessage,
    streaming: Boolean,
    isLastAssistant: Boolean,
    onRegenerate: () -> Unit
) {
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val isEmptyStreaming = msg.content.isBlank() && streaming

    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AssistantAvatar(size = 30.dp)
            Spacer(Modifier.size(8.dp))
            Text(
                "Notely",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground
            )
        }
        Spacer(Modifier.size(6.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .clip(
                    RoundedCornerShape(
                        topStart = 4.dp,
                        topEnd = 18.dp,
                        bottomStart = 18.dp,
                        bottomEnd = 18.dp
                    )
                )
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                .border(
                    1.dp,
                    HairlineOutline.copy(alpha = 0.5f),
                    RoundedCornerShape(
                        topStart = 4.dp,
                        topEnd = 18.dp,
                        bottomStart = 18.dp,
                        bottomEnd = 18.dp
                    )
                )
                .padding(14.dp)
        ) {
            if (isEmptyStreaming) {
                TypingDots()
            } else {
                MarkdownText(markdown = msg.content)
            }
        }
        // Action row for completed assistant replies.
        if (!isEmptyStreaming && msg.content.isNotBlank()) {
            Row(
                Modifier.padding(top = 6.dp, start = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                var copied by remember(msg.content) { mutableStateOf(false) }
                TextButton(onClick = {
                    clipboard.setText(AnnotatedString(msg.content))
                    copied = true
                }) {
                    NotelyIcon(name = "copy", trigger = NotelyIconTrigger.Click, pressed = copied, size = 16.dp, contentDescription = null)
                    Text(if (copied) "Copied" else "Copy")
                }
                MessageAction(Icons.Default.Share, "Share") {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, msg.content)
                        putExtra(Intent.EXTRA_SUBJECT, "Notely")
                    }
                    context.startActivity(Intent.createChooser(send, "Share response"))
                }
                if (isLastAssistant && !streaming) {
                    MessageAction(Icons.Default.Refresh, "Regenerate", onClick = onRegenerate)
                }
            }
        }
    }
}

@Composable
private fun MessageAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit
) {
    Row(
        Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = label, tint = MutedText, modifier = Modifier.size(15.dp))
        Spacer(Modifier.size(4.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MutedText)
    }
}
