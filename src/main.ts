import * as winston from "winston";
import * as onvif from 'node-onvif';
import * as WebSocket from 'websocket';
import * as http from 'http';
import * as fs from 'fs';
import * as net from "net";
// import * as ping from 'ping';
import { onvifDiscover } from "./OnvifDiscover";
import { NetworkOnvifDevice } from "./NetworkOnvifDevice";
import { OnvifServicePtz } from "../node_modules/node-onvif/lib/modules/service-ptz";
import config from './config';

type IPAddress = string;
type MacAddress = string;

// interface Device {
// 	lastPing: number;
// 	name: string;
// 	mac: MacAddress;
// 	connected: boolean;
// 	instance: onvif.OnvifDevice;
// };
interface DeviceMap {
	[index: string]: NetworkOnvifDevice;
};

interface Message {
	method:string;
	params:any;
	seq:number;
};

interface AbsSocket {
	send(msg:string|Buffer):void;
};
//type Alias = { num: number }

process.chdir(__dirname);

const PROCESS_ERR_UNIX_SOCKET_FILE = 5;
const KEEPALIVE_MS = 1000 * 60 * 3;

var devices : DeviceMap = {};
var discoveryTimer = null;
var listening = false;

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
      //
      // - Write to all logs with level `info` and below to `combined.log` 
      // - Write all logs error (and below) to `error.log`.
      //
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' })
    ]
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
// 
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        //format: winston.format.simple()
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
    }));
}


(function main() {
	let shutdown = (v?:number) => {
		//graceful shutdown
		let rv = destroyUnixSocket();
		if(typeof v == 'undefined' || v==null) v = 0;
		process.exit((rv?1:0)|v);
	}
	process.on("SIGINT", function () {
		shutdown();
	});
	
	process.on('SIGTERM', function() {
		shutdown();
	});
	
	process.on('SIGHUP', () => {
		// rescan network
		if(discoveryTimer) {
			clearTimeout(discoveryTimer);
			discoveryTimer = null;
		}
		discovery();
	});

	process.on('beforeExit', function() {
		shutdown();
	});

	// check if we're root
	if(process.geteuid() != 0) {
		logger.error("Must be started as root user");
		shutdown(1);
	}

	// switch to unpriveledged user
	try {
		process.setegid(config.processGroup);
		process.setuid(config.processUser);
	} catch(e) {
		logger.emerg("Unable to change to unpriviledged user and group "+config.processUser + "/"+ config.processGroup);
		shutdown(1);
	}

	// write pid file
	try {
		let v = String(process.pid);
		fs.writeFileSync(config.pidFile,v+"\n");
	} catch(e) {
		logger.error("Unable to write pid file "+ config.pidFile);
		shutdown(1);
	}
	
	// start the onvif camera discovery thread
	discovery();
    
})();

function listen() {
	if(listening) return;
	listening = true;
	// Unix domain socket server
	if(!destroyUnixSocket()) {
		logger.error("Unable to delete " + config.socket + ". Unable to start");
		process.exit(PROCESS_ERR_UNIX_SOCKET_FILE);
	}
	let uds_server = net.createServer(onUnixSocketConnect)
		.on('error', (err) => {
			throw err;
			/* if (e.code === 'EADDRINUSE') {
				logger.info('Address in use, retrying...');
				setTimeout(() => {
				server.close();
				server.listen(PORT, HOST);
				}, 1000);
			}
		*/
		});
	uds_server.listen(config.socket, () => {
		logger.info('Unix socket server listening on ' + uds_server.address());
	});
	// fs.chmod(config.socket,0o777, (err)=> {
	// 	if(err) throw err;
	// });

	if(config.httpEnabled) {
		// http server
		var http_server = http.createServer(httpServerRequest);
		http_server.listen(config.httpPort, function() {
			logger.info("HTTP server listening on port " + config.httpPort);
		});
		
		// websocket server
		var wsserver = new WebSocket.server({
			httpServer: http_server,
		});
		wsserver.on('request', wsServerRequest);
	}
}

function destroyUnixSocket() {
	try {
		if(fs.existsSync(config.socket)) {
			fs.unlinkSync(config.socket);
		}
		return true;
	} catch(err) {
		return false;
	}
}

