import FS from 'fs';
import PATH from 'path';
import { JSDOM } from 'jsdom';

const input = 'src';
const contentpath = 'dst/';
const resourcepath = 'assets/';

function clear() {
  const root = contentpath;
  if (FS.existsSync(root)) { FS.rmdirSync(root, { recursive: true, force: true }); }
  FS.mkdirSync(root);
  const resc = PATH.join(root, resourcepath);
  if (FS.existsSync(resc)) { FS.rmdirSync(resc, { recursive: true, force: true }); }
  FS.mkdirSync(resc);
}
clear();

function copy() {
  var files = FS.readdirSync(input);
  for (var file of files) {
    var src = PATH.join(input, file);
    var ex = PATH.extname(file);
    if (!['.html', '.htm', '.txt'].includes(ex)) {
      var dst = PATH.join(PATH.join(contentpath, resourcepath), file);
      FS.copyFileSync(src, dst);
      continue;
    }
    var rename = file.replace(/\..+?$/, '.md');
    if (!['.html', '.htm'].includes(ex)) {
      var dst = PATH.join(contentpath, rename);
      FS.copyFileSync(src, dst);
      continue;
    }
    var text = FS.readFileSync(src, 'utf8');
    var redirect = /\<META HTTP-EQUIV="Refresh" CONTENT="0; URL=(.+\.html)"\>/i.exec(text)?.[1];
    if (redirect) {
      var target = redirect.replace(/\..+?$/, '.md');
      var markdown = `**file moved to [${target}](${target})**\n`;
      var dst = PATH.join(contentpath, rename);
      FS.writeFileSync(dst, markdown);
      continue;
    }
    var document = new JSDOM(text)?.window?.document;
    if (!document) {
      console.error(`>> ${file} was unparsable`);
      continue;
    }
    var dst = PATH.join(contentpath, rename);
    var markdown = format(document.body);
    if (!markdown) {
      console.error(`>> ${file} not unformatted`);
      continue;
    }
    markdown = cleanup(markdown);
    FS.writeFileSync(dst, markdown);
  }
}
copy();

