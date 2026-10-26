package com.ainotebook.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/* =========================================================================
 *  Data models that mirror the Notely FastAPI backend contracts.
 * ========================================================================= */

@Serializable
data class User(
    val id: Int = 0,
    val name: String = "",
    val username: String? = null,
    val email: String = "",
    val created_at: String? = null,
    val last_login: String? = null,
    val trial_started_at: String? = null,
    val trial_ends_at: String? = null,
    val trial_days_left: Int? = null,
    val trial_active: Boolean = true,
    val trial_expired: Boolean = false,
    val is_trial: Boolean = false
)

@Serializable
data class AuthResponse(
    val token: String = "",
    val user: User = User()
)

@Serializable
data class MeResponse(val user: User = User())

@Serializable
data class MessageResponse(val message: String = "")

/* ---------- Auth request bodies ---------- */
@Serializable
data class LoginRequest(val identifier: String, val password: String)

@Serializable
data class SignupRequest(
    val name: String,
    val username: String,
    val email: String,
    val password: String,
    val confirm_password: String
)

@Serializable
data class ProfileRequest(val name: String)

@Serializable
data class ChangePasswordRequest(
    val current_password: String,
    val new_password: String
)

/* ---------- Chat ---------- */
@Serializable
data class Chat(
    val id: Int = 0,
    val title: String = "New Chat",
    val created_at: String? = null,
    val updated_at: String? = null
)

@Serializable
data class ChatResponse(val chat: Chat = Chat())

@Serializable
data class ChatListResponse(val chats: List<Chat> = emptyList())

@Serializable
data class ChatMessage(
    val id: Int = 0,
    val role: String = "user",
    val content: String = "",
    val created_at: String? = null
)

@Serializable
data class ChatDetailResponse(
    val chat: Chat = Chat(),
    val messages: List<ChatMessage> = emptyList()
)

@Serializable
data class NewChatRequest(val title: String? = null)

@Serializable
data class RenameChatRequest(val title: String)

@Serializable
data class StreamRequest(
    val content: String,
    val model: String? = null // optional per-message provider override
)

/* ---------- AI model selection (matches /api/ai/models + /api/ai/model) ---------- */
@Serializable
data class AiProvider(
    val id: String = "",
    @SerialName("label")
    val name: String = "",          // ← backend sends "label" not "name", this fixes it
    val configured: Boolean = false
)

@Serializable
data class ModelsResponse(
    val selected: String = "default",
    val options: List<String> = listOf("default", "pro", "pro_max"),
    val providers: List<AiProvider> = emptyList(),
    @SerialName("display_names")
    val displayNames: Map<String, String> = emptyMap()  // ← ADD THIS
)

@Serializable
data class SetModelRequest(val model: String)

@Serializable
data class SetModelResponse(val selected: String = "auto")

/* ---------- Dashboard stats ---------- */
@Serializable
data class Stats(
    val total_chats: Int = 0,
    val total_messages: Int = 0,
    val ai_responses: Int = 0,
    val notes: Int = 0,
    val quizzes: Int = 0,
    val recent_chats: List<Chat> = emptyList(),
    val daily_activity: List<DailyActivity> = emptyList()
)

@Serializable
data class DailyActivity(
    val day: String = "",
    val count: Int = 0
)

/* ---------- Saved notes shared with the web workspace ---------- */
@Serializable
data class SavedNote(
    val id: Int = 0,
    val topic: String = "Untitled note",
    val content: String = "",
    val created_at: String? = null,
    val pinned: Int = 0,
    val favorite: Int = 0,
    val archived: Int = 0,
    val deleted: Int = 0
)

@Serializable
data class SavedNotesResponse(val notes: List<SavedNote> = emptyList())

@Serializable
data class NoteSaveRequest(val topic: String, val content: String)

@Serializable
data class NoteSaveResponse(val note: SavedNote = SavedNote())

/* ---------- Study tools ---------- */
@Serializable
data class TopicRequest(val topic: String)

@Serializable
data class QuizRequest(val topic: String, val num_questions: Int = 5)

@Serializable
data class FlashRequest(val topic: String, val num_cards: Int = 8)

@Serializable
data class PlanRequest(val goal: String, val days: Int = 7)

@Serializable
data class TextRequest(val text: String)

@Serializable
data class QuestionRequest(val question: String)

@Serializable
data class NotesResponse(
    val id: Int = 0,
    val topic: String = "",
    val content: String = ""
)

@Serializable
data class QuizQuestion(
    val question: String = "",
    val options: List<String> = emptyList(),
    val answer: Int = 0,
    val explanation: String = ""
)

@Serializable
data class QuizGenResponse(
    val id: Int = 0,
    val topic: String = "",
    val questions: List<QuizQuestion> = emptyList()
)

@Serializable
data class Flashcard(
    val front: String = "",
    val back: String = ""
)

@Serializable
data class FlashResponse(
    val topic: String = "",
    val cards: List<Flashcard> = emptyList()
)

@Serializable
data class PlanResponse(
    val goal: String = "",
    val days: Int = 0,
    val content: String = ""
)

@Serializable
data class SummaryResponse(val summary: String = "")

@Serializable
data class HomeworkResponse(val answer: String = "")