function removePidFile() {
	try {
		if(fs.existsSync(config.pidFile)) {
			fs.unlinkSync(config.pidFile);
		}
		return true;
	} catch(err) {
		return false;
	}
}

function handleMessage(connection:AbsSocket, message : Message) {
	var method = message['method'];
	var params = message['params'];
	try {
		switch(method) {
			case 'listDevices':
				listDevices(connection,message);
				break;
			case 'listProfiles':
				getProfileList(connection,message);
				break;
			case 'connect':
				connect(connection, message);
				break;
			case 'fetchSnapshot':
				fetchSnapshot(connection, message);
				break;
			case 'ptzMove':
				ptzMove(connection, message);
				break;
			case 'ptzStop':
				ptzStop(connection, message);
				break;
			case 'getPresets':
				getPresets(connection, message);
				break;
			case 'gotoPreset':
				gotoPreset(connection, message);
				break;
			case 'setPreset':
				setPreset(connection, message);
				break;
			case 'gotoHome':
				gotoHome(connection, message);
				break;
			case 'setHome':
				setHome(connection, message);
				break;
			case 'reboot':
				reboot(connection, message);
				break;
			default:
				logger.warn('unhandled method "' + method + '"');
		}
	} catch(err) {
		sendError(connection, message, 'Internal server error');
		logger.warn(err.message);
		console.log(err);
	}
}

function onUnixSocketConnect(sock:any) {
	logger.info("Unix Socket client connected");
	sock.send = (msg) => sock.write(msg + "\n");
	sock.setEncoding('utf8');

    sock.on('end', () => {
        logger.info('Unix Socket client disconnected');
	});

	sock.on('error',(e)=>{
		logger.error(e.message);
	});

	sock.on('data', (msg) => {
		logger.debug("data received: " + msg.trim());
		let data: any = null;
		try {
			if(msg) {
				data = JSON.parse(msg);
			} 
		} catch(e) {
			logger.error("Domain socket: unparsable message received");
			return;
		}
		if(data)
			//handleMessage(sock, {method: "listDevices", params: null});
			handleMessage(sock, data);
	});
}

function httpServerRequest(req, res) {
	var path = req.url.replace(/\?.*$/, '');
	if(path.match(/\.{2,}/) || path.match(/[^a-zA-Z\d\_\-\.\/]/)) {
		httpServerResponse404(req.url, res);
		return;
	}
	if(path === '/') {
		path = '/index.html';
	}
	var fpath = './html' + path;
	fs.readFile(fpath, 'utf-8', function(err, data){
		if(err) {
			httpServerResponse404(req.url, res);
			return;
		} else {
			var ctype = getContentType(fpath);
			res.writeHead(200, {'Content-Type': ctype});
			res.write(data);
			res.end();
			logger.info('HTTP : 200 OK : ' + req.url);
		}
	});
}

function getContentType(fpath) {
	var ext = fpath.split('.').pop().toLowerCase();
	if(ext.match(/^(html|htm)$/)) {
		return 'text/html';
	} else if(ext.match(/^(jpeg|jpg)$/)) {
		return 'image/jpeg';
	} else if(ext.match(/^(png|gif)$/)) {
		return 'image/' + ext;
	} else if(ext === 'css') {
		return 'text/css';
	} else if(ext === 'js') {
		return 'text/javascript';
	} else if(ext === 'woff2') {
		return 'application/font-woff';
	} else if(ext === 'woff') {
		return 'application/font-woff';
	} else if(ext === 'ttf') {
		return 'application/font-ttf';
	} else if(ext === 'svg') {
		return 'image/svg+xml';
	} else if(ext === 'eot') {
		return 'application/vnd.ms-fontobject';
	} else if(ext === 'oft') {
		return 'application/x-font-otf';
	} else {
		return 'application/octet-stream';
	}
}

function httpServerResponse404(url, res) {
	res.writeHead(404, {'Content-Type': 'text/plain'});
	res.write('404 Not Found: ' + url);
	res.end();
	logger.info('HTTP : 404 Not Found : ' + url);
}

