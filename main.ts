/// <reference no-default-lib="true"/>
/// <reference lib="dom" />
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />

// Node modules
import net from 'node:net';
import {createSocket as createUDPSocket} from 'node:dgram';

import {globalConfig, platformAPI, setConfigFromEnv, vlessOverWSHandler, getVLESSConfig} from './edgetunnel.mjs';
import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';

/**
 * Portable function for creating a outbound TCP connections.
 * Has to be "async" because some platforms open TCP connection asynchronously.
 * 
 * @param {string} address The remote address to connect to.
 * @param {number} port The remote port to connect to.
 * @returns {object} The wrapped TCP connection, to be compatible with Cloudflare Workers
 */
platformAPI.connect = async (address, port) => {
	const socket = net.createConnection(port, address);

	let readableStreamCancel = false;
	const readableStream = new ReadableStream({
		start(controller) {
			socket.on('data', (data) => {
				if (readableStreamCancel) {
					return;
				}
				controller.enqueue(data);
			});
		
			socket.on('close', () => {
				socket.destroy();
				if (readableStreamCancel) {
					return;
				}
				controller.close();
			});
		},
	
		pull(controller) {
			// if ws can stop read if stream is full, we can implement backpressure
			// https://streams.spec.whatwg.org/#example-rs-push-backpressure
		},
		cancel(reason) {
			// 1. pipe WritableStream has error, this cancel will called, so ws handle server close into here
			// 2. if readableStream is cancel, all controller.close/enqueue need skip,
			// 3. but from testing controller.error still work even if readableStream is cancel
			if (readableStreamCancel) {
				return;
			}
			readableStreamCancel = true;
			socket.destroy();
		}
	});

	const onSocketCloses = new Promise((resolve, reject) => {
		socket.on('close', (err) => {
			if (err) {
				reject(socket.errored);
			} else {
				resolve();
			}
		});

		socket.on('error', (err) => {
			reject(err);
		});
	});

	return {
		// A ReadableStream Object
		readable: readableStream,
	
		// Contains functions to write to a TCP stream
		writable: {
			getWriter: () => {
				return {
					write: (data) => {
						socket.write(data);
					},
					releaseLock: () => {
						// console.log('Dummy writer.releaseLock()');
					}
				};
			}
		},

		// Handles socket close
		closed: onSocketCloses
	};
};

platformAPI.newWebSocket = (url) => new WebSocket(url);

platformAPI.associate = async (isIPv6) => {
	const UDPSocket = createUDPSocket(isIPv6 ? 'udp6' : 'udp4');
	return {
		send: (datagram, offset, length, port, address, sendDoneCallback) => {
			UDPSocket.send(datagram, offset, length, port, address, sendDoneCallback);
		},
		close: () => {
			UDPSocket.close();
		},
		onmessage: (handler) => {
			UDPSocket.on('message', handler);
		},
		onerror: (handler) => {
			UDPSocket.on('error', handler);
		}
	};
}

// Create an HTTP server
const handler = async (req: Request): Promise < Response > => {
	const upgrade = req.headers.get('upgrade') || '';

	if (upgrade.toLowerCase() == 'websocket') {
		// Attempt Vless handling
		const {
			socket: ws, // WebSocket instance
			response    // The upgrade response
		} = Deno.upgradeWebSocket(req);

		ws.onopen = () => {
			vlessOverWSHandler(ws, req.headers['sec-websocket-protocol'] || '');
		};
		return response;
	}

	const reqUrl = new URL(req.url);
	const hostname = reqUrl.hostname;
	const path = reqUrl.pathname;
	const path_config = '/' + globalConfig.userID;
	switch (path) {
		case path_config:
			return new Response(getVLESSConfig(hostname), {
				status: 200,
				headers: {
					'content-type': 'text/plain;charset=UTF-8',
				},
			});
		case '/':
			return new Response('Hello from the HTTP server!', {
				status: 200,
				headers: {
					'content-type': 'text/html; charset=utf-8',
				},
			});
		default:
			return new Response('Not found! (Code 404)', {
				status: 404
			});
	}
};

serve(handler, {
	port: 8080
});
