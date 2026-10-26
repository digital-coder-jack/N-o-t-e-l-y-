package com.ainotebook.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
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
    LaunchedEffect(state.success) { if (state.success) onLoggedIn() }

    Column(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Text("Notely", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(48.dp))
        Text("YOUR STUDENT WORKSPACE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Welcome back", style = MaterialTheme.typography.displaySmall, modifier = Modifier.padding(top = 16.dp))
        Text("A calmer place to pick up where you left off.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        OutlinedButton(onClick = onLoggedIn, shape = RoundedCornerShape(9.dp), border = androidx.compose.foundation.BorderStroke(1.dp, NotelyLine), modifier = Modifier.padding(top = 26.dp)) { Text("Continue with Google", color = MaterialTheme.colorScheme.onSurface) }
        Text("or with email", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 28.dp, bottom = 18.dp))
        AuthField("Student email", identifier, { identifier = it; vm.clearError() }, KeyboardType.Email)
        AuthField("Password", password, { password = it; vm.clearError() }, KeyboardType.Password, true)
        Text("☑  Keep me signed in", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 14.dp))
        Button(onClick = { vm.login(identifier, password) }, enabled = !state.loading, colors = ButtonDefaults.buttonColors(containerColor = NotelyIndigo), shape = RoundedCornerShape(8.dp), modifier = Modifier.padding(top = 24.dp)) {
            if (state.loading) NotelyIcon(name = "loading", trigger = NotelyIconTrigger.Loop, size = 18.dp, color = Color.White) else Text("Sign in to Notely")
        }
        TextButton(onClick = onGoSignup, modifier = Modifier.padding(top = 14.dp)) { Text("New here?  Create an account →", color = MaterialTheme.colorScheme.onSurface) }
        Text("Your notes stay private. We never use your coursework to train AI models.", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 36.dp))
        Text("Notely · Privacy · Terms · A study partner, not a shortcut.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 34.dp))
    }
}

@Composable
private fun AuthField(label: String, value: String, onValueChange: (String) -> Unit, keyboardType: KeyboardType, password: Boolean = false) {
    OutlinedTextField(value = value, onValueChange = onValueChange, label = { Text(label) }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(bottom = 15.dp), keyboardOptions = KeyboardOptions(keyboardType = keyboardType), visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None, shape = RoundedCornerShape(8.dp), colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = NotelyIndigo, unfocusedBorderColor = NotelyLine))
}
