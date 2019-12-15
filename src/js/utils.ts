import {SuggestedItem} from "./SuggestedItem";

let textDecoder: TextDecoder;
let textEncoder: TextEncoder;

export function decodeString(data: ArrayBuffer, byteOffset: number, length: number): string {
    try {
        return Buffer.from(data, byteOffset, length).toString();
    } catch (e) {
        debugger
        return (textDecoder || (textDecoder = new TextDecoder()))
            .decode(new Uint8Array(data, byteOffset, length));
    }
}

export function encodeString(word: string): Uint8Array {
    try {
        return Buffer.from(word);
    } catch {
        return (textEncoder || (textEncoder = new TextEncoder())).encode(word);
    }
}

export function readU32(buffer: Uint8Array, ptr: number): number {
    return (buffer[ptr + 3] << 24) | (buffer[ptr + 2] << 16) | (buffer[ptr + 1] << 8) | buffer[ptr];
}

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
export function deserializeSuggestedItems(buffer: ArrayBufferLike, ptr: number, length: number) {
    const rawSlice = new Uint8Array(buffer.slice(ptr, ptr + length));
    ptr = 0; // pointer resets to zero when we slice
    // Find each position of the encoded suggest item
    // within the buffer
    const numItems = readU32(rawSlice, 0); // bytes 0-3 represent the u32 of total items encoded in LE
    ptr += 4;
    const suggestedItems: SuggestedItem[] = [];
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