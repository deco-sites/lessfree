/// <reference no-default-lib="true"/>
/// <reference lib="dom" />
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />

import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';

const handler = async (req: Request): Promise < Response > => {
    // 如果用户 ID 有效，继续执行
    const upgrade = req.headers.get('upgrade') || '';

    // 如果请求头不是 websocket，返回普通 HTTP 响应
    if (upgrade.toLowerCase() != 'websocket') {
        console.log('not websocket request header get upgrade is ' + upgrade);
        return new Response('WTF2', {
            status: 200,
            headers: {
                'content-type': 'application/json; charset=utf-8',
            },
        });
    }

    const {
        socket, // WebSocket 实例
        response // WebSocket 响应
    } = Deno.upgradeWebSocket(req); // 升级 HTTP 连接为 WebSocket 连接
    socket.onmessage = (msg) => {
        socket.send(msg.data);
    }

    return response; // 返回 WebSocket 响应
};
console.log('Start!!!')

serve(handler, {
    port: 8080,
    hostname: '0.0.0.0'
});
