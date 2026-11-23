"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const shared_1 = require("@frontdesk/shared");
const clockPlugin = async (fastify, opts) => {
    const clock = opts.clock || new shared_1.ShiftableClock();
    fastify.decorate('clock', clock);
};
exports.default = (0, fastify_plugin_1.default)(clockPlugin);
//# sourceMappingURL=clock.js.map