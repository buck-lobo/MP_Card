from fastapi import FastAPI
import threading
import asyncio
from bot import main as start_bot  # sua função main atual do bot.py

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "Bot está rodando."}

def run_bot():
    asyncio.run(start_bot())  # Executa seu bot na thread principal do bot

# Iniciar o bot em uma thread separada
threading.Thread(target=run_bot).start()
