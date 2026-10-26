import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnakeModel, createSnakeSvg, resolveSnakePeriod } from './contribution-snake.mjs';

function calendar(start, end, counts = {}) {
  const days = [];
  for (const date = new Date(`${start}T12:00:00Z`); date.toISOString().slice(0,10) <= end; date.setUTCDate(date.getUTCDate()+1)) {
    const key = date.toISOString().slice(0,10), count = counts[key] ?? 0;
    days.push({date:key,count,level:count ? Math.min(4,count) : 0});
  }
  return days;
}

test('the saved period is kept unless a valid manual choice is supplied', () => {
  assert.equal(resolveSnakePeriod(undefined,'year'),'year');
  assert.equal(resolveSnakePeriod('configured','month'),'month');
  assert.equal(resolveSnakePeriod('year','month'),'year');
  assert.equal(resolveSnakePeriod('month','year'),'month');
  assert.throws(()=>resolveSnakePeriod('all'),/snakePeriod must be month or year/);
});

test('month counts only the current month through today', () => {
  const days = calendar('2025-12-31','2026-10-27',{'2025-12-31':99,'2026-04-01':3,'2026-10-26':8,'2026-10-27':100});
  const m = buildSnakeModel(days,{today:'2026-10-26',period:'month'});
  assert.equal(m.total,8);
  assert.equal(m.start,'2026-10-01');
  assert.equal(m.display.length,26);
  assert.ok(m.display.every(d=>d.date.startsWith('2026-10-')&&!d.future));
});

test('year shows January through December but never consumes future days', () => {
  const days = calendar('2025-12-31','2026-10-27',{'2025-12-31':99,'2026-01-01':2,'2026-04-01':3,'2026-10-26':8,'2026-10-27':100});
  const m=buildSnakeModel(days,{today:'2026-10-26',period:'year'});
  assert.equal(m.total,13);
  assert.equal(m.display.length,365);
  assert.equal(m.display.at(-1).date,'2026-12-31');
  assert.ok(m.events.every(e=>e.date<='2026-10-26'));
  assert.ok(m.display.filter(d=>d.future).every(d=>d.count===0));
});

test('body growth uses the number of contributions, not only active days', () => {
  const m=buildSnakeModel(calendar('2026-10-01','2026-10-26',{'2026-10-26':8}),{today:'2026-10-26',period:'month'});
  assert.equal(m.baseSegments,3);
  assert.equal(m.segments,11);
  assert.equal(m.events.length,1);
  assert.equal(m.events[0].consumed,8);
});

test('consumption events follow the actual snake route and sum to the period total', () => {
  const days=calendar('2026-10-01','2026-10-26',{'2026-10-05':2,'2026-10-08':5,'2026-10-26':1});
  const m=buildSnakeModel(days,{today:'2026-10-26',period:'month'});
  assert.ok(m.events.every((e,i,a)=>e.at>0&&e.at<1&&(!i||e.at>a[i-1].at)));
  assert.equal(m.events.at(-1).consumed,m.total);
  for(let i=0;i<m.route.length;i++) {
    const a=m.route[i],b=m.route[(i+1)%m.route.length];
    assert.equal(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]),1);
  }
});

test('the progress bar is weighted by consumed contributions and is safe at zero', () => {
  const empty=calendar('2026-10-01','2026-10-26');
  const m=buildSnakeModel(empty,{today:'2026-10-26'});
  assert.equal(m.total,0);
  assert.equal(m.segments,3);
  const svg=createSnakeSvg(empty,{today:'2026-10-26'});
  assert.match(svg,/id="progress-fill"[^>]*width="0"/);
  assert.match(svg,/>0 \/ 0/);
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  const weighted=createSnakeSvg(calendar('2026-10-01','2026-10-26',{'2026-10-01':2,'2026-10-26':6}),{today:'2026-10-26'});
  assert.match(weighted,/attributeName="width" values="0;95;380;380"/);
});

test('growth respects the visual limit', () => {
  const days=calendar('2026-10-01','2026-10-26',{'2026-10-26':1000});
  assert.equal(buildSnakeModel(days,{today:'2026-10-26',maxSegments:5}).segments,5);
  assert.throws(()=>buildSnakeModel(days,{today:'2026-10-26',maxSegments:41}));
});

test('calendar years include leap days and reset correctly in January', () => {
  const leap=buildSnakeModel(calendar('2024-01-01','2024-03-01',{'2024-02-29':2}),{today:'2024-03-01',period:'year'});
  assert.equal(leap.display.length,366);
  assert.equal(leap.total,2);
  for(const period of ['month','year']) {
    const m=buildSnakeModel(calendar('2026-12-31','2027-01-01',{'2026-12-31':50,'2027-01-01':1}),{today:'2027-01-01',period});
    assert.equal(m.start,'2027-01-01');
    assert.equal(m.total,1);
  }
});

test('missing dates fail instead of silently displaying incorrect zeros', () => {
  const days=calendar('2026-10-02','2026-10-26');
  assert.throws(()=>buildSnakeModel(days,{today:'2026-10-26'}),/incomplete/);
});
