import {decodeString, readU32} from "./utils";

export class SuggestedItem {
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
        const termLen = this.data[this.ptr + 8];
        return (this.cache.term = decodeString(this.data.buffer, this.ptr + 9, termLen));
    }

    public toJSON(): Pick<SuggestedItem, 'count' | 'distance' | 'term'> {
        const {count, distance, term} = this;
        return {count, distance, term};
    }
}

