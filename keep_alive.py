from fastapi import FastApi
import threading

app = FastApi()

@app.get("/")
def read_root():
    return {"status":"Bot ativo"}

def start_bot():
    import bot
    bot.main()

threading.Thread(target=start_bot).start()