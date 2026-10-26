package com.ainotebook.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ainotebook.app.data.Repository
import com.ainotebook.app.data.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AuthUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false
)

class AuthViewModel(private val repo: Repository) : ViewModel() {

    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    val userFlow = repo.userFlow

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    private fun run(block: suspend () -> User) {
        viewModelScope.launch {
            _state.value = AuthUiState(loading = true)
            try {
                block()
                _state.value = AuthUiState(success = true)
            } catch (e: Exception) {
                _state.value = AuthUiState(error = friendly(e))
            }
        }
    }

    fun login(identifier: String, password: String) {
        if (identifier.isBlank() || password.isBlank()) {
            _state.value = AuthUiState(error = "Please enter your email/username and password.")
            return
        }
        run { repo.login(identifier.trim(), password) }
    }

   fun signup(
    name: String, username: String, email: String,
    password: String, confirm: String
) {
    when {
        name.isBlank() || username.isBlank() || email.isBlank() ->
            _state.value = AuthUiState(error = "Please fill in all fields.")
        !email.contains("@") || !email.contains(".") ->  // ← ADD THIS
            _state.value = AuthUiState(error = "Please enter a valid email address.")
        password.length < 8 ->
            _state.value = AuthUiState(error = "Use at least 8 characters.")
        password != confirm ->
            _state.value = AuthUiState(error = "Passwords do not match.")
        else -> run {
            repo.signup(name.trim(), username.trim(), email.trim(), password, confirm)
        }
    }
}

  private fun friendly(e: Exception): String {
    if (e is retrofit2.HttpException) {
        val code = e.code()
        val detail = try {
            val body = e.response()?.errorBody()?.string()
            if (!body.isNullOrBlank()) {
                org.json.JSONObject(body).optString("detail", null)
            } else null
        } catch (ignored: Exception) { null }

        return when (code) {
            400 -> detail ?: "Invalid request. Please check your details."
            401 -> detail ?: "Invalid credentials."
            409 -> detail ?: "That account already exists."
            422 -> "Please check all fields and try again."
            429 -> "Too many requests. Please slow down."
            500 -> "Server error. Please try again later."
            else -> detail ?: "Request failed ($code)."
        }
    }
    
    return when {
        e.message?.contains("Unable to resolve host", true) == true ||
        e.message?.contains("timeout", true) == true ||
        e.message?.contains("failed to connect", true) == true ->
            "Cannot reach the server. Check your connection."
        else -> e.message ?: "Something went wrong."
    }
}
}

