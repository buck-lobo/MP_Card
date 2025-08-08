from fastapi import FastAPI
from bot import start_bot
import uvicorn

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    print("🚀 Iniciando bot...")
    start_bot()

@app.get("/")
def read_root():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10000)
