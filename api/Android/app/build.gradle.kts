plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.ainotebook.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ainotebook.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 3
        versionName = "1.3"

        vectorDrawables {
            useSupportLibrary = true
        }

        // Default backend URL. Override with the `apiBaseUrl` Gradle property
        // (e.g. -PapiBaseUrl=https://your-backend.example.com) or per build
        // type below. Falls back to the current production deployment.
        val apiBaseUrl = (project.findProperty("apiBaseUrl") as String?)
            ?: "https://study-sphere-ai-mwlq.vercel.app"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
    }

    buildTypes {
        debug {
            // Point debug builds at your local/dev backend if you like.
            val debugApiBaseUrl = (project.findProperty("apiBaseUrlDebug") as String?)
                ?: (project.findProperty("apiBaseUrl") as String?)
                ?: "https://study-sphere-ai-mwlq.vercel.app"
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

// Extract the supplied icon JSON archive into native assets when the user builds Android.
val notelyLottieSource = rootProject.file("../../frontend/assets/lottie")
val generatedNotelyLottieAssets = layout.buildDirectory.dir("generated/notelyLottieAssets")
tasks.register<Copy>("extractNotelyLottieAssets") {
    from(notelyLottieSource) { include("*.json") }
    into(generatedNotelyLottieAssets)
    eachFile { path = "lottie/${name}" }
    includeEmptyDirs = false
}
android.sourceSets.getByName("main").assets.srcDir(generatedNotelyLottieAssets)
tasks.named("preBuild").configure { dependsOn("extractNotelyLottieAssets") }

dependencies {
    implementation("com.airbnb.android:lottie-compose:6.6.2")
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.3")
    implementation("androidx.activity:activity-compose:1.9.0")

    // Android 12+ Splash Screen API (backwards compatible)
    implementation("androidx.core:core-splashscreen:1.0.1")

    // Compose
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.animation:animation-graphics")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // Networking
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")

    // JSON
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // DataStore for token persistence
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
