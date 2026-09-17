import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
http.createServer(async (req,res) => {
  try {
    let url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if(url.endsWith('/')) url += 'index.html';
    const file = path.resolve(root, '.' + url);
    if(!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    const type = ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.pdf':'application/pdf'})[path.extname(file)] || 'application/octet-stream';
    if(req.headers.range) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      const start = range ? Number(range[1]) : NaN;
      const end = range?.[2] ? Math.min(Number(range[2]),data.length-1) : data.length-1;
      if(!Number.isSafeInteger(start)||start>end||start>=data.length){res.writeHead(416,{'Content-Range':`bytes */${data.length}`});return res.end();}
      res.writeHead(206,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});return res.end(data.subarray(start,end+1));
    }
    res.writeHead(200, {'Content-Type': type,'Accept-Ranges':'bytes','Content-Length':data.length});
    res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(4173, '127.0.0.1', () => console.log('Portfolio preview: http://127.0.0.1:4173'));