function cleanup(markdown) {
  return markdown
    .replace(/\n\|(  \[people\]\(people\.md\)| \*\*personalities\*\*)[\s\S]+?\n\n/g, '\n\n')
    .replace(/^\s*?$/gm, '')
    .replace(/(\n\n+)/g, '\n\n')
    .replace(/\n[\| ]+\n/g, '\n')
    .replace(/\n{1,2}\s*\!\[xparent\]\(assets\/xparent\.gif\)/g, '\n>\n> ')
    .replace(/\(mailto:worlorn-webmaster@gadzikowski.com\)[\r\n\s]+\#+ missing something[\s\S]+/, '');
}

function format(element) {
  var layout =  element?.querySelector?.('body > table > tbody') ?? element?.querySelector?.('body > table');
  if (!layout) { return formatContent(element); }
  var rows = [...layout.childNodes].filter(n => n.tagName === 'TR');
  if (rows.length <= 0) { return formatContent(element); }
  var header = [...rows[0].childNodes].filter(n => n.tagName === 'TD');
  var icon = format(header[3]?.querySelector('img')).trim();
  var title = format(header[1]).replace(/#+/gi, '#').trim();
  var content = rows.slice(1)
    .map(row => [...row.childNodes].filter(n => n.tagName === 'TD'))
    .map(cells => `${format(cells[3])}\n\n${format(cells[1])}`)
    .filter(para => para?.trim()?.length)
    .join('\n\n').trim();
  return `${icon}\n\n${title}\n\n${content}`;
}

function formatContent(element) {
  if (!element) { return ''; } 
  const tag = element.tagName?.toUpperCase();
  if (!tag) { return element.textContent.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' '); } 
  if (['FONT'].includes(tag)) { return formatFont(element); }
  if (['H1','H2','H3','H4','H5','H6'].includes(tag)) { return formatHeader(element); }
  if (['P','DIV','HEADER','TITLE'].includes(tag)) { return formatBlock(element); } 
  if (['PRE','CODE'].includes(tag)) { return formatPre(element); }
  if (['A','IMG'].includes(tag)) { return formatReference(element); }
  if (['UL','OL','LI'].includes(tag)) { return formatList(element); }
  if (['TABLE'].includes(tag)) { return formatTable(element); }
  if (['I','EM'].includes(tag)) {
    return `*${[...element.childNodes].map(format).join('')}*`;
  }
  if (['B', 'STRONG'].includes(tag)) {
    return `**${[...element.childNodes].map(format).join('')}**`;
  }
  if (['BLOCKQUOTE'].includes(tag)) {
    return `\n\n> ${element.textContent?.split('\n').join('\n> ')}\n\n`;
  }
  if (['BR'].includes(tag)) {
    return '\n\n';
  }
  if (['HR'].includes(tag)) {
    return '\n\n---\n\n';
  }
  if (['U'].includes(tag)) {
    return `<ins>${[...element.childNodes].map(format).join('')}</ins>`;
  }
  if (!['BODY', 'TD', 'TT', 'CENTER'].includes(tag)) { console.warn(`>> ${tag} is unhandled`); }
  return [...element.childNodes].map(format).join('');
}

function formatReference(element) {
  var url = element.href ?? element.src ?? '';
  if (!url?.trim()) { return ''; }
  var file = /[^\/\#]+$/.exec(url)?.[0] ?? '';
  var filext = (/\.[^\.]+$/.exec(file)?.[0] ?? '.html').trim();
  var filename = file.replace(/\.[^\.]+$/, '').trim();
  var filetarget = ['.html', '.htm', '.txt'].includes(filext)
    ? `${filename}.md`
    : `${PATH.join(resourcepath, filename)}${filext}`;
  if (url.startsWith('mailto:')) { return ` (${url}) `; }
  if (url.startsWith('about:')) { return ` [${file}](#${file}) `; }
  if (!FS.existsSync(PATH.join(input, `${filename}${filext}`))) { filename = `FIXME: ${filename}`.trim(); }
  if (element.tagName === 'IMG') {
    return ` ![${filename}](${filetarget}) `;
  }
  return ` [${filename}](${filetarget}) `;
}

function formatList(element) {
  const sym = element.tagName === 'OL' ? '1.' : '*';
  var items = element.tagName === 'LI' 
    ? [element] 
    : [...element.childNodes].filter(n => n.tagName === 'LI');
  return `\n\n${items
    .map(item => [...item.childNodes]
      .map(format)
      .map(text => text.replace(/[\r\n]+(\s*\*|\s*\d+\.)/g, '\n  $1'))
      .map(text => text.replace(/([\r\n]\s*(\*|\d+\.)[^\r\n]+)[\r\n]+/g, '$1\n'))
      .map(text => text.replace(/[\r\n]+$/, '\n'))
      .join('')
    ).map(item => `${sym} ${item}`)
    .join('\n')
  }\n\n`;
}

function formatTable(element) {
  var body = [...element.childNodes].find(n => n.tagName === 'TBODY') ?? element;
  var rows = [...body.childNodes].filter(n => n.tagName === 'TR')
    .map(row => [...row.childNodes].filter(n => ['TD','TH'].includes(n.tagName)))
    .map(cells => cells.map(cell => ([...cell?.childNodes].map(format).join('') ?? '')
      .replace(/#+/gi, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
    ));
  if (rows.length < 1) { return ''; }
  if (rows.length < 2) { rows.push(rows[0].map(cell => '')); }
  var cols = [...new Array(Math.max(...rows.map(row => row.length)))]
    .map((_,col) => Math.max(...rows.map(row => row[col]?.length ?? 0)))
    .map(width => Number.isFinite(width) ? width : 0);
  var fmt = '\n';
  for (var row = 0; row < rows.length; row++) {
    fmt += '\n| ';
    for (var col = 0; col < cols.length; col++) {
      var width = cols[col];
      var cell = rows[row][col] ?? '';
      var pad = Math.max(0, width - cell.length);
      fmt += `${cell}${' '.repeat(pad)} | `;
    }
    if (row === 0) {
      fmt += '\n| ';
      for (var col = 0; col < cols.length; col++) {
        var width = cols[col];
        fmt += '-'.repeat(width) + ' | ';
      }
    }
  }
  return fmt + '\n\n';
}

function formatBlock(element) {
  return `\n${[...element.childNodes].map(format).join('')}\n\n`;
}

function formatFont(element) {
  var size = 7-(parseInt(element.size) ?? 0);
  return `\n${'#'.repeat(size)} ${[...element.childNodes].map(format).join('')
    .replace(/[\s\r\n]+/g, ' ')
    .replace(/[\#\*]/g, '')
  }\n\n`;
}

function formatPre(element) {
  return `\n\`\`\`\n${[...element.childNodes].map(n => n.textContent).join('')}\n\`\`\`\n\n`;
}

function formatHeader(element) {
  return `\n#${'#'.repeat(parseInt(element.tagName.substring(1)))} ${[...element.childNodes].map(format).join('')}\n\n`;
}
