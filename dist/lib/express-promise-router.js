"use strict";
const express_1 = require("express");
const flattenDeep = require("lodash.flattendeep");
const isPromise = require("is-promise");
const httpMethods = require("methods");
class PromiseRouter {
    constructor(options = {}) {
        this.router = express_1.Router(options);
        this.responseHandler = options.responseHandler;
        this.errorHandler = options.errorHandler;
        this.wrapMethods(this.router);
        this.wrapRoute(this.router);
    }
    wrapMethods(router) {
        const methods = httpMethods.concat(['use', 'all', 'param']);
        methods.forEach(method => this.wrapMethod(method, router));
    }
    wrapRoute(router) {
        router.__route = router.route;
        router.route = (path) => {
            const route = router.__route(path);
            const methods = httpMethods.concat(['all']);
            methods.forEach((method) => this.wrapMethod(method, route));
            return route;
        };
    }
    wrapMethod(method, instanceToWrap) {
        const original = `__${method}`;
        instanceToWrap[original] = instanceToWrap[method];
        instanceToWrap[method] = (...args) => {
            // Manipulating arguments directly is discouraged
            let _args = Array.from(args);
            // Grab the first parameter out in case it's a route or array of routes.
            let first = null;
            if (this.shouldRemoveFirstArg(_args)) {
                first = _args[0];
                _args = _args.slice(1);
            }
            _args = flattenDeep(_args).map((arg) => this.wrapHandler(arg));
            // If we have a route path or something, push it in front
            if (first) {
                _args.unshift(first);
            }
            return instanceToWrap[original].apply(instanceToWrap, _args);
        };
    }
    wrapHandler(handler) {
        if ('function' !== typeof handler) {
            const type = Object.prototype.toString.call(handler);
            const msg = `Expected a callback function but got a ${type}`;
            throw new Error(msg);
        }
        let wrappedHandler;
        if (handler.length === 2) {
            wrappedHandler = (req, res) => {
                const ret = handler.apply(null, [req, res, () => { }]);
                this.handlerReturn(ret, { next: null, res });
            };
        }
        else if (handler.length === 3) {
            wrappedHandler = (req, res, next) => {
                const ret = handler.apply(null, [req, res, next]);
                this.handlerReturn(ret, { next, res });
            };
        }
        else {
            wrappedHandler = (err, req, res, next) => {
                const ret = handler.apply(null, [err, req, res, next]);
                if ('string' === typeof next) {
                    res = req;
                    next = res;
                }
                this.handlerReturn(ret, { next, res });
            };
        }
        return wrappedHandler;
    }
    handlerReturn(ret, { res, next }) {
        if (isPromise(ret)) {
            Promise.resolve(ret)
                .then((result) => this.handlePromiseResult(result, { res, next }))
                .catch((error) => this.handleError(error, { res, next }));
        }
    }
    handlePromiseResult(result, { next, res }) {
        if (next !== null) {
            if (result === 'next') {
                next();
            }
            else if (result === 'route') {
                next('route');
            }
        }
        else if (this.responseHandler !== null) {
            this.responseHandler(res, result);
        }
    }
    handleError(error, { next, res }) {
        if (this.errorHandler !== null) {
            this.errorHandler(res, error);
        }
        else {
            next(error);
        }
    }
    /** Helper functions **/
    copyArgs(args) {
        let copy = new Array(args.length);
        for (let i = 0; i < args.length; ++i) {
            copy[i] = args[i];
        }
        return copy;
    }
    isString(arg) {
        return typeof (arg) === 'string';
    }
    isRegExp(arg) {
        return arg instanceof RegExp;
    }
    firstArgumentIsArray(args) {
        return ((Array.isArray(args[0]) && this.isString(args[0][0])) || this.isRegExp(args[0][0]));
    }
    shouldRemoveFirstArg(args) {
        return this.isString(args[0]) ||
            this.isRegExp(args[0]) ||
            this.firstArgumentIsArray(args);
    }
}
module.exports = (options) => {
    return new PromiseRouter(options).router;
};
//# sourceMappingURL=express-promise-router.js.map