function wsServerRequest(request) {
	var conn = request.accept(null, request.origin);
	conn.on("message", (message) => {
		if(message.type !== 'utf8') {
			return;
		}
		var data = JSON.parse(message.utf8Data);
		handleMessage(conn,data);
	});

	conn.on("close", function(message) {

	});
	conn.on("error", function(error) {
		logger.error(error);
	});
};


function discovery() {
	logger.debug("Starting network discovery");
	let replace = (device) => {
		device.lastPing = Date.now();
		devices[device.address] = device;
	}
	onvifDiscover().then(
		(results) => {
			results.forEach((device)=>{
				if(!devices[device.address]) {
					//device.lastPing = Date.now();
					//devices[device.address] = device;
					logger.info("New camera "+device.name+" found at "+device.address);
					//console.log(JSON.stringify(device));
					replace(device);
				} else {
					let d:NetworkOnvifDevice = devices[device.address];
					if(d.urn !== device.urn) {
						// new device at address
						logger.warn("Device",d.urn,' replaced by ',device.urn,' at address ',device.address);
						//devices[device.address] = device;
						replace(device);
					} else {
						d.lastPing = Date.now();
					}
				}
			});
			//logger.debug(JSON.stringify(devices));
			if(!listening) {
				listen();
			}
			discoveryTimer = setTimeout(discovery,config.discoveryTime);
		}, 
		(err) => {
			logger.error("onvifDiscover error: " + err.message);
			discoveryTimer = setTimeout(discovery,config.discoveryTime);
		}
	)
	.catch((e) => {
		console.log(e);
		console.log(e.message);
		throw e;
	});
}

function listDevices(conn:AbsSocket,msg:Message) {
	var devs = {};
	for(var addr in devices) {
		let d:NetworkOnvifDevice = devices[addr];
		devs[addr] = {
			name: d.name,
			address: d.address
		}
	}
	conn.send(JSON.stringify({'id': 'listDevices', 'seq':msg.seq, 'result': devs}));
}

// function pingCheck() {
// 	var ap = [];
// 	for(var ip in devices) {
// 		ap.push(ping.promise.probe(ip, { timeout: 3 }));
// 	}
// 	Promise.all(ap).then((resArray) => {
// 		/**
// 		 * Parsed response
// 		 * @typedef {object} PingResponse
// 		 * @param {string} host - The input IP address or HOST
// 		 * @param {string} numeric_host - Target IP address
// 		 * @param {boolean} alive - True for existed host
// 		 * @param {string} output - Raw stdout from system ping
// 		 * @param {number} time - Time (float) in ms for first successful ping response
// 		 * @param {string} min - Minimum time for collection records
// 		 * @param {string} max - Maximum time for collection records
// 		 * @param {string} avg - Average time for collection records
// 		 * @param {string} stddev - Standard deviation time for collected records
// 		 */
// 		for(var i=0; i<resArray.length; i++) {
// 			let r = resArray[i];
// 			if(r.alive)
// 				continue;
// 			devices[r.host].lastPing = Date.now();
// 		}
// 		discoveryTimer = setTimeout(pingCheck,KEEPALIVE_MS);
// 	});
// }

/**
 * 
 * @param conn client socket connection
 * @param msg client connect message with username and password
 * @param msg.params.user Username
 * @param msg.params.pass Password
 */
function connect(conn:AbsSocket, msg:Message):void {
	var params = msg.params;
	var device = devices[params.address];
	if(!device) {
		var res = {'id': 'connect', 'seq':msg.seq, 'error': 'The specified device is not found: ' + params.address};
		conn.send(JSON.stringify(res));
		return;
	}
	if(params.user) {
		device.instance.setAuth(params.user, params.pass);
	}
	device.instance.init((error, result) => {
		var res = {'id': 'connect', 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			res['result'] = result;
			device.connected = true;
			//{"id":"connect","result":{"Manufacturer":"","Model":"IPD-E36Y0701-BS","FirmwareVersion":"V1.04.10-190222","SerialNumber":"071D3E200144","HardwareId":"1.0"}}
		}
		conn.send(JSON.stringify(res));
	});
}

