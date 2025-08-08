# keep_alive.py

from fastapi import FastAPI
import uvicorn
import asyncio
from bot import main as bot_main

app = FastAPI()

@app.get("/")
async def root():
    return {"status": "Bot está ativo ✅"}

@app.on_event("startup")
async def start_bot():
    asyncio.create_task(bot_main())  # correto: usa o loop já rodando

if __name__ == "__main__":
    uvicorn.run("keep_alive:app", host="0.0.0.0", port=10000)
