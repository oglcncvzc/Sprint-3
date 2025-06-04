import asyncio
import json

import websockets
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.legacy.server import WebSocketServerProtocol

HOST = "us-central1-aiplatform.googleapis.com"
SERVICE_URL = f"wss://{HOST}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"

DEBUG = True  # Debug modunu açtım

# Token'ı burada saklıyoruz
GOOGLE_ACCESS_TOKEN = "Token"

async def proxy_task(
    client_websocket: WebSocketCommonProtocol, server_websocket: WebSocketCommonProtocol
) -> None:
    """
    Forwards messages from one WebSocket connection to another.

    Args:
        client_websocket: The WebSocket connection from which to receive messages.
        server_websocket: The WebSocket connection to which to send messages.
    """
    try:
        async for message in client_websocket:
            try:
                data = json.loads(message)
                if DEBUG:
                    print("Client -> Server: ", data)
                await server_websocket.send(json.dumps(data))
            except Exception as e:
                print(f"Error processing message: {e}")
    except websockets.exceptions.ConnectionClosed:
        print("Client connection closed")
    finally:
        try:
            await server_websocket.close()
        except:
            pass


async def create_proxy(
    client_websocket: WebSocketCommonProtocol, bearer_token: str
) -> None:
    """
    Establishes a WebSocket connection to the server and creates two tasks for
    bidirectional message forwarding between the client and the server.

    Args:
        client_websocket: The WebSocket connection of the client.
        bearer_token: The bearer token for authentication with the server.
    """
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {bearer_token}",
        }

        if DEBUG:
            print("Connecting to server with token:", bearer_token[:10] + "...")

        async with websockets.connect(
            SERVICE_URL, 
            additional_headers=headers,
            ping_interval=None  # Ping'i devre dışı bırak
        ) as server_websocket:
            if DEBUG:
                print("Server connection established")

            client_to_server_task = asyncio.create_task(
                proxy_task(client_websocket, server_websocket)
            )
            server_to_client_task = asyncio.create_task(
                proxy_task(server_websocket, client_websocket)
            )
            
            try:
                await asyncio.gather(client_to_server_task, server_to_client_task)
            except Exception as e:
                print(f"Error in proxy tasks: {e}")
    except Exception as e:
        print(f"Error creating proxy: {e}")
        try:
            await client_websocket.close()
        except:
            pass


async def handle_client(client_websocket: WebSocketServerProtocol) -> None:
    """
    Handles a new client connection, expecting the first message to contain a bearer token.
    Establishes a proxy connection to the server upon successful authentication.

    Args:
        client_websocket: The WebSocket connection of the client.
    """
    print("New client connection...")
    try:
        # Wait for the first message from the client
        auth_message = await asyncio.wait_for(client_websocket.recv(), timeout=5.0)
        auth_data = json.loads(auth_message)

        if DEBUG:
            print("Received auth message:", auth_data)

        # Her zaman varsayılan token'ı kullan
        bearer_token = GOOGLE_ACCESS_TOKEN
        if DEBUG:
            print("Using token:", bearer_token[:10] + "...")

        await create_proxy(client_websocket, bearer_token)
    except asyncio.TimeoutError:
        print("Timeout waiting for auth message")
        await client_websocket.close(code=1008, reason="Timeout waiting for auth")
    except Exception as e:
        print(f"Error handling client: {e}")
        try:
            await client_websocket.close()
        except:
            pass


async def main() -> None:
    """
    Starts the WebSocket server and listens for incoming client connections.
    """
    async with websockets.serve(handle_client, "0.0.0.0", 8765):
        print("Running websocket server 0.0.0.0:8765...")
        # Run forever
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
