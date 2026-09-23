const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../economy-model');
test('a passive policy opens all five industries and keeps buying without a long saving wall',()=>{
 for(const seed of [1,2,42]){
  const r=M.simulate({seed,rounds:600,maxFlowers:12,clicks:0});
  for(const good of ['log','stone','board','tool','iron'])assert.ok(r.firstSales[good]>0&&r.firstSales[good]<400,`${seed}: ${good} opportunity became a sale`);
  assert.ok(r.maxWait<=60,`${seed}: longest wait ${r.maxWait}`);assert.ok(r.unfinishedWait<=60);
  for(const kind of ['worker','craft','resident','era','explore','build'])assert.ok(r.purchases[kind]>0,`${seed}: ${kind} remains useful to this policy`);
 }
});
test('optional manual work accelerates early progress without being required',()=>{
 const passive=M.simulate({seed:1,rounds:200,maxFlowers:8,clicks:0});
 const active=M.simulate({seed:1,rounds:200,maxFlowers:8,clicks:1});
 assert.ok(active.firstSales.stone<=passive.firstSales.stone);
});
