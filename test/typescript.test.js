const tt = require('typescript-definition-tester');
const path = require('path');
const { resolve } = require('path');
const { assert } = require('chai');
const { spawnTypeScript } = require('./util/launch-utils');
const { GET } = require('./util/http-utils');

describe('TypeScript', function() {
    it('should compile base-case successfully against index.d.ts', function(done) {
        this.timeout(20000);
        tt.compile([path.resolve(__dirname + '/typescript-resources/typescript-base-case.ts')], {}, done.bind(null));
    });

    it('should run the example and respond', function(done) {
        this.timeout(5000);
        const ts_file = resolve(__dirname, './test-resources/typescript-base-case.ts');
        const target = spawnTypeScript(ts_file);
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
