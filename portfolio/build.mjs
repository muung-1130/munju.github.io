import './update-periods.mjs';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const files = ['index.html', 'styles.css', 'site.js', 'archive.css', 'archive.js', 'theme.css', 'project-covers.css', 'project-palettes.css', 'project-view.css', 'project-view.js', 'projects/dai-run/index.html', 'CNAME', 'projects/linux-fileserver/index.html', 'projects/linux-fileserver/project.css', 'projects/linux-fileserver/diagram.js', 'projects/linux-fileserver/assets/architecture.png', 'projects/linux-fileserver/assets/file-server.drawio', 'projects/linux-fileserver/assets/permissions.png', 'projects/linux-fileserver/assets/events.png', 'projects/camping/index.html', 'projects/camping/camping.css', 'projects/camping/assets/conceptual-model-initial.png', 'projects/camping/assets/explain-baseline.png', 'projects/camping/assets/explain-partitioned.png', 'projects/camping/assets/mongodb-regex-stats.png', 'projects/camping/assets/mongodb-text-stats.png', 'projects/camping/assets/partition-comparison.png'];
files.push('projects/docker-camping/docker.css', 'projects/docker-camping/index.html', 'projects/docker-camping/soundtrack.js', 'projects/docker-camping/assets/actions-success.png', 'projects/docker-camping/assets/application-screens.pdf', 'projects/docker-camping/assets/architecture.svg', 'projects/docker-camping/assets/camping-architecture.drawio', 'projects/docker-camping/assets/docker-harbor.mp4', 'projects/docker-camping/assets/internal-network.png', 'projects/docker-camping/assets/load-21.png', 'projects/docker-camping/assets/load-24.png', 'projects/docker-camping/assets/load-27.png', 'projects/docker-camping/assets/screen-campground.png', 'projects/docker-camping/assets/screen-dashboard.png', 'projects/docker-camping/assets/screen-detail.png', 'projects/docker-camping/assets/screen-forecast.png', 'projects/docker-camping/assets/screen-mainhome.png', 'projects/docker-camping/assets/screen-review.png', 'projects/docker-camping/assets/screen-statistics.png', 'projects/docker-camping/assets/screen-trend.png', 'projects/docker-camping/assets/video-poster.jpg');
files.push('projects/docker-camping/assets/screen-forecast-2.png');
files.push('projects/paw-data/index.html', 'projects/paw-data/paw.css', 'projects/paw-data/assets/screen-map.png', 'projects/paw-data/assets/screen-dashboard.png', 'projects/paw-data/assets/screen-market.png', 'projects/paw-data/assets/paw-data-screens.pdf');
files.push('projects/etcd-recovery/index.html', 'projects/etcd-recovery/etcd.css', 'projects/etcd-recovery/assets/etcd-three.png', 'projects/etcd-recovery/assets/nodes-degraded.png', 'projects/etcd-recovery/assets/nodes-initial.png', 'projects/etcd-recovery/assets/nodes-ready.png', 'projects/etcd-recovery/assets/registry-query.png', 'projects/etcd-recovery/assets/runtime-running.png', 'projects/etcd-recovery/assets/scheduler-lease.png');
files.push('projects/dai-run/dai-run.css', 'projects/dai-run/assets/ai-architecture.drawio', 'projects/dai-run/assets/ai-architecture.svg', 'projects/dai-run/assets/dai-run-screens.pdf', 'projects/dai-run/assets/docker-architecture.drawio', 'projects/dai-run/assets/docker-architecture.svg', 'projects/dai-run/assets/kubernetes-architecture.drawio', 'projects/dai-run/assets/kubernetes-architecture.svg', 'projects/dai-run/assets/screen-chat.pdf', 'projects/dai-run/assets/screen-chat.png', 'projects/dai-run/assets/screen-courses.pdf', 'projects/dai-run/assets/screen-courses.png', 'projects/dai-run/assets/screen-home.pdf', 'projects/dai-run/assets/screen-home.png', 'projects/dai-run/assets/screen-login.pdf', 'projects/dai-run/assets/screen-login.png', 'projects/dai-run/assets/screen-summary.pdf', 'projects/dai-run/assets/screen-summary.png');
for (const file of files) {
  const destination = path.join(root, 'dist', file);
  await mkdir(path.dirname(destination), {recursive: true});
  await copyFile(path.join(root, file), destination);
}
await writeFile(path.join(root, 'dist', '.nojekyll'), '');
for (const file of files.filter(file => file.endsWith('.html'))) {
  const html = await readFile(path.join(root, file), 'utf8');
  for (const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|#|mailto:)/.test(url)) continue;
    const clean = url.split('#')[0];
    const target = path.resolve(root, path.dirname(file), clean.endsWith('/') ? clean + 'index.html' : clean);
    await readFile(target);
  }
}
console.log('Build complete: 7 pages. All local asset and page links verified. Output: portfolio/dist');
