package com.ainotebook.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DriveFileRenameOutline
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ainotebook.app.data.Chat
import com.ainotebook.app.ui.ChatViewModel
import com.ainotebook.app.ui.components.NotelyIcon
import com.ainotebook.app.ui.components.NotelyIconTrigger
import com.ainotebook.app.ui.theme.Cyan
import com.ainotebook.app.ui.theme.Indigo
import com.ainotebook.app.ui.theme.MutedText
import com.ainotebook.app.ui.theme.Violet

/** Native modal bottom sheet listing chat history with search, pin, rename, delete. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatHistorySheet(vm: ChatViewModel, onDismiss: () -> Unit) {
    val state by vm.state.collectAsState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var renameTarget by remember { mutableStateOf<Chat?>(null) }
    var deleteTarget by remember { mutableStateOf<Chat?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            Text(
                "Your conversations",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(Modifier.size(12.dp))
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = vm::setSearchQuery,
                placeholder = { Text("Search chats") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.size(12.dp))

            val chats = state.visibleChats
            if (chats.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                    Text(
                        if (state.searchQuery.isBlank()) "No conversations yet."
                        else "No chats match \"${state.searchQuery}\".",
                        color = MutedText
                    )
                }
            } else {
                LazyColumn(
                    Modifier.heightIn(max = 460.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(chats, key = { it.id }) { chat ->
                        ChatHistoryRow(
                            chat = chat,
                            pinned = chat.id in state.pinnedChatIds,
                            onOpen = { vm.openChat(chat.id); onDismiss() },
                            onPin = { vm.togglePin(chat.id) },
                            onRename = { renameTarget = chat },
                            onDelete = { deleteTarget = chat }
                        )
                    }
                }
            }
            Spacer(Modifier.size(24.dp))
        }
    }

    renameTarget?.let { chat ->
        var newTitle by remember { mutableStateOf(chat.title) }
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            title = { Text("Rename conversation") },
            text = {
                OutlinedTextField(
                    value = newTitle,
                    onValueChange = { newTitle = it },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(onClick = { vm.renameChat(chat.id, newTitle); renameTarget = null }) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { renameTarget = null }) { Text("Cancel") }
            }
        )
    }

    deleteTarget?.let { chat ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { NotelyIcon(name = "trash", trigger = NotelyIconTrigger.Hover, size = 28.dp); Text("Delete conversation?") } },
            text = { Text("\"${chat.title}\" will be permanently removed.") },
            confirmButton = {
                TextButton(onClick = { vm.deleteChat(chat.id); deleteTarget = null }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun ChatHistoryRow(
    chat: Chat,
    pinned: Boolean,
    onOpen: () -> Unit,
    onPin: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.5f))
            .clickable(onClick = onOpen)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, tint = if (pinned) Cyan else Indigo, modifier = Modifier.size(20.dp))
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                chat.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
            chat.updated_at?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MutedText, maxLines = 1)
            }
        }
        IconButton(onClick = onPin, modifier = Modifier.size(34.dp)) {
            Icon(
                Icons.Default.PushPin,
                contentDescription = "Pin",
                tint = if (pinned) Cyan else MutedText,
                modifier = Modifier.size(17.dp)
            )
        }
        IconButton(onClick = onRename, modifier = Modifier.size(34.dp)) {
            Icon(Icons.Default.DriveFileRenameOutline, contentDescription = "Rename", tint = MutedText, modifier = Modifier.size(17.dp))
        }
        IconButton(onClick = onDelete, modifier = Modifier.size(34.dp)) {
            NotelyIcon(name = "trash", trigger = NotelyIconTrigger.Hover, size = 20.dp, contentDescription = "Delete")
        }
    }
}

/** Native bottom sheet for picking an Notely product tier. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelPickerSheet(
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            Text(
                "Choose assistant mode",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                "Choose the Notely tier for your next response.",
                style = MaterialTheme.typography.bodySmall,
                color = MutedText
            )
            Spacer(Modifier.size(12.dp))
            options.forEach { opt ->
                val isSelected = opt.equals(selected, ignoreCase = true)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (isSelected) Indigo.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.4f))
                        .clickable { onSelect(opt) }
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            modelLabel(opt),
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            modelDescription(opt),
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedText
                        )
                    }
                    if (isSelected) {
                        Icon(Icons.Default.Check, contentDescription = "Selected", tint = Indigo)
                    }
                }
                Spacer(Modifier.size(8.dp))
            }
            Spacer(Modifier.size(20.dp))
        }
    }
}

private fun modelLabel(model: String): String = when (model.lowercase()) {
    "default", "auto" -> "Notely"
    "pro" -> "Notely Pro"
    "pro_max" -> "Notely Pro Max"
    else -> "Notely"
}

private fun modelDescription(model: String): String = when (model.lowercase()) {
    "default", "auto" -> "Your calm, fast study assistant"
    "pro" -> "More capable study assistance"
    "pro_max" -> "Advanced study assistance"
    else -> "Your Notely assistant"
}
