export declare class SuggestedItem {
    private readonly cache;
    private readonly data;
    private readonly ptr;
    constructor(data: Uint8Array, ptr: number);
    get count(): number;
    get distance(): number;
    get term(): string;
    toJSON(): Pick<SuggestedItem, 'count' | 'distance' | 'term'>;
}
