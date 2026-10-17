"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultCheckSpellingOptions = exports.defaultOptions = exports.Verbosity = exports.SpellcheckerWasm = void 0;
var SpellcheckerWasm_ts_1 = require("./SpellcheckerWasm.js");
Object.defineProperty(exports, "SpellcheckerWasm", { enumerable: true, get: function () { return SpellcheckerWasm_ts_1.SpellcheckerWasm; } });
__exportStar(require("./SuggestedItem.js"), exports);
var SpellCheckerBase_ts_1 = require("./SpellCheckerBase.js");
Object.defineProperty(exports, "Verbosity", { enumerable: true, get: function () { return SpellCheckerBase_ts_1.Verbosity; } });
Object.defineProperty(exports, "defaultOptions", { enumerable: true, get: function () { return SpellCheckerBase_ts_1.defaultOptions; } });
Object.defineProperty(exports, "defaultCheckSpellingOptions", { enumerable: true, get: function () { return SpellCheckerBase_ts_1.defaultCheckSpellingOptions; } });
