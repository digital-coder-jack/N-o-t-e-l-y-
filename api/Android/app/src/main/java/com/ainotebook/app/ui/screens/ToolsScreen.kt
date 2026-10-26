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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.Quiz
import androidx.compose.material.icons.filled.Style
import androidx.compose.material.icons.filled.Summarize
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ainotebook.app.ui.Tool
import com.ainotebook.app.ui.ToolsViewModel
import com.ainotebook.app.ui.components.BrandLogo
import com.ainotebook.app.ui.components.NotelyIcon
import com.ainotebook.app.ui.components.NotelyIconTrigger
import com.ainotebook.app.ui.components.ErrorBanner
import com.ainotebook.app.ui.components.GlassCard
import com.ainotebook.app.ui.components.MarkdownText
import com.ainotebook.app.ui.components.TextResultSkeleton
import com.ainotebook.app.ui.components.rememberHaptics
import com.ainotebook.app.ui.theme.Cyan
import com.ainotebook.app.ui.theme.Indigo
import com.ainotebook.app.ui.theme.Violet

private data class ToolMeta(val tool: Tool, val title: String, val desc: String, val icon: ImageVector, val accent: Color)

private val TOOLS = listOf(
    ToolMeta(Tool.NOTES, "Notes", "Generate study notes", Icons.Default.AutoStories, Indigo),
    ToolMeta(Tool.QUIZ, "Quiz", "Interactive MCQ quiz", Icons.Default.Quiz, Violet),
    ToolMeta(Tool.FLASHCARDS, "Flashcards", "Flip-to-reveal cards", Icons.Default.Style, Cyan),
    ToolMeta(Tool.PLAN, "Study Plan", "Day-by-day plan", Icons.Default.CalendarMonth, Indigo),
    ToolMeta(Tool.SUMMARIZE, "Summarizer", "Summarize any text", Icons.Default.Summarize, Violet),
    ToolMeta(Tool.HOMEWORK, "Homework Helper", "Step-by-step answers", Icons.AutoMirrored.Filled.HelpOutline, Cyan),
)

