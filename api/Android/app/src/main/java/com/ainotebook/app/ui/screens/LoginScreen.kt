package com.ainotebook.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Surface
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.ainotebook.app.ui.AuthViewModel
import com.ainotebook.app.ui.components.NotelyIcon
import com.ainotebook.app.ui.components.NotelyIconTrigger
import com.ainotebook.app.ui.theme.NotelyIndigo
import com.ainotebook.app.ui.theme.NotelyLine

@Composable
fun LoginScreen(vm: AuthViewModel, onLoggedIn: () -> Unit, onGoSignup: () -> Unit) {
    val state by vm.state.collectAsState()
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var googleNotice by remember { mutableStateOf(false) }
    LaunchedEffect(state.success) { if (state.success) onLoggedIn() }

    Column(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).imePadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Text("Welcome back", style = MaterialTheme.typography.headlineMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        Text("Log in to return to your notes, practice and plans.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = { googleNotice = true }, shape = RoundedCornerShape(999.dp), border = androidx.compose.foundation.BorderStroke(1.dp, NotelyLine), modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("Continue with Google", color = MaterialTheme.colorScheme.onSurface) }
        Text("OR CONTINUE WITH EMAIL", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        AuthField("Student email", identifier, { identifier = it; vm.clearError() }, KeyboardType.Email)
        AuthField("Password", password, { password = it; vm.clearError() }, KeyboardType.Password, true)
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Button(onClick = { vm.login(identifier, password) }, enabled = !state.loading, colors = ButtonDefaults.buttonColors(containerColor = NotelyIndigo), shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth().height(50.dp).padding(top = 4.dp)) {
            if (state.loading) NotelyIcon(name = "loading", trigger = NotelyIconTrigger.Loop, size = 18.dp, color = Color.White) else Text("Log in")
        }
        TextButton(onClick = onGoSignup, modifier = Modifier.padding(top = 14.dp)) { Text("New to Notely? Start your 7-day trial →", color = MaterialTheme.colorScheme.onSurface) }
        if (googleNotice) androidx.compose.material3.AlertDialog(onDismissRequest = { googleNotice = false }, title = { Text("Google sign-in isn’t connected yet") }, text = { Text("Use email for now. Google OAuth must be configured before this button can sign you in.") }, confirmButton = { TextButton(onClick = { googleNotice = false }) { Text("Got it") } })
        Text("Your notes stay private. We never use your coursework to train AI models.", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 36.dp))
        Text("Notely · Privacy · Terms · A study partner, not a shortcut.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 34.dp))
    }
}

@Composable
private fun AuthField(label: String, value: String, onValueChange: (String) -> Unit, keyboardType: KeyboardType, password: Boolean = false) {
    var passwordVisible by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(bottom = 15.dp),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = if (password && !passwordVisible) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        trailingIcon = if (password) ({ TextButton(onClick = { passwordVisible = !passwordVisible }) { Text(if (passwordVisible) "Hide" else "Show") } }) else null,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = NotelyIndigo, unfocusedBorderColor = NotelyLine)
    )
}
