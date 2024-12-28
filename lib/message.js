var tag = require('./tags');

function msg(host, operation, id){
	var buf = new Uint8Array(1024);
	var position = 0;
	function write1(val){
		buf[position] = val;
		position += 1;
	}
	function write2(val){
		buf[position] = (val >> 8) & 0xff;
		buf[position + 1] = val & 0xff;
		position += 2;
	}
	function write4(val){
		buf[position] = (val >> 24) & 0xff;
		buf[position + 1] = (val >> 16) & 0xff;
		buf[position + 2] = (val >> 8) & 0xff;
		buf[position + 3] = val & 0xff;
		position += 4;
	}
	function write(str){
		var length = new TextEncoder().encode(str).length;
		write2(length);
		buf.set(new TextEncoder().encode(str), position);
		position += length;
	}
	function attr(tag, name, values){
		write1(tag);
		write(name);
		for(var i=0; i<values.length; i++){
			write(values[i]);
		}
	}
	//http://tools.ietf.org/html/rfc2910#section-3.1.1
	//	-----------------------------------------------
	//	|                  version-number             |   2 bytes  - required
	//	-----------------------------------------------
	//	|               operation-id (request)        |
	//	|                      or                     |   2 bytes  - required
	//	|               status-code (response)        |
	//	-----------------------------------------------
	//	|                   request-id                |   4 bytes  - required
	//	-----------------------------------------------
	//	|                 attribute-group             |   n bytes - 0 or more
	//	-----------------------------------------------
	//	|              end-of-attributes-tag          |   1 byte   - required
	//	-----------------------------------------------
	//	|                     data                    |   q bytes  - optional
	//	-----------------------------------------------

	write2(0x0200);//version 2.0
	write2(operation);
	write4(id);//request-id

	//the required stuff...
	write1(tag['operation-attributes-tag']);//0x01
	attr(tag.charset, 'attributes-charset', ['utf-8']);
	attr(tag.naturalLanguage, 'attributes-natural-language', ['en-us']);
	attr(tag.uri, 'printer-uri', ['ipp://'+host]);

	write1(0x03);//end
	return buf.slice(0, position);
}

module.exports = msg;