@Composable
fun ToolsScreen(vm: ToolsViewModel) {
    var selected by remember { mutableStateOf<Tool?>(null) }

    val haptics = rememberHaptics()

    if (selected == null) {
        Column(Modifier.fillMaxSize().statusBarsPadding().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BrandLogo(size = 40.dp)
                Spacer(Modifier.size(10.dp))
                Text(
                    "Study Tools",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
            Spacer(Modifier.height(12.dp))
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(TOOLS) { meta ->
                    GlassCard(
                        Modifier
                            .fillMaxWidth()
                            .height(140.dp)
                            .clickable { haptics(); vm.reset(); selected = meta.tool }
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Box(
                                Modifier
                                    .size(44.dp)
                                    .background(meta.accent.copy(alpha = 0.18f), androidx.compose.foundation.shape.RoundedCornerShape(12.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(meta.icon, null, tint = meta.accent, modifier = Modifier.size(24.dp))
                            }
                            Spacer(Modifier.height(10.dp))
                            Text(meta.title, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                            Text(
                                meta.desc,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    } else {
        ToolDetail(vm, selected!!, onBack = { haptics(); selected = null; vm.reset() })
    }
}

@Composable
private fun ToolDetail(vm: ToolsViewModel, tool: Tool, onBack: () -> Unit) {
    val state by vm.state.collectAsState()
    var topic by remember { mutableStateOf("") }
    var number by remember { mutableStateOf("5") }

    val meta = TOOLS.first { it.tool == tool }

    val haptics = rememberHaptics()

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = MaterialTheme.colorScheme.onBackground)
            }
            Text(
                meta.title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
        }
        Spacer(Modifier.height(8.dp))
        ErrorBanner(state.error)

        val multiline = tool == Tool.SUMMARIZE || tool == Tool.HOMEWORK
        val label = when (tool) {
            Tool.SUMMARIZE -> "Paste text to summarize"
            Tool.HOMEWORK -> "Your homework question"
            Tool.PLAN -> "Your study goal"
            else -> "Topic"
        }

        OutlinedTextField(
            value = topic,
            onValueChange = { topic = it },
            label = { Text(label) },
            modifier = Modifier.fillMaxWidth().then(if (multiline) Modifier.height(160.dp) else Modifier),
            singleLine = !multiline
        )

        if (tool == Tool.QUIZ || tool == Tool.FLASHCARDS || tool == Tool.PLAN) {
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = number,
                onValueChange = { number = it.filter { c -> c.isDigit() } },
                label = { Text(if (tool == Tool.PLAN) "Number of days" else "How many?") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Spacer(Modifier.height(16.dp))
        val canGenerate = !state.loading && topic.isNotBlank()
        Box(
            Modifier
                .fillMaxWidth()
                .height(50.dp)
                .clip(androidx.compose.foundation.shape.RoundedCornerShape(14.dp))
                .background(
                    if (canGenerate)
                        Brush.linearGradient(listOf(Indigo, Violet))
                    else
                        Brush.linearGradient(
                            listOf(
                                MaterialTheme.colorScheme.surfaceContainerHigh,
                                MaterialTheme.colorScheme.surfaceContainerHigh
                            )
                        )
                )
        ) {
            Button(
                onClick = {
                    haptics()
                    val n = number.toIntOrNull() ?: 5
                    when (tool) {
                        Tool.NOTES -> vm.notes(topic)
                        Tool.QUIZ -> vm.quiz(topic, n.coerceIn(1, 15))
                        Tool.FLASHCARDS -> vm.flashcards(topic, n.coerceIn(1, 20))
                        Tool.PLAN -> vm.plan(topic, n.coerceIn(1, 60))
                        Tool.SUMMARIZE -> vm.summarize(topic)
                        Tool.HOMEWORK -> vm.homework(topic)
                    }
                },
                enabled = canGenerate,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.Transparent,
                    disabledContainerColor = Color.Transparent
                ),
                elevation = null
            ) {
                if (state.loading) {
                    NotelyIcon(name = "loading", trigger = NotelyIconTrigger.Loop, size = 20.dp, color = Color.White)
                } else {
                    Text("Generate", fontWeight = FontWeight.SemiBold, color = Color.White)
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        // Results
        if (state.loading && state.textResult == null && state.quiz == null && state.flashcards == null) {
            GlassCard(Modifier.fillMaxWidth()) {
                TextResultSkeleton(Modifier.padding(16.dp))
            }
        }
        state.textResult?.let { ResultCard(it) }
        state.quiz?.let { QuizResult(it) }
        state.flashcards?.let { cards ->
            cards.forEach { FlashcardView(it.front, it.back) }
        }
    }
}

@Composable
private fun ResultCard(text: String) {
    GlassCard(Modifier.fillMaxWidth()) {
        MarkdownText(
            markdown = text,
            modifier = Modifier.padding(16.dp),
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun QuizResult(questions: List<com.ainotebook.app.data.QuizQuestion>) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        questions.forEachIndexed { i, q ->
            GlassCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        "${i + 1}. ${q.question}",
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(8.dp))
                    q.options.forEachIndexed { idx, opt ->
                        val correct = idx == q.answer
                        Text(
                            "${('A' + idx)}. $opt",
                            color = if (correct) Cyan else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = if (correct) FontWeight.Bold else FontWeight.Normal,
                            modifier = Modifier.padding(vertical = 2.dp)
                        )
                    }
                    if (q.explanation.isNotBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "💡 ${q.explanation}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FlashcardView(front: String, back: String) {
    var flipped by remember { mutableStateOf(false) }
    GlassCard(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .clickable { flipped = !flipped }
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(
                if (flipped) "Answer" else "Question",
                style = MaterialTheme.typography.labelSmall,
                color = Indigo
            )
            Spacer(Modifier.height(6.dp))
            Text(
                if (flipped) back else front,
                color = MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.bodyLarge
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "Tap to flip",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
