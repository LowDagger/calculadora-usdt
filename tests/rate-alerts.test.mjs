import test from 'node:test'; import assert from 'node:assert/strict'; import { evaluateAlert, successfulDeliveryUpdate, COOLDOWN_MS } from '../lib/rate-alerts.js';
const stamp = '2026-08-04T12:00:00Z'; const base = { active: true, baseline_rate: 100, threshold: 5, measurement: 'ves', direction: 'up' };
for (const [name, alert, rate, expected] of [
  ['up VES exact', base, 105, true], ['up VES below', base, 104.99, false], ['down VES', { ...base, direction:'down' }, 95, true], ['any VES', { ...base, direction:'any' }, 94, true],
  ['up percent', { ...base, measurement:'percent' }, 105, true], ['down percent', { ...base, measurement:'percent', direction:'down' }, 95, true], ['any percent', { ...base, measurement:'percent', direction:'any' }, 105, true]
]) test(name, () => assert.equal(evaluateAlert(alert, rate, stamp).triggered, expected));
for (const [name, alert, rate] of [['invalid baseline',{...base,baseline_rate:0},105],['invalid current',base,NaN],['zero threshold',{...base,threshold:0},105],['negative threshold',{...base,threshold:-1},105]]) test(name,()=>assert.equal(evaluateAlert(alert,rate,stamp).reason,'invalid'));
test('one-time delivery deactivates',()=>assert.equal(successfulDeliveryUpdate({...base,recurring:false},105,stamp).active,false));
test('recurring delivery resets baseline and cooldown',()=>{const now=new Date('2026-08-04T12:01:00Z');const out=successfulDeliveryUpdate({...base,recurring:true},105,stamp,now);assert.equal(out.baseline_rate,105);assert.equal(Date.parse(out.cooldown_until),now.getTime()+COOLDOWN_MS)});
test('cooldown prevents trigger',()=>assert.equal(evaluateAlert({...base,cooldown_until:'2099-01-01T00:00:00Z'},110,stamp).reason,'cooldown'));
test('duplicate provider update is ignored',()=>assert.equal(evaluateAlert({...base,last_observed_provider_timestamp:stamp},110,stamp).reason,'duplicate'));
test('inactive alert models provider failure/no evaluation',()=>assert.equal(evaluateAlert({...base,active:false},110,stamp).reason,'inactive'));
test('multiple alerts use one rates object',()=>{const rates={bcv:95,p2p:105};const list=[{...base,rate_type:'p2p'},{...base,rate_type:'bcv',direction:'down'}];assert.deepEqual(list.map(a=>evaluateAlert(a,rates[a.rate_type],stamp).triggered),[true,true]);});
