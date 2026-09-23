// Reproducible progression audit using the same engine and policy as the design page.
const M=require('../economy-model.js');
const seeds=Math.max(1,Math.min(50,Number(process.argv[2])||5)),rounds=Math.max(100,Math.min(1800,Number(process.argv[3])||600));
for(let seed=1;seed<=seeds;seed++){
 const r=M.simulate({seed,rounds,maxFlowers:12});
 console.log(JSON.stringify({seed,rounds,firstSales:r.firstSales,maxWait:r.maxWait,medianWait:r.medianWait,unfinishedWait:r.unfinishedWait,income:r.income,flowers:r.flowers,purchases:r.purchases}));
}
