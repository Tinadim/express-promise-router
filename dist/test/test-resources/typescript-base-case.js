"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="../../index.d.ts"/>
const express = require("express");
const express_promise_router_js_1 = require("../../lib/express-promise-router.js");
const router = express_promise_router_js_1.default();
router.get('/', function (req, res) {
    res.send('Hi!');
});
const app = express();
app.use(router);
app.listen(12345);
console.log('START');
//# sourceMappingURL=typescript-base-case.js.map