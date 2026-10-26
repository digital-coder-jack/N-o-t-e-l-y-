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
import com.ainotebook.app.ui.theme.NotelyBackground
import com.ainotebook.app.ui.theme.NotelyGreen
import com.ainotebook.app.ui.theme.NotelyIndigo
import com.ainotebook.app.ui.theme.NotelyLine
import com.ainotebook.app.ui.theme.NotelyMuted

@Composable
fun SignupScreen(vm: AuthViewModel, onSignedUp: () -> Unit, onGoLogin: () -> Unit) {
    val state by vm.state.collectAsState()
    var name by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    LaunchedEffect(state.success) { if (state.success) onSignedUp() }

    Column(
        modifier = Modifier.fillMaxSize().background(NotelyBackground).statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Text("Notely", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(42.dp))
        Text("YOUR STUDENT WORKSPACE", style = MaterialTheme.typography.labelSmall, color = NotelyMuted)
        Text("Create your account", style = MaterialTheme.typography.displaySmall, modifier = Modifier.padding(top = 16.dp))
        Text("One workspace for everything you’re learning.", style = MaterialTheme.typography.bodyLarge, color = NotelyMuted, modifier = Modifier.padding(top = 8.dp))
        OutlinedButton(onClick = onSignedUp, shape = RoundedCornerShape(9.dp), border = androidx.compose.foundation.BorderStroke(1.dp, NotelyLine), modifier = Modifier.padding(top = 26.dp)) { Text("Sign up with Google", color = MaterialTheme.colorScheme.onSurface) }
        Text("OR SIGN UP WITH EMAIL", style = MaterialTheme.typography.labelMedium, color = NotelyMuted, modifier = Modifier.padding(top = 28.dp, bottom = 18.dp))
        AuthField("Full name", name, { name = it; vm.clearError() })
        AuthField("Student email", email, { email = it; vm.clearError() }, KeyboardType.Email)
        AuthField("Create password", password, { password = it; vm.clearError() }, KeyboardType.Password, true)
        Text("Use at least 8 characters, including a number.", style = MaterialTheme.typography.labelMedium, color = NotelyMuted)
        Text("✓  Strong password", style = MaterialTheme.typography.bodyMedium, color = NotelyGreen, modifier = Modifier.padding(top = 18.dp))
        Text("☑  I agree to the Terms of Service and Privacy Policy.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 22.dp))
        Button(onClick = { vm.signup(name, username, email, password, confirm) }, enabled = !state.loading, colors = ButtonDefaults.buttonColors(containerColor = NotelyIndigo), shape = RoundedCornerShape(8.dp), modifier = Modifier.padding(top = 22.dp)) {
            if (state.loading) NotelyIcon(name = "loading", trigger = NotelyIconTrigger.Loop, size = 18.dp, color = Color.White) else Text("Create account")
        }
        TextButton(onClick = onGoLogin, modifier = Modifier.padding(top = 12.dp)) { Text("Already have an account?  Sign in →", color = MaterialTheme.colorScheme.onSurface) }
        Text("Notely · Privacy · Terms · A study partner, not a shortcut.", style = MaterialTheme.typography.labelSmall, color = NotelyMuted, modifier = Modifier.padding(top = 36.dp))
    }
}

@Composable
private fun AuthField(label: String, value: String, onValueChange: (String) -> Unit, keyboardType: KeyboardType = KeyboardType.Text, password: Boolean = false) {
    OutlinedTextField(value = value, onValueChange = onValueChange, label = { Text(label) }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(bottom = 15.dp), keyboardOptions = KeyboardOptions(keyboardType = keyboardType), visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None, shape = RoundedCornerShape(8.dp), colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = NotelyIndigo, unfocusedBorderColor = NotelyLine))
}
