package com.ainotebook.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.border
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ainotebook.app.R
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class LaunchStage { INTRO, LANDING, AUTH, WORKSPACE }

private val ShutterCyan = Color(0xFF8FE8F8)
private val ShutterInk = Color(0xFF060C1C)

@Composable
internal fun NativeLaunchFlow(
    factory: VMFactory,
    isAuthed: Boolean,
    sessionLoading: Boolean,
    onWorkspace: @Composable () -> Unit
) {
    var stage by remember { mutableStateOf(LaunchStage.INTRO) }
    var authStartTab by remember { mutableStateOf(Routes.LOGIN) }
    val shutterY = remember { Animatable(-1f) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val reducedMotion = remember {
        runCatching {
            android.provider.Settings.Global.getFloat(
                context.contentResolver,
                android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,
                1f
            ) == 0f
        }.getOrDefault(false)
    }

    suspend fun transitionTo(next: LaunchStage) {
        shutterY.snapTo(-1f)
        shutterY.animateTo(0f, tween(if (reducedMotion) 100 else 600))
        stage = next
        delay(if (reducedMotion) 16 else 50)
        shutterY.animateTo(-1f, tween(if (reducedMotion) 100 else 700))
    }

    LaunchedEffect(Unit) {
        delay(if (reducedMotion) 250 else 1900)
        while (sessionLoading) delay(60)
        stage = if (isAuthed) LaunchStage.WORKSPACE else LaunchStage.LANDING
    }

    LaunchedEffect(isAuthed) {
        if ((stage == LaunchStage.LANDING || stage == LaunchStage.AUTH) && isAuthed) {
            transitionTo(LaunchStage.WORKSPACE)
        } else if (stage == LaunchStage.WORKSPACE && !isAuthed) {
            transitionTo(LaunchStage.LANDING)
        }
    }

    Box(Modifier.fillMaxSize().background(ShutterInk)) {
        when (stage) {
            LaunchStage.INTRO -> IntroScene(
                reducedMotion = reducedMotion,
                onSkip = { scope.launch {
                    while (sessionLoading) delay(60)
                    stage = if (isAuthed) LaunchStage.WORKSPACE else LaunchStage.LANDING
                } }
            )
            LaunchStage.LANDING -> NativeLanding(
                onSignUp = { scope.launch { authStartTab = Routes.SIGNUP; transitionTo(LaunchStage.AUTH) } },
                onSignIn = { scope.launch { authStartTab = Routes.LOGIN; transitionTo(LaunchStage.AUTH) } }
            )
            LaunchStage.AUTH -> AuthFlow(
                factory = factory,
                startRoute = authStartTab,
                onBackToLanding = { scope.launch { transitionTo(LaunchStage.LANDING) } }
            )
            LaunchStage.WORKSPACE -> onWorkspace()
        }
        if (stage != LaunchStage.INTRO && shutterY.value > -1f) {
            Box(
                Modifier.fillMaxSize().graphicsLayer { translationY = shutterY.value * size.height }
                    .background(ShutterCyan),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Image(painterResource(R.drawable.official_logo), contentDescription = "Notely logo", modifier = Modifier.size(88.dp))
                    Text("Notely", color = ShutterInk, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun IntroScene(reducedMotion: Boolean, onSkip: () -> Unit) {
    var phase by remember { mutableStateOf(0) }
    val markSize by animateDpAsState(
        targetValue = if (phase >= 1) 94.dp else 18.dp,
        animationSpec = tween(if (reducedMotion) 100 else 550),
        label = "notely-intro-mark"
    )
    LaunchedEffect(reducedMotion) {
        if (reducedMotion) { phase = 3; return@LaunchedEffect }
        delay(350); phase = 1
        delay(550); phase = 2
        delay(600); phase = 3
    }
    Box(Modifier.fillMaxSize().background(ShutterInk), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                Modifier.size(markSize)
                    .clip(CircleShape)
                    .then(if (phase >= 1) Modifier.border(2.dp, ShutterCyan, CircleShape) else Modifier)
                    .background(if (phase >= 1) Color.Transparent else ShutterCyan),
                contentAlignment = Alignment.Center
            ) {
                if (phase >= 1) Image(painterResource(R.drawable.official_logo), contentDescription = "Notely mark", modifier = Modifier.size(88.dp))
            }
            if (phase >= 3) Text("Notely", color = Color.White, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        }
        TextButton(onClick = onSkip, modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)) {
            Text("Skip", color = Color.White.copy(alpha = .85f))
        }
    }
}

@Composable
private fun NativeLanding(onSignUp: () -> Unit, onSignIn: () -> Unit) {
    Box(Modifier.fillMaxSize().background(ShutterInk).padding(horizontal = 28.dp, vertical = 32.dp)) {
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Image(painterResource(R.drawable.official_logo), contentDescription = "Notely logo", modifier = Modifier.size(72.dp))
            Text("Notely", color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Write. Practice. Ask.", color = ShutterCyan, style = MaterialTheme.typography.titleMedium)
            Text("A calmer workspace for everything you’re learning.", color = Color(0xFFBAC5D8), style = MaterialTheme.typography.bodyLarge)
            Spacer(Modifier.height(10.dp))
            Button(onClick = onSignUp, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(14.dp), colors = ButtonDefaults.buttonColors(containerColor = ShutterCyan, contentColor = ShutterInk)) {
                Text("Create account", fontWeight = FontWeight.SemiBold)
            }
            OutlinedButton(onClick = onSignIn, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(14.dp)) {
                Text("Sign in", color = Color.White)
            }
        }
    }
}
