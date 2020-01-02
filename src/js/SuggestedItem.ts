export class SuggestedItem {
    public static decodeString: (bytes: Uint8Array) => string;

    private readonly cache = {} as { [prop: string]: any };

    private readonly data: Uint8Array;
    private readonly ptr: number;

    constructor(data: Uint8Array, ptr: number) {
        this.data = data;
        this.ptr = ptr;
    }

    public get count(): number /* u32 */ {
        return this.cache.count || (this.cache.count = readU32(this.data, this.ptr));
    }

    public get distance(): number /* u32 */ {
        return this.cache.distance || (this.cache.distance = readU32(this.data, this.ptr + 4));
    }

    public get term(): string /* Vec<u8> */ {
        if (this.cache.term) {
            return this.cache.term as string;
        }
        const start = this.ptr + 12;
        const end = start + readU32(this.data, this.ptr + 8);
        return (this.cache.term = SuggestedItem.decodeString(this.data.slice(start, end)));
    }

    public toJSON(): Pick<SuggestedItem, 'count' | 'distance' | 'term'> {
        const {count, distance, term} = this;
        return {count, distance, term};
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
export function deserializeSuggestedItems(buffer: ArrayBufferLike, ptr: number, length: number): SuggestedItem[] {
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
