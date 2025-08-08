# keep_alive.py

from fastapi import FastAPI
import uvicorn
import asyncio
from bot import main as bot_main

app = FastAPI()

@app.get("/")
async def root():
    return {"status": "OK"}

# Bot será iniciado assim que o FastAPI subir
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(bot_main())  # executa o bot no mesmo loop do FastAPI

if __name__ == "__main__":
    uvicorn.run("keep_alive:app", host="0.0.0.0", port=10000)
