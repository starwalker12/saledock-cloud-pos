const repairs = [];
for (let i = 0; i < 50000; i++) {
  repairs.push({ job_no: `RJ-${String(i).padStart(6, "0")}` });
}

console.log("=== Benchmark: Repair Job Number Generation ===");

// BASELINE
console.time("Baseline (Fetch all & map/reduce)");
let maxSeqBaseline = 0;
for (let attempt = 0; attempt < 5; attempt++) {
    const maxSeq = (repairs ?? [])
    .map((r) => {
        const num = r.job_no.replace(/\D/g, "");
        return num ? parseInt(num, 10) : 0;
    })
    .reduce((max, val) => Math.max(max, val), 0);
    maxSeqBaseline = maxSeq;
}
console.timeEnd("Baseline (Fetch all & map/reduce)");


// OPTIMIZED
console.time("Optimized (Fetch limit 1 & parse)");
const latestRepair = repairs[repairs.length - 1]; // Simulating .order("created_at", { ascending: false }).limit(1)
let maxSeqOptimized = 0;
for (let attempt = 0; attempt < 5; attempt++) {
    let maxSeq = 0;
    if (latestRepair) {
        const num = latestRepair.job_no.replace(/\D/g, "");
        maxSeq = num ? parseInt(num, 10) : 0;
    }
    maxSeqOptimized = maxSeq;
}
console.timeEnd("Optimized (Fetch limit 1 & parse)");

console.log(`Matched max seq: ${maxSeqBaseline === maxSeqOptimized} (${maxSeqBaseline})`);
console.log("===============================================");
