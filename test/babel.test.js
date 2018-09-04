const { resolve } = require('path');
const { assert } = require('chai');
const { spawnBabel } = require('./util/launch-utils');
const { GET } = require('./util/http-utils');

describe('Babel', function() {
    it('should run the example and respond', function(done) {
        this.timeout(5000);
        const js_file = resolve(__dirname, './test-resources/babel-base-case.js');
        const target = spawnBabel(js_file);
        let called = false;

        target.stdout.on('data', (data) => {
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
