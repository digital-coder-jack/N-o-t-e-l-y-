package com.ainotebook.app.ui.screens

import android.content.Context
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ainotebook.app.ui.NotesViewModel
import com.ainotebook.app.ui.components.NotelyIcon
import com.ainotebook.app.ui.components.NotelyIconTrigger
import com.ainotebook.app.ui.theme.MutedText

@Composable
fun NotesScreen(vm: NotesViewModel, userId: Int = 0, onOpenTools: () -> Unit) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val activityPrefs = remember(context, userId) { context.getSharedPreferences("notely_home_activity_$userId", Context.MODE_PRIVATE) }
    val selected = state.notes.firstOrNull { it.id == state.selectedId }
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var dirty by remember { mutableStateOf(false) }

    LaunchedEffect(state.selectedId, state.message) {
        state.selectedId?.let { activityPrefs.edit().putLong("note:$it", System.currentTimeMillis()).apply() }
        title = selected?.topic.orEmpty()
        content = selected?.content.orEmpty()
        dirty = false
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("My Notes", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("Saved notes sync with your Notely web workspace.", color = MutedText, style = MaterialTheme.typography.bodySmall)
            }
            OutlinedButton(onClick = { vm.load() }, enabled = !state.loading) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh notes", modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.size(6.dp))
            Button(onClick = { vm.create() }, enabled = !state.saving) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(6.dp))
                Text("New")
            }
        }

        if (state.loading) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                NotelyIcon(name = "loading", trigger = NotelyIconTrigger.Loop, size = 24.dp)
            }
        }

        state.error?.let { message ->
            Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        state.message?.let { message ->
            Text(message, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
        }

        if (state.notes.isEmpty() && !state.loading) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("No saved notes yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("Create a note here or generate study notes from the study tools.", color = MutedText)
                    OutlinedButton(onClick = onOpenTools) { Text("Open study tools") }
                }
            }
        }

        state.notes.forEach { note ->
            Card(
                modifier = Modifier.fillMaxWidth().clickable { activityPrefs.edit().putLong("note:${note.id}", System.currentTimeMillis()).apply(); vm.select(note.id) },
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (state.selectedId == note.id) MaterialTheme.colorScheme.primary.copy(alpha = 0.09f) else MaterialTheme.colorScheme.surface
                )
            ) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(note.topic.ifBlank { "Untitled note" }, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(note.content.take(120).ifBlank { "No content yet" }, style = MaterialTheme.typography.bodySmall, color = MutedText, maxLines = 2)
                }
            }
        }

        if (selected != null) {
            Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Edit note", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    OutlinedTextField(
                        value = title,
                        onValueChange = { title = it; dirty = true },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Title") },
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = content,
                        onValueChange = { content = it; dirty = true },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Content") },
                        minLines = 6,
                        maxLines = 14
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Button(
                            onClick = { vm.save(selected.id, title, content); dirty = false },
                            enabled = dirty && !state.saving && title.isNotBlank(),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.size(6.dp))
                            Text(if (state.saving) "Saving…" else "Save")
                        }
                        OutlinedButton(
                            onClick = { vm.delete(selected.id) },
                            enabled = !state.saving
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete note")
                        }
                    }
                    if (dirty) Text("Unsaved edits", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                }
            }
        }

        Spacer(Modifier.height(12.dp))
    }
}
