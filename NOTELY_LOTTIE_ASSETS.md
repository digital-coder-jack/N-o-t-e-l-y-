# Notely Lottie icon assets

Extract the nine original JSON files from the supplied `notely-lottie-icons.zip` into this exact repository directory:

`frontend/assets/lottie/`

Required filenames (keep the names and JSON contents unchanged):
- `trash-v2.json`
- `copy.json`
- `archive.json`
- `book.json`
- `notification-v3.json`
- `loading-v2.json`
- `info.json`
- `help.json`
- `alert-circle.json`

The web component fetches them from `/assets/lottie/`. The Android Gradle task copies the same files into generated app assets at `lottie/` when you build Android locally. Do not use `Scene.mp4`; the icon system uses only these JSON files.
