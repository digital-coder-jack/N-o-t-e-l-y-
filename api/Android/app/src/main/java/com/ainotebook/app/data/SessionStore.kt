package com.ainotebook.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val Context.dataStore by preferencesDataStore(name = "ai_notebook_session")

data class SessionAccount(
    val id: Int,
    val name: String,
    val email: String,
    val isCurrent: Boolean
)

@Serializable
private data class StoredAccount(
    val id: Int,
    val token: String,
    val user: User
)

/**
 * Stores active and additional account sessions in DataStore.
 * JWTs and the account-session registry are encrypted with an AES-GCM key
 * generated and held by Android Keystore. Existing plaintext JWTs are read
 * once for backwards compatibility and are encrypted on the next save.
 */
class SessionStore(private val context: Context) {

    companion object {
        private val TOKEN_KEY = stringPreferencesKey("ss_token")
        private val USER_KEY = stringPreferencesKey("ss_user")
        private val ACCOUNTS_KEY = stringPreferencesKey("notely_account_sessions_v1")
        private const val KEY_ALIAS = "notely_session_aes_v1"
        private const val ENCRYPTED_PREFIX = "enc:"
        private val json = Json { ignoreUnknownKeys = true }
    }

    val tokenFlow: Flow<String?> = context.dataStore.data.map { prefs ->
        decryptStored(prefs[TOKEN_KEY])
    }

    val userFlow: Flow<User?> = context.dataStore.data.map { prefs ->
        prefs[USER_KEY]?.let { runCatching { json.decodeFromString<User>(it) }.getOrNull() }
    }

    suspend fun token(): String? = decryptStored(context.dataStore.data.first()[TOKEN_KEY])

    suspend fun save(token: String, user: User) {
        context.dataStore.edit { prefs ->
            val sessions = readStoredAccounts(prefs[ACCOUNTS_KEY]).toMutableList()
            val previousToken = decryptStored(prefs[TOKEN_KEY])
            val previousUser = prefs[USER_KEY]?.let { runCatching { json.decodeFromString<User>(it) }.getOrNull() }
            if (!previousToken.isNullOrBlank() && previousUser != null && previousUser.id != user.id) {
                sessions.removeAll { it.id == previousUser.id }
                sessions.add(0, StoredAccount(previousUser.id, previousToken, previousUser))
            }
            sessions.removeAll { it.id == user.id }
            sessions.add(0, StoredAccount(user.id, token, user))
            prefs[TOKEN_KEY] = encryptStored(token)
            prefs[USER_KEY] = json.encodeToString(User.serializer(), user)
            prefs[ACCOUNTS_KEY] = encryptStored(json.encodeToString(sessions.take(8)))
        }
    }

    suspend fun saveUser(user: User) {
        context.dataStore.edit { prefs ->
            prefs[USER_KEY] = json.encodeToString(User.serializer(), user)
            val token = decryptStored(prefs[TOKEN_KEY])
            if (!token.isNullOrBlank()) {
                val sessions = readStoredAccounts(prefs[ACCOUNTS_KEY]).toMutableList()
                sessions.removeAll { it.id == user.id }
                sessions.add(0, StoredAccount(user.id, token, user))
                prefs[ACCOUNTS_KEY] = encryptStored(json.encodeToString(sessions.take(8)))
            }
        }
    }

    suspend fun accounts(): List<SessionAccount> {
        val prefs = context.dataStore.data.first()
        val activeToken = decryptStored(prefs[TOKEN_KEY])
        val activeUser = prefs[USER_KEY]?.let { runCatching { json.decodeFromString<User>(it) }.getOrNull() }
        val sessions = readStoredAccounts(prefs[ACCOUNTS_KEY]).toMutableList()
        if (!activeToken.isNullOrBlank() && activeUser != null) {
            sessions.removeAll { it.id == activeUser.id }
            sessions.add(0, StoredAccount(activeUser.id, activeToken, activeUser))
        }
        return sessions.distinctBy { it.id }.map {
            SessionAccount(it.id, it.user.name, it.user.email, it.id == activeUser?.id)
        }
    }

