package com.ainotebook.app.ui.components

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val compactHeight = maxHeight * 0.72f
        val panelModifier = when (mode) {
            2 -> Modifier.fillMaxSize().padding(8.dp)
            1 -> Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 12.dp, bottom = 84.dp)
                .fillMaxWidth()
                .widthIn(max = 380.dp)
                .heightIn(max = compactHeight)
                .height(compactHeight)
            else -> Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = 88.dp)
                .size(1.dp)
                .alpha(0f)
                .clearAndSetSemantics { }
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
                        IconButton(onClick = { contextEnabled = !contextEnabled }) {
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
                Box(Modifier.weight(1f)) {
                    // Keep ChatScreen composed while the widget is minimized so the selected chat and
                    // drafts survive navigation between destinations.
                    ChatScreen(vm = vm, initialChatId = null, embedded = true, context = if (contextEnabled) context else null)
                }
            }
        }

        if (mode == 0) {
            FloatingActionButton(
                onClick = onOpen,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 16.dp, bottom = 88.dp)
                    .size(56.dp)
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
