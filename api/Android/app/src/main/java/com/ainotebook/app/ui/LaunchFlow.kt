package com.ainotebook.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.AlertDialog
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
    var introFinished by remember { mutableStateOf(false) }
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

    LaunchedEffect(reducedMotion) {
        delay(if (reducedMotion) 250 else 1900)
        introFinished = true
    }

    LaunchedEffect(introFinished, sessionLoading, isAuthed, stage) {
        if (introFinished && !sessionLoading && stage == LaunchStage.INTRO) {
            stage = if (isAuthed) LaunchStage.WORKSPACE else LaunchStage.LANDING
        }
    }

    LaunchedEffect(isAuthed) {
        if ((stage == LaunchStage.LANDING || stage == LaunchStage.AUTH) && isAuthed) {
            transitionTo(LaunchStage.WORKSPACE)
        } else if (stage == LaunchStage.WORKSPACE && !isAuthed) {
            transitionTo(LaunchStage.LANDING)
        }
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        when (stage) {
            LaunchStage.INTRO -> IntroScene(
                reducedMotion = reducedMotion,
                onSkip = { introFinished = true }
            )
            LaunchStage.LANDING -> NativeLanding(
                onSignUp = { scope.launch { authStartTab = Routes.SIGNUP; transitionTo(LaunchStage.AUTH) } },
                onSignIn = { scope.launch { authStartTab = Routes.LOGIN; transitionTo(LaunchStage.AUTH) } }
            )
            LaunchStage.AUTH -> {
                NativeLanding(
                    onSignUp = { authStartTab = Routes.SIGNUP },
                    onSignIn = { authStartTab = Routes.LOGIN }
                )
                AuthFlow(
                    factory = factory,
                    startRoute = authStartTab,
                    onBackToLanding = { scope.launch { transitionTo(LaunchStage.LANDING) } }
                )
            }
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
    var showGoogleNotice by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(horizontal = 28.dp, vertical = 30.dp)) {
        Column(
            modifier = Modifier.align(Alignment.Center).fillMaxWidth(),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Image(painterResource(R.drawable.official_logo), contentDescription = "Notely logo", modifier = Modifier.size(54.dp))
            Text("WELCOME TO NOTELY", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            Text("Your study space starts here.", color = MaterialTheme.colorScheme.onBackground, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
            Text("7 days free. Everything unlocked.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge)
            Surface(shape = RoundedCornerShape(999.dp), color = MaterialTheme.colorScheme.primary.copy(alpha = .10f), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = .28f))) {
                Text("  ✦  7-day free trial  ", modifier = Modifier.padding(horizontal = 7.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            }
            StudyNoteStack()
            Spacer(Modifier.height(2.dp))
            Button(onClick = onSignUp, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(999.dp), colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary)) {
                Text("Start free trial", fontWeight = FontWeight.SemiBold)
            }
            OutlinedButton(onClick = { showGoogleNotice = true }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(999.dp)) {
                Text("Continue with Google", color = MaterialTheme.colorScheme.onSurface)
            }
            TextButton(onClick = onSignIn, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text("Already have an account? Log in", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    if (showGoogleNotice) AlertDialog(
        onDismissRequest = { showGoogleNotice = false },
        title = { Text("Google sign-in isn't connected yet") },
        text = { Text("Use email for now. Google OAuth needs to be configured before this button can sign you in.") },
        confirmButton = { TextButton(onClick = { showGoogleNotice = false }) { Text("Got it") } }
    )
}

@Composable
private fun StudyNoteStack() {
    Box(Modifier.fillMaxWidth().height(128.dp), contentAlignment = Alignment.Center) {
        listOf(-9f, 7f, -2f).forEachIndexed { index, angle ->
            Surface(
                modifier = Modifier.width(208.dp).height(112.dp).graphicsLayer { rotationZ = angle; translationX = (index - 1) * 18f; translationY = (1 - index) * 3f },
                shape = RoundedCornerShape(15.dp),
                color = MaterialTheme.colorScheme.surface,
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Text("NOTELY", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                        Text("STUDY NOTE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Box(Modifier.size(17.dp).clip(RoundedCornerShape(5.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) { Text("✦", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelSmall) }
                    Box(Modifier.fillMaxWidth(.82f).height(4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = .12f)))
                    Box(Modifier.fillMaxWidth(.62f).height(4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.onSurface.copy(alpha = .09f)))
                }
            }
        }
    }
}
