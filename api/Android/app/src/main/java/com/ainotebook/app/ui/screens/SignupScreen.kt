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
import com.ainotebook.app.ui.theme.NotelyGreen
import com.ainotebook.app.ui.theme.NotelyIndigo
import com.ainotebook.app.ui.theme.NotelyLine

@Composable
fun SignupScreen(vm: AuthViewModel, onSignedUp: () -> Unit, onGoLogin: () -> Unit) {
    val state by vm.state.collectAsState()
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var googleNotice by remember { mutableStateOf(false) }
    LaunchedEffect(state.success) { if (state.success) onSignedUp() }

    Column(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).imePadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Text("Start your free trial", style = MaterialTheme.typography.headlineMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        Text("Seven days. Everything unlocked. Your work stays yours.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = { googleNotice = true }, shape = RoundedCornerShape(999.dp), border = androidx.compose.foundation.BorderStroke(1.dp, NotelyLine), modifier = Modifier.fillMaxWidth().height(46.dp)) { Text("Continue with Google", color = MaterialTheme.colorScheme.onSurface) }
        Text("OR USE EMAIL", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
        AuthField("Full name", name, { name = it; vm.clearError() })
        AuthField("Student email", email, { email = it; vm.clearError() }, KeyboardType.Email)
        AuthField("Create password", password, { password = it; vm.clearError() }, KeyboardType.Password, true)
        Text(if (password.length < 8) "Use at least 8 characters, including a number." else "Password strength: " + if (password.length >= 12 && password.any { it.isDigit() }) "Strong" else "Good start", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        AuthField("Confirm password", confirm, { confirm = it; vm.clearError() }, KeyboardType.Password, true)
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Text("7-day trial starts when your account is created", style = MaterialTheme.typography.bodyMedium, color = NotelyGreen, modifier = Modifier.padding(top = 18.dp))
        Text("☑  I agree to the Terms of Service and Privacy Policy.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 22.dp))
        Button(onClick = { vm.signup(name, "", email, password, confirm) }, enabled = !state.loading, colors = ButtonDefaults.buttonColors(containerColor = NotelyIndigo), shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth().height(50.dp).padding(top = 4.dp)) {
            if (state.loading) NotelyIcon(name = "loading", trigger = NotelyIconTrigger.Loop, size = 18.dp, color = Color.White) else Text("Start free trial")
        }
        TextButton(onClick = onGoLogin, modifier = Modifier.padding(top = 12.dp)) { Text("Already have an account?  Sign in →", color = MaterialTheme.colorScheme.onSurface) }
        Text("Notely · Privacy · Terms · A study partner, not a shortcut.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 36.dp))
    }
}

@Composable
private fun AuthField(label: String, value: String, onValueChange: (String) -> Unit, keyboardType: KeyboardType = KeyboardType.Text, password: Boolean = false) {
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
