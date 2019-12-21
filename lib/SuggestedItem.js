"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
class SuggestedItem {
    constructor(data, ptr) {
        this.cache = {};
        this.data = data;
        this.ptr = ptr;
    }
    get count() {
        return this.cache.count || (this.cache.count = utils_1.readU32(this.data, this.ptr));
    }
    get distance() {
        return this.cache.distance || (this.cache.distance = utils_1.readU32(this.data, this.ptr + 4));
    }
    get term() {
        if (this.cache.term) {
            return this.cache.term;
        }
        const termLen = utils_1.readU32(this.data, this.ptr + 8);
        return (this.cache.term = Buffer.from(this.data.buffer, this.ptr + 12, termLen).toString());
    }
    toJSON() {
        const { count, distance, term } = this;
        return { count, distance, term };
    }
}
exports.SuggestedItem = SuggestedItem;
