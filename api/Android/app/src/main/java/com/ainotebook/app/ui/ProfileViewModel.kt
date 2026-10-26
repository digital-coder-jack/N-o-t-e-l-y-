package com.ainotebook.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ainotebook.app.data.Repository
import com.ainotebook.app.data.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ProfileUiState(
    val user: User? = null,
    val loading: Boolean = false,
    val message: String? = null,
    val error: String? = null,
    val loggedOut: Boolean = false
)

class ProfileViewModel(private val repo: Repository) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(user = repo.me())
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    fun updateName(name: String) {
        if (name.isBlank()) {
            _state.value = _state.value.copy(error = "Please enter your name.")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, message = null, error = null)
            try {
                val u = repo.updateProfile(name.trim())
                _state.value = _state.value.copy(loading = false, user = u, message = "Profile updated.")
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message)
            }
        }
    }

    fun changePassword(current: String, new: String) {
        if (new.length < 8) {
            _state.value = _state.value.copy(error = "Use at least 8 characters for your new password.")
            return
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, message = null, error = null)
            try {
                val msg = repo.changePassword(current, new)
                _state.value = _state.value.copy(loading = false, message = msg)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message)
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repo.logout()
            _state.value = _state.value.copy(loggedOut = true)
        }
    }

    fun clearMessages() {
        _state.value = _state.value.copy(message = null, error = null)
    }
}
