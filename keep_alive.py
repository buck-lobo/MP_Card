# keep_alive.py

from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio
from bot import start_bot

shutdown_event = asyncio.Event()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await start_bot()  # inicia o bot em segundo plano
    try:
        yield
        await shutdown_event.wait()  # mantém o app vivo
    finally:
        print("🔴 Encerrando aplicação")

app = FastAPI(lifespan=lifespan)

@app.get("/")
def root():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=10000)
