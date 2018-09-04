const { resolve } = require('path');
const { assert } = require('chai');
const { spawnJavaScript } = require('./util/launch-utils');
const { GET } = require('./util/http-utils');

describe('CommonJs', function() {
    it('should run the example and respond', function(done) {
        this.timeout(5000);
        const js_file = resolve(__dirname, './test-resources/commonjs-base-case.js');
        const target = spawnJavaScript(js_file);
        let called = false;

        target.stdout.on('data', function(data) {
            if (data.toString().indexOf('START') === -1) {
                return;
            }

            GET('/').then(function() {
                called = true;
                target.kill('SIGINT');
            });
        });

        target.stderr.on('data', function(data) {
            console.error(data.toString());
        });

        target.on('close', function() {
            assert(called);
            done();
        });
    });
});
