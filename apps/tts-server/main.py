import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Khởi tạo ứng dụng FastAPI
app = FastAPI(title="OpenReel VieNeu TTS Server")

# Cấu hình CORS để Frontend (Vite) có thể gọi API mà không bị chặn
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Thử tải mô hình VieNeu-TTS vào bộ nhớ
print("Loading VieNeu-TTS model, please wait...")
try:
    from vieneu import Vieneu
    tts = Vieneu()
    print("[SUCCESS] VieNeu-TTS is ready!")
except ImportError:
    print("[ERROR] vieneu not installed.")
    tts = None
except Exception as e:
    print(f"[ERROR] Error initializing VieNeu-TTS: {e}")
    tts = None

class TTSRequest(BaseModel):
    text: str
    voice: str = "default"
    speed: float = 1.0

@app.post("/tts")
async def generate_speech(req: TTSRequest):
    if not tts:
        raise HTTPException(status_code=500, detail="Mô hình VieNeu-TTS chưa được tải thành công.")
    
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Văn bản không được để trống.")
    
    try:
        # Giải quyết giọng nói preset được chọn
        voice_dict = None
        if req.voice and req.voice != "default":
            try:
                voice_dict = tts.get_preset_voice(req.voice)
            except ValueError as e:
                # Use a safe ASCII string to avoid UnicodeEncodeError on Windows cmd
                print(f"[WARNING] Preset voice '{req.voice}' not found, falling back to default. Error: {e}".encode("ascii", "ignore").decode())
        
        # Gọi hàm tạo giọng nói
        audio = tts.infer(text=req.text, voice=voice_dict)
        
        # Lưu ra file tạm rồi đọc dưới dạng bytes để trả về cho Frontend
        temp_file = f"temp_output_{os.getpid()}.wav"
        tts.save(audio, temp_file)
        
        with open(temp_file, "rb") as f:
            wav_bytes = f.read()
            
        # Dọn dẹp file tạm
        if os.path.exists(temp_file):
            os.remove(temp_file)
            
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        if "No valid speech tokens" in str(e):
            safe_text = req.text.encode("ascii", "ignore").decode()
            print(f"[WARNING] No valid speech tokens for text: '{safe_text}'. Returning silence.")
            import wave
            temp_file = f"temp_silent_{os.getpid()}.wav"
            with wave.open(temp_file, 'w') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2) # 16-bit
                wf.setframerate(24000)
                wf.writeframes(b'\x00' * int(24000 * 0.1 * 2)) # 0.1s silence
            with open(temp_file, "rb") as f:
                wav_bytes = f.read()
            if os.path.exists(temp_file):
                os.remove(temp_file)
            return Response(content=wav_bytes, media_type="audio/wav")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("Starting API on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
