import sys
import traceback
from aiohttp import web
from botbuilder.integration.aiohttp import CloudAdapter, ConfigurationBotFrameworkAuthentication
from bot import FoundryBot
from config import Config

config = Config()
adapter = CloudAdapter(ConfigurationBotFrameworkAuthentication(config))

async def on_error(context, error):
    print(f"[on_error] {error}", file=sys.stderr)
    traceback.print_exc()
    await context.send_activity("Sorry, something went wrong.")

adapter.on_turn_error = on_error
bot = FoundryBot()

async def messages(req: web.Request) -> web.Response:
    print(f"[{req.method}] Request received at /api/messages", flush=True)
    try:
        if "application/json" in req.headers.get("Content-Type", ""):
            body = await req.json()
            print(f"Incoming activity type: {body.get('type')}", flush=True)
        
        response = await adapter.process(req, bot)
        print(f"Request processed successfully with status {response.status}", flush=True)
        return response
    except Exception as e:
        print(f"Error processing request: {e}", flush=True)
        traceback.print_exc()
        raise

async def health(req: web.Request) -> web.Response:
    return web.json_response({"status": "healthy"})

app = web.Application()
app.router.add_post("/api/messages", messages)
app.router.add_get("/api/health", health)

if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=config.PORT)