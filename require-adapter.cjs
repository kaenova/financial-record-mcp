const mod = require('./.xmcp/adapter/index.js');
console.log('typeof mod', typeof mod);
console.log('keys', Object.keys(mod));
console.log('defaultType', typeof mod.default);
console.log('xmcpHandlerType', typeof mod.xmcpHandler);
console.log('mod', mod);
