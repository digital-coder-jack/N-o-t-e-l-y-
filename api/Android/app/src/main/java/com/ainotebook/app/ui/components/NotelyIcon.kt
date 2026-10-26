package com.ainotebook.app.ui.components

import android.provider.Settings
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.LottieConstants
import com.airbnb.lottie.compose.animateLottieCompositionAsState
import com.airbnb.lottie.compose.rememberLottieComposition

enum class NotelyIconTrigger { Hover, Click, Once, Loop, InView, Manual }

private fun Color.toLottieColor(): String =
    "[${red},${green},${blue},1]"

@Composable
fun NotelyIcon(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 20.dp,
    trigger: NotelyIconTrigger = NotelyIconTrigger.Hover,
    speed: Float = if (name.lowercase() in setOf("trash", "copy", "archive")) 0.7f else 1f,
    color: Color = MaterialTheme.colorScheme.onSurface,
    active: Boolean = false,
    pressed: Boolean = false,
    contentDescription: String? = null
) {
    val context = LocalContext.current
    val filename = remember(name) {
        when (name.lowercase()) {
            "trash" -> "lottie/trash-v2.json"
            "copy" -> "lottie/copy.json"
            "archive" -> "lottie/archive.json"
            "book" -> "lottie/book.json"
            "bell" -> "lottie/notification-v3.json"
            "loading" -> "lottie/loading-v2.json"
            "info" -> "lottie/info.json"
            "help" -> "lottie/help.json"
            "alert" -> "lottie/alert-circle.json"
            else -> "lottie/info.json"
        }
    }
    val surface = MaterialTheme.colorScheme.surface
    val json = remember(filename, color, surface) {
        val raw = context.assets.open(filename).bufferedReader().use { it.readText() }
        val ink = color.toLottieColor()
        val surfaceColor = surface.toLottieColor()
        raw.replace("[0,0,0,1]", ink)
            .replace("[0, 0, 0, 1]", ink)
            .let { if (name.lowercase() == "bell") it.replace("[1,1,1,1]", surfaceColor).replace("[1, 1, 1, 1]", surfaceColor) else it }
    }
    val composition by rememberLottieComposition(LottieCompositionSpec.JsonString(json))
    val reduceMotion = remember(context) {
        runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)
    }
    val loop = trigger == NotelyIconTrigger.Loop
    val play = when (trigger) {
        NotelyIconTrigger.Once, NotelyIconTrigger.InView -> true
        NotelyIconTrigger.Loop -> true
        NotelyIconTrigger.Manual -> active || pressed
        NotelyIconTrigger.Click, NotelyIconTrigger.Hover -> pressed
    }
    val progress by animateLottieCompositionAsState(
        composition = composition,
        isPlaying = play || (name.lowercase() == "loading" && loop),
        iterations = if (loop) LottieConstants.IterateForever else 1,
        speed = if (reduceMotion && name.lowercase() == "loading") 0.3f else speed,
        restartOnPlay = trigger == NotelyIconTrigger.Click || trigger == NotelyIconTrigger.Manual
    )
    val semanticsModifier = if (contentDescription == null) modifier.semantics { } else modifier.semantics { this.contentDescription = contentDescription }
    LottieAnimation(
        composition = composition,
        progress = { if (reduceMotion && name.lowercase() != "loading") 1f else progress },
        modifier = semanticsModifier.size(size)
    )
}
