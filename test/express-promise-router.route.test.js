const { assert } = require('chai');
const sinon = require('sinon');
const express = require('express');
const { GET } = require('./util/http-utils');

const delay = (method, payload) => {
    setTimeout(() => {
        method(payload);
    }, 10);
};

const { default: promiseRouter } = require('../dist/express-promise-router.js');

describe('new Router().route(...)', function () {
    let app;
    let serverListening;
    let server;
    let router;

    const bootstrap = (router) => {
        app = express();
        app.use('/', router);

        if (serverListening) {
            throw 'Already bootstrapped';
        }

        serverListening = new Promise((resolve, reject) => {
            server = app.listen(12345, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        return serverListening;
    };

    beforeEach(function () {
        router = promiseRouter();
    });

    afterEach(function () {
        if (serverListening) {
            return serverListening.then(() => {
                server.close();
                app = undefined;
                server = undefined;
                serverListening = undefined;
            });
        }
    });

    it('should call next with an error when a returned promise is rejected', function () {
        const callback = sinon.spy();

        router.route('/foo').get(() => {
            return new Promise((resolve, reject) => {
                delay(reject, 'some error');
            });
        });

        router.use((err, req, res, next) => {
            assert.equal('some error', err);
            callback();
            res.send();
        });

        return bootstrap(router)
            .then(() => GET('/foo'))
            .then(() => assert(callback.calledOnce));
    });

    it('should call next without an error when a returned promise is resolved with "next"', function () {
        const errorCallback = sinon.spy();
        const nextCallback = sinon.spy();

        router
            .route('/foo')
            .get(() => {
                return new Promise((resolve) => {
                    delay(resolve, 'next');
                });
            })
            .all((req, res) => {
                nextCallback();
                res.send();
            });

        router.use((err, req, res, next) => {
            errorCallback();
            next();
        });

        return bootstrap(router)
            .then(() => GET('/foo'))
            .then(() => {
                assert(errorCallback.notCalled);
                assert(nextCallback.calledOnce);
            });
    });

    it('should not call next when a returned promise is resolved with anything other than "route" or "next"', function () {
        const callback = sinon.spy();

        router.route('/foo').get((req, res) => {
            return new Promise((resolve) => {
                res.send();
                delay(resolve, 'something');
            });
        });

        router.route('/bar').get((req, res) => {
            return new Promise((resolve) => {
                res.send();
                delay(resolve, {});
            });
        });

        router.use((req, res) => {
            callback();
            res.send(500);
        });

        return bootstrap(router)
            .then(() => GET('/foo'))
            .then(() => {
                assert(callback.notCalled);
                return GET('/bar');
            })
            .then(() => assert(callback.notCalled));
    });

    it('should move to the next middleware when next is called without an error', function () {
        const callback = sinon.spy();

        router
            .route('/foo')
            .get((req, res, next) => next())
            .all((req, res, next) => {
                callback();
                res.send();
            });

        return bootstrap(router)
            .then(() => GET('/foo'))
            .then(() => assert(callback.calledOnce));
    });

    it('should move to the next error handler when next is called with an error', function () {
        const callback = sinon.spy();
        const errorCallback = sinon.spy();

        router
            .route('/foo')
            .get((req, res, next) => next('an error'))
            .all((req, res, next) => {
                callback();
                next();
            });

        router.use((err, req, res, next) => {
            assert.equal('an error', err);
            errorCallback();
            res.send();
        });

        return bootstrap(router)
            .then(() => GET('/foo'))
            .then(() => {
                assert(errorCallback.calledOnce);
                assert(callback.notCalled);
            });
    });

    it('should call chained handlers in the correct order', function () {
        const fn2 = sinon.spy((req, res) => {
            res.send();
        });
        const fn1 = sinon.spy(() => {
            assert(fn2.notCalled);
            return Promise.resolve('next');
        });

        router.route('/foo').get(fn1, fn2);

        return bootstrap(router).then(() => GET('/foo'));
    });

    it('should correctly call an array of handlers', function () {
        const fn2 = sinon.spy((req, res) => {
            res.send();
        });

        const fn1 = sinon.spy(() => {
            assert(fn2.notCalled);
            return Promise.resolve('next');
        });

        router.route('/foo').get([[fn1], [fn2]]);

        return bootstrap(router).then(() => GET('/foo'));
    });

    it('should call next("route") if a returned promise is resolved with "route"', function () {
        const fn1 = () => Promise.resolve('route');
        const fn2 = () => assert.fail();

        router.route('/foo').get(fn1, fn2);

        router.route('/foo').get((req, res) => {
            res.send();
        });

        return bootstrap(router).then(() => GET('/foo'));
    });

    it('should bind to RegExp routes', function () {
        const fn1 = (req, res) => res.send();

        router.route(/^\/foo/).get(fn1);

        return bootstrap(router).then(() => GET('/foo'));
    });

    it('multiple calls to handlers that have used "next" should not interfere with each other', function () {
        const fn = sinon.spy((req, res, next) => {
            if (fn.calledOnce) {
                next('error');
            } else {
                setTimeout(() => {
                    res.status(200).send('ok');
                }, 15);
            }
        });

        const errHandler = (err, req, res, next) => {
            if (err === 'error') {
                res.send('fail');
            } else {
                next(err);
            }
        };

        router.route('/foo').get(fn, errHandler);

        return bootstrap(router)
            .then(() => GET('/foo'))
            .then((res) => {
                assert.equal(res.body, 'fail');
                return GET('/foo');
            })
            .then((res) => assert.equal(res.body, 'ok'));
    });

    it('calls next if next is called even if the handler returns a promise', function () {
        const fn = (req, res, next) => {
            next();
            return new Promise((resolve, reject) => {});
        };

        const fn2 = (req, res) => res.send('ok');

        const errHandler = (err, req, res, next) => res.send('error');

        router.route('/foo').get(fn, fn2, errHandler);

        return bootstrap(router)
            .then(() => GET('/foo'))
            .then((res) => assert.equal(res.body, 'ok'));
    });

    it('calls next with an error if the returned promise is rejected with no reason', function () {
        const fn = () => {
            return new Promise((resolve, reject) => {
                delay(reject, null);
            });
        };

        const errHandler = (err, req, res, next) => res.send('error');

        router.route('/foo').get(fn, errHandler);

        return bootstrap(router)
            .then(() => GET('/foo'))
            .then((res) => assert.equal(res.body, 'error'));
    });

    it('should handle resolved promises returned in req.param() calls', function () {
        router.param('id', () => {
            return new Promise((resolve) => {
                delay(resolve, 'next');
            });
        });

        router.route('/foo/:id').all((req, res) => {
            res.send('done');
        });

        return bootstrap(router)
            .then(() => GET('/foo/1'))
            .then((res) => assert.equal(res.body, 'done'));
    });
});
