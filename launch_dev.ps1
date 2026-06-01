$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
Write-Host "Launching openreel-video dev server with Tauri..."
pnpm tauri:dev
