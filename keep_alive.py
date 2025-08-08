from fastapi import FastAPI
from contextlib import asynccontextmanager
from bot import start_bot

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Iniciando bot no startup do FastAPI...")
    start_bot()
    yield
    print("🛑 Finalizando bot no shutdown do FastAPI...")

app = FastAPI(lifespan=lifespan)

@app.get("/")
def read_root():
    return {"status": "ok"}
