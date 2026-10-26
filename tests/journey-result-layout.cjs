'use strict';
// Static DOM fixture from the real template/CSS and an observed route result.
// This checks browser layout only; it does not obtain or modify gameplay state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.join(__dirname, '..');
const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const emblem = app.match(/function heartIcon\(\)\s*\{\s*return '([^']+)';/)[1];
const fixture = template.replace('/* STYLES */', () => styles).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const folder = path.join(__dirname, 'screenshots'); fs.mkdirSync(folder, { recursive: true });
const errors = [], requests = []; let browser;
(async () => {
  console.log('INFO result layout fixture; source CSS SHA-256: ' + crypto.createHash('sha256').update(styles).digest('hex'));
  const launch = { headless: true }; if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(launch);
  const reports = [];
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!/^(about|data):/.test(request.url())) requests.push(request.url()); });
    await page.setContent(fixture, { waitUntil: 'load' });
    await page.evaluate(({ emblem, viewport }) => {
      for (const screen of document.querySelectorAll('.screen')) screen.hidden = screen.id !== 'result';
      const $ = id => document.getElementById(id);
      $('modal').hidden = true; $('entry-transition').hidden = true; $('app').className = '';
      document.body.className = ''; document.body.dataset.layoutFixture = 'observed-result-b';
      const scale = Math.min(viewport.width / 720, (viewport.height - (viewport.width > 600 ? 30 : 0)) / 1280);
      $('viewport').style.width = `${720 * scale}px`; $('viewport').style.height = `${1280 * scale}px`;
      $('app').style.width = '720px'; $('app').style.height = '1280px'; $('app').style.transform = `scale(${scale})`;
      $('result-emblem').innerHTML = emblem; $('result-kicker').textContent = 'A WORLD REBORN';
      $('result-case').textContent = 'CASE 01 / 生命之城'; $('result-stars').textContent = '巡诊评级 B';
      $('result-title').textContent = '一颗心，重新有了光。';
      $('result-description').textContent = '你修复了河流与传导。巨人的呼吸渐渐平稳，身上的村落重新亮起灯火。肺叶深处，仍有微弱的求救。';
      $('result-stamp').textContent = 'HEART STABLE ✓'; $('result-score').textContent = '80';
      $('metric-score-label').textContent = '医疗设备耐久'; $('result-time').innerHTML = '238<span> 秒</span>';
      $('result-restored').textContent = '1'; $('metric-restored-label').textContent = '重启次数';
      $('result-message').textContent = '心脏已稳定 · 下一个求救信号来自肺部';
      $('result-next').firstElementChild.textContent = '完成巡诊 · 返回诊断室';
      $('result-medals').hidden = false;
      for (const [label, earned] of [['组织守护', false], ['精准医师', true], ['稳健巡诊', false]]) {
        const item = document.createElement('span'); item.className = earned ? 'earned' : 'unearned';
        item.textContent = `${earned ? '✓' : '○'} ${label}`; $('result-medals').append(item);
      }
    }, { emblem, viewport });
    const report = await page.evaluate(() => {
      const select = selector => document.querySelector(selector);
      const bounds = selector => { const { x, y, width, height, right, bottom } = select(selector).getBoundingClientRect(); return { x, y, width, height, right, bottom }; };
      const overflow = selector => { const element = select(selector); return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1; };
      const scale = select('#app').getBoundingClientRect().width / 720;
      return {
        viewport: { width: innerWidth, height: innerHeight }, scale,
        gradeFont: parseFloat(getComputedStyle(select('#result-stars')).fontSize), badgeFont: parseFloat(getComputedStyle(select('#result-medals span')).fontSize),
        app: bounds('#app'), grade: bounds('#result-stars'), title: bounds('#result-title'), description: bounds('#result-description'), note: bounds('.result-note'), numbers: bounds('.result-numbers'), medals: bounds('#result-medals'), message: bounds('#result-message'), actions: bounds('.result-actions'), next: bounds('#result-next'), secondary: bounds('.result-actions>div'), footnote: bounds('.result-footnote'),
        badges: [...document.querySelectorAll('#result-medals span')].map(element => { const box = element.getBoundingClientRect(); return { x: box.x, right: box.right, y: box.y, bottom: box.bottom, overflow: element.scrollWidth > element.clientWidth + 1 }; }),
        overflow: ['#result-stars', '#result-description', '.result-note', '#result-medals', '#result-next'].some(overflow), horizontalScroll: document.documentElement.scrollWidth > innerWidth
      };
    });
    assert.equal(report.gradeFont, 26); assert.equal(report.badgeFont, 22);
    assert(report.gradeFont * report.scale >= 14); assert(report.badgeFont * report.scale >= 11.5);
    assert(report.grade.bottom <= report.title.y); assert(report.title.bottom <= report.description.y);
    assert(report.description.bottom + 3 <= report.note.y, 'description remains above the record card');
    assert(report.numbers.bottom + 3 <= report.medals.y); assert(report.medals.bottom <= report.message.y);
    assert(report.note.bottom + 3 <= report.actions.y, 'the enlarged medals do not cover the primary action');
    assert(report.secondary.bottom <= report.footnote.y + 1);
    assert(report.app.x >= 0 && report.app.y >= 0 && report.app.right <= viewport.width + 1 && report.app.bottom <= viewport.height + 1);
    assert(report.badges.every(badge => !badge.overflow && badge.x >= report.note.x && badge.right <= report.note.right));
    assert(!report.overflow && !report.horizontalScroll);
    await page.screenshot({ path: path.join(folder, `journey-result-layout-${viewport.width}x${viewport.height}.png`) });
    reports.push(report); console.log(`PASS ${viewport.width}x${viewport.height}: readable grade and medals, no overlapping sections or overflow`);
    await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  fs.writeFileSync(path.join(folder, 'journey-result-layout-metrics.json'), JSON.stringify(reports, null, 2));
  console.log('\n2 result DOM layout fixtures passed; no errors or external requests.');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
