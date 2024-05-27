import { serveFile } from "jsr:@std/http/file-server";

const clients = new Map();

const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    console.log("req.url:", req.url);

    if (path === '/ws') {
        console.log("WebSocket connection requested");
        const { socket, response } = Deno.upgradeWebSocket(req);

        socket.onopen = () => {
            console.log("WebSocket connection opened");
            clients.set(socket, {});
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log("Received message:", message);
            handleWebSocketMessage(socket, message);
        };

        socket.onclose = () => {
            console.log("WebSocket connection closed");
            clients.delete(socket);
        };

        socket.onerror = (error) => {
            console.error("WebSocket error:", error);
            socket.close();
        };

        return response;
    }

    if (path === "/") {
        return serveFile(req, "./index.html");
    }
    return new Response(null, { status: 404 });
};

const handleWebSocketMessage = (socket, message) => {
    if (message.offer) {
        message.type = 'offer';
    } else if (message.answer) {
        message.type = 'answer';
    } else if (message.candidate) {
        message.type = 'candidate';
    } else {
        console.error("Unknown message type:", message);
        return;
    }
    broadcastMessage(socket, message);
};

const broadcastMessage = (senderSocket, message) => {
    for (const [socket, _] of clients.entries()) {
        if (socket !== senderSocket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }
};

const cert = await Deno.readTextFile("./cert.pem");
const key = await Deno.readTextFile("./key.pem");
const port = 443;
const options = {
    hostname: "0.0.0.0",
    port: port,
    cert: cert,
    key: key,
};
console.log(`HTTPS server running. Access it at: https://localhost:${port}/`);
Deno.serve(options, handler);

const wsPort = 3000;
console.log(`WebSocket server running on ws://localhost:${wsPort}/ws`);
Deno.serve({ hostname: "0.0.0.0", port: wsPort }, handler);


//#region http redirect
const redirectToHttps = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const httpsUrl = `https://${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
    return new Response(null, {
        status: 301,
        headers: {
            "Location": httpsUrl,
        },
    });
};

const httpPort = 80;

console.log(`HTTP server running. Redirecting all requests to HTTPS.`);
Deno.serve({ hostname: "0.0.0.0", port: httpPort }, redirectToHttps);
//#endregion
