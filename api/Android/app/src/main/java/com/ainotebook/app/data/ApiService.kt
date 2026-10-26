package com.ainotebook.app.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * Retrofit declaration of the Notely REST API.
 * (Streaming chat is handled separately via raw OkHttp in [StreamClient].)
 */
interface ApiService {

    /* ---------- Auth ---------- */
    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("api/auth/signup")
    suspend fun signup(@Body body: SignupRequest): AuthResponse

    @GET("api/auth/me")
    suspend fun me(): MeResponse

    @PUT("api/auth/profile")
    suspend fun updateProfile(@Body body: ProfileRequest): MeResponse

    @PUT("api/auth/change-password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): MessageResponse

    @DELETE("api/auth/account")
    suspend fun deleteAccount(): MessageResponse

    /* ---------- Chats (CRUD ONLY) ----------
     *
     * SINGLE SOURCE OF TRUTH:
     * Sending a message and receiving an AI reply is STREAMING-ONLY and lives
     * exclusively in [StreamClient] via  POST api/chats/{id}/stream  (SSE).
     *
     * The backend exposes NO REST "send message" endpoint. Do NOT add a
     * `@POST("api/chats/{id}")` here — that route only accepts GET/PUT/DELETE
     * server-side and would fail with 405 Method Not Allowed / HTML fallback.
     * Keep these declarations limited to chat metadata CRUD.
     */
    @GET("api/chats")
    suspend fun listChats(): ChatListResponse

    @POST("api/chats")
    suspend fun newChat(@Body body: NewChatRequest): ChatResponse

    @GET("api/chats/{id}")
    suspend fun getChat(@Path("id") id: Int): ChatDetailResponse

    @PUT("api/chats/{id}")
    suspend fun renameChat(@Path("id") id: Int, @Body body: RenameChatRequest): ChatResponse

    @DELETE("api/chats/{id}")
    suspend fun deleteChat(@Path("id") id: Int): Map<String, Boolean>

    /* ---------- AI model selection ---------- */
    @GET("api/ai/models")
    suspend fun aiModels(): ModelsResponse

    @PUT("api/ai/model")
    suspend fun setAiModel(@Body body: SetModelRequest): SetModelResponse

    /* ---------- Dashboard ---------- */
    @GET("api/stats")
    suspend fun stats(): Stats

    /* ---------- Saved notes (shared with web workspace) ---------- */
    @GET("api/tools/notes")
    suspend fun listSavedNotes(): SavedNotesResponse

    @POST("api/notes")
    suspend fun createSavedNote(@Body body: NoteSaveRequest): NoteSaveResponse

    @PUT("api/notes/{id}")
    suspend fun updateSavedNote(@Path("id") id: Int, @Body body: NoteSaveRequest): NoteSaveResponse

    @DELETE("api/tools/notes/{id}")
    suspend fun deleteSavedNote(@Path("id") id: Int): Map<String, Boolean>

    /* ---------- Study tools ---------- */
    @POST("api/tools/notes")
    suspend fun generateNotes(@Body body: TopicRequest): NotesResponse

    @POST("api/tools/quiz")
    suspend fun generateQuiz(@Body body: QuizRequest): QuizGenResponse

    @POST("api/tools/flashcards")
    suspend fun generateFlashcards(@Body body: FlashRequest): FlashResponse

    @POST("api/tools/plan")
    suspend fun generatePlan(@Body body: PlanRequest): PlanResponse

    @POST("api/tools/summarize")
    suspend fun summarize(@Body body: TextRequest): SummaryResponse

    @POST("api/tools/homework")
    suspend fun homework(@Body body: QuestionRequest): HomeworkResponse
}
