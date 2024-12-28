var operations = require('./enums')['operations-supported'],
	tags = require('./tags'),
	versions = require('./versions'),
	attributes = require('./attributes'),
	enums = require('./enums'),
	keywords = require('./keywords'),
	statusCodes = require('./status-codes'),
	RS = '\u001e';

function random(){
	return +Math.random().toString().substr(-8);
}

module.exports = function serializer(msg){
	var buf = new Uint8Array(10240);
	var position = 0;
	function write1(val){
		checkBufferSize(1);
		buf[position] = val;
		position += 1;
	}
	function write2(val){
		checkBufferSize(2);
		buf[position] = (val >> 8) & 0xff;
		buf[position + 1] = val & 0xff;
		position += 2;
	}
	function write4(val){
		checkBufferSize(4);
		buf[position] = (val >> 24) & 0xff;
		buf[position + 1] = (val >> 16) & 0xff;
		buf[position + 2] = (val >> 8) & 0xff;
		buf[position + 3] = val & 0xff;
		position += 4;
	}
	function writeStr(str, enc){
		var length = new TextEncoder(enc || "utf8").encode(str).length;
		checkBufferSize(length);
		buf.set(new TextEncoder(enc || "utf8").encode(str), position);
		position += length;
	}
	function write(str, enc){
		var length = new TextEncoder(enc || "utf8").encode(str).length;
		write2(length);
		checkBufferSize(length);
		buf.set(new TextEncoder(enc || "utf8").encode(str), position);
		position += length;
	}
	function checkBufferSize(length){
		if (position + length > buf.length){
			var newBuf = new Uint8Array(2 * buf.length);
			newBuf.set(buf);
			buf = newBuf;
		}
	}
	var special = {'attributes-charset':1, 'attributes-natural-language':2};
	var groupmap = {
		"job-attributes-tag":	               ['Job Template', 'Job Description'],
		'operation-attributes-tag':          'Operation',
		'printer-attributes-tag':            'Printer Description',
		"unsupported-attributes-tag":        '',//??
		"subscription-attributes-tag":       'Subscription Description',
		"event-notification-attributes-tag": 'Event Notifications',
		"resource-attributes-tag":           '',//??
		"document-attributes-tag":           'Document Description'
	};
	function writeGroup(tag){
		var attrs = msg[tag];
		if(!attrs) return;
		var keys = Object.keys(attrs);
		//'attributes-charset' and 'attributes-natural-language' need to come first- so we sort them to the front
		if(tag==tags['operation-attributes-tag'])
			keys = keys.sort(function(a,b){ return (special[a]||3)-(special[b]||3); });
		var groupname = groupmap[tag];
		write1(tags[tag]);
		keys.forEach(function(name){
			attr(groupname, name, attrs);
		});
	}
	function attr(group, name, obj){
		var groupName = Array.isArray(group)
			? group.find( function (grp) { return attributes[grp][name] })
			: group;
		if(!groupName) throw "Unknown attribute: " + name;

		var syntax = attributes[groupName][name];

		if(!syntax) throw "Unknown attribute: " + name;

		var value = obj[name];
		if(!Array.isArray(value))
			value = [value];

		value.forEach(function(value, i){
			//we need to re-evaluate the alternates every time
			var syntax2 = Array.isArray(syntax)? resolveAlternates(syntax, name, value) : syntax;
			var tag = getTag(syntax2, name, value);
			if(tag===tags.enum)
				value = enums[name][value];

			write1(tag);
			if(i==0){
				write(name);
			}
			else {
				write2(0x0000);//empty name
			}

			writeValue(tag, value, syntax2.members);
		});
	}
	function getTag(syntax, name, value){
		var tag = syntax.tag;
		if(!tag){
			var hasRS = !!~value.indexOf(RS);
			tag = tags[syntax.type+(hasRS?'With':'Without')+'Language'];
		}
		return tag;
	}
	function resolveAlternates(array, name, value){
		switch(array.alts){
			case 'keyword,name':
			case 'keyword,name,novalue':
				if(value===null && array.lookup['novalue']) return array.lookup['novalue'];
				return ~keywords[name].indexOf(value)? array.lookup.keyword : array.lookup.name;
			case 'integer,rangeOfInteger':
				return Array.isArray(value)? array.lookup.rangeOfInteger : array.lookup.integer;
			case 'dateTime,novalue':
				return !IsNaN(date.parse(value))? array.lookup.dateTime : array.lookup['novalue'];
			case 'integer,novalue':
				return !IsNaN(value)? array.lookup.integer : array.lookup['novalue'];
			case 'name,novalue':
				return value!==null? array.lookup.name : array.lookup['novalue'];
			case 'novalue,uri':
				return value!==null? array.lookup.uri : array.lookup['novalue'];
			case 'enumeration,unknown':
				return enums[name][value]? array.lookup['enumeration'] : array.lookup.unknown;
			case 'enumeration,novalue':
				return value!==null? array.lookup['enumeration'] : array.lookup['novalue'];
			case 'collection,novalue':
				return value!==null? array.lookup['enumeration'] : array.lookup['novalue'];
			default:
				throw "Unknown atlernates";
		}
	}
	function writeValue(tag, value, submembers){
		switch(tag){
			case tags.enum:
				write2(0x0004);
				return write4(value);
			case tags.integer:
				write2(0x0004);
				return write4(value);

			case tags.boolean:
				write2(0x0001);
				return write1(Number(value));

			case tags.rangeOfInteger:
				write2(0x0008);
				write4(value.min);
				write4(value.max);
				return;

			case tags.resolution:
				write2(0x0009);
				write4(value[0]);
				write4(value[1]);
				write1(value[2]==='dpi'? 0x03 : 0x04);
				return;

			case tags.dateTime:
				write2(0x000B);
				write2(value.getFullYear());
				write1(value.getMonth() + 1);
				write1(value.getDate());
				write1(value.getHours());
				write1(value.getMinutes());
				write1(value.getSeconds());
				write1(Math.floor(value.getMilliseconds() / 100));
				var tz = timezone(value);
				writeStr(tz[0]);// + or -
				write1(tz[1]);//hours
				write1(tz[2]);//minutes
				return;

			case tags.textWithLanguage:
			case tags.nameWithLanguage:
				write2(parts[0].length);
				write2(parts[0]);
				write2(parts[1].length);
				write2(parts[1]);
				return;

			case tags.nameWithoutLanguage:
			case tags.textWithoutLanguage:
			case tags.octetString:
			case tags.memberAttrName:
				return write(value);

			case tags.keyword:
			case tags.uri:
			case tags.uriScheme:
			case tags.charset:
			case tags.naturalLanguage:
			case tags.mimeMediaType:
				return write(value, 'ascii');

			case tags.begCollection:
				write2(0);//empty value
				return writeCollection(value, submembers);

			case tags["no-value"]:
				//empty value? I can't find where this is defined in any spec.
				return write2(0);

			default:
				debugger;
				console.error(tag, "not handled");
		}
	}
	function writeCollection(value, members){
		Object.keys(value).forEach(function(key){
			var subvalue = value[key];
			var subsyntax = members[key];

			if(Array.isArray(subsyntax))
				subsyntax = resolveAlternates(subsyntax, key, subvalue);

			var tag = getTag(subsyntax, key, subvalue);
			if(tag===tags.enum)
				subvalue = enums[key][subvalue];

			write1(tags.memberAttrName)
			write2(0)//empty name
			writeValue(tags.memberAttrName, key);
			write1(tag)
			write2(0)//empty name
			writeValue(tag, subvalue, subsyntax.members);
		});
		write1(tags.endCollection)
		write2(0)//empty name
		write2(0)//empty value
	}

	write2(versions[msg.version||'2.0']);
	write2(msg.operation? operations[msg.operation] : statusCodes[msg.statusCode]);
	write4(msg.id||random());//request-id

	writeGroup('operation-attributes-tag');
	writeGroup('job-attributes-tag');
	writeGroup('printer-attributes-tag');
	writeGroup('document-attributes-tag');
	//TODO... add the others

	write1(0x03);//end


	if(!msg.data)
		return buf.slice(0, position);

	if(!(msg.data instanceof Uint8Array))
		throw "data must be a Uint8Array"

	var buf2 = new Uint8Array(position + msg.data.length);
	buf2.set(buf.slice(0, position), 0);
	buf2.set(msg.data, position);
	return buf2;
};

function timezone(d) {
	var z = d.getTimezoneOffset();
	return [
		z > 0 ? "-" : "+",
		~~(Math.abs(z) / 60),
		Math.abs(z) % 60
	];
}
