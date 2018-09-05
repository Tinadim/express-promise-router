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

describe('express-promise-router', function () {
    let app;
    let serverListening;
    let server;
    let router;

    const bootstrap = (router) => {
        app = express();
        app.use('/', router);

        if (serverListening) {
            throw 'already bootstrapped';
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

        router.use('/foo', () => {
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

        router.use('/foo', () => {
            return new Promise((resolve) => {
                delay(resolve, 'next');
            });
        });

        router.use('/foo', (req, res) => {
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

        router.get('/foo', (req, res) => {
            return new Promise((resolve) => {
                res.send();
                delay(resolve, 'something');
            });
        });

        router.get('/bar', (req, res) => {
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

        router.use('/foo', (req, res, next) => {
            next();
        });

        router.use('/foo', (req, res, next) => {
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

        router.use('/foo', (req, res, next) => {
            next('an error');
        });

        router.use('/foo', (req, res, next) => {
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
        const fn2 = sinon.spy((req, res) => res.send());
        const fn1 = sinon.spy(() => {
            assert(fn2.notCalled);
            return Promise.resolve('next');
        });

        router.get('/foo', fn1, fn2);

        return bootstrap(router).then(() => GET('/foo'));
    });

    it('should correctly call an array of handlers', function () {
        const fn2 = sinon.spy((req, res) => res.send());
        const fn1 = sinon.spy(() => {
            assert(fn2.notCalled);
            return Promise.resolve('next');
        });

        router.get('/foo', [[fn1], [fn2]]);

        return bootstrap(router).then(() => GET('/foo'));
    });

    it('should call next("route") if a returned promise is resolved with "route"', function () {
        const fn1 = () => Promise.resolve('route');
        const fn2 = () => assert.fail();

        router.get('/foo', fn1, fn2);
        router.get('/foo', (req, res) => res.send());

        return bootstrap(router).then(() => GET('/foo'));
    });

    it('should bind to RegExp routes', function() {
        const fn1 = (req, res) => res.send();

        router.get(/^\/foo/, fn1);

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

        router.get('/foo', fn, errHandler);

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

        router.get('/foo', fn, fn2, errHandler);

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

        router.get('/foo', fn, errHandler);

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

        router.use('/foo/:id', (req, res) => res.send('done'));

        return bootstrap(router)
            .then(() => GET('/foo/1'))
            .then((res) => assert.equal(res.body, 'done'));
    });

    it('should call next with unresolved promises returned in req.param() calls', function () {
        const assertOutput = 'error in param';

        router.param('id', (req, res, next, id) => {
            return new Promise((resolve, reject) => {
                delay(reject, assertOutput);
            });
        });

        const fn = (req, res) => res.send('done');

        const errHandler = (err, req, res, next) => res.send(err);

        router.use('/foo/:id', fn);

        router.use(errHandler);

        return bootstrap(router)
            .then(() => GET('/foo/1'))
            .then((res) => assert.equal(res.body, assertOutput));
    });

    it('support array in routes values', function () {
        router.use(['/', '/foo/:bar'], (req, res) => res.send('done'));

        return bootstrap(router)
            .then(() => GET('/'))
            .then((res) => {
                assert.equal(res.body, 'done');
                return GET('/foo/1');
            })
            .then((res) => assert.equal(res.body, 'done'));
    });

    it('should throw sensible errors when handler is not a function', function () {
        assert.throws(() => {
            router.use('/foo/:id', null);
        }, /callback/);
    });

    describe('Error handler test cases', function () {
        it('should handle errors in case an error handler is provided', function () {
            const mockError = new Error('Unexpected error during request');
            mockError.code = 500;

            const errorHandler = (res, error) => {
                res.status(error.code).send(error.message);
            };

            const firstHandler = sinon.stub().callsFake((req, res, next) => {
                return Promise.reject(mockError);
            });

            const secondHandler = sinon.stub().callsFake((req, res, next) => res.status(200));

            router = promiseRouter({ errorHandler });
            router.get('/foo', firstHandler, secondHandler);
            
            return bootstrap(router)
                .then(() => GET('/foo'))
                .then(() => {
                    throw new Error('Shouldn\'t reach this point');
                })
                .catch((response) => {
                    assert.equal(response.statusCode, mockError.code);
                    assert.equal(response.message, `${mockError.code} - "${mockError.message}"`);
                    assert(firstHandler.calledOnce);
                    assert(secondHandler.notCalled);
                });
        });
    });

    describe('Response handler test cases', function () {
        it('should handle the promise result in case a response handler is provided', function () {
            const mockResponse = 'Great success!';
            const responseHandler = (res, result) => {
                res.status(200).send(result);
            };

            const handler = sinon.spy(((req, res) => {
                return Promise.resolve(mockResponse);
            }));

            router = promiseRouter({ responseHandler });
            router.get('/foo', handler);
            
            return bootstrap(router)
                .then(() => GET('/foo'))
                .then((response) => {
                    assert.equal(response.body, mockResponse);
                    assert(handler.calledOnce);
                });
        });
    
        it('should not handle the response in case promise is resolved with \'next\'', function () {
            const mockResponse = 'Great success!';
            const responseHandler = sinon.spy((res, result) => {
                res.status(200).send(result);
            });

            const firstHandler = sinon.spy(((req, res) => {
                return Promise.resolve('next');
            }));

            const secondHandler = sinon.spy((req, res) => {
                res.status(200).send(mockResponse);
            })

            router = promiseRouter({ responseHandler });
            router.get('/foo', firstHandler, secondHandler);
            
            return bootstrap(router)
                .then(() => GET('/foo'))
                .then((response) => {
                    assert.equal(response.body, mockResponse);
                    assert(firstHandler.calledOnce);
                    assert(secondHandler.calledOnce);
                    assert(responseHandler.notCalled);
                });
        });
    
        it('should not handle the response in case promise is resolved with \'route\'', function () {
            const mockResponse = 'Great success!';
            const responseHandler = sinon.spy((res, result) => {
                res.status(200).send(result);
            });

            const firstHandler = sinon.spy(((req, res) => {
                return Promise.resolve('route');
            }));

            const secondHandler = sinon.spy((req, res) => {
                res.status(200).send(mockResponse);
            })

            router = promiseRouter({ responseHandler });
            router.get('/foo/:param', firstHandler);
            router.get('/foo/param', secondHandler);
            
            return bootstrap(router)
                .then(() => GET('/foo/param'))
                .then((response) => {
                    assert.equal(response.body, mockResponse);
                    assert(firstHandler.calledOnce);
                    assert(secondHandler.calledOnce);
                    assert(responseHandler.notCalled);
                });
        });
    
        it('should not handle the response in case a handler that includes the \'next\' argument is provided', function () {
            const mockResponse = 'Great success!';
            const responseHandler = sinon.spy((res, result) => {
                res.status(200).send(result);
            });

            const handler = sinon.spy(((req, res, next) => {
                return Promise.resolve()
                    .then(() => res.status(200).send(mockResponse));
            }));

            router = promiseRouter({ responseHandler });
            router.get('/foo', handler);
            
            return bootstrap(router)
                .then(() => GET('/foo'))
                .then((response) => {
                    assert.equal(response.body, mockResponse);
                    assert(handler.calledOnce);
                    assert(responseHandler.notCalled);
                });
        });
    });
});