// For Debug --------------------------------------------
//var total_size = 0;
//var start_time = 0;
//var total_frame = 0;
// ------------------------------------------------------

function fetchSnapshot(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	// For Debug --------------------------------------------
	//if(start_time === 0) {
	//	start_time = Date.now();
	//}
	// ------------------------------------------------------
	var device = devices[params.address];
	if(!device) {
		var res = {'id': 'fetchSnapshot', 'seq': msg.seq, 'error': 'The specified device is not found: ' + params.address};
		conn.send(JSON.stringify(res));
		return;
	}
	device.instance.fetchSnapshot((error, result) => {
		var res = {'id': 'fetchSnapshot', 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			var ct = result['headers']['content-type'];
			var buffer = result['body'];
			var b64 = buffer.toString('base64');
			var uri = 'data:' + ct + ';base64,' + b64;
			res['result'] = uri;

			// For Debug --------------------------------------------
			/*
			total_size += parseInt(result['headers']['content-length'], 10);
			var duration = Date.now() - start_time;
			var bps = total_size * 1000 / duration;
			var kbps = parseInt(bps / 1000);
			total_frame ++;
			var fps = Math.round(total_frame * 1000 / duration);
			logger.info(kbps + ' kbps / ' + fps + ' fps');
			*/
			// ------------------------------------------------------
		}
		conn.send(JSON.stringify(res));
	});
}

function ptzMove(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	var device = devices[params.address];
	if(!device) {
		sendError(conn, msg, 'The specified device is not found: ' + params.address);
		return;
	}
	var ptz = checkCanPtz(conn, msg);
	if(!ptz) return;

	device.instance.ptzMove(params, (error) => {
		var res = {'id': 'ptzMove', 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			res['result'] = true;
		}
		conn.send(JSON.stringify(res));
	});
}

function ptzStop(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	var device = devices[params.address];
	if(!device) {
		sendError(conn, msg, 'The specified device is not found: ' + params.address);
		return;
	}
	var ptz = checkCanPtz(conn, msg);
	if(!ptz) return;
	device.instance.ptzStop((error) => {
		var res = {'id': 'ptzStop', 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			res['result'] = true;
		}
		conn.send(JSON.stringify(res));
	});
}

///////////////////////////////////////////////////////
///					Profiles						///
///////////////////////////////////////////////////////
function getProfileList(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	var device = devices[msg.params.address];
	if(!device) {
		sendError(conn, msg, 'The specified device is not found: ' + params.address);
		return;
	}

	var res = {'id': 'getProfileList', 'seq': msg.seq};
	try {
		let l = device.instance.getProfileList();
		console.log(l);
		res['result'] = l;
	} catch(error) {
		res['error'] = error.toString();
	}
	conn.send(JSON.stringify(res));
}

///////////////////////////////////////////////////////
///					Presets							///
///////////////////////////////////////////////////////

function getPresets(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	var device = devices[params.address];
	if(!device) {
		sendError(conn, msg, 'The specified device is not found: ' + params.address);
		return;
	}
	var ptz = checkCanPtz(conn, msg);
	if(!ptz) return;

	var info = {
		'ProfileToken': getProfileToken(params),
	};
	ptz.getPresets(info, (error, result) => {
		var res = {'id': 'getPresets', 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			var response = result.data['GetPresetsResponse']['Preset'];
			var rv = [];
			for(var i=0;i<response.length;i++) {
				let v = response[i];
				rv.push({
					'name': v['Name'],
					'token': v['$']['token'],
				})
			}
			res['result'] = rv; // result.data['GetPresetsResponse'];
		}
		conn.send(JSON.stringify(res));
	});
}

function gotoPreset(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	var device = devices[params.address];
	if(!device) {
		sendError(conn, msg, 'The specified device is not found: ' + params.address);
		return;
	}
	var ptz = checkCanPtz(conn, msg);
	if(!ptz) return;

	params['ProfileToken'] = getProfileToken(params);
	//params['PresetToken'] = String(params['PresetToken']);
	ptz.gotoPreset(params, (error, result) => {
		var res = {'id': msg.method, 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			res['result'] = true;
		}
		conn.send(JSON.stringify(res));
	});
}

