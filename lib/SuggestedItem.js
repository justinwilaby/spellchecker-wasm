"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class SuggestedItem {
    constructor(data, ptr) {
        this.cache = {};
        this.data = data;
        this.ptr = ptr;
    }
    get count() {
        return this.cache.count || (this.cache.count = readU32(this.data, this.ptr));
    }
    get distance() {
        return this.cache.distance || (this.cache.distance = readU32(this.data, this.ptr + 4));
    }
    get term() {
        if (this.cache.term) {
            return this.cache.term;
        }
        const termLen = readU32(this.data, this.ptr + 8);
        return (this.cache.term = SuggestedItem.decodeString(new Uint8Array(this.data.buffer, this.ptr + 12, termLen)));
    }
    toJSON() {
        const { count, distance, term } = this;
        return { count, distance, term };
    }
}
exports.SuggestedItem = SuggestedItem;
function readU32(buffer, ptr) {
    return (buffer[ptr + 3] << 24) | (buffer[ptr + 2] << 16) | (buffer[ptr + 1] << 8) | buffer[ptr];
}
exports.readU32 = readU32;
/**
 * Suggested items are encoded by the wasm to be as compact as possible and
 * reside in the wasm ArrayBuffer. This function slices that ArrayBuffer into
 * the data representing each SuggestedItem and supplies it as the data source
 * for all properties within the respective SuggestedItem.
 *
 * This is not JSON encoded data since JSON tokens often exceed the data they
 * encapsulate making them far less efficient.
 *
 *
 * @param buffer ArrayBufferLike The ArrayBuffer from the wasm memory export.
 * @param ptr number The beginning byte for the SuggestedItems
 * @param length number The total number of byes comprising all suggested items in memory.
 */
function deserializeSuggestedItems(buffer, ptr, length) {
    const rawSlice = new Uint8Array(buffer.slice(ptr, ptr + length));
    ptr = 0; // pointer resets to zero when we slice
    // Find each position of the encoded suggest item
    // within the buffer
    const numItems = readU32(rawSlice, 0); // bytes 0-3 represent the u32 of total items encoded in LE
    ptr += 4;
    const suggestedItems = [];
    for (let i = 0; i < numItems; i++) {
        const itemLen = readU32(rawSlice, ptr); //bytes ptr + 3 represent the number of bytes in each item encoded in LE
        ptr += 4;
        // All suggested items share the same slice but the pointer
        // is updated to indicate where the property values start.
        suggestedItems[i] = new SuggestedItem(rawSlice, ptr);
        ptr += itemLen;
    }
    return suggestedItems;
}
exports.deserializeSuggestedItems = deserializeSuggestedItems;