    suspend fun switchAccount(userId: Int): Boolean {
        var switched = false
        context.dataStore.edit { prefs ->
            val sessions = readStoredAccounts(prefs[ACCOUNTS_KEY]).toMutableList()
            val currentToken = decryptStored(prefs[TOKEN_KEY])
            val currentUser = prefs[USER_KEY]?.let { runCatching { json.decodeFromString<User>(it) }.getOrNull() }
            if (!currentToken.isNullOrBlank() && currentUser != null) {
                sessions.removeAll { it.id == currentUser.id }
                sessions.add(0, StoredAccount(currentUser.id, currentToken, currentUser))
            }
            val target = sessions.firstOrNull { it.id == userId } ?: return@edit
            prefs[TOKEN_KEY] = encryptStored(target.token)
            prefs[USER_KEY] = json.encodeToString(User.serializer(), target.user)
            prefs[ACCOUNTS_KEY] = encryptStored(json.encodeToString(sessions.take(8)))
            switched = true
        }
        return switched
    }

    /** Preserve the current account in the switcher, then return to auth flow. */
    suspend fun beginAddAccount() {
        context.dataStore.edit { prefs ->
            val token = decryptStored(prefs[TOKEN_KEY])
            val user = prefs[USER_KEY]?.let { runCatching { json.decodeFromString<User>(it) }.getOrNull() }
            val sessions = readStoredAccounts(prefs[ACCOUNTS_KEY]).toMutableList()
            if (!token.isNullOrBlank() && user != null) {
                sessions.removeAll { it.id == user.id }
                sessions.add(0, StoredAccount(user.id, token, user))
                prefs[ACCOUNTS_KEY] = encryptStored(json.encodeToString(sessions.take(8)))
            }
            prefs.remove(TOKEN_KEY)
            prefs.remove(USER_KEY)
        }
    }

    suspend fun removeAccount(userId: Int) {
        context.dataStore.edit { prefs ->
            val sessions = readStoredAccounts(prefs[ACCOUNTS_KEY]).filterNot { it.id == userId }
            prefs[ACCOUNTS_KEY] = encryptStored(json.encodeToString(sessions))
            val currentUser = prefs[USER_KEY]?.let { runCatching { json.decodeFromString<User>(it) }.getOrNull() }
            if (currentUser?.id == userId) {
                prefs.remove(TOKEN_KEY)
                prefs.remove(USER_KEY)
            }
        }
    }

    /** Logout clears only the active session; saved account sessions remain switchable. */
    suspend fun clear(preserveCurrent: Boolean = true) {
        context.dataStore.edit { prefs ->
            val token = decryptStored(prefs[TOKEN_KEY])
            val user = prefs[USER_KEY]?.let { runCatching { json.decodeFromString<User>(it) }.getOrNull() }
            if (preserveCurrent && !token.isNullOrBlank() && user != null) {
                val sessions = readStoredAccounts(prefs[ACCOUNTS_KEY]).toMutableList()
                sessions.removeAll { it.id == user.id }
                sessions.add(0, StoredAccount(user.id, token, user))
                prefs[ACCOUNTS_KEY] = encryptStored(json.encodeToString(sessions.take(8)))
            }
            prefs.remove(TOKEN_KEY)
            prefs.remove(USER_KEY)
        }
    }

    private fun readStoredAccounts(value: String?): List<StoredAccount> {
        val plain = decryptStored(value) ?: return emptyList()
        return runCatching { json.decodeFromString<List<StoredAccount>>(plain) }.getOrDefault(emptyList())
    }

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    private fun encryptStored(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
        val combined = cipher.iv + encrypted
        return ENCRYPTED_PREFIX + Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decryptStored(value: String?): String? {
        if (value.isNullOrBlank()) return null
        if (!value.startsWith(ENCRYPTED_PREFIX)) return value // legacy plaintext migration
        return runCatching {
            val combined = Base64.decode(value.removePrefix(ENCRYPTED_PREFIX), Base64.NO_WRAP)
            val iv = combined.copyOfRange(0, 12)
            val ciphertext = combined.copyOfRange(12, combined.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
        }.getOrNull()
    }
}