/**
 * 
 * @param conn 
 * @param {Object} msg the 
 * @param {Object} msg.params Parameters 
 * @param {string} msg.params.address Ip address of 
 * @param {string} [msg.params.ProfileToken] Optional profile, otherwise current profile is used
 * @param {string} msg.params.PresetToken The token to set
 * @param {string} [msg.params.PresetName] Optional name, will be set to the PresetToken if not supplied
 */
function setPreset(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	var device = devices[params.address];
	if(!device) {
		sendError(conn, msg, 'The specified device is not found: ' + params.address);
		return;
	}
	var ptz : OnvifServicePtz = checkCanPtz(conn, msg);
	if(!ptz) return;

	params['ProfileToken'] = getProfileToken(params);
	if(!params['PresetName'])
		params['PresetName'] = params['ProfileToken'];

	ptz.setPreset(params, (error, result) => {
		var res = {'id': msg.method, 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			res['result'] = true;
		}
		conn.send(JSON.stringify(res));
	});
}

function gotoHome(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	var speed = Number(params.speed);
	speed = isNaN(speed) ? 1 : Math.max(0,Math.min(1,speed));
	var device = devices[params.address];
	if(!device) {
		sendError(conn, msg, 'The specified device is not found: ' + params.address);
		return;
	}
	var ptz = checkCanPtz(conn, msg);
	if(!ptz) return;

	var info = {
		'ProfileToken': getProfileToken(params),
		'Speed'       : speed
	};
	ptz.gotoHomePosition(info, (error, result) => {
		var res = {'id': msg.method, 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			res['result'] = true;
		}
		conn.send(JSON.stringify(res));
	});
}

/**
 * 
 * @param conn 
 * @param {Object} msg the 
 * @param {Object} msg.params Parameters 
 * @param {string} msg.params.address Ip address of 
 * @param {string} [msg.params.ProfileToken] Optional profile, otherwise current profile is used
 */
function setHome(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	var device = devices[params.address];
	if(!device) {
		sendError(conn, msg, 'The specified device is not found: ' + params.address);
		return;
	}
	var ptz : OnvifServicePtz = checkCanPtz(conn, msg);
	if(!ptz) return;

	params['ProfileToken'] = getProfileToken(params);

	ptz.setHomePosition(params, (error, result) => {
		var res = {'id': msg.method, 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			res['result'] = true;
		}
		conn.send(JSON.stringify(res));
	});
}

function reboot(conn:AbsSocket, msg:Message) {
	var params = msg.params;
	var device = devices[params.address];
	if(!device) {
		sendError(conn, msg, 'The specified device is not found: ' + params.address);
		return;
	}
	if(!device.connected) {
		sendError(conn, msg, 'Not logged in to device ' + device.address + ". Call 'connect' first");
		return null;
	}
	device.instance.services.device.reboot((error, result) => {
		var res = {'id': msg.method, 'seq': msg.seq};
		if(error) {
			res['error'] = error.toString();
		} else {
			res['result'] = true;
		}
		conn.send(JSON.stringify(res));
	})
}

/////////////////////////// Support //////////////////////////
function getProfileToken(params) : string | null {
	var device = devices[params.address];
	if(!device)
		return null;
	// if request has a profile token, use that.
	if(params.ProfileToken)
		return params.ProfileToken;
	// use default current profile.
	var profile = device.instance.getCurrentProfile();
	return profile['token'];
}

function checkCanPtz(conn:AbsSocket, msg:Message) : OnvifServicePtz | null {
	var params = msg.params;
	var device = devices[params.address];
	if(!device.connected) {
		sendError(conn, msg, 'Not logged in to device ' + device.address + ". Call 'connect' first");
		return null;
	}
	else if(!device.instance.services.ptz) {
		sendError(conn, msg, 'The specified device does not support PTZ.');
		return null;
	}
	return device.instance.services.ptz;
}

function sendError(conn:AbsSocket, msg:Message, errorStr:string) {
	var res = {
		'id': msg.method,
		'seq': msg.seq,
		'error': errorStr
	};
	conn.send(JSON.stringify(res));
}