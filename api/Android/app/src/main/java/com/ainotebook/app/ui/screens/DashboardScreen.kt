package com.ainotebook.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckBoxOutlineBlank
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ainotebook.app.ui.DashboardViewModel
import com.ainotebook.app.ui.components.NotelyIcon
import com.ainotebook.app.ui.components.NotelyIconTrigger
import com.ainotebook.app.ui.theme.NotelyBackground
import com.ainotebook.app.ui.theme.NotelyGreen
import com.ainotebook.app.ui.theme.NotelyIndigo
import com.ainotebook.app.ui.theme.NotelyLavender
import com.ainotebook.app.ui.theme.NotelyLine
import com.ainotebook.app.ui.theme.NotelyMuted
import com.ainotebook.app.ui.theme.NotelySurface

private val CardShape = RoundedCornerShape(12.dp)

@Composable
fun DashboardScreen(
    vm: DashboardViewModel,
    userName: String,
    onOpenChat: (Int) -> Unit,
    onNewChat: () -> Unit,
    onOpenTools: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(NotelyBackground),
        contentPadding = PaddingValues(bottom = 32.dp)
    ) {
        item {
            DashboardHeader(userName)
            Text("A calmer place to pick up where you left off.", style = MaterialTheme.typography.bodyMedium, color = NotelyMuted, modifier = Modifier.padding(horizontal = 20.dp))
        }
        item {
            DashboardCard(NotelyLavender, Modifier.padding(20.dp, 24.dp, 20.dp, 8.dp)) {
                Eyebrow("BIOLOGY 101 · LECTURE 07")
                Text("Cellular respiration", style = MaterialTheme.typography.headlineSmall)
                Text("How does a proton gradient become usable energy? Continue your note before today’s study group.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 10.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 12.dp)) {
                    Text("8 note pages", style = MaterialTheme.typography.labelMedium, color = NotelyMuted)
                    Spacer(Modifier.width(10.dp))
                    Text("All changes saved", style = MaterialTheme.typography.labelMedium, color = NotelyGreen)
                }
                NotelyButton("Continue writing", Icons.Default.ArrowForward, onNewChat)
            }
        }
        item { SectionLabel("YOUR NOTEBOOKS") }
        item { NotebookRow("Biology 101", "Prof. Elena Martinez · 8 pages · Updated Oct 14", Icons.Default.School) }
        item { NotebookRow("Organic Chemistry", "6 pages · Reaction mechanisms", Icons.Default.AutoStories) }
        item { NotebookRow("World History", "5 pages · Industrial revolutions", Icons.Default.MenuBook) }
        item {
            DashboardCard(modifier = Modifier.padding(20.dp, 16.dp, 20.dp, 8.dp)) {
                Text("A quick recall session", style = MaterialTheme.typography.titleLarge)
                Text("12 Biology cards are ready for review. Five focused minutes can make the next lecture feel easier.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 10.dp))
                NotelyOutlineButton("Review flashcards", Icons.Default.AutoStories, onOpenTools)
            }
        }
        item {
            DashboardCard(modifier = Modifier.padding(20.dp, 8.dp)) {
                Text("On your calendar", style = MaterialTheme.typography.titleLarge)
                Eyebrow("TODAY · OCT 16", NotelyIndigo)
                Text("Biology study group", style = MaterialTheme.typography.titleLarge)
                Text("3:00–4:00 PM · Library, room 2B", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
                NotelyOutlineButton("View calendar", Icons.Default.CalendarMonth, onOpenTools)
            }
        }
        item {
            DashboardCard(modifier = Modifier.padding(20.dp, 8.dp)) {
                Text("Coming up", style = MaterialTheme.typography.titleLarge)
                TaskRow("Lab report: yeast respiration", "Biology 101 · Due Oct 17")
                TaskRow("Mechanisms problem set", "Organic Chemistry · Due Oct 19")
            }
        }
        item {
            DashboardCard(modifier = Modifier.padding(20.dp, 8.dp, 20.dp, 20.dp)) {
                Text("Your study rhythm", style = MaterialTheme.typography.titleLarge)
                Text("20 / 30 min", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 8.dp))
                LinearProgressIndicator(progress = { .38f }, modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp), color = NotelyIndigo, trackColor = NotelyLine)
                Text("Today’s study goal · 10 minutes to go", style = MaterialTheme.typography.labelMedium, color = NotelyMuted)
            }
        }
    }
}

@Composable
private fun DashboardHeader(userName: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 22.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text("Notely", style = MaterialTheme.typography.titleLarge)
        Text("JL", style = MaterialTheme.typography.labelMedium, color = NotelyMuted)
    }
    Text("Good morning, ${userName.ifBlank { "Jamie" }}", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(horizontal = 20.dp))
}

@Composable
private fun DashboardCard(background: Color = NotelySurface, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier = modifier.fillMaxWidth(), shape = CardShape, colors = CardDefaults.cardColors(containerColor = background), border = BorderStroke(1.dp, NotelyLine)) {
        Column(modifier = Modifier.padding(16.dp), content = content)
    }
}

@Composable
private fun NotebookRow(title: String, detail: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    DashboardCard(modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            NotelyIcon(name = "book", trigger = NotelyIconTrigger.Hover, size = 24.dp, color = NotelyIndigo)
            Spacer(Modifier.width(14.dp))
            Column { Text(title, style = MaterialTheme.typography.titleMedium); Text(detail, style = MaterialTheme.typography.labelMedium, color = NotelyMuted) }
        }
    }
}

@Composable
private fun TaskRow(title: String, detail: String) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 10.dp)) {
        Icon(Icons.Default.CheckBoxOutlineBlank, contentDescription = null, tint = NotelyIndigo, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(12.dp))
        Column { Text(title, style = MaterialTheme.typography.labelLarge); Text(detail, style = MaterialTheme.typography.labelMedium, color = NotelyMuted) }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold), color = NotelyMuted, modifier = Modifier.padding(start = 20.dp, top = 16.dp, bottom = 4.dp))
}

@Composable
private fun Eyebrow(text: String, color: Color = NotelyMuted) {
    Text(text, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.4.sp), color = color, modifier = Modifier.padding(bottom = 10.dp))
}

@Composable
private fun NotelyButton(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = NotelyIndigo), shape = RoundedCornerShape(8.dp), modifier = Modifier.padding(top = 14.dp)) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(8.dp))
        Text(text)
    }
}

@Composable
private fun NotelyOutlineButton(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, shape = RoundedCornerShape(8.dp), border = BorderStroke(1.dp, NotelyLine), modifier = Modifier.padding(top = 12.dp)) {
        Icon(icon, contentDescription = null, tint = NotelyIndigo, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, color = MaterialTheme.colorScheme.onSurface)
    }
}
