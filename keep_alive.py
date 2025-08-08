# keep_alive.py

from fastapi import FastAPI
from contextlib import asynccontextmanager
from bot import start_bot  # importa a função que inicia o bot

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicia o bot assim que o FastAPI levantar
    await start_bot()
    yield  # mantém o app vivo enquanto o Render quiser
    # Você poderia colocar lógica para shutdown aqui, se quiser

app = FastAPI(lifespan=lifespan)

@app.get("/")
def root():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=10000)
