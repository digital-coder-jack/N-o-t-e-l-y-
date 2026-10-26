package com.ainotebook.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.animation.AnimatedVisibility as AnimatedVisibilityCommon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ainotebook.app.R
import com.ainotebook.app.ui.theme.BrandBlue
import com.ainotebook.app.ui.theme.BrandOrange
import com.ainotebook.app.ui.theme.BrandPink
import com.ainotebook.app.ui.theme.BrandViolet
import com.ainotebook.app.ui.theme.HairlineOutline
import com.ainotebook.app.ui.theme.Indigo
import com.ainotebook.app.ui.theme.SpaceBg
import com.ainotebook.app.ui.theme.SpaceCard

@Composable
fun SpaceBackground(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color.White)) { content() }
}

@Composable
fun GlassCard(modifier: Modifier = Modifier, elevated: Boolean = false, content: @Composable () -> Unit) {
    val borderColor = if (elevated) HairlineOutline.copy(alpha = 0.9f) else HairlineOutline.copy(alpha = 0.55f)
    Card(
        modifier = modifier.border(if (elevated) 1.5.dp else 1.dp, borderColor, RoundedCornerShape(20.dp)),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) { content() }
}

@Composable
fun BrandLogo(size: Dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(id = R.drawable.official_logo),
        contentDescription = "Notely",
        contentScale = ContentScale.Fit,
        modifier = modifier.size(size)
    )
}

@Composable
fun AssistantAvatar(size: Dp = 30.dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.size(size).clip(CircleShape)
            .border(1.dp, HairlineOutline, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Box(Modifier.size(size - 3.dp).clip(CircleShape), contentAlignment = Alignment.Center) {
            Image(
                painter = painterResource(id = R.drawable.official_logo),
                contentDescription = "Notely",
                contentScale = ContentScale.Fit,
                modifier = Modifier.size(size * 0.60f)
            )
        }
    }
}

@Composable
fun TypingDots(color: Color = Indigo) {
    val transition = rememberInfiniteTransition(label = "typing")
    Row(verticalAlignment = Alignment.CenterVertically) {
        repeat(3) { i ->
            val alpha by transition.animateFloat(
                initialValue = 0.25f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(tween(600, delayMillis = i * 180, easing = LinearEasing), RepeatMode.Reverse),
                label = "dot$i"
            )
            Box(Modifier.padding(horizontal = 2.dp).size(7.dp).alpha(alpha).clip(CircleShape).background(color))
            if (i < 2) Spacer(Modifier.size(2.dp))
        }
    }
}

@Composable
fun GradientBrush(): Brush = Brush.linearGradient(listOf(BrandOrange, BrandPink, BrandViolet, BrandBlue))

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { NotelyIcon(name = "loading", trigger = NotelyIconTrigger.Loop, size = 24.dp, color = Indigo) }
}

@Composable
fun ErrorBanner(message: String?) {
    AnimatedVisibility(visible = message != null) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).background(Color(0x33FB7185), RoundedCornerShape(12.dp)).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = Color(0xFFFB7185), modifier = Modifier.size(20.dp))
            Text(message ?: "", color = Color(0xFFFCA5A5), style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun OfflineBanner(isOnline: Boolean) {
    AnimatedVisibilityCommon(visible = !isOnline, enter = expandVertically(), exit = shrinkVertically()) {
        Row(
            modifier = Modifier.fillMaxWidth().background(Color(0xFF2A1020)).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.CloudOff, contentDescription = null, tint = Color(0xFFFCA5A5), modifier = Modifier.size(18.dp))
            Text("You're offline — some features may be unavailable.", color = Color(0xFFFCA5A5), style = MaterialTheme.typography.bodySmall)
        }
    }
}
