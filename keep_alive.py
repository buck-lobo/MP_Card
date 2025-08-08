# keep_alive.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio, os
from bot import start_bot

shutdown_event = asyncio.Event()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await start_bot()  # inicia o bot em segundo plano
    try:
        yield
        await shutdown_event.wait()
    finally:
        print("🔴 Encerrando aplicação")

app = FastAPI(lifespan=lifespan)

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/healthz")
def healthz():
    return {"ok": True}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "10000"))   # ⚠️ Render injeta PORT
    uvicorn.run(app, host="0.0.0.0", port=port)
