import test from 'node:test';import assert from 'node:assert/strict';
import {hiddenFeatureIds,setFeatureHidden,mergeVisibleFeatureOrder,repairLegacyFeatureVisibility} from '../feature-visibility.js';
const available=['savings','budget','stock','cards','hiddenFunctions','home'];
test('legacy menu hides savings, budget and already absent functions',()=>{assert.deepEqual(hiddenFeatureIds({},available,['savings','budget','stock']),['savings','budget','stock']);});
test('show and hide persist explicit choices without changing any other setting or data',()=>{
 const original={reminderDays:[3,2,1],budgets:{monthly:500},mainMenuOrder:['cards','stock']};const before=structuredClone(original);
 const shown=setFeatureHidden(original,'savings',false,available,['savings','budget','stock']);assert.deepEqual(shown.hiddenFeatureIds,['budget','stock']);assert.deepEqual(original,before);assert.deepEqual(shown.reminderDays,before.reminderDays);assert.deepEqual(shown.budgets,before.budgets);assert.deepEqual(shown.mainMenuOrder,before.mainMenuOrder);
 assert.deepEqual(hiddenFeatureIds(shown,available,['savings','budget','stock']),['budget','stock']);assert.deepEqual(setFeatureHidden(shown,'savings',true,available).hiddenFeatureIds,['budget','stock','savings']);
});
test('empty explicit preferences remain visible after reload and protected navigation cannot be hidden',()=>{
 assert.deepEqual(hiddenFeatureIds({hiddenFeatureIds:[]},available,['savings','budget']),[]);
 for(const id of ['home','hiddenFunctions','missing'])assert.throws(()=>setFeatureHidden({},id,true,available));
 assert.deepEqual(hiddenFeatureIds({hiddenFeatureIds:['stock','stock','resale','home']},available),['stock']);
});

test('reordering visible functions preserves hidden positions for later restoration',()=>{
 const order=['cards','savings','budget','stock','hiddenFunctions'];assert.deepEqual(mergeVisibleFeatureOrder(order,['stock','cards','hiddenFunctions']),['stock','savings','budget','cards','hiddenFunctions']);assert.deepEqual(order,['cards','savings','budget','stock','hiddenFunctions']);
});

test('future functions initially hidden join the folder without changing existing shown preferences',()=>{
 const settings=setFeatureHidden({},'savings',false,available,['savings','budget']);assert.deepEqual(hiddenFeatureIds(settings,[...available,'recurring'],['savings','budget','recurring']),['budget','recurring']);
});

test('repairs only the legacy inverted menu shown in the report, without touching other settings',()=>{
 const ids=['savings','budget','recurring','stock','recoveries','history','cards','reports','usd','trash','fixedExpenses','consultations','resale','unclassified'];const defaults=['savings','budget','recurring','stock','recoveries','history'];const usual=ids.filter(id=>!defaults.includes(id));
 const original={hiddenFeatureIds:[...usual,'history'],mainMenuOrder:['cards','savings'],reminderDays:[1,2,3]};const before=structuredClone(original);const fixed=repairLegacyFeatureVisibility(original,ids,defaults);
 assert.deepEqual(fixed.hiddenFeatureIds,defaults);assert.deepEqual(original,before);assert.deepEqual(fixed.mainMenuOrder,original.mainMenuOrder);assert.deepEqual(fixed.reminderDays,original.reminderDays);
 const intentional={...original,featureVisibilityControlVersion:2};assert.equal(repairLegacyFeatureVisibility(intentional,ids,defaults),intentional);
 const custom={hiddenFeatureIds:['cards']};assert.deepEqual(repairLegacyFeatureVisibility(custom,ids,defaults).hiddenFeatureIds,['cards']);
});
