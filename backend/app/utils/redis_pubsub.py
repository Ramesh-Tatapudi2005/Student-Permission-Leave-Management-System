import json
import asyncio
import redis.asyncio as aioredis
from app.utils.sockets import manager

REDIS_URL = "redis://redis:6379/0"
CHANNEL_NAME = "campus_announcements"

class RedisPubSubManager:
    def __init__(self):
        self.redis = None
        self.pubsub = None

    async def connect(self):
        """Initializes the Redis connection."""
        self.redis = aioredis.from_url(REDIS_URL, decode_responses=True)

    async def publish_announcement(self, payload: dict):
        """Publishes an announcement payload to the Redis Channel."""
        if not self.redis:
            await self.connect()
        # Convert dictionary data to a JSON string for transmission
        await self.redis.publish(CHANNEL_NAME, json.dumps(payload))
        print(f"[Redis Pub] Broadcasted announcement ID {payload.get('announcement_id')}")

    async def start_listener(self):
        """Background loop listening for incoming Redis messages."""
        if not self.redis:
            await self.connect()
        
        self.pubsub = self.redis.pubsub()
        await self.pubsub.subscribe(CHANNEL_NAME)
        print(f"[Redis Sub] Subscribed to '{CHANNEL_NAME}' channel.")

        try:
            while True:
                # Read incoming messages from the channel
                message = await self.pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message["type"] == "message":
                    payload = json.loads(message["data"])
                    print(f"[Redis Sub] Received message: {payload.get('title')}")
                    
                    # Pass the payload directly to our WebSocket switcher matrix
                    await manager.broadcast_announcement(payload)
                
                # Yield control back to the event loop momentarily
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            print("[Redis Sub] Listener background task stopped.")
        except Exception as e:
            print(f"[Redis Sub] Error in listener loop: {e}")
        finally:
            await self.pubsub.unsubscribe(CHANNEL_NAME)

# Global instance
redis_pubsub = RedisPubSubManager()