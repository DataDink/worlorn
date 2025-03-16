import FS from 'fs';
import PATH from 'path';
import REQUEST from 'sync-request';
import { JSDOM } from 'jsdom';

const output = 'src';
const root = 'http://gadzikowski.com/worlorn';

function* crawl(url) {
  var file = (/[^\/]+$/.exec(url)?.[0])?.trim();
  if (!file) { return; }
  var ext = (/\.[^\.]+$/.exec(file)?.[0] ?? '.html')?.trim();
  if (ext.length <= 1) { return; }
  var filename = (file.replace(/\.[^\.]+$/, ''))?.trim();
  file = `${filename}${ext}`.trim();

  var filepath = PATH.join(output, file);
  if (FS.existsSync(filepath)) { return; }

  if (REQUEST('HEAD', url).statusCode >= 400) { 
    console.error(`>> download failed: ${url}`);
    return; 
  }
  var content = REQUEST('GET', url)?.body;
  FS.writeFileSync(filepath, content);

  if (ext !== '.html') { return; }

  var document = new JSDOM(content.toString('utf8'))?.window?.document;
  if (!document) { return; }

  var resources = [...document.querySelectorAll('a')]
    .concat([...document.querySelectorAll('img')])
    .map(e => e.href ?? e.src ?? '')
    .filter(e => !/^http/i.test(e))
    .filter(e => e.indexOf('@') < 0)
    .filter(e => e.indexOf('#') < 0)
    .map(e => e.replace('../../', '../'))
    .map(e => e.replace(/[\<\>].+/gi, ''))
    .map(e => e.split('/').filter(k => k?.length).join('/'))
    .map(e => `${root}/${e}`)
    .map(e => e.replace('worlorn/../', ''));

  for (var resource of resources) {
    yield resource;
    for (var item of crawl(resource)) {
      yield item;
    }
  }
}
if (FS.existsSync(output)) { FS.rmdirSync(output, { recursive: true, force: true }); }
FS.mkdirSync(output, { recursive: true });
for (var url of crawl(root)) { /* console.log(url); */ }