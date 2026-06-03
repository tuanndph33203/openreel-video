use std::process::Command;
use std::fs::OpenOptions;
use std::io::{Write, Seek, SeekFrom};
use serde_json::Value;
use rfd::FileDialog;

#[tauri::command]
fn run_ffmpeg(args: Vec<String>) -> Result<String, String> {
  let output = Command::new("ffmpeg")
    .args(&args)
    .output()
    .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

  if output.status.success() {
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
  } else {
    Err(String::from_utf8_lossy(&output.stderr).into_owned())
  }
}

#[tauri::command]
fn run_ffmpeg_binary(args: Vec<String>) -> Result<Vec<u8>, String> {
  let output = Command::new("ffmpeg")
    .args(&args)
    .output()
    .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

  if output.status.success() {
    Ok(output.stdout)
  } else {
    Err(String::from_utf8_lossy(&output.stderr).into_owned())
  }
}

#[tauri::command]
fn extract_metadata(path: String) -> Result<Value, String> {
  let output = Command::new("ffprobe")
    .args(&[
      "-v", "error",
      "-show_format",
      "-show_streams",
      "-of", "json",
      &path,
    ])
    .output()
    .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

  if output.status.success() {
    let json_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&json_str)
      .map_err(|e| format!("Failed to parse metadata JSON: {}", e))
  } else {
    Err(String::from_utf8_lossy(&output.stderr).into_owned())
  }
}

#[tauri::command]
fn generate_waveform(path: String, samples_per_second: u32) -> Result<Vec<f32>, String> {
  let output = Command::new("ffmpeg")
    .args(&[
      "-i", &path,
      "-f", "s16le",
      "-ac", "1",
      "-ar", &samples_per_second.to_string(),
      "-",
    ])
    .output()
    .map_err(|e| format!("Failed to extract audio: {}", e))?;

  if !output.status.success() {
    return Err(String::from_utf8_lossy(&output.stderr).into_owned());
  }

  let bytes = output.stdout;
  let mut samples = Vec::new();

  for chunk in bytes.chunks_exact(2) {
    let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
    let normalized = (sample.abs() as f32) / (i16::MAX as f32);
    samples.push(normalized);
  }

  Ok(samples)
}

