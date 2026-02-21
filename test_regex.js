const val = "<120";
const opMatch = val.match(/^(>=|<=|>|<|=)\s*(-?\d+(\.\d+)?)$/);
console.log("Val:", val);
console.log("Match:", !!opMatch);
if (opMatch) {
    console.log("Op:", opMatch[1]);
    console.log("Num:", opMatch[2]);
}
