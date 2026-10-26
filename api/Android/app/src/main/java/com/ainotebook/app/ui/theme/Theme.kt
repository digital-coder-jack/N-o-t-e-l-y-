package com.ainotebook.app.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import com.ainotebook.app.data.AccentTone

/** Platform counterpart to the web spacing/radius/motion tokens. */
object NotelyTokens {
    val space1 = 4.dp
    val space2 = 8.dp
    val space3 = 12.dp
    val space4 = 16.dp
    val space5 = 24.dp
    val space6 = 32.dp
    val space7 = 48.dp
    val space8 = 64.dp
    val radiusSmall = 8.dp
    val radiusMedium = 12.dp
    val radiusCard = 16.dp
    val radiusLarge = 24.dp
    val radiusPill = 999.dp
    const val motionFast = 120
    const val motionBase = 200
    const val motionEnter = 320
    const val motionFeature = 600
}

// Semantic palette mirrored from frontend/css/notely-theme.css.
val NotelyIndigo = Color(0xFF1F6FB5)
val NotelyInk = Color(0xFF17233C)
val NotelyMuted = Color(0xFF53647E)
val NotelyBackground = Color(0xFFF4F7FC)
val NotelySurface = Color(0xFFFFFFFF)
val NotelyLavender = Color(0xFFEAF3FA)
val NotelyLine = Color(0xFFD8E2EF)
val NotelyGreen = Color(0xFF08785D)
val NotelyAmber = Color(0xFF875400)

val BrandOrange = Color(0xFF875400)
val BrandPink = Color(0xFFC64F7B)
val BrandViolet = Color(0xFF7B70E8)
val BrandBlue = Color(0xFF1F6FB5)
val Indigo = NotelyIndigo
val Violet = BrandViolet
val Cyan = Color(0xFF8FE8F8)

val SpaceBg = NotelyBackground
val SpaceSurface = NotelySurface
val SpaceCard = NotelyLavender
val AssistantBubble = NotelyLavender
val HairlineOutline = NotelyLine
val MutedText = NotelyMuted
val LightBg = NotelyBackground
val LightSurface = NotelySurface
val LightCard = NotelyLavender
val LightHairline = NotelyLine
val LightMuted = NotelyMuted

private val DarkColors = darkColorScheme(
    primary = Cyan,
    onPrimary = Color(0xFF060C1C),
    primaryContainer = Color(0xFF163044),
    onPrimaryContainer = Color(0xFFF4F6FF),
    secondary = Color(0xFF1F6FB5),
    onSecondary = Color.White,
    tertiary = Color(0xFFFFD48A),
    onTertiary = Color(0xFF17233C),
    background = Color(0xFF060C1C),
    onBackground = Color(0xFFF4F6FF),
    surface = Color(0xFF0D162B),
    onSurface = Color(0xFFF4F6FF),
    surfaceVariant = Color(0xFF172442),
    onSurfaceVariant = Color(0xFFC8D2E9),
    outline = Color(0xFF3A4A67),
    error = Color(0xFFFF7E9D),
    onError = Color(0xFF060C1C)
)

private val LightColors = lightColorScheme(
    primary = NotelyIndigo,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDF7FB),
    onPrimaryContainer = Color(0xFF12314A),
    secondary = Color(0xFF1F6FB5),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE6F0FB),
    onSecondaryContainer = NotelyInk,
    tertiary = NotelyAmber,
    onTertiary = Color.White,
    background = NotelyBackground,
    onBackground = NotelyInk,
    surface = NotelySurface,
    onSurface = NotelyInk,
    surfaceVariant = NotelyLavender,
    onSurfaceVariant = NotelyMuted,
    outline = NotelyLine,
    outlineVariant = NotelyLine,
    error = Color(0xFFB4234B),
    onError = Color.White
)

private val AppTypography = Typography().run {
    copy(
        displaySmall = displaySmall.copy(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, letterSpacing = (-0.6).sp),
        headlineLarge = headlineLarge.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal),
        headlineMedium = headlineMedium.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, letterSpacing = (-0.5).sp),
        headlineSmall = headlineSmall.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, letterSpacing = (-0.3).sp),
        titleLarge = titleLarge.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold),
        bodyLarge = bodyLarge.copy(lineHeight = 24.sp),
        bodyMedium = bodyMedium.copy(lineHeight = 22.sp),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.SemiBold)
    )
}

@Composable
fun AiNotebookTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    accentTone: AccentTone = AccentTone.INDIGO,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val colors = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors.withAccent(accentTone, dark = true)
        else -> LightColors.withAccent(accentTone, dark = false)
    }
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.setDecorFitsSystemWindows(window, false)
            val lightIcons = colors.background.luminance() > 0.5f
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = lightIcons
            controller.isAppearanceLightNavigationBars = lightIcons
        }
    }
    MaterialTheme(colorScheme = colors, typography = AppTypography, content = content)
}

private fun androidx.compose.material3.ColorScheme.withAccent(
    tone: AccentTone,
    dark: Boolean
): androidx.compose.material3.ColorScheme {
    val primary = when (tone) {
        AccentTone.INDIGO -> NotelyIndigo
        AccentTone.CYAN -> NotelyGreen
        AccentTone.VIOLET -> NotelyIndigo
        AccentTone.SUNSET -> NotelyAmber
    }
    return copy(
        primary = primary,
        primaryContainer = primary.copy(alpha = if (dark) 0.24f else 0.14f),
        onPrimaryContainer = if (dark) Color.White else NotelyInk,
        secondary = if (tone == AccentTone.SUNSET) BrandPink else NotelyGreen,
        tertiary = NotelyAmber
    )
}