#[tauri::command]
fn generate_thumbnail(path: String, time: f64, width: u32) -> Result<String, String> {
  let output = Command::new("ffmpeg")
    .args(&[
      "-ss", &time.to_string(),
      "-i", &path,
      "-vframes", "1",
      "-vf", &format!("scale={}:-1", width),
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-",
    ])
    .output()
    .map_err(|e| format!("Failed to extract frame: {}", e))?;

  if !output.status.success() {
    return Err(String::from_utf8_lossy(&output.stderr).into_owned());
  }

  use base64::{Engine as _, engine::general_purpose};
  let b64 = general_purpose::STANDARD.encode(&output.stdout);
  Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
fn extract_audio_as_wav(path: String, audio_track_index: u32) -> Result<Vec<u8>, String> {
  // Map audio_track_index to stream selection: 0:a:0, 0:a:1, etc.
  let stream_selector = format!("0:a:{}", audio_track_index);
  let output = Command::new("ffmpeg")
    .args(&[
      "-i", &path,
      "-map", &stream_selector,
      "-f", "wav",
      "-acodec", "pcm_s16le",
      "-",
    ])
    .output()
    .map_err(|e| format!("Failed to execute ffmpeg for audio extraction: {}", e))?;

  if !output.status.success() {
    // Try without explicit mapping (fallback for single audio track)
    let fallback = Command::new("ffmpeg")
      .args(&[
        "-i", &path,
        "-vn",
        "-f", "wav",
        "-acodec", "pcm_s16le",
        "-",
      ])
      .output()
      .map_err(|e| format!("FFmpeg fallback audio extraction failed: {}", e))?;

    if fallback.status.success() {
      return Ok(fallback.stdout);
    }
    return Err(String::from_utf8_lossy(&output.stderr).into_owned());
  }

  Ok(output.stdout)
}

#[tauri::command]
fn generate_proxy(input_path: String, output_path: String) -> Result<(), String> {
  let output = Command::new("ffmpeg")
    .args(&[
      "-i", &input_path,
      "-vf", "scale=-2:360",
      "-c:v", "libx264",
      "-crf", "28",
      "-preset", "veryfast",
      "-c:a", "aac",
      "-b:a", "128k",
      "-y",
      &output_path,
    ])
    .output()
    .map_err(|e| format!("Failed to execute ffmpeg for proxy generation: {}", e))?;

  if output.status.success() {
    Ok(())
  } else {
    Err(String::from_utf8_lossy(&output.stderr).into_owned())
  }
}

#[tauri::command]
fn write_export_chunk(path: String, chunk: Vec<u8>, position: u64) -> Result<(), String> {
  let mut file = OpenOptions::new()
    .create(true)
    .write(true)
    .open(&path)
    .map_err(|e| format!("Failed to open file for export: {}", e))?;

  file.seek(SeekFrom::Start(position))
    .map_err(|e| format!("Failed to seek in export file: {}", e))?;

  file.write_all(&chunk)
    .map_err(|e| format!("Failed to write chunk: {}", e))?;

  Ok(())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
  std::fs::write(&path, content)
    .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
  std::fs::read_to_string(&path)
    .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn read_file_chunk(path: String, offset: u64, length: usize) -> Result<Vec<u8>, String> {
  use std::fs::File;
  use std::io::Read;

  let mut file = File::open(&path).map_err(|e| e.to_string())?;
  file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;

  let mut buffer = vec![0; length];
  let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
  buffer.truncate(bytes_read);

  Ok(buffer)
}

#[tauri::command]
fn select_open_file(filters: Vec<String>) -> Result<Option<String>, String> {
  let mut dialog = FileDialog::new();
  if !filters.is_empty() {
    let filter_refs: Vec<&str> = filters.iter().map(|s| s.as_str()).collect();
    dialog = dialog.add_filter("Media Files", &filter_refs);
  }

  let res = dialog.pick_file()
    .map(|path| path.to_string_lossy().into_owned());

  Ok(res)
}

#[tauri::command]
fn select_save_file(suggested_name: String, extension: String) -> Result<Option<String>, String> {
  let res = FileDialog::new()
    .set_file_name(&suggested_name)
    .add_filter(&extension, &[&extension])
    .save_file()
    .map(|path| path.to_string_lossy().into_owned());

  Ok(res)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
static TTS_PROCESS: std::sync::OnceLock<std::sync::Mutex<Option<std::process::Child>>> = std::sync::OnceLock::new();

fn get_tts_process() -> &'static std::sync::Mutex<Option<std::process::Child>> {
  TTS_PROCESS.get_or_init(|| std::sync::Mutex::new(None))
}

pub fn run() {
  let app = tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      run_ffmpeg,
      run_ffmpeg_binary,
      extract_metadata,
      generate_waveform,
      generate_thumbnail,
      write_export_chunk,
      write_text_file,
      read_text_file,
      select_open_file,
      select_save_file,
      extract_audio_as_wav,
      read_file_chunk,
      generate_proxy
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Start the Python TTS server in a background thread
      std::thread::spawn(|| {
        let mut tts_dir = std::env::current_dir().unwrap_or_default();
        tts_dir.push("..");
        tts_dir.push("..");
        tts_dir.push("tts-server");
        
        if tts_dir.exists() {
          println!("[Tauri Setup] Starting TTS Server in directory: {:?}", tts_dir);
          let child = Command::new("python")
            .arg("main.py")
            .current_dir(&tts_dir)
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit())
            .spawn();
            
          match child {
            Ok(child_proc) => {
              println!("[Tauri Setup] TTS Server spawned successfully with PID: {}", child_proc.id());
              if let Ok(mut guard) = get_tts_process().lock() {
                *guard = Some(child_proc);
              }
            }
            Err(e) => {
              eprintln!("[Tauri Setup] Failed to spawn TTS Server: {}", e);
            }
          }
        } else {
          eprintln!("[Tauri Setup] TTS Server directory not found at: {:?}", tts_dir);
        }
      });

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|_app_handle, event| {
    if let tauri::RunEvent::Exit = event {
      if let Ok(mut guard) = get_tts_process().lock() {
        if let Some(mut child) = guard.take() {
          println!("[Tauri Exit] Killing TTS Server process...");
          let _ = child.kill();
        }
      }
    }
  });
}
