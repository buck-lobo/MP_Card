# keep_alive_firebase.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio, os
from bot import start_bot

shutdown_event = asyncio.Event()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Iniciar o bot em segundo plano
    bot_task = asyncio.create_task(start_bot())
    try:
        yield
        await shutdown_event.wait()
    finally:
        print("🔴 Encerrando aplicação")
        bot_task.cancel()
        try:
            await bot_task
        except asyncio.CancelledError:
            pass

app = FastAPI(lifespan=lifespan)

@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {
        "status": "ok", 
        "service": "Bot de Cartão de Crédito",
        "database": "Firebase Firestore",
        "version": "2.0"
    }

@app.api_route("/healthz", methods=["GET", "HEAD"])
def healthz():
    return {"ok": True, "firebase": True}

@app.api_route("/status", methods=["GET", "HEAD"])
def status():
    return {
        "bot": "running",
        "database": "firebase_firestore",
        "features": [
            "gastos_parcelados",
            "pagamentos",
            "interface_otimizada",
            "modo_escuta",
            "relatorios_admin"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "10000"))   # ⚠️ Render injeta PORT
    uvicorn.run(app, host="0.0.0.0", port=port)

