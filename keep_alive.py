# keep_alive.py

from fastapi import FastAPI
import uvicorn
import asyncio
import threading
from bot import main as bot_main

app = FastAPI()

@app.get("/")
async def root():
    return {"status": "ok"}

def run_web():
    uvicorn.run("keep_alive:app", host="0.0.0.0", port=10000)

if __name__ == "__main__":
    threading.Thread(target=run_web, daemon=True).start()
    asyncio.run(bot_main())
