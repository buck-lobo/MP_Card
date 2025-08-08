from fastapi import FastAPI
import threading

app = FastAPI()

@app.get("/")
def read_root():
    return {"status":"Bot ativo"}

def start_bot():
    application.run_polling()

threading.Thread(target=start_bot).start()