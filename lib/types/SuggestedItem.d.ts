export declare class SuggestedItem {
    static decodeString: (bytes: Uint8Array) => string;
    private readonly cache;
    private readonly data;
    private readonly ptr;
    constructor(data: Uint8Array, ptr: number);
    get count(): number;
    get distance(): number;
    get term(): string;
    toJSON(): Pick<SuggestedItem, 'count' | 'distance' | 'term'>;
}
export declare function readU32(buffer: Uint8Array, ptr: number): number;
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
export declare function deserializeSuggestedItems(buffer: ArrayBufferLike, ptr: number, length: number): SuggestedItem[];
