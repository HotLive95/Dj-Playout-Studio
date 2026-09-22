import asyncio, json, os, sys
import websockets

MP3 = "/app/backend/tests/_bc_test.mp3"
FAKE_PORT = 8899
RELAY = "wss://dj-playout-studio.preview.emergentagent.com/api/broadcast/ws"

received = bytearray()
handshake_ok = {"pwd": False, "headers": b""}


async def fake_shoutcast(reader, writer):
    # Emulate radio.co SHOUTcast v1 source: read password, send OK2, read icy
    # headers, then collect the streamed MP3 body.
    pwd_line = await reader.readuntil(b"\r\n")
    handshake_ok["pwd"] = pwd_line.strip() == b"testpass"
    writer.write(b"OK2\r\nicy-caps:11\r\n\r\n")
    await writer.drain()
    headers = await reader.readuntil(b"\r\n\r\n")
    handshake_ok["headers"] = headers
    while True:
        data = await reader.read(65536)
        if not data:
            break
        received.extend(data)


async def main():
    server = await asyncio.start_server(fake_shoutcast, "127.0.0.1", FAKE_PORT)
    async with server:
        mp3 = open(MP3, "rb").read()
        async with websockets.connect(RELAY, open_timeout=15, max_size=None) as ws:
            await ws.send(json.dumps({"host": "127.0.0.1", "port": FAKE_PORT, "password": "testpass", "name": "Test", "bitrate": 128}))
            msg = json.loads(await asyncio.wait_for(ws.recv(), 15))
            print("relay said:", msg)
            if msg.get("type") != "live":
                print("FAIL: relay did not go live")
                return
            for i in range(0, len(mp3), 8192):
                await ws.send(mp3[i:i + 8192])
            await asyncio.sleep(1.5)
            await ws.close()
        await asyncio.sleep(0.5)
    print("password_ok:", handshake_ok["pwd"])
    print("icy_headers:", handshake_ok["headers"][:120])
    print("sent_bytes:", len(mp3), "received_bytes:", len(received))
    print("bytes_match:", bytes(received) == mp3)


asyncio.run(main())
