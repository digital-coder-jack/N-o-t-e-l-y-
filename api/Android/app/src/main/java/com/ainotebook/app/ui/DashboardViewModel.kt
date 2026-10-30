package com.ainotebook.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ainotebook.app.data.Chat
import com.ainotebook.app.data.Repository
import com.ainotebook.app.data.SavedNote
import com.ainotebook.app.data.Stats
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DashboardUiState(
    val loading: Boolean = true,
    val stats: Stats? = null,
    val notes: List<SavedNote> = emptyList(),
    val chats: List<Chat> = emptyList(),
    val error: String? = null
)

class DashboardViewModel(private val repo: Repository) : ViewModel() {
    private val _state = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            val stats = runCatching { repo.stats() }.getOrNull()
            val notesResult = runCatching { repo.listSavedNotes() }
            val chatsResult = runCatching { repo.listChats() }
            _state.value = DashboardUiState(
                loading = false,
                stats = stats,
                notes = notesResult.getOrDefault(emptyList()),
                chats = chatsResult.getOrDefault(stats?.recent_chats ?: emptyList()),
                error = if (stats == null && notesResult.isFailure && chatsResult.isFailure) {
                    "Could not load your recent work. Check your connection and try again."
                } else null
            )
        }
    }
}