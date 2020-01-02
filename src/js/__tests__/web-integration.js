const {fork} = require('child_process');
const path = require('path');

const http = fork(require.resolve('http-server/bin/http-server'), null, {cwd: path.resolve(__dirname, '../../../')});

http.on("error", data => {
    process.exit(1);
});

const MochaChrome = require('mocha-chrome');
const mc = new MochaChrome({url: 'http://localhost:8080/src/js/__tests__/'});
mc.bus.on('ended', message => {
    http.kill();
    process.exit(+!!message.failures);
});

mc.connect().then(() => mc.run());
