// 使用 fetch 替换 http 和 https 模块
var parse = require('./parser'),
	url = require('url');

module.exports = function (opts, buffer, cb) {
	var streamed = typeof buffer === "function";
	//All IPP requires are POSTs- so we must have some data.
	//  10 is just a number I picked- this probably should have something more meaningful
	if (!(buffer instanceof Uint8Array) || buffer.length < 10) {
		return cb(new Error("Data required"));
	}
	// React Native 不支持 Buffer，需要使用 Uint8Array 或其他替代方案
	if (typeof buffer === 'string') {
		buffer = new TextEncoder().encode(buffer);
	} else if (!(buffer instanceof Uint8Array)) {
		return cb(new Error("Data required"));
	}
	if (typeof opts === "string")
		opts = url.parse(opts);
	if (!opts.port) opts.port = 631;

	if (!opts.headers) opts.headers = {};
	opts.headers['Content-Type'] = 'application/ipp';
	opts.method = "POST";

	if (opts.protocol === "ipp:")
		opts.protocol = "http:";

	if (opts.protocol === "ipps:")
		opts.protocol = "https:";

	// 使用 fetch 进行请求
	fetch(`${opts.protocol}//${opts.hostname}:${opts.port}${opts.pathname}`, {
		method: opts.method,
		headers: opts.headers,
		body: buffer.buffer // 使用 ArrayBuffer
	})
		.then(response => {
			switch (response.status) {
				case 100:
					if (opts.headers['Expect'] !== '100-Continue' || typeof opts.continue !== "function") {
						cb(new IppResponseError(response.status));
					}
					return console.log("100 Continue");
				case 200:
					return response.arrayBuffer().then(buffer => readResponse(buffer, cb));
				default:
					cb(new IppResponseError(response.status));
					return console.log(response.status, "response");
			}
		})
		.catch(err => {
			cb(err);
		});
};

function readResponse(buffer, cb) {
	var chunks = [new Uint8Array(buffer)], length = buffer.byteLength;
	var response = parse(concatUint8Arrays(chunks, length));
	delete response.operation;
	cb(null, response);
}

function concatUint8Arrays(arrays, length) {
	var result = new Uint8Array(length);
	var offset = 0;
	arrays.forEach(array => {
		result.set(array, offset);
		offset += array.length;
	});
	return result;
}

function IppResponseError(statusCode, message) {
	this.name = 'IppResponseError';
	this.statusCode = statusCode;
	this.message = message || 'Received unexpected response status ' + statusCode + ' from the printer';
	this.stack = (new Error()).stack;
}
IppResponseError.prototype = Object.create(Error.prototype);
IppResponseError.prototype.constructor = IppResponseError;
